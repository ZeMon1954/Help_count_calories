import { mobileEnv } from '@/constants/env';

const apiBaseUrl = mobileEnv.apiUrl;
const responseCache = new Map<
  string,
  { expiresAt: number; response: ApiResponse<unknown> }
>();
const pendingRequests = new Map<string, Promise<ApiResponse<unknown>>>();
const cacheGenerations = new Map<string, number>();

const DEFAULT_GET_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;

function hashScope(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function requestScope(headers?: HeadersInit) {
  const authorization = new Headers(headers).get('authorization') ?? '';
  return authorization ? `user:${hashScope(authorization)}` : 'anonymous';
}

function cacheKey(path: string, headers?: HeadersInit) {
  return `${requestScope(headers)}:${path}`;
}

function cacheTtlFor(path: string) {
  if (path === 'profile' || path === 'settings') return 5 * 60_000;
  if (path.startsWith('foods')) return 5 * 60_000;
  if (path.startsWith('food-logs') || path.startsWith('nutrition/')) {
    return 30_000;
  }
  return DEFAULT_GET_CACHE_TTL_MS;
}

export function clearApiCache() {
  responseCache.clear();
  pendingRequests.clear();
  cacheGenerations.clear();
}

function clearApiCacheForScope(headers?: HeadersInit) {
  const scope = requestScope(headers);
  const prefix = `${scope}:`;
  cacheGenerations.set(scope, (cacheGenerations.get(scope) ?? 0) + 1);
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
  for (const key of pendingRequests.keys()) {
    if (key.startsWith(prefix)) pendingRequests.delete(key);
  }
}

if (!apiBaseUrl) {
  console.warn(
    'EXPO_PUBLIC_API_URL is not configured. API requests will be unavailable.',
  );
}

export interface ApiResponse<T> {
  status: number;
  data: T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<ApiResponse<T>> {
  if (!apiBaseUrl) throw new ApiError('EXPO_PUBLIC_API_URL is not configured');

  const method = init?.method ?? 'GET';
  const normalizedMethod = method.toUpperCase();
  const safePath = path.replace(/^\//, '');
  const scope = requestScope(init?.headers);
  const key = cacheKey(safePath, init?.headers);
  const generation = cacheGenerations.get(scope) ?? 0;
  const canUseCache = normalizedMethod === 'GET' && init?.cache !== 'no-store';

  if (canUseCache) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      console.info(`[API] GET /${safePath} served from memory cache`);
      return cached.response as ApiResponse<T>;
    }
    if (cached) responseCache.delete(key);

    const pending = pendingRequests.get(key);
    if (pending) {
      console.info(`[API] GET /${safePath} joined pending request`);
      return pending as Promise<ApiResponse<T>>;
    }
  }

  const request = performApiRequest<T>(
    apiBaseUrl,
    safePath,
    normalizedMethod,
    init,
    fetchImpl,
    sleep,
  );

  if (!canUseCache) return request;

  pendingRequests.set(key, request as Promise<ApiResponse<unknown>>);
  try {
    const response = await request;
    if (responseCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = responseCache.keys().next().value;
      if (oldestKey) responseCache.delete(oldestKey);
    }
    if ((cacheGenerations.get(scope) ?? 0) === generation) {
      responseCache.set(key, {
        expiresAt: Date.now() + cacheTtlFor(safePath),
        response,
      });
    }
    return response;
  } finally {
    if (pendingRequests.get(key) === request) pendingRequests.delete(key);
  }
}

async function performApiRequest<T>(
  baseUrl: string,
  safePath: string,
  method: string,
  init: RequestInit | undefined,
  fetchImpl: typeof fetch,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<ApiResponse<T>> {
  const startedAt = Date.now();
  console.info(`[API] ${method} /${safePath} started`);

  let response: Response | undefined;
  let lastError: unknown;
  const attempts = method === 'GET' ? 3 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = undefined;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 75_000);
    const abortFromCaller = () => controller.abort();
    init?.signal?.addEventListener('abort', abortFromCaller, { once: true });
    try {
      response = await fetchImpl(
        `${baseUrl.replace(/\/$/, '')}/${safePath}`,
        {
          ...init,
          signal: controller.signal,
          headers: { Accept: 'application/json', ...init?.headers },
        },
      );
      if (
        attempt + 1 < attempts &&
        (response.status === 502 ||
          response.status === 503 ||
          response.status === 504)
      ) {
        console.info(
          `[API] ${method} /${safePath} received HTTP ${response.status}; retrying while the server starts`,
        );
        await sleep(1_500 * 2 ** attempt);
        continue;
      }
      break;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts && !init?.signal?.aborted) {
        await sleep(1_500 * 2 ** attempt);
      }
    } finally {
      clearTimeout(timeout);
      init?.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  if (!response) {
    const error = lastError;
    const diagnostic =
      error instanceof Error ? `: ${error.name}: ${error.message}` : '';
    console.error(
      `[API] ${method} /${safePath} network failure after ${Date.now() - startedAt}ms${diagnostic}`,
    );
    throw new ApiError(
      'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง',
    );
  }

  const data = (await response.json().catch(() => null)) as T | null;

  console.info(
    `[API] ${method} /${safePath} completed with HTTP ${response.status} in ${Date.now() - startedAt}ms`,
  );

  if (!response.ok) {
    const errorData = data as { message?: unknown; code?: unknown } | null;
    throw new ApiError(
      typeof errorData?.message === 'string'
        ? errorData.message
        : `API request failed with HTTP ${response.status}`,
      response.status,
      typeof errorData?.code === 'string' ? errorData.code : undefined,
    );
  }

  if (data === null) {
    throw new ApiError(
      'API returned an invalid JSON response',
      response.status,
    );
  }

  if (method !== 'GET') clearApiCacheForScope(init?.headers);

  return { status: response.status, data };
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await apiRequest<T>(path, init);
  return response.data;
}
