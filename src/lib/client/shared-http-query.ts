import { QueryClient } from '@tanstack/svelte-query';

type CachedHttpResponse = {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
};

class HttpResponseError extends Error {
  constructor(readonly response: CachedHttpResponse) {
    super(`GET request failed with status ${response.status}`);
    this.name = 'HttpResponseError';
  }
}

function toResponse(result: CachedHttpResponse): Response {
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
}

declare global {
  interface Window {
    /** A single browser QueryClient shared by independently hydrated page widgets. */
    __trueExitSharedQueryClient?: QueryClient;
  }
}

export function getSharedQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // This helper is intended for browser-side requests. A fresh instance avoids
    // sharing user data between server renders.
    return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 1_500, gcTime: 60_000 } } });
  }
  return window.__trueExitSharedQueryClient ??= new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 1_500,
        gcTime: 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function invalidateSharedGetCache(): Promise<void> {
  return getSharedQueryClient().invalidateQueries({ queryKey: ['shared-http-get'] });
}

/**
 * Perform a GET through TanStack Query so identical concurrent reads share one
 * request across independently hydrated components. The short freshness window
 * also prevents immediate remounts from reissuing the same request. Only the
 * response representation is cached; callers receive a fresh Response object
 * and can consume its body independently.
 */

function canonicalizeGetUrl(input: string): string {
  const base = typeof window === 'undefined' ? 'http://trueexit.invalid' : window.location.href;
  const url = new URL(input, base);
  url.searchParams.sort();
  // Fragments are not sent in HTTP requests and must not split cache identity.
  url.hash = '';
  return url.toString();
}

export async function fetchSharedGet(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const method = (init.method ?? request?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') return fetch(input, init);

  const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  // Query parameter order does not change the resource represented by these
  // API GETs. Canonicalize it so equivalent URLs share the same request/cache.
  const url = canonicalizeGetUrl(requestUrl);

  // Fetch's Request input already carries headers and request options. Merge
  // explicit init headers as overrides rather than accidentally dropping the
  // headers supplied by the Request object.
  const headers = new Headers(request?.headers);
  if (init.headers) {
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  }
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const credentials = init.credentials ?? request?.credentials ?? 'same-origin';
  const mode = init.mode ?? request?.mode ?? 'cors';
  const redirect = init.redirect ?? request?.redirect ?? 'follow';
  const referrer = init.referrer ?? request?.referrer ?? '';
  const referrerPolicy = init.referrerPolicy ?? request?.referrerPolicy ?? '';
  const integrity = init.integrity ?? request?.integrity ?? '';
  const headerIdentity = [...headers.entries()].sort(([a], [b]) => a.localeCompare(b));
  const key = [
    'shared-http-get',
    method,
    url,
    credentials,
    mode,
    redirect,
    referrer,
    referrerPolicy,
    integrity,
    headerIdentity,
  ] as const;

  try {
    const result = await getSharedQueryClient().fetchQuery<CachedHttpResponse>({
      queryKey: key,
      staleTime: 1_500,
      queryFn: async ({ signal }) => {
        // The shared query owns the network request's AbortSignal. One consumer
        // leaving must not abort a request that another consumer is awaiting.
        const response = await fetch(input, {
          ...init,
          method,
          headers,
          credentials,
          mode,
          redirect,
          referrer,
          referrerPolicy,
          integrity,
          signal,
        });
        const result: CachedHttpResponse = {
          status: response.status,
          statusText: response.statusText,
          headers: [...response.headers.entries()].filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name.toLowerCase())),
          body: await response.text(),
        };
        // HTTP errors are returned to callers but must not become fresh cached
        // successes; otherwise a brief 401/5xx can suppress an immediate retry.
        if (!response.ok) throw new HttpResponseError(result);
        return result;
      },
    });
    return toResponse(result);
  } catch (error) {
    if (error instanceof HttpResponseError) return toResponse(error.response);
    throw error;
  }
}
