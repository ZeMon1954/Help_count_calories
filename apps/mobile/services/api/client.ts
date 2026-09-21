import { mobileEnv } from '@/constants/env';

const apiBaseUrl = mobileEnv.apiUrl;

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
): Promise<ApiResponse<T>> {
  if (!apiBaseUrl) throw new ApiError('EXPO_PUBLIC_API_URL is not configured');

  const method = init?.method ?? 'GET';
  const safePath = path.replace(/^\//, '');
  const startedAt = Date.now();
  console.info(`[API] ${method} /${safePath} started`);

  let response: Response | undefined;
  let lastError: unknown;
  const attempts = method.toUpperCase() === 'GET' ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 75_000);
    const abortFromCaller = () => controller.abort();
    init?.signal?.addEventListener('abort', abortFromCaller, { once: true });
    try {
      response = await fetchImpl(
        `${apiBaseUrl.replace(/\/$/, '')}/${safePath}`,
        {
          ...init,
          signal: controller.signal,
          headers: { Accept: 'application/json', ...init?.headers },
        },
      );
      break;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts && !init?.signal?.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
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

  return { status: response.status, data };
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await apiRequest<T>(path, init);
  return response.data;
}
