<svelte:options runes={true} />
<script lang="ts">
  import * as Select from './ui/select/index.js';
  import * as Table from './ui/table/index.js';
  import { Button } from './ui/button/index.js';
  import { Input } from './ui/input/index.js';
  import { Checkbox } from './ui/checkbox/index.js';
  import { Badge } from './ui/badge/index.js';
  import {
    Search, X, ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Tags,
    Pencil, Pause, Play, RotateCcw, Archive, Plus, ChevronLeft, ChevronRight
  } from '@lucide/svelte';
  import type { Monitor, MonitorStatus } from '../lib/client/monitor-types';
  import type { MonitorSort } from '../lib/client/monitor-queries';
  import { formatMonitorCadence, formatMonitorDate } from '../lib/client/monitor-format';

  let {
    workspaceId,
    loadingWorkspaces = false,
    bootError = '',
    hasWorkspace = false,
    loadingMonitors = false,
    listError = '',
    actionError = '',
    actionMessage = '',
    monitors = [],
    search = $bindable(''),
    statusFilter = $bindable<'all' | MonitorStatus>('all'),
    tagFilter = $bindable(''),
    sort = $bindable<MonitorSort>('updated_at'),
    direction = $bindable<'asc' | 'desc'>('desc'),
    includeArchived = $bindable(false),
    workspaceTags = [],
    tagBusy = false,
    creating = false,
    busyMonitorId = '',
    nextCursor = null,
    pageIndex = 0,
    onRetryWorkspace,
    onNewMonitor,
    onSearchInput,
    onApplyFilters,
    onClearFilters,
    onRetryList,
    onManageTags,
    onEditMonitor,
    onLifecycleAction,
    onPreviousPage,
    onNextPage,
  }: {
    workspaceId: string;
    loadingWorkspaces?: boolean;
    bootError?: string;
    hasWorkspace?: boolean;
    loadingMonitors?: boolean;
    listError?: string;
    actionError?: string;
    actionMessage?: string;
    monitors?: Monitor[];
    search?: string;
    statusFilter?: 'all' | MonitorStatus;
    tagFilter?: string;
    sort?: MonitorSort;
    direction?: 'asc' | 'desc';
    includeArchived?: boolean;
    workspaceTags?: Array<{ id: string; name: string }>;
    tagBusy?: boolean;
    creating?: boolean;
    busyMonitorId?: string;
    nextCursor?: string | null;
    pageIndex?: number;
    onRetryWorkspace: () => void;
    onNewMonitor: () => void;
    onSearchInput: () => void;
    onApplyFilters: () => void;
    onClearFilters: () => void;
    onRetryList: () => void;
    onManageTags: (monitor: Monitor) => void;
    onEditMonitor: (monitor: Monitor) => void;
    onLifecycleAction: (monitor: Monitor, action: 'pause' | 'resume' | 'archive' | 'restore') => void;
    onPreviousPage: () => void;
    onNextPage: () => void;
  } = $props();

  const monitorSortOptions: readonly MonitorSort[] = ['updated_at', 'created_at', 'name', 'id'];
  function isMonitorSort(value: string): value is MonitorSort {
    return monitorSortOptions.some((option) => option === value);
  }
</script>

