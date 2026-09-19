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
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  if (!apiBaseUrl) throw new ApiError('EXPO_PUBLIC_API_URL is not configured');

  const method = init?.method ?? 'GET';
  const safePath = path.replace(/^\//, '');
  const startedAt = Date.now();
  console.info(`[API] ${method} /${safePath} started`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/${safePath}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    console.error(
      `[API] ${method} /${safePath} network failure after ${Date.now() - startedAt}ms`,
    );
    throw new ApiError(
      'Unable to reach the API. Check the server, Wi-Fi, and EXPO_PUBLIC_API_URL.',
    );
  }

  const data = (await response.json().catch(() => null)) as T | null;

  console.info(
    `[API] ${method} /${safePath} completed with HTTP ${response.status} in ${Date.now() - startedAt}ms`,
  );

  if (!response.ok) {
    throw new ApiError(
      `API request failed with HTTP ${response.status}`,
      response.status,
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
