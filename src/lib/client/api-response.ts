export type ApiErrorEnvelope = {
  error?: {
    code?: unknown;
    details?: unknown;
  };
  request_id?: unknown;
};

/** Extract a machine-readable API error code without trusting the response shape. */
export function getApiErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('error' in body)) return null;
  const error = (body as ApiErrorEnvelope).error;
  return typeof error?.code === 'string' ? error.code : null;
}

/** Normalize common list response shapes used by the backend API. */
export function getApiList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)) {
    return body.data as T[];
  }
  return [];
}
