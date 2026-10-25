<svelte:options runes={true} />
<script lang="ts">
  import { Button } from '@/components/ui/button/index.js';
  import { ArrowUpDown, Plus } from '@lucide/svelte';
  import type { Monitor, MonitorStatus } from '@/lib/client/monitor-types';
  import type { MonitorSort } from '@/lib/client/monitor-queries';
  import MonitorInventoryFilters from '@/features/monitors/inventory/monitor-inventory-filters.svelte';
  import MonitorInventoryTable from '@/features/monitors/inventory/monitor-inventory-table.svelte';
  import MonitorInventoryPagination from '@/features/monitors/inventory/monitor-inventory-pagination.svelte';

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
      <MonitorInventoryFilters
        bind:search
        bind:statusFilter
        bind:tagFilter
        bind:sort
        bind:direction
        bind:includeArchived
        {workspaceTags}
        onSearchInput={onSearchInput}
        onApplyFilters={onApplyFilters}
        onClearFilters={onClearFilters}
      />

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

        <MonitorInventoryTable
          {monitors}
          {workspaceId}
          {loadingMonitors}
          {tagBusy}
          {creating}
          {busyMonitorId}
          {onManageTags}
          {onEditMonitor}
          {onLifecycleAction}
        />

        <MonitorInventoryPagination
          {pageIndex}
          {nextCursor}
          {loadingMonitors}
          onPreviousPage={onPreviousPage}
          onNextPage={onNextPage}
        />
      {/if}
      <p class="text-xs text-muted-foreground">Monitor IDs and Ping capabilities are intentionally not displayed. Archived monitors retain evidence and health history; restoring returns them to disabled.</p>
    </section>
  {/if}
</div>
