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

/** Extract the backend correlation ID when it is present and well-formed as a string. */
export function getApiRequestId(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('request_id' in body)) return null;
  const requestId = (body as ApiErrorEnvelope).request_id;
  return typeof requestId === 'string' ? requestId : null;
}

