<script lang="ts">
  import { onMount } from 'svelte';
  import * as DropdownMenu from './ui/dropdown-menu/index.js';
  import * as Command from './ui/command/index.js';
  import { Button } from './ui/button/index.js';
  import {
    Search, ChevronDown, Check, Monitor, Sun, Moon, UserRound, LogOut,
    Settings, ArrowUpRight, LayoutDashboard, Activity, FileText, Tags, X
  } from '@lucide/svelte';
  import { loadWorkspaceBootstrap } from '../lib/client/workspace-bootstrap';
  import { assertApiSuccess, ApiClientError, requestApi } from '../lib/client/api-client';
  import { clearPersistedQueryCache, getSharedQueryClient } from '../lib/client/query-client';
  import { readActiveWorkspaceId, writeActiveWorkspaceId, resolveAndPersistWorkspaceId } from '../lib/client/workspace-preference';
  import { parseApiBody, workspaceSearchResponseSchema } from '../lib/client/api-schemas';
  import type { WorkspaceContext } from '../lib/client/workspace-bootstrap';

  type AppearancePreference = 'system' | 'light' | 'dark';
  type SearchResult = { label: string; detail: string; href: string; kind: string };

  let {
    email = 'Signed in',
    initials = 'TE'
  }: { email?: string; initials?: string } = $props();

  let workspaces: WorkspaceContext[] = $state([]);
  let activeWorkspaceId = $state('');
  let workspaceLoading = $state(true);
  let workspaceError = $state('');
  let workspaceMenuOpen = $state(false);
  let accountMenuOpen = $state(false);
  let searchOpen = $state(false);
  let searchQuery = $state('');
  let searchResults: SearchResult[] = $state([]);
  let searchStatus = $state('');
  let searchLoading = $state(false);
  let appearance = $state<AppearancePreference>('system');
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchSequence = 0;

  const navigationItems: SearchResult[] = [
    { label: 'Overview', detail: 'Dashboard and recent activity', href: '/', kind: 'overview' },
    { label: 'Monitors', detail: 'Monitor inventory and checks', href: '/monitors', kind: 'monitors' },
    { label: 'Settings', detail: 'Workspace settings and members', href: '/settings', kind: 'settings' },
    { label: 'Templates', detail: 'Global template library', href: '/templates', kind: 'templates' }
  ];
  const appearanceOrder: readonly AppearancePreference[] = ['light', 'dark', 'system'];
  const appearanceLabels: Record<AppearancePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

  function applyAppearance(preference: AppearancePreference, persist = true) {
    const resolved = preference === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved;
    document.querySelector<HTMLMetaElement>('[data-theme-color]')?.setAttribute('content', resolved === 'dark' ? '#09090d' : '#f6f6f9');
    appearance = preference;
    if (persist) {
      try { localStorage.setItem('trueexit.appearance', preference); } catch { /* Theme still applies for this page. */ }
    }
  }

  function chooseWorkspace(id: string) {
    const next = workspaces.find((workspace) => workspace.id === id);
    if (!next || id === activeWorkspaceId) { workspaceMenuOpen = false; return; }
    const confirmed = window.confirm(`Switch to “${next.name}”? This reloads the current page, so any unsaved changes may be lost.`);
    if (!confirmed) return;
    writeActiveWorkspaceId(id);
    const url = new URL(window.location.href);
    if (url.pathname.startsWith('/monitors/')) url.searchParams.set('workspace_id', id);
    else url.searchParams.delete('workspace_id');
    window.location.assign(url.toString());
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

  function resultIcon(kind: string) {
    if (kind === 'overview') return LayoutDashboard;
    if (kind === 'monitors') return Activity;
    if (kind === 'settings') return Settings;
    if (kind === 'templates') return FileText;
    if (kind === 'tags') return Tags;
    return FileText;
  }

  onMount(() => {
    const themeKey = 'trueexit.appearance';
    const stored = (() => {
      try { return localStorage.getItem(themeKey) || document.documentElement.dataset.themePreference || 'system'; }
      catch { return document.documentElement.dataset.themePreference || 'system'; }
    })();
    applyAppearance(stored === 'light' || stored === 'dark' ? stored : 'system', false);

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

    void (async () => {
      try {
        const result = await loadWorkspaceBootstrap();
        if (!result.workspaces.ok) throw new Error('workspace_load_failed');
        workspaces = result.workspaces.data.data;
        const me = result.me.ok ? result.me.data : null;
        const requested = new URLSearchParams(window.location.search).get('workspace_id');
        const storedWorkspace = readActiveWorkspaceId();
        activeWorkspaceId = resolveAndPersistWorkspaceId(workspaces, [requested, storedWorkspace, me?.personal_workspace_id]);
        if (!workspaces.length) workspaceError = 'No accessible workspace was returned for this account.';
      } catch {
        workspaceError = 'Could not load workspaces. Refresh to try again.';
      } finally {
        workspaceLoading = false;
      }
    })();

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
      <svg class="brand__mark" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path d="M25.7 8.3H13.4C8.8 8.3 5.1 12 5.1 16.6v5.1c0 3.3 2.7 6 6 6h8.4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
        <path d="M15.3 18h15.1m-6.2-6.2 6.2 6.2-6.2 6.2" stroke="url(#trueexit-shell-mark-gradient)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        <defs><linearGradient id="trueexit-shell-mark-gradient" x1="15.3" y1="18" x2="30.4" y2="18" gradientUnits="userSpaceOnUse"><stop stop-color="#6558E8" /><stop offset="1" stop-color="#9A78F5" /></linearGradient></defs>
      </svg>
    </a>

    <DropdownMenu.Root bind:open={workspaceMenuOpen}>
      <DropdownMenu.Trigger class="workspace-switcher__trigger" disabled={workspaceLoading || !!workspaceError || !workspaces.length}>
        <span class="workspace-switcher__name">{#if workspaceLoading}Loading workspace…{:else if workspaceError}{workspaces.length ? 'Workspace unavailable' : 'No workspace'}{:else}{workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name || 'Choose workspace'}{/if}</span>
        <ChevronDown class="size-4 shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content class="w-80 max-w-[calc(100vw-1.5rem)]" align="start">
        <DropdownMenu.Label>Switch workspace</DropdownMenu.Label>
        <DropdownMenu.Separator />
        {#each workspaces as workspace (workspace.id)}
          <DropdownMenu.Item onSelect={() => chooseWorkspace(workspace.id)} class="cursor-pointer">
            <span class="flex min-w-0 flex-1 items-center gap-2">
              <span class="size-2 rounded-sm border" class:bg-primary={workspace.id === activeWorkspaceId} aria-hidden="true"></span>
              <span class="truncate">{workspace.name}{workspace.personal ? ' · Personal' : ''}</span>
            </span>
            {#if workspace.id === activeWorkspaceId}<Check class="size-4" />{/if}
          </DropdownMenu.Item>
        {/each}
        {#if workspaceError}<p class="px-2 py-2 text-xs text-muted-foreground">{workspaceError}</p>{/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <Button variant="outline" size="sm" class="search-trigger gap-2" onclick={openSearch} aria-label="Quick navigation" title="Quick navigation (⌘K)">
      <Search class="size-4" />
      <span class="hidden text-xs sm:inline">Search</span>
      <kbd class="rounded border px-1 py-0.5 text-[10px] text-muted-foreground">⌘ K</kbd>
    </Button>
  </div>

  <div class="app-header__utilities" aria-label="Application utilities">
    <DropdownMenu.Root bind:open={accountMenuOpen}>
      <DropdownMenu.Trigger class="account-menu__trigger" aria-label="Open account menu">
        <span class="account-avatar" aria-hidden="true">{initials}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content class="w-64" align="end">
        <div class="flex items-center gap-3 px-2 py-2">
          <span class="account-avatar account-avatar--large" aria-hidden="true">{initials}</span>
          <span class="min-w-0 truncate text-xs font-medium" title={email}>{email}</span>
        </div>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={() => navigateTo('/account')}>
          <UserRound class="size-4" /> Account settings <ArrowUpRight class="ml-auto size-4" />
        </DropdownMenu.Item>
        <DropdownMenu.Item variant="destructive" onSelect={() => {
          void clearPersistedQueryCache().finally(() => window.location.assign('/logout'));
        }}>
          <LogOut class="size-4" /> Sign out <ArrowUpRight class="ml-auto size-4" />
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="icon-button" aria-label={`Appearance: ${appearanceLabels[appearance]}`}>
        {#if appearance === 'system'}<Monitor class="size-5" />{:else if appearance === 'light'}<Sun class="size-5" />{:else}<Moon class="size-5" />{/if}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        <DropdownMenu.Label>Appearance</DropdownMenu.Label>
        <DropdownMenu.Separator />
        {#each appearanceOrder as option}
          <DropdownMenu.Item onSelect={() => applyAppearance(option)}>
            {#if option === 'system'}<Monitor class="size-4" />{:else if option === 'light'}<Sun class="size-4" />{:else}<Moon class="size-4" />{/if}
            {appearanceLabels[option]}
            {#if appearance === option}<Check class="ml-auto size-4" />{/if}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</div>

<Command.Dialog bind:open={searchOpen} title="Quick navigation" description="Search navigation and workspace resources." class="top-[12%] translate-y-0 sm:top-[18%]">
  <Command.Input value={searchQuery} oninput={(event) => updateSearch(event.currentTarget.value)} placeholder="Search destinations and workspace resources…" />
  <Command.List class="max-h-[min(65vh,32rem)]">
    <Command.Group heading="Navigation">
      {#each navigationItems as item (item.href)}
        {@const Icon = resultIcon(item.kind)}
        <Command.LinkItem href={item.href} value={`${item.label} ${item.detail}`} onSelect={() => { searchOpen = false; }}>
          <Icon class="size-4 text-muted-foreground" />
          <span>{item.label}</span><span class="ml-auto text-xs text-muted-foreground">{item.detail}</span>
        </Command.LinkItem>
      {/each}
    </Command.Group>
    {#if searchQuery.trim().length >= 2}
      <Command.Separator />
      <Command.Group heading="Workspace results">
        {#if searchLoading}
          <div class="px-2 py-3 text-sm text-muted-foreground">Searching this workspace…</div>
        {:else if searchResults.length}
          {#each searchResults as item, index (`${item.kind}-${item.label}-${index}`)}
            {@const Icon = resultIcon(item.kind)}
            <Command.LinkItem href={item.href} value={`${item.label} ${item.detail}`} onSelect={() => { searchOpen = false; }}>
              <Icon class="size-4 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">{item.label}</span>
              <span class="max-w-[45%] truncate text-xs text-muted-foreground">{item.detail}</span>
            </Command.LinkItem>
          {/each}
        {:else if searchStatus}
          <div class="px-2 py-3 text-sm text-muted-foreground">{searchStatus}</div>
        {/if}
      </Command.Group>
    {/if}
    <Command.Empty>No matching navigation destinations.</Command.Empty>
  </Command.List>
</Command.Dialog>
