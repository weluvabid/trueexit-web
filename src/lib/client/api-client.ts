import ky, { type Options } from 'ky';
import { getApiErrorCode } from './api-response';

/**
 * Shared browser transport. TanStack Query remains responsible for caching,
 * cancellation orchestration, retries, and invalidation.
 */
const apiClient = ky.create({
  headers: { Accept: 'application/json' },
  credentials: 'same-origin',
  cache: 'no-store',
  retry: 0,
  timeout: false,
  throwHttpErrors: false,
});

export type ApiResponse = {
  response: Response;
  body: unknown;
  code: string | null;
};

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Execute a request and parse its JSON body once, without changing HTTP semantics. */
export async function requestApi(path: string, init: RequestInit = {}): Promise<ApiResponse> {
  const response = await apiClient(path, init as Options);
  const method = init.method?.toUpperCase() ?? 'GET';

  if (method === 'HEAD' || response.status === 204 || response.status === 205) {
    return { response, body: null, code: null };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch (error) {
    // Cancellation while consuming the body must remain cancellation, not an
    // apparently successful response with an empty payload.
    if (isAbortError(error)) throw error;
  }

  return { response, body, code: getApiErrorCode(body) };
}
