<script lang="ts">
  import { onMount } from 'svelte';
  import * as DropdownMenu from './ui/dropdown-menu/index.js';
  import * as Popover from './ui/popover/index.js';
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
  let workspaceSearchQuery = $state('');
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
    const themeColor = document.querySelector<HTMLMetaElement>('[data-theme-color]');
    if (themeColor) themeColor.content = resolved === 'dark' ? themeColor.dataset.darkColor ?? '#0a0a0a' : themeColor.dataset.lightColor ?? '#ffffff';
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
      <img
        class="brand__mark dark:hidden"
        src="/brand/trueexit-symbol.svg"
        alt=""
        aria-hidden="true"
        decoding="async"
      />
      <img
        class="brand__mark hidden dark:block"
        src="/brand/trueexit-symbol-inverse.svg"
        alt=""
        aria-hidden="true"
        decoding="async"
      />
    </a>

    <Popover.Root bind:open={workspaceMenuOpen}>
      <Popover.Trigger
        class="workspace-switcher__trigger"
        disabled={workspaceLoading || !!workspaceError || !workspaces.length}
        aria-label="Switch workspace"
      >
        <span class="workspace-switcher__name">{#if workspaceLoading}Loading workspace…{:else if workspaceError}{workspaces.length ? 'Workspace unavailable' : 'No workspace'}{:else}{workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name || 'Choose workspace'}{/if}</span>
        <ChevronDown class="size-4 shrink-0" />
      </Popover.Trigger>
      <Popover.Content
        class="w-80 max-w-[calc(100vw-1.5rem)] gap-0 p-2"
        align="center"
        sideOffset={8}
        aria-label="Switch workspace"
      >
        <Command.Root class="min-h-0">
          <Command.Input
            bind:value={workspaceSearchQuery}
            placeholder="Search workspaces…"
            aria-label="Search workspaces"
          />
          <Command.List class="mt-3 w-full max-h-72">
            <Command.Empty>No matching workspaces.</Command.Empty>
            <Command.Group class="w-full">
              {#each workspaces as workspace (workspace.id)}
                <Command.Item
                  value={`${workspace.name} ${workspace.personal ? 'Personal' : ''}`}
                  onSelect={() => {
                    workspaceSearchQuery = '';
                    chooseWorkspace(workspace.id);
                  }}
                  class="relative box-border w-full cursor-pointer gap-2 px-3 py-2.5"
                >
                  <span class="min-w-0 flex-1 truncate pr-8">{workspace.name}{workspace.personal ? ' · Personal' : ''}</span>
                  {#if workspace.id === activeWorkspaceId}<Check class="pointer-events-none absolute right-3 size-4 shrink-0" />{/if}
                </Command.Item>
              {/each}
            </Command.Group>
            {#if workspaceError}
              <div class="px-3 py-2 text-xs text-muted-foreground">{workspaceError}</div>
            {/if}
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>

  </div>

  <Button variant="ghost" size="icon" class="search-trigger" onclick={openSearch} aria-label="Quick navigation" title="Quick navigation (⌘K)">
    <Search class="size-4" />
  </Button>

  <div class="app-header__utilities" aria-label="Application utilities">
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
