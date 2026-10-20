import { env } from 'node:process';

/**
 * Server-only boundary for calls to the TrueExit API.
 * Import this module only from Astro server code (pages, actions, or endpoints).
 * Never pass bearer tokens to client components or return them in responses.
 */
export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(status: number, code: string | null, requestId: string | null) {
    super(`TrueExit API request failed with status ${status}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function getApiBaseUrl(): URL {
  const configuredUrl = env.TRUEEXIT_API_BASE_URL;

  if (!configuredUrl) {
    throw new ApiConfigurationError(
      'TRUEEXIT_API_BASE_URL must be configured for server-side API requests.',
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredUrl);
  } catch {
    throw new ApiConfigurationError('TRUEEXIT_API_BASE_URL must be a valid absolute URL.');
  }

  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new ApiConfigurationError('TRUEEXIT_API_BASE_URL must use HTTP or HTTPS.');
  }

  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new ApiConfigurationError(
      'TRUEEXIT_API_BASE_URL must not contain credentials, a query, or a fragment.',
    );
  }

  baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, '')}/`;
  return baseUrl;
}

function buildApiUrl(path: string): URL {
  // Accept endpoint-relative paths only, so callers cannot override the configured host.
  if (!path || path.startsWith('/') || path.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(path)) {
    throw new TypeError('API paths must be non-empty relative paths without a leading slash.');
  }

  const base = getApiBaseUrl();
  const url = new URL(path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new TypeError('API path resolves outside the configured API base path.');
  }
  return url;
}

/**
 * Make a server-side API request. Authentication is deliberately supplied by the caller
 * after the future session layer validates the user; this module does not manage sessions.
 */
export async function requestApi(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<Response> {
  const url = buildApiUrl(path);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  } else {
    headers.delete('Authorization');
  }

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: 'manual',
  });

  if (!response.ok) {
    // The API contract uses an error envelope; ignore arbitrary server messages.
    const body: unknown = await response.clone().json().catch(() => null);
    const error =
      body && typeof body === 'object' && 'error' in body &&
      body.error && typeof body.error === 'object'
        ? body.error
        : null;
    const code =
      error && 'code' in error && typeof error.code === 'string' ? error.code : null;
    const requestId =
      error && 'request_id' in error && typeof error.request_id === 'string'
        ? error.request_id
        : null;
    throw new ApiRequestError(response.status, code, requestId);
  }

  // Callers must respect the endpoint contract: 204 responses have no JSON body.
  return response;
}
