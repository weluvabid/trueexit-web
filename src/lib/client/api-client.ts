import ky, { type Options } from 'ky';
import { getApiErrorCode, getApiRequestId } from './api-response';

/**
 * Shared browser transport. TanStack Query remains responsible for caching,
 * retries, query cancellation orchestration, and invalidation.
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
  requestId: string | null;
};

export type ApiClientErrorKind = 'http' | 'network' | 'invalid_response';

/** A transport-boundary failure with stable machine-readable metadata. */
export class ApiClientError extends Error {
  constructor(
    readonly kind: ApiClientErrorKind,
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly requestId: string | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiClientError';
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

/** Convert a thrown value into a stable API failure without swallowing cancellation. */
export function normalizeApiError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;
  if (isAbortError(error)) throw error;
  return new ApiClientError('network', 'The API request could not reach the server.', 0, 'network_error', null, {
    cause: error,
  });
}

/** Require a successful HTTP response. Use result unions instead when failure is intentionally data. */
export function assertApiSuccess(result: ApiResponse): ApiResponse {
  if (!result.response.ok) {
    throw new ApiClientError(
      'http',
      `The API request failed with status ${result.response.status}.`,
      result.response.status,
      result.code,
      result.requestId,
    );
  }
  return result;
}

/** Execute a request and parse its JSON body once, preserving HTTP and cancellation semantics. */
export async function requestApi(path: string, init: RequestInit = {}): Promise<ApiResponse> {
  let response: Response;
  try {
    response = await apiClient(path, init as Options);
  } catch (error) {
    throw normalizeApiError(error);
  }

  const method = init.method?.toUpperCase() ?? 'GET';
  if (method === 'HEAD' || response.status === 204 || response.status === 205) {
    return { response, body: null, code: null, requestId: null };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    // An unreadable error body must not hide the authoritative HTTP status.
    // A successful response, however, must not silently become a null payload.
    if (response.ok) {
      throw new ApiClientError(
        'invalid_response',
        'The server returned an invalid JSON response.',
        response.status,
        'invalid_response',
        null,
        { cause: error },
      );
    }
  }

  return {
    response,
    body,
    code: getApiErrorCode(body),
    requestId: getApiRequestId(body),
  };
}
