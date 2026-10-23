/** Minimal safe shape helpers for untrusted API error bodies. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extract a machine-readable API error code without trusting the response shape. */
export function getApiErrorCode(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  return typeof body.error.code === 'string' ? body.error.code : null;
}

/** Extract the backend correlation ID when it is present and well-formed as a string. */
export function getApiRequestId(body: unknown): string | null {
  if (!isRecord(body)) return null;
  return typeof body.request_id === 'string' ? body.request_id : null;
}
