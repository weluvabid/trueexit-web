<script lang="ts">
  import { onMount } from 'svelte';
  import { createMutation, createQuery } from '@tanstack/svelte-query';
  import { Button } from '../../ui/button/index.js';
  import { Search } from '@lucide/svelte';
  import WorkspaceSwitcher from './workspace-switcher.svelte';
  import AppearanceToggle from './appearance-toggle.svelte';
  import AccountMenu from './account-menu.svelte';
  import QuickNavigation from './quick-navigation.svelte';
  import { loadWorkspaceSelection } from './workspace-bootstrap';
  import { createWorkspaceSwitchUrl } from './workspace-selection';
  import { assertApiSuccess, ApiClientError, requestApi } from '../../../lib/client/api-client';
  import { getSharedQueryClient } from '../../../lib/client/query-client';
  import { appearancePreferenceQueryOptions, updateAppearancePreferenceMutationOptions } from '../../../lib/client/account-settings-api';
  import { readActiveWorkspaceId, writeActiveWorkspaceId } from '../../../lib/client/workspace-preference';
  import { parseApiBody, workspaceSearchResponseSchema } from '../../../lib/client/api-schemas';
  import type { WorkspaceContext } from '../../../lib/client/workspace-bootstrap';

  import {
    applyAppearancePreference,
    readAppearancePreference,
    type AppearancePreference
  } from './appearance-preference';

  type SearchResult = { label: string; detail: string; href: string; kind: string };

  let {
    email = 'Signed in',
    initials = 'TE',
    initialAppearancePreference = null,
  }: { email?: string; initials?: string; initialAppearancePreference?: AppearancePreference | null } = $props();

  let workspaces: WorkspaceContext[] = $state([]);
  let activeWorkspaceId = $state('');
  let workspaceLoading = $state(true);
  let workspaceError = $state('');
  let workspaceMenuOpen = $state(false);
  let workspaceSearchQuery = $state('');
  let searchOpen = $state(false);
  let searchQuery = $state('');
  let searchResults: SearchResult[] = $state([]);
  let searchStatus = $state('');
  let searchLoading = $state(false);
  let appearance = $state<AppearancePreference>('system');
  const queryClient = getSharedQueryClient();
  const appearanceQuery = createQuery(() => appearancePreferenceQueryOptions(initialAppearancePreference), () => queryClient);
  const appearanceMutation = createMutation(() => updateAppearancePreferenceMutationOptions(queryClient), () => queryClient);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchSequence = 0;

  function effectiveTheme(): 'light' | 'dark' {
    if (appearance !== 'system') return appearance;
    // Keep server rendering deterministic; the real system preference is applied on mount.
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function toggleAppearance() {
    if (appearanceMutation.isPending) return;
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    appearanceMutation.mutate(next);
  }

  function applyAppearance(preference: AppearancePreference, persist = true) {
    applyAppearancePreference(preference, persist);
    appearance = preference;
  }

  // The local preference is applied immediately; the shared query reconciles it
  // with the account-level preference returned by the backend.
  $effect(() => {
    const savedPreference = appearanceQuery.data?.theme;
    if (savedPreference) applyAppearance(savedPreference, false);
  });

  function chooseWorkspace(id: string) {
    const next = workspaces.find((workspace) => workspace.id === id);
    if (!next || id === activeWorkspaceId) { workspaceMenuOpen = false; return; }
    const confirmed = window.confirm(`Switch to “${next.name}”? This reloads the current page, so any unsaved changes may be lost.`);
    if (!confirmed) return;
    writeActiveWorkspaceId(id);
    window.location.assign(createWorkspaceSwitchUrl(window.location.href, id));
  }

  function openSearch() {
    searchOpen = true;
    searchQuery = '';
    searchResults = [];
    searchStatus = '';
    searchLoading = false;
  }

  function navigateTo(href: string) {
    searchOpen = false;
    window.location.assign(href);
  }

  function updateSearch(query: string) {
    searchQuery = query;
    searchResults = [];
    searchStatus = '';
    if (searchTimer) clearTimeout(searchTimer);
    const sequence = ++searchSequence;
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      searchStatus = 'Searching this workspace…';
      searchTimer = setTimeout(() => void searchWorkspace(trimmed, sequence), 220);
    }
  }

  async function searchWorkspace(query: string, sequence: number) {
    const workspaceId = activeWorkspaceId || readActiveWorkspaceId();
    if (!workspaceId) {
      if (sequence === searchSequence) searchStatus = 'Choose a workspace to search its resources.';
      return;
    }
    searchLoading = true;
    try {
      const params = new URLSearchParams({ workspace_id: workspaceId, q: query, scope: 'all', limit: '5' });
      const body = await getSharedQueryClient().query({
        queryKey: ['workspace-search', workspaceId, query, 'all', 5],
        staleTime: 10_000,
        queryFn: async ({ signal }) => {
          const { response, body: result, code, requestId } = await requestApi(`/api/backend/search?${params}`, { signal });
          assertApiSuccess({ response, body: result, code, requestId });
          return result;
        }
      });
      if (sequence !== searchSequence) return;
      const groups = parseApiBody(workspaceSearchResponseSchema, body).results ?? {};
      const results: SearchResult[] = [];
      for (const item of groups.monitors?.data || []) {
        results.push({ label: item.name, detail: item.description || 'Monitor', href: `/monitors/${encodeURIComponent(item.id)}?workspace_id=${encodeURIComponent(workspaceId)}`, kind: 'monitors' });
      }
      for (const item of groups.evidence?.data || []) {
        results.push({ label: item.monitor_name || 'Evidence', detail: `${item.outcome || 'Evidence'} · ${item.recorded_at || ''}`, href: `/monitors/${encodeURIComponent(item.monitor_id)}?workspace_id=${encodeURIComponent(workspaceId)}`, kind: 'evidence' });
      }
      for (const item of groups.templates?.data || []) {
        results.push({ label: item.name, detail: `${item.kind === 'built_in' ? 'Built-in template' : 'Custom template'} · v${item.version}`, href: '/templates', kind: 'templates' });
      }
      for (const item of groups.tags?.data || []) {
        results.push({ label: item.name, detail: `${item.monitor_count ?? 0} monitors`, href: '/monitors', kind: 'tags' });
      }
      searchResults = results;
      searchStatus = results.length ? '' : 'No matching workspace resources.';
    } catch (error) {
      if (sequence === searchSequence) {
        const status = error instanceof ApiClientError ? error.status : undefined;
        searchStatus = status === 403
          ? 'You do not have access to search this workspace.'
          : status
            ? 'Workspace search is temporarily unavailable.'
            : 'Could not reach workspace search. Try again.';
      }
    } finally {
      if (sequence === searchSequence) searchLoading = false;
    }
  }

  onMount(() => {
    applyAppearance(initialAppearancePreference ?? readAppearancePreference(), false);

    const onSystemThemeChange = () => {
      if (appearance === 'system') applyAppearance('system', false);
    };
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change', onSystemThemeChange);

    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', onKeydown);

    let header: HTMLElement | null = null;
    const onScroll = () => {
      header ??= document.querySelector<HTMLElement>('[data-app-header]');
      header?.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    void loadWorkspaceSelection().then((selection) => {
      workspaces = selection.workspaces;
      activeWorkspaceId = selection.activeWorkspaceId;
      workspaceError = selection.error;
      workspaceLoading = false;
    });

    return () => {
      media.removeEventListener?.('change', onSystemThemeChange);
      document.removeEventListener('keydown', onKeydown);
      window.removeEventListener('scroll', onScroll);
      if (searchTimer) clearTimeout(searchTimer);
    };
  });
</script>

<div class="app-shell-controls" style="display: contents">
  <div class="app-header__identity">
    <a class="brand" href="/" aria-label="TrueExit home">
      <img class="brand__mark dark:hidden" src="/brand/trueexit-symbol.svg" alt="" aria-hidden="true" decoding="async" />
      <img class="brand__mark hidden dark:block" src="/brand/trueexit-symbol-inverse.svg" alt="" aria-hidden="true" decoding="async" />
    </a>
    <WorkspaceSwitcher
      {workspaces}
      {activeWorkspaceId}
      {workspaceLoading}
      {workspaceError}
      bind:workspaceMenuOpen
      bind:workspaceSearchQuery
      onChooseWorkspace={chooseWorkspace}
    />
  </div>

  <Button variant="ghost" size="icon" class="search-trigger" onclick={openSearch} aria-label="Quick navigation" title="Quick navigation (⌘K)">
    <Search class="size-4" />
  </Button>

  <div class="app-header__utilities" aria-label="Application utilities">
    <AppearanceToggle isDark={effectiveTheme() === 'dark'} onToggle={toggleAppearance} />
    <AccountMenu {email} {initials} onNavigate={navigateTo} />
  </div>
</div>

<QuickNavigation
  bind:open={searchOpen}
  bind:query={searchQuery}
  results={searchResults}
  status={searchStatus}
  loading={searchLoading}
  onQueryChange={updateSearch}
/>
