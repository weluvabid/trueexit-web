import { QueryClient } from '@tanstack/svelte-query';

const queryClientOptions = {
  defaultOptions: {
    queries: {
      // Preserve TrueExit's existing no-automatic-retry behavior while query
      // functions and resource-specific freshness policies are migrated.
      retry: false,
      staleTime: 1_500,
      gcTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
};

declare global {
  interface Window {
    /** Shared only by independently hydrated browser islands in this document. */
    __trueExitQueryClient?: QueryClient;
  }
}

/**
 * Return the document-wide browser client, or a fresh client during SSR.
 * Server renders must never share user-specific query data between requests.
 *
 * QueryClient ownership lives here independently of the temporary shared HTTP
 * cache so resource queries can migrate without depending on that cache module.
 */
export function getSharedQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return new QueryClient(queryClientOptions);
  }

  return (window.__trueExitQueryClient ??= new QueryClient(queryClientOptions));
}
