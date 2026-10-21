<script lang="ts">
  import StyledSelect from './ui/StyledSelect.svelte';
  import type { Monitor, MonitorStatus } from '../lib/client/monitor-types';
  import { formatMonitorCadence, formatMonitorDate } from '../lib/client/monitor-format';

  export let workspaceId: string;
  export let loadingWorkspaces = false;
  export let bootError = '';
  export let hasWorkspace = false;
  export let loadingMonitors = false;
  export let listError = '';
  export let actionError = '';
  export let actionMessage = '';
  export let monitors: Monitor[] = [];
  export let search = '';
  export let statusFilter: 'all' | MonitorStatus = 'all';
  export let tagFilter = '';
  export let sort = 'updated_at';
  export let direction: 'asc' | 'desc' = 'desc';
  export let includeArchived = false;
  export let workspaceTags: Array<{ id: string; name: string }> = [];
  export let tagBusy = false;
  export let creating = false;
  export let busyMonitorId = '';
  export let nextCursor: string | null = null;
  export let pageIndex = 0;

  export let onRetryWorkspace: () => void;
  export let onNewMonitor: () => void;
  export let onSearchInput: () => void;
  export let onApplyFilters: () => void;
  export let onClearFilters: () => void;
  export let onRetryList: () => void;
  export let onManageTags: (monitor: Monitor) => void;
  export let onEditMonitor: (monitor: Monitor) => void;
  export let onLifecycleAction: (monitor: Monitor, action: 'pause' | 'resume' | 'archive' | 'restore') => void;
  export let onPreviousPage: () => void;
  export let onNextPage: () => void;
</script>

<div class="monitor-page-heading">
  <div>
    <p class="eyebrow">YOUR CHECKS</p>
    <h1 id="monitor-page-title">Monitors</h1>
    <p class="monitor-page-subtitle">Inspect monitor configuration and control its lifecycle. Health is shown as persisted evidence and field signals—not a guessed overall verdict.</p>
  </div>
  <button class="monitor-button monitor-button--primary monitor-create-trigger" type="button" on:click={onNewMonitor} disabled={loadingWorkspaces || !workspaceId}>＋ New monitor</button>
</div>