<div class="mx-auto flex w-full min-w-0 flex-col gap-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0 space-y-1">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your checks</p>
      <h1 id="monitor-page-title" class="text-2xl font-semibold tracking-tight">Monitors</h1>
      <p class="max-w-3xl text-sm text-muted-foreground">Inspect monitor configuration and control its lifecycle. Health is shown as persisted evidence and field signals—not a guessed overall verdict.</p>
    </div>
    <Button onclick={onNewMonitor} disabled={loadingWorkspaces || !workspaceId}>
      <Plus class="mr-1 size-4" /> New monitor
    </Button>
  </header>

  {#if loadingWorkspaces}
    <div class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground" aria-live="polite">
      <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>
      Loading your workspace…
    </div>
  {:else if bootError}
    <div class="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4" role="alert">
      <p class="text-sm">{bootError}</p>
      <Button variant="outline" onclick={onRetryWorkspace}>Try again</Button>
    </div>
  {:else if !hasWorkspace}
    <div class="rounded-lg border border-dashed p-10 text-center">
      <h2 class="font-medium">No workspace available</h2>
      <p class="mt-1 text-sm text-muted-foreground">Your account is authenticated, but there is no active workspace to inspect.</p>
    </div>
  {:else}
    <section class="space-y-4" aria-label="Monitor inventory">
      <div class="flex flex-wrap items-end gap-3">
        <div class="relative min-w-56 flex-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input class="pl-9 pr-9" aria-label="Search monitor names" bind:value={search} oninput={onSearchInput} placeholder="Search monitors…" maxlength={200} />
          {#if search}
            <Button class="absolute right-1 top-1/2 size-7 -translate-y-1/2" variant="ghost" size="icon-sm" aria-label="Clear search" onclick={() => { search = ''; onApplyFilters(); }}>
              <X class="size-4" />
            </Button>
          {/if}
        </div>

        <div class="grid min-w-36 gap-1.5">
          <label class="text-xs font-medium text-muted-foreground" for="monitor-status-filter">Status</label>
          <Select.Root type="single" value={statusFilter} onValueChange={(value) => { if (value) { statusFilter = value as 'all' | MonitorStatus; onApplyFilters(); } }}>
            <Select.Trigger id="monitor-status-filter" class="w-full">
              <Select.Value placeholder="All active" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all" label="All active">All active</Select.Item>
              <Select.Item value="enabled" label="Enabled">Enabled</Select.Item>
              <Select.Item value="disabled" label="Disabled">Disabled</Select.Item>
              <Select.Item value="archived" label="Archived">Archived</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>

        <div class="grid min-w-36 gap-1.5">
          <label class="text-xs font-medium text-muted-foreground" for="monitor-tag-filter">Tag</label>
          <Select.Root type="single" value={tagFilter || '__trueexit_all_tags__'} onValueChange={(value) => { if (value) { tagFilter = value === '__trueexit_all_tags__' ? '' : value; onApplyFilters(); } }}>
            <Select.Trigger id="monitor-tag-filter" class="w-full">
              <Select.Value placeholder="All tags" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="__trueexit_all_tags__" label="All tags">All tags</Select.Item>
              {#each workspaceTags as tag (tag.id)}
                <Select.Item value={tag.id} label={tag.name}>{tag.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="grid min-w-40 gap-1.5">
          <label class="text-xs font-medium text-muted-foreground" for="monitor-sort-filter">Sort by</label>
          <Select.Root type="single" value={sort} onValueChange={(value) => { if (value && isMonitorSort(value)) { sort = value; onApplyFilters(); } }}>
            <Select.Trigger id="monitor-sort-filter" class="w-full">
              <Select.Value placeholder="Recently updated" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="updated_at" label="Recently updated">Recently updated</Select.Item>
              <Select.Item value="created_at" label="Recently created">Recently created</Select.Item>
              <Select.Item value="name" label="Name">Name</Select.Item>
              <Select.Item value="id" label="Default order">Default order</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>

        <Button variant="outline" onclick={() => { direction = direction === 'desc' ? 'asc' : 'desc'; onApplyFilters(); }} aria-label={`Sort ${direction === 'desc' ? 'ascending' : 'descending'}`} title={`Currently ${direction === 'desc' ? 'descending' : 'ascending'}`}>
          {#if direction === 'desc'}<ArrowDown class="size-4" />{:else}<ArrowUp class="size-4" />{/if}
          {direction === 'desc' ? 'Descending' : 'Ascending'}
        </Button>

        <label class="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
          <Checkbox bind:checked={includeArchived} onchange={onApplyFilters} />
          Include archived
        </label>

        <Button variant="ghost" onclick={onClearFilters} disabled={!search && statusFilter === 'all' && !tagFilter && !includeArchived}>
          Clear filters
        </Button>
      </div>

      {#if actionError}
        <div class="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{actionError}</div>
      {/if}
      {#if actionMessage}
        <div class="rounded-md border border-border bg-muted/40 p-3 text-sm" role="status">{actionMessage}</div>
      {/if}

      {#if listError}
        <div class="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4" role="alert">
          <p class="text-sm">{listError}</p>
          <Button variant="outline" onclick={onRetryList}>Try again</Button>
        </div>
      {:else if loadingMonitors && monitors.length === 0}
        <div class="flex items-center gap-3 rounded-lg border p-8 text-sm text-muted-foreground" aria-live="polite">
          <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>
          Loading monitors…
        </div>
      {:else if monitors.length === 0}
        <div class="rounded-lg border border-dashed px-6 py-14 text-center">
          <div class="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><ArrowUpDown class="size-5" /></div>
          <h2 class="font-semibold">{search || statusFilter !== 'all' || tagFilter ? 'No monitors match these filters' : 'Nothing to monitor yet'}</h2>
          <p class="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">{search || statusFilter !== 'all' || tagFilter ? 'Try another search or broaden the status or tag filter.' : 'There are no monitors in this view yet. Create one by defining the fields TrueExit should observe.'}</p>
          <div class="mt-4">
            {#if search || statusFilter !== 'all' || tagFilter || includeArchived}
              <Button variant="outline" onclick={onClearFilters}>Clear filters</Button>
            {:else}
              <Button onclick={onNewMonitor} disabled={loadingWorkspaces || !workspaceId}><Plus class="mr-1 size-4" /> Create your first monitor</Button>
            {/if}
          </div>
        </div>
      {:else}
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p aria-live="polite">{loadingMonitors ? 'Refreshing…' : `${monitors.length} monitor${monitors.length === 1 ? '' : 's'} on this page`}</p>
          <p>Page {pageIndex + 1}</p>
        </div>

        <div class="overflow-hidden rounded-lg border" aria-busy={loadingMonitors}>
          <Table.Root class="min-w-6xl">
            <Table.Caption>Monitor inventory and lifecycle controls.</Table.Caption>
            <Table.Header>
              <Table.Row class="bg-muted/50 hover:bg-muted/50">
                <Table.Head class="w-[28%]">Monitor</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Cadence</Table.Head>
                <Table.Head>Configuration</Table.Head>
                <Table.Head>Last updated</Table.Head>
                <Table.Head class="text-right">Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each monitors as monitor (monitor.id)}
                <Table.Row>
                  <Table.Cell class="max-w-[24rem] whitespace-normal">
                    <div class="min-w-0 space-y-1">
                      <a class="font-medium underline-offset-4 hover:underline" href={`/monitors/${encodeURIComponent(monitor.id)}?workspace_id=${encodeURIComponent(workspaceId)}`}>{monitor.name}</a>
                      <p class="line-clamp-2 text-xs text-muted-foreground">{monitor.description || 'No description added yet.'}</p>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge variant={monitor.status === 'enabled' ? 'default' : 'secondary'} class="capitalize">{monitor.status}</Badge>
                  </Table.Cell>
                  <Table.Cell>{formatMonitorCadence(monitor.cadence_seconds)}</Table.Cell>
                  <Table.Cell>v{monitor.current_config_version}</Table.Cell>
                  <Table.Cell>{formatMonitorDate(monitor.updated_at)}</Table.Cell>
                  <Table.Cell>
                    <div class="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" href={`/monitors/${encodeURIComponent(monitor.id)}?workspace_id=${encodeURIComponent(workspaceId)}`} aria-label={`Investigate ${monitor.name}`} title="Investigate">
                        <ExternalLink class="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Manage tags for ${monitor.name}`} title="Manage tags" disabled={tagBusy || creating || !!busyMonitorId} onclick={() => onManageTags(monitor)}>
                        <Tags class="size-4" />
                      </Button>
                      {#if monitor.status !== 'archived'}
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${monitor.name}`} title="Edit monitor" disabled={!!busyMonitorId || creating} onclick={() => onEditMonitor(monitor)}>
                          <Pencil class="size-4" />
                        </Button>
                      {/if}
                      {#if monitor.status === 'enabled'}
                        <Button variant="ghost" size="icon-sm" aria-label={`Pause ${monitor.name}`} title="Pause monitor" disabled={!!busyMonitorId} onclick={() => onLifecycleAction(monitor, 'pause')}>
                          <Pause class="size-4" />
                        </Button>
                      {:else if monitor.status === 'disabled'}
                        <Button variant="ghost" size="icon-sm" aria-label={`Resume ${monitor.name}`} title="Resume monitor" disabled={!!busyMonitorId} onclick={() => onLifecycleAction(monitor, 'resume')}>
                          <Play class="size-4" />
                        </Button>
                      {:else}
                        <Button variant="ghost" size="icon-sm" aria-label={`Restore ${monitor.name}`} title="Restore monitor" disabled={!!busyMonitorId} onclick={() => onLifecycleAction(monitor, 'restore')}>
                          <RotateCcw class="size-4" />
                        </Button>
                      {/if}
                      {#if monitor.status !== 'archived'}
                        <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" aria-label={`Archive ${monitor.name}`} title="Archive monitor" disabled={!!busyMonitorId} onclick={() => onLifecycleAction(monitor, 'archive')}>
                          <Archive class="size-4" />
                        </Button>
                      {/if}
                    </div>
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>

        <nav class="flex flex-wrap items-center justify-between gap-3" aria-label="Monitor list pages">
          <p class="text-sm text-muted-foreground">Page {pageIndex + 1}</p>
          <div class="flex items-center gap-2">
            <Button variant="outline" onclick={onPreviousPage} disabled={pageIndex === 0 || loadingMonitors}>
              <ChevronLeft class="size-4" /> Previous
            </Button>
            <Button variant="outline" onclick={onNextPage} disabled={!nextCursor || loadingMonitors}>
              Next <ChevronRight class="size-4" />
            </Button>
          </div>
        </nav>
      {/if}
      <p class="text-xs text-muted-foreground">Monitor IDs and Ping capabilities are intentionally not displayed. Archived monitors retain evidence and health history; restoring returns them to disabled.</p>
    </section>
  {/if}
</div>
