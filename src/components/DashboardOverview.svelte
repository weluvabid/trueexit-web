<svelte:options runes={true} />
<script lang="ts">
  import { onMount } from 'svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { getSharedQueryClient } from '../lib/client/query-client';
  import { dashboardQueryOptions, dashboardQueryErrorMessage, type DashboardResponse } from '../lib/client/dashboard-queries';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';
  import { readActiveWorkspaceId, writeActiveWorkspaceId, resolveWorkspaceId } from '../lib/client/workspace-preference';
  import { formatDateTime } from '../lib/client/date-format';

  type MonitorItem = { id: string; name: string; status: 'enabled' | 'disabled' | 'archived'; cadence_seconds?: number; updated_at?: string };
  type Page<T> = { data: T[]; page?: { next_cursor: string | null } };
  type View = 'overview' | 'attention' | 'signals' | 'monitors' | 'evidence';
  type AttentionFilter = 'all' | 'submission_rejected' | 'evidence_overdue' | 'health_signal';

  let workspaces = $state<WorkspaceContext[]>([]);
  let selectedWorkspaceId = $state('');
  let monitors = $state<MonitorItem[]>([]);
  let bootstrapping = $state(true);
  let loadingDetail = $state(false);
  let bootstrapError = $state('');
  let detailError = $state('');
  let view = $state<View>('overview');
  let attentionFilter = $state<AttentionFilter>('all');
  let monitorCursor = $state<string | null>(null);
  let evidenceCursor = $state<string | null>(null);
  let evidenceFrom = $state<string | null>(null);
  let detailHasMore = $state(false);
  let detailItems = $state<Array<Record<string, unknown>>>([]);
  let requestSequence = 0;
  let detailSequence = 0;
  let bootstrapSequence = 0;
  let disposed = false;

  const reasonCopy: Record<string, { title: string; detail: string }> = {
    submission_rejected: { title: 'A submission was rejected', detail: 'Inspect the evidence to understand why it did not pass validation.' },
    evidence_overdue: { title: 'Evidence is overdue', detail: 'This monitor has not received valid evidence within its expected window.' },
    health_signal: { title: 'A field health signal needs review', detail: 'Review configured field states; this is not independent proof of an outage.' },
  };
  const activityCopy: Record<string, string> = { accepted: 'Evidence accepted', evidence_accepted: 'Evidence accepted', rejected: 'Evidence rejected', evidence_rejected: 'Evidence rejected' };
  const filterLabels: Record<AttentionFilter, string> = { all: 'All', submission_rejected: 'Rejected', evidence_overdue: 'Missed / overdue', health_signal: 'Health signals' };

  function messageForCode(code: string | null, status: number): string {
    if (status === 401) return 'Your session needs attention. Sign in again to continue.';
    if (status === 403) return 'You do not have permission to view this workspace.';
    if (status === 404) return 'This workspace is no longer available.';
    if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
    if (status >= 500) return 'TrueExit could not load this information right now. Try again shortly.';
    return code ? `The request could not be completed (${code}).` : 'The request could not be completed. Please try again.';
  }
  function formatDate(value: string | null | undefined): string {
    return formatDateTime(value);
  }
  function relativeDate(value: string | null | undefined): string {
    if (!value) return 'Time unavailable';
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return 'Time unavailable';
    const minutes = Math.round((time - Date.now()) / 60000);
    if (Math.abs(minutes) < 1) return 'Just now';
    if (minutes < 0) return `${Math.abs(minutes)}m ago`;
    if (minutes < 60) return `In ${minutes}m`;
    const hours = Math.round(minutes / 60);
    return minutes < 1440 ? `In ${hours}h` : formatDate(value);
  }
  const queryClient = getSharedQueryClient();
  const dashboardQuery = createQuery(() => dashboardQueryOptions(selectedWorkspaceId), () => queryClient);
  const dashboard = $derived(dashboardQuery.data ?? null);
  const loadingDashboard = $derived(Boolean(selectedWorkspaceId) && dashboardQuery.isPending);
  const dashboardError = $derived(dashboardQuery.error && !dashboardQuery.data ? dashboardQueryErrorMessage(dashboardQuery.error) : '');
  const filteredAttention = $derived((dashboard?.attention_items ?? []).filter((item) => attentionFilter === 'all' || item.reason === attentionFilter).slice(0, 5));
  const monitorTotal = $derived((dashboard?.summary.active_monitors ?? 0) + (dashboard?.summary.disabled_monitors ?? 0));
  const monitorCategoryTotal = $derived((dashboard?.summary.active_monitors ?? 0) + (dashboard?.summary.disabled_monitors ?? 0) + (dashboard?.summary.needs_attention ?? 0));
  const emptyWorkspace = $derived(!!dashboard && monitorTotal === 0);

  async function loadDashboard(workspaceId: string) {
    const changedWorkspace = selectedWorkspaceId !== workspaceId;
    requestSequence += 1;
    selectedWorkspaceId = workspaceId;
    writeActiveWorkspaceId(workspaceId);
    monitors = [];
    detailError = '';
    view = 'overview';
    detailItems = [];
    monitorCursor = null;
    evidenceCursor = null;
    if (!workspaceId) return;
    if (!changedWorkspace) void dashboardQuery.refetch();
    // Inventory is optional; the dashboard summary remains usable if it fails.
    await loadMonitorPage(false, workspaceId, requestSequence);
  }

  async function fetchDashboardPage<T>(resource: 'monitors' | 'evidence', params: URLSearchParams): Promise<Page<T>> {
    const workspaceId = params.get('workspace_id') ?? '';
    const queryIdentity = params.toString();
    return queryClient.fetchQuery({
      queryKey: ['dashboard-page', workspaceId, resource, queryIdentity] as const,
      staleTime: 15_000,
      queryFn: async ({ signal }) => {
        const response = await fetch(`/api/backend/${resource}?${params.toString()}`, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          signal,
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(messageForCode(null, response.status));
        return body as Page<T>;
      },
    });
  }

  async function loadMonitorPage(append = false, workspaceId = selectedWorkspaceId, parentSequence = requestSequence) {
    const cursor = append ? monitorCursor : null;
    const query = new URLSearchParams({ workspace_id: workspaceId, limit: '50', sort: 'name', direction: 'asc' });
    if (cursor) query.set('cursor', cursor);
    let page: Page<MonitorItem>;
    try {
      page = await fetchDashboardPage<MonitorItem>('monitors', query);
    } catch {
      return; // Summary remains usable if the optional inventory request fails.
    }
    if (disposed || parentSequence !== requestSequence || workspaceId !== selectedWorkspaceId) return;
    if (disposed || parentSequence !== requestSequence || workspaceId !== selectedWorkspaceId) return;
    monitors = append ? [...monitors, ...(page.data ?? [])] : (page.data ?? []);
    monitorCursor = page.page?.next_cursor ?? null;
  }
  async function bootstrap() {
    const sequence = ++bootstrapSequence;
    bootstrapping = true;
    bootstrapError = '';
    try {
      const result = await loadWorkspaceBootstrap();
      if (disposed || sequence !== bootstrapSequence) return;
      if (!result.workspaces.ok) {
        bootstrapError = messageForCode(result.workspaces.code, result.workspaces.status);
        bootstrapping = false;
        return;
      }
      workspaces = result.workspaces.data.data;
      const personalId = result.me.ok ? result.me.data.personal_workspace_id : null;
      const requestedWorkspaceId = new URL(window.location.href).searchParams.get('workspace_id');
      const initialWorkspaceId = resolveWorkspaceId(workspaces, [requestedWorkspaceId, readActiveWorkspaceId(), personalId]);
      writeActiveWorkspaceId(initialWorkspaceId);
      bootstrapping = false;
      if (initialWorkspaceId) await loadDashboard(initialWorkspaceId);
    } catch {
      if (!disposed && sequence === bootstrapSequence) {
        bootstrapError = messageForCode('network_error', 0);
        bootstrapping = false;
      }
    }
  }
  function openView(next: View) {
    detailSequence += 1;
    loadingDetail = false;
    view = next; detailError = ''; detailItems = []; detailHasMore = false;
    const url = new URL(window.location.href);
    if (next === 'overview') { url.searchParams.delete('overview'); url.searchParams.delete('filter'); window.history.pushState({}, '', url); return; }
    url.searchParams.set('overview', next);
    if (next === 'attention' && attentionFilter !== 'all') url.searchParams.set('filter', attentionFilter); else url.searchParams.delete('filter');
    window.history.pushState({}, '', url);
    if (next === 'monitors') void loadMonitorDetail();
    if (next === 'evidence' || next === 'signals') void loadEvidenceDetail();
    if (next === 'attention') detailItems = (dashboard?.attention_items ?? []).map((x) => x as unknown as Record<string, unknown>);
  }
  async function loadMonitorDetail() {
    const sequence = ++detailSequence;
    const workspaceId = selectedWorkspaceId;
    loadingDetail = true;
    detailError = '';
    try {
      const query = new URLSearchParams({ workspace_id: workspaceId, limit: '50', sort: 'name', direction: 'asc' });
      const page = await fetchDashboardPage<MonitorItem>('monitors', query);
      if (disposed || sequence !== detailSequence || workspaceId !== selectedWorkspaceId || view !== 'monitors') return;
      detailItems = (page.data ?? []).map((x) => x as unknown as Record<string, unknown>);
      monitorCursor = page.page?.next_cursor ?? null;
      detailHasMore = !!monitorCursor;
    } catch (error) {
      if (!disposed && sequence === detailSequence && workspaceId === selectedWorkspaceId) detailError = error instanceof Error ? error.message : 'Could not load monitors.';
    } finally {
      if (!disposed && sequence === detailSequence) loadingDetail = false;
    }
  }
  async function loadMoreMonitors() {
    if (!monitorCursor || loadingDetail) return;
    const sequence = ++detailSequence;
    const workspaceId = selectedWorkspaceId;
    const cursor = monitorCursor;
    loadingDetail = true;
    try {
      const query = new URLSearchParams({ workspace_id: workspaceId, limit: '50', sort: 'name', direction: 'asc', cursor });
      const page = await fetchDashboardPage<MonitorItem>('monitors', query);
      if (disposed || sequence !== detailSequence || workspaceId !== selectedWorkspaceId || view !== 'monitors') return;
      detailItems = [...detailItems, ...(page.data ?? []).map((x) => x as unknown as Record<string, unknown>)];
      monitorCursor = page.page?.next_cursor ?? null;
      detailHasMore = !!monitorCursor;
    } catch (error) {
      if (!disposed && sequence === detailSequence && workspaceId === selectedWorkspaceId) detailError = error instanceof Error ? error.message : 'Could not load more monitors.';
    } finally {
      if (!disposed && sequence === detailSequence) loadingDetail = false;
    }
  }
  async function loadEvidenceDetail() {
    const sequence = ++detailSequence;
    const workspaceId = selectedWorkspaceId;
    const targetView = view;
    loadingDetail = true;
    detailError = '';
    try {
      const query = new URLSearchParams({ workspace_id: workspaceId, limit: '50', outcome: 'all' });
      evidenceFrom = targetView === 'signals'
        ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        : null;
      if (evidenceFrom) query.set('from', evidenceFrom);
      const page = await fetchDashboardPage<Record<string, unknown>>('evidence', query);
      if (disposed || sequence !== detailSequence || workspaceId !== selectedWorkspaceId || view !== targetView) return;
      detailItems = page.data ?? [];
      evidenceCursor = page.page?.next_cursor ?? null;
      detailHasMore = !!evidenceCursor;
    } catch (error) {
      if (!disposed && sequence === detailSequence && workspaceId === selectedWorkspaceId) detailError = error instanceof Error ? error.message : 'Could not load evidence activity.';
    } finally {
      if (!disposed && sequence === detailSequence) loadingDetail = false;
    }
  }
  async function loadMoreEvidence() {
    if (!evidenceCursor || loadingDetail || (view !== 'evidence' && view !== 'signals')) return;
    const sequence = ++detailSequence;
    const workspaceId = selectedWorkspaceId;
    const targetView = view;
    const cursor = evidenceCursor;
    loadingDetail = true;
    detailError = '';
    try {
      const query = new URLSearchParams({ workspace_id: workspaceId, limit: '50', outcome: 'all', cursor });
      if (evidenceFrom) query.set('from', evidenceFrom);
      const page = await fetchDashboardPage<Record<string, unknown>>('evidence', query);
      if (disposed || sequence !== detailSequence || workspaceId !== selectedWorkspaceId || view !== targetView) return;
      detailItems = [...detailItems, ...(page.data ?? [])];
      evidenceCursor = page.page?.next_cursor ?? null;
      detailHasMore = !!evidenceCursor;
    } catch (error) {
      if (!disposed && sequence === detailSequence && workspaceId === selectedWorkspaceId && view === targetView) {
        detailError = error instanceof Error ? error.message : 'Could not load more evidence activity.';
      }
    } finally {
      if (!disposed && sequence === detailSequence) loadingDetail = false;
    }
  }

  function changeFilter(filter: AttentionFilter) {
    attentionFilter = filter;
    if (view === 'attention') { const url = new URL(window.location.href); if (filter === 'all') url.searchParams.delete('filter'); else url.searchParams.set('filter', filter); window.history.replaceState({}, '', url); detailItems = (dashboard?.attention_items ?? []).filter((x) => filter === 'all' || x.reason === filter).map((x) => x as unknown as Record<string, unknown>); }
  }
  onMount(() => {
    const url = new URL(window.location.href); const requested = url.searchParams.get('overview') as View | null;
    if (requested && ['attention', 'signals', 'monitors', 'evidence'].includes(requested)) view = requested;
    const filter = url.searchParams.get('filter') as AttentionFilter | null;
    if (filter && filter in filterLabels) attentionFilter = filter;
    void bootstrap();
    const pop = () => { detailSequence += 1; loadingDetail = false; const u = new URL(window.location.href); const requestedView = u.searchParams.get('overview') as View | null; view = requestedView && ['attention','signals','monitors','evidence'].includes(requestedView) ? requestedView : 'overview'; if (view === 'monitors') void loadMonitorDetail(); if (view === 'signals' || view === 'evidence') void loadEvidenceDetail(); };
    window.addEventListener('popstate', pop); return () => { disposed = true; requestSequence += 1; detailSequence += 1; bootstrapSequence += 1; window.removeEventListener('popstate', pop); };
  });
</script>

<section class="dashboard-overview" aria-labelledby="dashboard-title">
  <div class="dashboard-heading">
    <div><p class="eyebrow">YOUR WORKSPACE, AT A GLANCE</p><h1 id="dashboard-title">The current picture</h1></div>
  </div>

  {#if bootstrapping}
    <div class="dashboard-bento dashboard-skeleton" aria-label="Loading workspace overview" aria-live="polite">
      <div class="dashboard-skeleton-card dashboard-skeleton-card--monitors"><i></i><b></b><span></span><span></span><span></span></div>
      <div class="dashboard-skeleton-card dashboard-skeleton-card--evidence-summary"><i></i><b></b><span></span><span></span></div>
      <div class="dashboard-skeleton-card dashboard-skeleton-card--pings"><i></i><b></b><span></span></div>
      <div class="dashboard-skeleton-card dashboard-skeleton-card--attention"><i></i><b></b><span></span><span></span><span></span></div>
      <div class="dashboard-skeleton-card dashboard-skeleton-card--signals"><i></i><b></b><span></span><span></span></div>
    </div>
  {:else if bootstrapError}
    <div class="dashboard-state dashboard-state--error" role="alert"><p>{bootstrapError}</p><button class="dashboard-retry" type="button" onclick={bootstrap}>Try again</button></div>
  {:else if workspaces.length === 0}
    <section class="dashboard-onboarding"><p class="eyebrow">A SIMPLE PLACE TO START</p><h2>Know what's real.<br/><span>Act with confidence.</span></h2><p>Connect your first monitor to see the evidence behind each result and understand service health without the noise.</p><a class="dashboard-primary-action" href="/monitors">Explore monitors <span aria-hidden="true">↗</span></a></section>
  {:else if loadingDashboard}
    <div class="dashboard-bento dashboard-skeleton" aria-label="Loading workspace overview" aria-live="polite"><div class="dashboard-skeleton-card dashboard-skeleton-card--monitors"><i></i><b></b><span></span><span></span><span></span></div><div class="dashboard-skeleton-card dashboard-skeleton-card--evidence-summary"><i></i><b></b><span></span><span></span></div><div class="dashboard-skeleton-card dashboard-skeleton-card--pings"><i></i><b></b><span></span></div><div class="dashboard-skeleton-card dashboard-skeleton-card--attention"><i></i><b></b><span></span><span></span><span></span></div><div class="dashboard-skeleton-card dashboard-skeleton-card--signals"><i></i><b></b><span></span><span></span></div></div>
  {:else if dashboardError}
    <div class="dashboard-state dashboard-state--error" role="alert"><p>{dashboardError}</p><button class="dashboard-retry" type="button" onclick={() => loadDashboard(selectedWorkspaceId)}>Try again</button></div>
  {:else if dashboard && emptyWorkspace}
    <section class="dashboard-onboarding"><p class="eyebrow">A SIMPLE PLACE TO START</p><h2>Know what's real.<br/><span>Act with confidence.</span></h2><p>Connect your first monitor to see the evidence behind each result and understand service health without the noise.</p><a class="dashboard-primary-action" href="/monitors">Explore monitors <span aria-hidden="true">↗</span></a></section>
  {:else if dashboard}
    {#if view === 'overview'}
      <div class="dashboard-bento">
        <article class="dashboard-bento-card dashboard-monitors-card">
          <div class="dashboard-bento-heading"><div><p class="eyebrow">INVENTORY</p><h2>Monitors</h2></div><a href="/monitors" class="dashboard-card-link">View all <span aria-hidden="true">↗</span></a></div>
          <div class="dashboard-total"><strong>{monitorTotal}</strong><span>monitors in this workspace</span></div>
          <div class="dashboard-monitor-breakdown">
            <button type="button" onclick={() => openView('monitors')}><span class="dashboard-state-dot dashboard-state-dot--active"></span><strong>{dashboard.summary.active_monitors}</strong><span>Active</span></button>
            <button type="button" onclick={() => openView('monitors')}><span class="dashboard-state-dot dashboard-state-dot--disabled"></span><strong>{dashboard.summary.disabled_monitors}</strong><span>Disabled</span></button>
            <button type="button" onclick={() => { attentionFilter = 'all'; openView('attention'); }}><span class="dashboard-state-dot dashboard-state-dot--attention"></span><strong>{dashboard.summary.needs_attention}</strong><span>Attention</span></button>
          </div>
          <div class="dashboard-segmented-bar" role="img" aria-label={`${dashboard.summary.active_monitors} enabled monitors, ${dashboard.summary.disabled_monitors} disabled monitors, ${dashboard.summary.needs_attention} monitors needing attention; attention can overlap enabled state`}><span class="dashboard-segment dashboard-segment--active" style={`--segment:${monitorCategoryTotal ? dashboard.summary.active_monitors / monitorCategoryTotal * 100 : 0}%`}></span><span class="dashboard-segment dashboard-segment--disabled" style={`--segment:${monitorCategoryTotal ? dashboard.summary.disabled_monitors / monitorCategoryTotal * 100 : 0}%`}></span><span class="dashboard-segment dashboard-segment--attention" style={`--segment:${monitorCategoryTotal ? dashboard.summary.needs_attention / monitorCategoryTotal * 100 : 0}%`}></span></div>
        </article>
<section class="dashboard-bento-card dashboard-evidence-card" aria-labelledby="evidence-title"><div class="dashboard-bento-heading"><div><p class="eyebrow">LAST 24 HOURS</p><h2 id="evidence-title">Evidence</h2></div><button class="dashboard-card-link" type="button" onclick={() => openView('evidence')}>View all <span aria-hidden="true">↗</span></button></div><div class="dashboard-evidence-summary"><div class="dashboard-total"><strong>{dashboard.summary.evidence_outcomes_24h.total}</strong><span>records received</span></div><div class="dashboard-evidence-breakdown"><button type="button" onclick={() => openView('evidence')}><span class="dashboard-evidence-key dashboard-evidence-key--accepted"></span><span>Accepted</span><strong>{dashboard.summary.evidence_outcomes_24h.accepted}</strong></button><button type="button" onclick={() => openView('evidence')}><span class="dashboard-evidence-key dashboard-evidence-key--rejected"></span><span>Rejected</span><strong>{dashboard.summary.evidence_outcomes_24h.rejected}</strong></button></div></div>{#if dashboard.summary.evidence_outcomes_24h.total > 0}<div class="dashboard-evidence-bar" role="img" aria-label={`${dashboard.summary.evidence_outcomes_24h.accepted} accepted and ${dashboard.summary.evidence_outcomes_24h.rejected} rejected evidence records`}><span class="dashboard-evidence-bar__accepted" style={`--segment:${dashboard.summary.evidence_outcomes_24h.accepted / dashboard.summary.evidence_outcomes_24h.total * 100}%`}></span><span class="dashboard-evidence-bar__rejected" style={`--segment:${dashboard.summary.evidence_outcomes_24h.rejected / dashboard.summary.evidence_outcomes_24h.total * 100}%`}></span></div>{/if}</section>
        <section class="dashboard-bento-card dashboard-pings-card" aria-labelledby="pings-title"><div class="dashboard-bento-heading"><div><p class="eyebrow">WHAT'S NEXT</p><h2 id="pings-title">Upcoming pings</h2></div><span class="dashboard-future-mark" aria-hidden="true">↗</span></div><div class="dashboard-pings-empty"><span class="dashboard-pings-orbit" aria-hidden="true"></span><div><strong>Expected activity, at a glance.</strong><p>Upcoming ping schedules will appear here when the workspace scheduling feed is connected.</p></div></div></section>
                        <section class="dashboard-bento-card dashboard-attention-card" aria-labelledby="attention-title"><div class="dashboard-bento-heading"><div><p class="eyebrow">WHAT MAY NEED YOU</p><h2 id="attention-title">Attention queue</h2></div><span class="dashboard-count">{dashboard.summary.needs_attention}</span></div><div class="dashboard-filter-chips" aria-label="Filter attention preview">{#each (['all','submission_rejected','evidence_overdue','health_signal'] as AttentionFilter[]) as filter}<button type="button" class:active={attentionFilter === filter} aria-pressed={attentionFilter === filter} onclick={() => changeFilter(filter)}>{filterLabels[filter]}</button>{/each}</div>
          {#if filteredAttention.length}<ul class="dashboard-list">{#each filteredAttention as item (`${item.monitor_id}-${item.reason}-${item.occurred_at ?? ''}`)}<li class="dashboard-attention-item"><span class="dashboard-attention-mark" aria-hidden="true"></span><div class="dashboard-list__body"><strong>{item.monitor_name}</strong><span class="dashboard-list__title">{reasonCopy[item.reason]?.title ?? 'Monitor needs review'}</span><p>{reasonCopy[item.reason]?.detail ?? 'Review this monitor for more context.'}</p><span class="dashboard-list__meta">{relativeDate(item.occurred_at ?? item.last_valid_evidence_at)}</span></div><a class="dashboard-row-link" href={`/monitors/${encodeURIComponent(item.monitor_id)}`} aria-label={`Investigate ${item.monitor_name}`}>↗</a></li>{/each}</ul>{:else}<div class="dashboard-inline-empty"><span aria-hidden="true">✳</span><p>{attentionFilter === 'all' ? 'Nothing needs your attention right now.' : `No ${filterLabels[attentionFilter].toLowerCase()} items are currently reported.`}</p></div>{/if}
          <button class="dashboard-view-all" type="button" onclick={() => openView('attention')}>View all attention <span aria-hidden="true">→</span></button>
        </section>
<section class="dashboard-bento-card dashboard-signals-card" aria-labelledby="signals-title"><div class="dashboard-bento-heading"><div><p class="eyebrow">RECENT SIGNALS</p><h2 id="signals-title">Evidence activity</h2></div><span class="dashboard-count">{dashboard.recent_evidence_activity.length}</span></div>{#if dashboard.recent_evidence_activity.length}<ul class="dashboard-list">{#each dashboard.recent_evidence_activity.slice(0,5) as item (item.event_id)}<li class="dashboard-activity-item"><span class="dashboard-activity-mark" aria-hidden="true"></span><div class="dashboard-list__body"><strong>{item.monitor_name}</strong><span class="dashboard-list__title">{activityCopy[item.event_type] ?? 'Evidence activity recorded'}</span><span class="dashboard-list__meta">{relativeDate(item.occurred_at)}</span></div></li>{/each}</ul>{:else}<div class="dashboard-inline-empty"><span aria-hidden="true">◌</span><p>No recent evidence activity has been recorded.</p></div>{/if}<button class="dashboard-view-all" type="button" onclick={() => openView('signals')}>View all signals <span aria-hidden="true">→</span></button></section>
      </div>
      <p class="dashboard-footnote">Summary generated {formatDate(dashboard.generated_at)}. Health counts are field-level signals, not a single monitor-wide health verdict.</p>
    {:else}
      <div class="dashboard-detail-view"><div class="dashboard-detail-breadcrumbs"><button type="button" onclick={() => openView('overview')}>Overview</button><span aria-hidden="true">/</span><span>{view === 'attention' ? 'Attention queue' : view === 'signals' ? 'Recent signals' : view === 'monitors' ? 'Monitors' : 'Evidence · 24 hours'}</span></div><div class="dashboard-detail-heading"><div><p class="eyebrow">WORKSPACE DETAIL</p><h2>{view === 'attention' ? 'Attention queue' : view === 'signals' ? 'Recent signals' : view === 'monitors' ? 'Monitors' : 'Evidence · last 24 hours'}</h2></div>{#if view === 'attention'}<span class="dashboard-count">{dashboard.summary.needs_attention}</span>{/if}</div>
        {#if view === 'attention'}<div class="dashboard-filter-chips dashboard-filter-chips--detail">{#each (['all','submission_rejected','evidence_overdue','health_signal'] as AttentionFilter[]) as filter}<button type="button" class:active={attentionFilter === filter} aria-pressed={attentionFilter === filter} onclick={() => changeFilter(filter)}>{filterLabels[filter]}</button>{/each}</div><div class="dashboard-detail-table-wrap"><table class="dashboard-detail-table"><thead><tr><th>Monitor</th><th>Reason</th><th>Last observed</th><th></th></tr></thead><tbody>{#each (dashboard.attention_items.filter((x) => attentionFilter === 'all' || x.reason === attentionFilter)) as item (`${item.monitor_id}-${item.reason}-${item.occurred_at ?? ''}`)}<tr><td><strong>{item.monitor_name}</strong></td><td>{reasonCopy[item.reason]?.title ?? 'Monitor needs review'}</td><td>{formatDate(item.occurred_at ?? item.last_valid_evidence_at)}</td><td><a href={`/monitors/${encodeURIComponent(item.monitor_id)}`}>Investigate →</a></td></tr>{/each}</tbody></table></div>{#if dashboard.attention_items.length === 0}<p class="dashboard-detail-empty">No attention items are currently reported.</p>{/if}
        {:else if loadingDetail}<div class="dashboard-detail-loading" aria-live="polite"><span class="dashboard-loader" aria-hidden="true"></span>Loading details…</div>{:else if detailError}<div class="dashboard-state dashboard-state--error" role="alert"><p>{detailError}</p><button class="dashboard-retry" type="button" onclick={() => view === 'monitors' ? loadMonitorDetail() : loadEvidenceDetail()}>Try again</button></div>
        {:else if view === 'monitors'}<div class="dashboard-detail-table-wrap"><table class="dashboard-detail-table"><thead><tr><th>Monitor</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>{#each detailItems as item (String(item.id))}<tr><td><strong>{String(item.name ?? 'Monitor')}</strong></td><td><span class={`dashboard-status dashboard-status--${String(item.status)}`}>{String(item.status)}</span></td><td>{formatDate(String(item.updated_at ?? ''))}</td><td><a href={`/monitors/${encodeURIComponent(String(item.id))}`}>Open →</a></td></tr>{/each}</tbody></table></div>{#if detailHasMore}<button class="dashboard-view-all" type="button" disabled={loadingDetail} onclick={loadMoreMonitors}>Load more monitors →</button>{/if}
        {:else}<div class="dashboard-detail-table-wrap"><table class="dashboard-detail-table"><thead><tr><th>Monitor</th><th>Outcome</th><th>Recorded</th><th>Evidence</th></tr></thead><tbody>{#each detailItems as item, i (`${String(item.id ?? item.event_id ?? i)}`)}<tr><td><strong>{String(item.monitor_name ?? item.monitor?.name ?? 'Monitor')}</strong></td><td>{String(item.outcome ?? item.event_type ?? 'Evidence recorded')}</td><td>{formatDate(String(item.created_at ?? item.occurred_at ?? ''))}</td><td>{String(item.id ?? item.evidence_id ?? '—')}</td></tr>{/each}</tbody></table></div>{#if detailItems.length === 0}<p class="dashboard-detail-empty">No evidence records are available in this view.</p>{/if}{#if detailHasMore}<button class="dashboard-view-all" type="button" disabled={loadingDetail} onclick={loadMoreEvidence}>Load more evidence →</button>{/if}{/if}
      </div>
    {/if}
  {/if}
</section>
