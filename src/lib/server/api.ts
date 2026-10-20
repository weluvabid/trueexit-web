import type { APIContext } from 'astro';

const DEFAULT_API_BASE_URL = process.env.TRUEEXIT_API_BASE_URL as string;
const REQUEST_TIMEOUT_MS = 15_000;

export function jsonError(status: number, code: string, requestId = crypto.randomUUID()): Response {
  return Response.json(
    { error: { code }, request_id: requestId },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Request-Id': requestId,
      },
    },
  );
}

function getApiBaseUrl(): URL {
  const raw = process.env.TRUEEXIT_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const url = new URL(raw);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('TRUEEXIT_API_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment.');
  }

  return url;
}

function isSameOriginMutation(request: Request, appUrl: URL): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).origin === appUrl.origin;
  } catch {
    return false;
  }
}

export async function proxyApiRequest(context: APIContext): Promise<Response> {
  const { request, url, params, locals } = context;
  const method = request.method.toUpperCase();
  const allowedMethods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);

  if (!allowedMethods.has(method)) {
    return jsonError(405, 'method_not_allowed');
  }

  if (method !== 'GET' && method !== 'HEAD' && !isSameOriginMutation(request, url)) {
    return jsonError(403, 'origin_check_failed');
  }

  const { auth } = locals;
  if (!auth.user || !auth.accessToken) {
    return jsonError(401, 'authentication_required');
  }

  const path = params.path;
  if (!path || path.split('/').some((segment) => segment === '.' || segment === '..' || segment === '')) {
    return jsonError(400, 'invalid_request_path');
  }

  let upstreamUrl: URL;
  try {
    const baseUrl = getApiBaseUrl().toString().replace(/\/+$/, '');
    const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    upstreamUrl = new URL(`${baseUrl}/${encodedPath}`);
    upstreamUrl.search = url.search;
  } catch {
    return jsonError(500, 'api_configuration_error');
  }

  const headers = new Headers({
    Authorization: `Bearer ${auth.accessToken}`,
    Accept: request.headers.get('accept') ?? 'application/json',
  });

  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);

  // Preserve the operation's idempotency key, but never forward caller-supplied
  // Authorization, cookies, or other browser-controlled credentials.
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

  let body: ArrayBuffer | undefined;
  if (!['GET', 'HEAD'].includes(method)) {
    body = await request.arrayBuffer();
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const responseHeaders = new Headers({
      'Cache-Control': 'no-store',
      'X-Request-Id': upstream.headers.get('x-request-id') ?? crypto.randomUUID(),
    });
    const responseContentType = upstream.headers.get('content-type');
    if (responseContentType) responseHeaders.set('Content-Type', responseContentType);
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) responseHeaders.set('Retry-After', retryAfter);

    return new Response(method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    return jsonError(timedOut ? 504 : 502, timedOut ? 'upstream_timeout' : 'upstream_unavailable');
  }
}
