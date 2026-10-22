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
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET') return fetch(input, init);

  const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  // Query parameter order does not change the resource represented by these
  // API GETs. Canonicalize it so callers that construct equivalent URLs in
  // different orders share the same in-flight request and cached response.
  const url = canonicalizeGetUrl(requestUrl);
  const headers = new Headers(init.headers);
  headers.set('Accept', headers.get('Accept') ?? 'application/json');
  const credentials = init.credentials ?? 'same-origin';
  const key = ['shared-http-get', method, url, credentials, [...headers.entries()].sort(([a], [b]) => a.localeCompare(b))] as const;

  try {
    const result = await getSharedQueryClient().fetchQuery<CachedHttpResponse>({
      queryKey: key,
      staleTime: 1_500,
      queryFn: async ({ signal }) => {
        // The shared query owns the network request's AbortSignal. A component's
        // signal must not cancel an in-flight request shared with other consumers.
        const response = await fetch(input, { ...init, method, headers, credentials, signal });
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
