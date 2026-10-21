import { QueryClient } from '@tanstack/svelte-query';

type CachedHttpResponse = {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
};

declare global {
  interface Window {
    /** A single browser QueryClient shared by independently hydrated page widgets. */
    __trueExitSharedQueryClient?: QueryClient;
  }
}

function getSharedQueryClient(): QueryClient {
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
export async function fetchSharedGet(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET') return fetch(input, init);

  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const headers = new Headers(init.headers);
  headers.set('Accept', headers.get('Accept') ?? 'application/json');
  const credentials = init.credentials ?? 'same-origin';
  const key = ['shared-http-get', method, url, credentials, [...headers.entries()].sort(([a], [b]) => a.localeCompare(b))] as const;

  const result = await getSharedQueryClient().fetchQuery<CachedHttpResponse>({
    queryKey: key,
    staleTime: 1_500,
    queryFn: async ({ signal }) => {
      const response = await fetch(input, { ...init, method, headers, credentials, signal: init.signal ?? signal });
      return {
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()].filter(([name]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(name.toLowerCase())),
        body: await response.text(),
      };
    },
  });

  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
}