{#if loadingWorkspaces}
  <div class="monitor-state" aria-live="polite"><span class="monitor-loader" aria-hidden="true"></span>Loading your workspace…</div>
{:else if bootError}
  <div class="monitor-state monitor-state--error" role="alert"><p>{bootError}</p><button class="monitor-button monitor-button--quiet" type="button" on:click={onRetryWorkspace}>Try again</button></div>
{:else if !hasWorkspace}
  <div class="monitor-state monitor-state--empty"><h2>No workspace available</h2><p>Your account is authenticated, but there is no active workspace to inspect.</p></div>
{:else}
  <div class="monitor-toolbar">
    <label class="monitor-search">
      <span class="monitor-search__icon" aria-hidden="true">⌕</span>
      <span class="sr-only">Search monitor names</span>
      <input bind:value={search} on:input={onSearchInput} placeholder="Search monitors…" maxlength="200" />
      {#if search}<button type="button" class="monitor-search__clear" aria-label="Clear search" on:click={() => { search = ''; onApplyFilters(); }}>×</button>{/if}
    </label>
    <div class="monitor-filter"><span>Status</span><StyledSelect label="Status" value={statusFilter} options={[{ value: 'all', label: 'All active' }, { value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }, { value: 'archived', label: 'Archived' }]} on:change={(event) => { statusFilter = event.detail.value; onApplyFilters(); }} /></div>
    <div class="monitor-filter"><span>Tag</span><StyledSelect label="Tag" value={tagFilter} options={[{ value: '', label: 'All tags' }, ...workspaceTags.map((tag) => ({ value: tag.id, label: tag.name }))]} on:change={(event) => { tagFilter = event.detail.value; onApplyFilters(); }} /></div>
    <div class="monitor-filter"><span>Sort by</span><StyledSelect label="Sort by" value={sort} options={[{ value: 'updated_at', label: 'Recently updated' }, { value: 'created_at', label: 'Recently created' }, { value: 'name', label: 'Name' }, { value: 'id', label: 'Default order' }]} on:change={(event) => { sort = event.detail.value; onApplyFilters(); }} /></div>
    <button class="monitor-sort-direction" type="button" on:click={() => { direction = direction === 'desc' ? 'asc' : 'desc'; onApplyFilters(); }} aria-label={`Sort ${direction === 'desc' ? 'ascending' : 'descending'}`} title={`Currently ${direction === 'desc' ? 'descending' : 'ascending'}`}>
      {direction === 'desc' ? '↓' : '↑'} <span>{direction === 'desc' ? 'Desc' : 'Asc'}</span>
    </button>
    <label class="monitor-archived-toggle"><input type="checkbox" bind:checked={includeArchived} on:change={onApplyFilters} /><span>Include archived</span></label>
  </div>

  {#if actionError}<div class="monitor-inline-alert" role="alert"><p>{actionError}</p></div>{/if}
  {#if actionMessage}<div class="monitor-inline-success" role="status">{actionMessage}</div>{/if}

  {#if listError}
    <div class="monitor-state monitor-state--error" role="alert"><p>{listError}</p><button class="monitor-button monitor-button--quiet" type="button" on:click={onRetryList}>Try again</button></div>
  {:else if loadingMonitors && monitors.length === 0}
    <div class="monitor-state" aria-live="polite"><span class="monitor-loader" aria-hidden="true"></span>Loading monitors…</div>
  {:else if monitors.length === 0}
    <div class="monitor-state monitor-state--empty">
      <span class="monitor-empty-mark" aria-hidden="true">⌁</span>
      <h2>{search || statusFilter !== 'all' || tagFilter ? 'No monitors match these filters' : 'Nothing to monitor yet'}</h2>
      <p>{search || statusFilter !== 'all' || tagFilter ? 'Try another search or broaden the status or tag filter.' : 'There are no monitors in this view yet. Create one by defining the fields TrueExit should observe.'}</p>
      {#if search || statusFilter !== 'all' || tagFilter}<button class="monitor-button monitor-button--quiet" type="button" on:click={onClearFilters}>Clear filters</button>{:else}<button class="monitor-button monitor-button--primary" type="button" on:click={onNewMonitor}>Create your first monitor</button>{/if}
    </div>
  {:else}
    <div class="monitor-results-heading"><span>{loadingMonitors ? 'Refreshing…' : `${monitors.length} monitor${monitors.length === 1 ? '' : 's'} on this page`}</span><span>Page {pageIndex + 1}</span></div>
    <div class="monitor-list" aria-busy={loadingMonitors}>
      {#each monitors as monitor (monitor.id)}
        <article class="monitor-row">
          <div class="monitor-row__main">
            <div class="monitor-row__identity">
              <span class={`monitor-status-dot monitor-status-dot--${monitor.status}`} aria-hidden="true"></span>
              <div class="monitor-row__titleblock">
                <div class="monitor-row__titleline">
                  <h2>{monitor.name}</h2>
                  <span class={`monitor-status-pill monitor-status-pill--${monitor.status}`}>{monitor.status}</span>
                </div>
                <p class="monitor-row__description">{monitor.description || 'No description added yet.'}</p>
              </div>
            </div>
            <div class="monitor-row__facts" aria-label="Monitor details">
              <span><small>Cadence</small><strong>{formatMonitorCadence(monitor.cadence_seconds)}</strong></span>
              <span><small>Configuration</small><strong>v{monitor.current_config_version}</strong></span>
              <span><small>Last updated</small><strong>{formatMonitorDate(monitor.updated_at)}</strong></span>
            </div>
          </div>
          <div class="monitor-row__actions" aria-label={`${monitor.name} actions`}>
            <a class="monitor-icon-button" href={`/monitors/${encodeURIComponent(monitor.id)}?workspace_id=${encodeURIComponent(workspaceId)}`} aria-label={`Investigate ${monitor.name}`} title="Investigate">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4 10 14"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>
            </a>
            <button class="monitor-icon-button" type="button" aria-label={`Manage tags for ${monitor.name}`} title="Manage tags" disabled={tagBusy || creating || !!busyMonitorId} on:click={() => onManageTags(monitor)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13 13 20 3 10V3h7z"/><circle cx="7.5" cy="7.5" r="1"/></svg>
            </button>
            {#if monitor.status !== 'archived'}
              <button class="monitor-icon-button" type="button" aria-label={`Edit ${monitor.name}`} title="Edit monitor" disabled={!!busyMonitorId || creating} on:click={() => onEditMonitor(monitor)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M13 20h7"/></svg>
              </button>
            {/if}
            {#if monitor.status === 'enabled'}
              <button class="monitor-icon-button" type="button" aria-label={`Pause ${monitor.name}`} title="Pause monitor" disabled={!!busyMonitorId} on:click={() => onLifecycleAction(monitor, 'pause')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>
              </button>
            {:else if monitor.status === 'disabled'}
              <button class="monitor-icon-button" type="button" aria-label={`Resume ${monitor.name}`} title="Resume monitor" disabled={!!busyMonitorId} on:click={() => onLifecycleAction(monitor, 'resume')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>
              </button>
            {:else}
              <button class="monitor-icon-button" type="button" aria-label={`Restore ${monitor.name}`} title="Restore monitor" disabled={!!busyMonitorId} on:click={() => onLifecycleAction(monitor, 'restore')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
              </button>
            {/if}
            {#if monitor.status !== 'archived'}
              <button class="monitor-icon-button monitor-icon-button--danger" type="button" aria-label={`Archive ${monitor.name}`} title="Archive monitor" disabled={!!busyMonitorId} on:click={() => onLifecycleAction(monitor, 'archive')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg>
              </button>
            {/if}
          </div>
        </article>
      {/each}
    </div>
    <nav class="monitor-pagination" aria-label="Monitor list pages">
      <button class="monitor-button monitor-button--quiet" type="button" on:click={onPreviousPage} disabled={pageIndex === 0 || loadingMonitors}>← Previous</button>
      <span>Page {pageIndex + 1}</span>
      <button class="monitor-button monitor-button--quiet" type="button" on:click={onNextPage} disabled={!nextCursor || loadingMonitors}>Next →</button>
    </nav>
  {/if}
  <p class="monitor-footnote">Monitor IDs and Ping capabilities are intentionally not displayed. Archived monitors retain evidence and health history; restoring returns them to disabled.</p>
{/if}
