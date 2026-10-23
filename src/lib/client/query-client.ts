import { QueryClient } from '@tanstack/svelte-query';
import type { Query } from '@tanstack/query-core';
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
  type PersistedClient,
  type Persister,
} from '@tanstack/query-persist-client-core';
import { del, get, set } from 'idb-keyval';

const PERSISTENCE_VERSION = 'v1';
const PERSISTENCE_MAX_AGE = 24 * 60 * 60 * 1_000;
const PERSISTENCE_USER_MARKER = 'trueexit.query-cache-user';

let browserRestorePromise: Promise<void> = Promise.resolve();
let stopBrowserPersistence: (() => void) | null = null;

const queryClientOptions = {
  defaultOptions: {
    queries: {
      // Preserve TrueExit's existing no-automatic-retry behavior.
      retry: false,
      staleTime: 1_500,
      // TanStack requires gcTime to be at least as long as persisted maxAge.
      gcTime: PERSISTENCE_MAX_AGE,
      refetchOnWindowFocus: false,
    },
  },
};

declare global {
  interface Window {
    /** Shared only by independently hydrated browser islands in this document. */
    __trueExitQueryClient?: QueryClient;
    __trueExitQueryPersistenceStarted?: boolean;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPersistableQuery(queryKey: readonly unknown[], data: unknown): boolean {
  const [family, resource] = queryKey;

  // Persist only compact, read-only resources that improve return visits.
  // Exclude settings/member data, search results, investigation details,
  // mutation state, and any query family not explicitly listed here.
  if (family === 'dashboard') return resource === 'overview';
  if (family === 'monitors') return resource === 'list';
  if (family === 'templates') return resource === 'list' || resource === 'detail';
  if (family === 'workspace-bootstrap') {
    // Bootstrap intentionally models individual resource failures as data so
    // the shell can render partial state. Never persist those failures as if
    // they were useful successful snapshots.
    if (resource !== 'me' && resource !== 'workspaces') return false;
    return isRecord(data) && data.ok === true;
  }
  return false;
}

function getBrowserUserId(): string | null {
  if (typeof document === 'undefined') return null;
  const userId = document.querySelector('[data-query-cache-user]')?.getAttribute('data-query-cache-user');
  return userId?.trim() || null;
}

function createUserPersister(userId: string): Persister {
  const storageKey = `trueexit.query-cache.${PERSISTENCE_VERSION}.${encodeURIComponent(userId)}`;
  return {
    persistClient: async (client: PersistedClient) => set(storageKey, client),
    restoreClient: async () => (await get<PersistedClient | undefined>(storageKey)) ?? undefined,
    removeClient: async () => del(storageKey),
  };
}

function startBrowserPersistence(queryClient: QueryClient): void {
  if (typeof window === 'undefined' || window.__trueExitQueryPersistenceStarted) return;

  // Do not mark persistence as started until an authenticated identity exists.
  // getSharedQueryClient() can be called on signed-out routes too; marking it
  // started there would prevent persistence from starting after sign-in without
  // a full document reload.
  const userId = getBrowserUserId();
  if (!userId) return;

  window.__trueExitQueryPersistenceStarted = true;

  const previousUserId = (() => {
    try { return window.localStorage.getItem(PERSISTENCE_USER_MARKER); }
    catch { return null; }
  })();

  const persister = createUserPersister(userId);

  // A browser session that changes identity must not retain the previous
  // account's in-memory cache. Its IndexedDB record is removed as well.
  if (previousUserId && previousUserId !== userId) {
    queryClient.clear();
    void createUserPersister(previousUserId).removeClient().catch(() => undefined);
  }
  try { window.localStorage.setItem(PERSISTENCE_USER_MARKER, userId); }
  catch { /* Persistence can still work when localStorage is unavailable. */ }

  const persistenceOptions = {
    queryClient,
    persister,
    maxAge: PERSISTENCE_MAX_AGE,
    buster: PERSISTENCE_VERSION,
    dehydrateOptions: {
      shouldDehydrateQuery: (query: Query) =>
        query.state.status === 'success' && isPersistableQuery(query.queryKey, query.state.data),
    },
  };

  // Restore first, then subscribe to cache changes. Callers can await this
  // promise before deciding whether a page has any usable data to render.
  browserRestorePromise = persistQueryClientRestore(persistenceOptions)
    .catch(() => undefined)
    .then(() => {
      stopBrowserPersistence = persistQueryClientSubscribe(persistenceOptions);
    });
}

/** Clear both in-memory and persisted server state when signing out. */
export async function clearPersistedQueryCache(): Promise<void> {
  const queryClient = getSharedQueryClient();

  // Do not clear storage while restoration is still in flight: a late restore
  // could repopulate the in-memory cache, and its subscription could write the
  // old account's data back after the persisted record had been deleted.
  await browserRestorePromise;

  stopBrowserPersistence?.();
  stopBrowserPersistence = null;
  queryClient.clear();

  const userId = getBrowserUserId();
  if (userId) await createUserPersister(userId).removeClient().catch(() => undefined);

  try { window.localStorage.removeItem(PERSISTENCE_USER_MARKER); }
  catch { /* The next authenticated session still has a user-scoped key. */ }

  // Allow the next authenticated identity to initialize a fresh persistence
  // lifecycle in this document. Keep the restore promise settled so subsequent
  // callers cannot wait on a stale restoration operation.
  browserRestorePromise = Promise.resolve();
  if (typeof window !== 'undefined') {
    window.__trueExitQueryPersistenceStarted = false;
  }
}

/**
 * Return the document-wide browser client, or a fresh client during SSR.
 * Server renders must never share user-specific query data between requests.
 */
export function getSharedQueryClient(): QueryClient {
  if (typeof window === 'undefined') return new QueryClient(queryClientOptions);

  const client = (window.__trueExitQueryClient ??= new QueryClient(queryClientOptions));
  startBrowserPersistence(client);
  return client;
}

/** Resolve only after the browser cache has been restored (or restoration failed). */
export async function waitForQueryCacheRestoration(): Promise<void> {
  getSharedQueryClient();
  await browserRestorePromise;
}
