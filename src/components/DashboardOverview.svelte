<svelte:options runes={true} />
<script lang="ts">
  import { onMount } from 'svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { getSharedQueryClient } from '../lib/client/query-client';
  import * as v from 'valibot';
  import { dashboardEvidenceItemSchema, dashboardMonitorItemSchema } from '../lib/client/api-schemas';
  import type { DashboardEvidenceItem, DashboardMonitorItem } from '../lib/client/api-schemas';
  import { dashboardErrorMessage, dashboardPageQueryOptions, dashboardQueryErrorMessage, dashboardQueryOptions, type DashboardResponse } from '../lib/client/dashboard-queries';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';
  import { readActiveWorkspaceId, writeActiveWorkspaceId, resolveAndPersistWorkspaceId } from '../lib/client/workspace-preference';
  import { formatDateTime } from '../lib/client/date-format';
  import { filterAttentionItems, formatRelativeDate, getAttentionSeverityClasses, getAttentionSeverityTextClass, getDashboardSummaryMetrics, type AttentionFilter } from '../lib/client/dashboard-model';
  import type { AttentionItem } from '../lib/client/dashboard-queries';
  import * as Table from './ui/table/index.js';
  import * as Tabs from './ui/tabs/index.js';
  import { Button } from './ui/button/index.js';
  import { Badge } from './ui/badge/index.js';
  import { Alert, AlertDescription, AlertTitle } from './ui/alert/index.js';
  import { Skeleton } from './ui/skeleton/index.js';
  import { Separator } from './ui/separator/index.js';
  import { Activity, ArrowRight, ArrowUpRight, CheckCircle2, CircleAlert, LayoutDashboard, Monitor, RefreshCw, ShieldAlert, Send } from '@lucide/svelte';

  type MonitorItem = DashboardMonitorItem;
  type Page<T> = { data: T[]; page?: { next_cursor: string | null } };
  type View = 'overview' | 'attention' | 'signals' | 'monitors' | 'evidence';

  const views: readonly View[] = ['overview', 'attention', 'signals', 'monitors', 'evidence'];
  const attentionFilters: readonly AttentionFilter[] = ['all', 'submission_rejected', 'evidence_overdue', 'health_signal'];

  function parseView(value: string | null): View | null {
    return value !== null ? views.find((candidate) => candidate === value) ?? null : null;
  }

  function parseAttentionFilter(value: string | null): AttentionFilter | null {
    return value !== null ? attentionFilters.find((candidate) => candidate === value) ?? null : null;
  }

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
  let detailMonitors = $state<MonitorItem[]>([]);
  let detailEvidence = $state<DashboardEvidenceItem[]>([]);
  let requestSequence = 0;
  let detailSequence = 0;
  let bootstrapSequence = 0;
  let disposed = false;

  const reasonCopy: Record<AttentionItem['reason'], { title: string; detail: string }> = {
    submission_rejected: { title: 'A submission was rejected', detail: 'Inspect the evidence to understand why it did not pass validation.' },
    evidence_overdue: { title: 'Evidence is overdue', detail: 'This monitor has not received valid evidence within its expected window.' },
    health_signal: { title: 'A field health signal needs review', detail: 'Review configured field states; this is not independent proof of an outage.' },
  };
  const activityCopy: Record<string, string> = { accepted: 'Evidence accepted', evidence_accepted: 'Evidence accepted', rejected: 'Evidence rejected', evidence_rejected: 'Evidence rejected' };
  const filterLabels: Record<AttentionFilter, string> = { all: 'All', submission_rejected: 'Rejected', evidence_overdue: 'Missed / overdue', health_signal: 'Health signals' };

  function formatDate(value: string | null | undefined): string {
    return formatDateTime(value);
  }
  const queryClient = getSharedQueryClient();
  const dashboardQuery = createQuery(() => dashboardQueryOptions(selectedWorkspaceId), () => queryClient);
  const dashboard = $derived(dashboardQuery.data ?? null);
  const loadingDashboard = $derived(Boolean(selectedWorkspaceId) && dashboardQuery.isPending);
  const dashboardError = $derived(dashboardQuery.error && !dashboardQuery.data ? dashboardQueryErrorMessage(dashboardQuery.error) : '');
  const filteredAttention = $derived(filterAttentionItems(dashboard?.attention_items ?? [], attentionFilter));
  const summaryMetrics = $derived(getDashboardSummaryMetrics(dashboard?.summary));
  const monitorTotal = $derived(summaryMetrics.monitorTotal);
  const monitorCategoryTotal = $derived(summaryMetrics.monitorCategoryTotal);
  const emptyWorkspace = $derived(!!dashboard && monitorTotal === 0);

  async function loadDashboard(workspaceId: string) {
    const changedWorkspace = selectedWorkspaceId !== workspaceId;
    requestSequence += 1;
    selectedWorkspaceId = workspaceId;
    writeActiveWorkspaceId(workspaceId);
    monitors = [];
    detailError = '';
    view = 'overview';
    detailMonitors = [];
    detailEvidence = [];
    monitorCursor = null;
    evidenceCursor = null;
    if (!workspaceId) return;
    if (!changedWorkspace) void dashboardQuery.refetch();
    // Inventory is optional; the dashboard summary remains usable if it fails.
    await loadMonitorPage(false, workspaceId, requestSequence);
  }

  async function fetchDashboardPage<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    resource: 'monitors' | 'evidence', params: URLSearchParams, itemSchema: TSchema,
  ): Promise<Page<v.InferOutput<TSchema>>> {
    const workspaceId = params.get('workspace_id') ?? '';
    return queryClient.query(dashboardPageQueryOptions(workspaceId, resource, params, itemSchema));
  }

  async function loadMonitorPage(append = false, workspaceId = selectedWorkspaceId, parentSequence = requestSequence) {
    const cursor = append ? monitorCursor : null;
    const query = new URLSearchParams({ workspace_id: workspaceId, limit: '50', sort: 'name', direction: 'asc' });
    if (cursor) query.set('cursor', cursor);
    let page: Page<MonitorItem>;
    try {
      page = await fetchDashboardPage('monitors', query, dashboardMonitorItemSchema);
    } catch {
      return; // Summary remains usable if the optional inventory request fails.
    }
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
        bootstrapError = dashboardErrorMessage(result.workspaces.status, result.workspaces.code);
        bootstrapping = false;
        return;
      }
      workspaces = result.workspaces.data.data;
      const personalId = result.me.ok ? result.me.data.personal_workspace_id : null;
      const requestedWorkspaceId = new URL(window.location.href).searchParams.get('workspace_id');
      const initialWorkspaceId = resolveAndPersistWorkspaceId(workspaces, [requestedWorkspaceId, readActiveWorkspaceId(), personalId]);
      bootstrapping = false;
      if (initialWorkspaceId) await loadDashboard(initialWorkspaceId);
    } catch {
      if (!disposed && sequence === bootstrapSequence) {
        bootstrapError = dashboardErrorMessage(0, 'network_error');
        bootstrapping = false;
      }
    }
  }
  function openView(next: View) {
    detailSequence += 1;
    loadingDetail = false;
    view = next; detailError = ''; detailMonitors = []; detailEvidence = []; detailHasMore = false;
    const url = new URL(window.location.href);
    if (next === 'overview') { url.searchParams.delete('overview'); url.searchParams.delete('filter'); window.history.pushState({}, '', url); return; }
    url.searchParams.set('overview', next);
    if (next === 'attention' && attentionFilter !== 'all') url.searchParams.set('filter', attentionFilter); else url.searchParams.delete('filter');
    window.history.pushState({}, '', url);
    if (next === 'monitors') void loadMonitorDetail();
    if (next === 'evidence' || next === 'signals') void loadEvidenceDetail();
  }
  async function loadMonitorDetail() {
    const sequence = ++detailSequence;
    const workspaceId = selectedWorkspaceId;
    loadingDetail = true;
    detailError = '';
    try {
      const query = new URLSearchParams({ workspace_id: workspaceId, limit: '50', sort: 'name', direction: 'asc' });
      const page = await fetchDashboardPage('monitors', query, dashboardMonitorItemSchema);
      if (disposed || sequence !== detailSequence || workspaceId !== selectedWorkspaceId || view !== 'monitors') return;
      detailMonitors = page.data;
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
      const page = await fetchDashboardPage('monitors', query, dashboardMonitorItemSchema);
      if (disposed || sequence !== detailSequence || workspaceId !== selectedWorkspaceId || view !== 'monitors') return;
      detailMonitors = [...detailMonitors, ...page.data];
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
      const page = await fetchDashboardPage('evidence', query, dashboardEvidenceItemSchema);
      if (disposed || sequence !== detailSequence || workspaceId !== selectedWorkspaceId || view !== targetView) return;
      detailEvidence = page.data;
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
      const page = await fetchDashboardPage('evidence', query, dashboardEvidenceItemSchema);
      if (disposed || sequence !== detailSequence || workspaceId !== selectedWorkspaceId || view !== targetView) return;
      detailEvidence = [...detailEvidence, ...page.data];
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
    if (view === 'attention') { const url = new URL(window.location.href); if (filter === 'all') url.searchParams.delete('filter'); else url.searchParams.set('filter', filter); window.history.replaceState({}, '', url); }
  }
  onMount(() => {
    const url = new URL(window.location.href);
    const requested = parseView(url.searchParams.get('overview'));
    if (requested && requested !== 'overview') view = requested;
    const filter = parseAttentionFilter(url.searchParams.get('filter'));
    if (filter) attentionFilter = filter;
    void bootstrap();
    const pop = () => {
      detailSequence += 1;
      loadingDetail = false;
      const currentUrl = new URL(window.location.href);
      view = parseView(currentUrl.searchParams.get('overview')) ?? 'overview';
      attentionFilter = parseAttentionFilter(currentUrl.searchParams.get('filter')) ?? 'all';
      if (view === 'monitors') void loadMonitorDetail();
      if (view === 'signals' || view === 'evidence') void loadEvidenceDetail();
    };
    window.addEventListener('popstate', pop); return () => { disposed = true; requestSequence += 1; detailSequence += 1; bootstrapSequence += 1; window.removeEventListener('popstate', pop); };
  });
</script>

<section class="mx-auto flex w-full min-w-0 flex-col gap-6" aria-labelledby="dashboard-title">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="space-y-1">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your workspace, at a glance</p>
      <h1 id="dashboard-title" class="text-2xl font-semibold tracking-tight sm:text-3xl">The current picture</h1>
    </div>
    {#if workspaces.length > 0 && !bootstrapping}
      <Button variant="outline" href="/monitors">Manage monitors <ArrowUpRight class="ml-1 size-4" /></Button>
    {/if}
  </header>

  {#if bootstrapping || loadingDashboard}
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading workspace overview" aria-live="polite">
      {#each Array.from({ length: 6 }) as _, i (i)}
        <div class="space-y-4 rounded-xl border bg-card p-5">
          <Skeleton class="h-4 w-28" />
          <Skeleton class="h-9 w-20" />
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-3/4" />
        </div>
      {/each}
    </div>
  {:else if bootstrapError}
    <Alert variant="destructive">
      <CircleAlert class="size-4" />
      <AlertTitle>Workspace could not be loaded</AlertTitle>
      <AlertDescription class="flex flex-wrap items-center justify-between gap-3">
        <span>{bootstrapError}</span>
        <Button variant="outline" size="sm" onclick={bootstrap}>Try again</Button>
      </AlertDescription>
    </Alert>
  {:else if workspaces.length === 0 || (dashboard && emptyWorkspace)}
    <section class="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
      <div class="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground"><Monitor class="size-6" /></div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">A simple place to start</p>
      <h2 class="mt-2 text-2xl font-semibold tracking-tight">Know what's real. Act with confidence.</h2>
      <p class="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Connect your first monitor to see the evidence behind each result and understand service health without the noise.</p>
      <Button class="mt-5" href="/monitors">Explore monitors <ArrowUpRight class="ml-1 size-4" /></Button>
    </section>
  {:else if dashboardError}
    <Alert variant="destructive">
      <CircleAlert class="size-4" />
      <AlertTitle>Dashboard data could not be loaded</AlertTitle>
      <AlertDescription class="flex flex-wrap items-center justify-between gap-3">
        <span>{dashboardError}</span>
        <Button variant="outline" size="sm" onclick={() => loadDashboard(selectedWorkspaceId)}>Try again</Button>
      </AlertDescription>
    </Alert>
  {:else if dashboard}
    <Tabs.Root value={view} onValueChange={(value) => openView(value as View)} class="w-full">
      <Tabs.List class="h-auto flex-wrap justify-start">
        <Tabs.Trigger value="overview"><LayoutDashboard class="mr-2 size-4" />Overview</Tabs.Trigger>
        <Tabs.Trigger value="attention"><ShieldAlert class="mr-2 size-4" />Attention</Tabs.Trigger>
        <Tabs.Trigger value="signals"><Activity class="mr-2 size-4" />Signals</Tabs.Trigger>
        <Tabs.Trigger value="monitors"><Monitor class="mr-2 size-4" />Monitors</Tabs.Trigger>
        <Tabs.Trigger value="evidence"><CheckCircle2 class="mr-2 size-4" />Evidence</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>

    {#if view === 'overview'}
      <div class="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <section class="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 lg:col-span-2">
          <div class="flex items-start justify-between gap-3">
            <div><p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Inventory</p><h2 class="mt-1 text-lg font-semibold">Monitors</h2></div>
            <Button variant="ghost" size="sm" href="/monitors">View all <ArrowRight class="ml-1 size-4" /></Button>
          </div>
          <div class="flex flex-wrap items-end justify-between gap-4"><div><p class="text-4xl font-semibold tracking-tight tabular-nums">{monitorTotal}</p><p class="mt-1 text-sm text-muted-foreground">monitors in this workspace</p></div><div class="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><span class="size-2 rounded-full bg-primary"></span>{dashboard.summary.active_monitors} active</div></div>
          <Separator />
          <div class="grid grid-cols-3 gap-3">
            <button type="button" class="rounded-lg p-2 text-left transition-colors hover:bg-muted" onclick={() => openView('monitors')}>
              <span class="mb-2 block size-2 rounded-full bg-primary"></span><strong class="block text-xl tabular-nums">{dashboard.summary.active_monitors}</strong><span class="text-xs text-muted-foreground">Active</span>
            </button>
            <button type="button" class="rounded-lg p-2 text-left transition-colors hover:bg-muted" onclick={() => openView('monitors')}>
              <span class="mb-2 block size-2 rounded-full bg-muted-foreground"></span><strong class="block text-xl tabular-nums">{dashboard.summary.disabled_monitors}</strong><span class="text-xs text-muted-foreground">Disabled</span>
            </button>
            <button type="button" class="rounded-lg p-2 text-left transition-colors hover:bg-muted" onclick={() => { attentionFilter = 'all'; openView('attention'); }}>
              <span class="mb-2 block size-2 rounded-full bg-status-warning"></span><strong class="block text-xl tabular-nums">{dashboard.summary.needs_attention}</strong><span class="text-xs text-muted-foreground">Attention</span>
            </button>
          </div>
        </section>

        <section class="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5">
          <div class="flex items-start justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Last 24 hours</p><h2 class="mt-1 text-lg font-semibold">Evidence</h2></div><Button variant="ghost" size="sm" onclick={() => openView('evidence')}>View all <ArrowRight class="ml-1 size-4" /></Button></div>
          <div><p class="text-4xl font-semibold tracking-tight">{dashboard.summary.evidence_outcomes_24h.total}</p><p class="mt-1 text-sm text-muted-foreground">records received</p></div>
          <Separator />
          <div class="grid grid-cols-2 gap-3">
            <button type="button" class="flex items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-muted" onclick={() => openView('evidence')}><span class="flex items-center gap-2 text-sm text-muted-foreground"><span class="size-2 rounded-full bg-primary"></span>Accepted</span><strong class="text-lg tabular-nums">{dashboard.summary.evidence_outcomes_24h.accepted}</strong></button>
            <button type="button" class="flex items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-muted" onclick={() => openView('evidence')}><span class="flex items-center gap-2 text-sm text-muted-foreground"><span class="size-2 rounded-full bg-destructive"></span>Rejected</span><strong class="text-lg tabular-nums">{dashboard.summary.evidence_outcomes_24h.rejected}</strong></button>
          </div>
        </section>

        <section class="min-w-0 rounded-xl border bg-card p-5 lg:col-span-3">
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">What may need you</p><h2 class="mt-1 text-lg font-semibold">Attention queue</h2></div><Badge variant="outline" class={dashboard.summary.needs_attention > 0 ? 'border-status-warning-border bg-status-warning-background text-status-warning' : ''}>{dashboard.summary.needs_attention} items</Badge></div>
          <div class="mb-4 flex flex-wrap gap-2" aria-label="Filter attention preview">
            {#each attentionFilters as filter}
              <Button size="sm" variant={attentionFilter === filter ? 'secondary' : 'outline'} aria-pressed={attentionFilter === filter} onclick={() => changeFilter(filter)}>{filterLabels[filter]}</Button>
            {/each}
          </div>
          {#if filteredAttention.length}
            <div class="divide-y">
              {#each filteredAttention as item (`${item.monitor_id}-${item.reason}-${item.occurred_at ?? ''}`)}
                <div class="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                  <CircleAlert class={`mt-1 size-4 shrink-0 ${getAttentionSeverityTextClass(item.severity)}`} />
                  <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><strong class="text-sm">{item.monitor_name}</strong><Badge variant="outline" class={getAttentionSeverityClasses(item.severity)}>{reasonCopy[item.reason]?.title ?? 'Monitor needs review'}</Badge></div><p class="mt-1 text-sm text-muted-foreground">{reasonCopy[item.reason]?.detail ?? 'Review this monitor for more context.'}</p><p class="mt-2 text-xs text-muted-foreground">{formatRelativeDate(item.occurred_at ?? item.last_valid_evidence_at, Date.now(), formatDate)}</p></div>
                  <Button variant="ghost" size="icon-sm" href={`/monitors/${encodeURIComponent(item.monitor_id)}`} aria-label={`Investigate ${item.monitor_name}`}><ArrowUpRight class="size-4" /></Button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="rounded-lg border border-dashed px-4 py-8 text-center"><p class="text-sm text-muted-foreground">{attentionFilter === 'all' ? 'Nothing needs your attention right now.' : `No ${filterLabels[attentionFilter].toLowerCase()} items are currently reported.`}</p></div>
          {/if}
          <div class="mt-4"><Button variant="outline" onclick={() => openView('attention')}>View all attention <ArrowRight class="ml-1 size-4" /></Button></div>
        </section>

        <section class="min-w-0 rounded-xl border bg-card p-5 lg:col-span-2">
          <div class="mb-4 flex items-start justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recent signals</p><h2 class="mt-1 text-lg font-semibold">Recent activity</h2></div><Badge variant="secondary">{dashboard.recent_evidence_activity.length}</Badge></div>
          {#if dashboard.recent_evidence_activity.length}
            <div class="divide-y">
              {#each dashboard.recent_evidence_activity.slice(0, 5) as item (item.event_id)}
                <div class="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><Activity class="mt-1 size-4 shrink-0 text-muted-foreground" /><div class="min-w-0"><p class="text-sm font-medium">{item.monitor_name}</p><p class="mt-0.5 text-sm text-muted-foreground">{activityCopy[item.event_type] ?? 'Evidence activity recorded'}</p><p class="mt-1 text-xs text-muted-foreground">{formatRelativeDate(item.occurred_at, Date.now(), formatDate)}</p></div></div>
              {/each}
            </div>
          {:else}
            <div class="rounded-lg border border-dashed px-4 py-8 text-center"><p class="text-sm text-muted-foreground">No recent evidence activity has been recorded.</p></div>
          {/if}
          <div class="mt-4"><Button variant="outline" onclick={() => openView('signals')}>View all activity <ArrowRight class="ml-1 size-4" /></Button></div>
        </section>

        <section class="flex min-w-0 flex-col rounded-xl border bg-card p-5">
          <div class="mb-4 flex items-start justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Notifications</p><h2 class="mt-1 text-lg font-semibold">Delivery</h2></div><Send class="size-5 text-muted-foreground" /></div>
          <div class="flex flex-1 flex-col justify-center rounded-lg border border-dashed px-4 py-6">
            <p class="text-sm font-medium">Delivery visibility is coming next</p>
            <p class="mt-1 text-sm leading-relaxed text-muted-foreground">Notification attempts and outcomes will appear here when delivery events are available.</p>
          </div>
          <p class="mt-3 text-xs text-muted-foreground">No delivery status is inferred from evidence activity.</p>
        </section>
      </div>
      <p class="text-xs text-muted-foreground">Summary generated {formatDate(dashboard.generated_at)}. Health counts are field-level signals, not a single monitor-wide health verdict.</p>
    {:else}
      <section class="min-w-0 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div><Button variant="ghost" size="sm" class="-ml-2 mb-2" onclick={() => openView('overview')}><ArrowRight class="mr-1 size-4 rotate-180" />Overview</Button><p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Workspace detail</p><h2 class="text-xl font-semibold tracking-tight">{view === 'attention' ? 'Attention queue' : view === 'signals' ? 'Recent signals' : view === 'monitors' ? 'Monitors' : 'Evidence · last 24 hours'}</h2></div>
          {#if view === 'attention'}<Badge variant="secondary">{dashboard.summary.needs_attention} items</Badge>{/if}
        </div>
        {#if view === 'attention'}
          <div class="flex flex-wrap gap-2">{#each attentionFilters as filter}<Button size="sm" variant={attentionFilter === filter ? 'secondary' : 'outline'} aria-pressed={attentionFilter === filter} onclick={() => changeFilter(filter)}>{filterLabels[filter]}</Button>{/each}</div>
          <div class="overflow-hidden rounded-lg border">
            <Table.Root>
              <Table.Caption>Items currently reported as needing review.</Table.Caption>
              <Table.Header><Table.Row class="bg-muted/50 hover:bg-muted/50"><Table.Head>Monitor</Table.Head><Table.Head>Reason</Table.Head><Table.Head>Last observed</Table.Head><Table.Head class="text-right">Action</Table.Head></Table.Row></Table.Header>
              <Table.Body>
                {#each dashboard.attention_items.filter((x) => attentionFilter === 'all' || x.reason === attentionFilter) as item (`${item.monitor_id}-${item.reason}-${item.occurred_at ?? ''}`)}
                  <Table.Row><Table.Cell class="font-medium">{item.monitor_name}</Table.Cell><Table.Cell><Badge variant="outline" class={getAttentionSeverityClasses(item.severity)}>{reasonCopy[item.reason]?.title ?? 'Monitor needs review'}</Badge></Table.Cell><Table.Cell class="text-muted-foreground">{formatDate(item.occurred_at ?? item.last_valid_evidence_at)}</Table.Cell><Table.Cell class="text-right"><Button variant="ghost" size="sm" href={`/monitors/${encodeURIComponent(item.monitor_id)}`}>Investigate <ArrowUpRight class="ml-1 size-4" /></Button></Table.Cell></Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
          {#if dashboard.attention_items.length === 0}<p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No attention items are currently reported.</p>{/if}
        {:else if loadingDetail}
          <div class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground" aria-live="polite"><span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>Loading details…</div>
        {:else if detailError}
          <Alert variant="destructive"><CircleAlert class="size-4" /><AlertTitle>Details could not be loaded</AlertTitle><AlertDescription class="flex flex-wrap items-center justify-between gap-3"><span>{detailError}</span><Button variant="outline" size="sm" onclick={() => view === 'monitors' ? loadMonitorDetail() : loadEvidenceDetail()}>Try again</Button></AlertDescription></Alert>
        {:else if view === 'monitors'}
          <div class="overflow-hidden rounded-lg border">
            <Table.Root>
              <Table.Caption>Monitor inventory.</Table.Caption>
              <Table.Header><Table.Row class="bg-muted/50 hover:bg-muted/50"><Table.Head>Monitor</Table.Head><Table.Head>Status</Table.Head><Table.Head>Updated</Table.Head><Table.Head class="text-right">Action</Table.Head></Table.Row></Table.Header>
              <Table.Body>
                {#each detailMonitors as item (item.id)}
                  <Table.Row><Table.Cell class="font-medium">{item.name}</Table.Cell><Table.Cell><Badge variant={item.status === 'enabled' ? 'default' : 'secondary'} class="capitalize">{item.status}</Badge></Table.Cell><Table.Cell class="text-muted-foreground">{formatDate(item.updated_at ?? '')}</Table.Cell><Table.Cell class="text-right"><Button variant="ghost" size="sm" href={`/monitors/${encodeURIComponent(item.id)}`}>Open <ArrowUpRight class="ml-1 size-4" /></Button></Table.Cell></Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
          {#if detailMonitors.length === 0}<p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No monitors are available in this view.</p>{/if}
          {#if detailHasMore}<Button variant="outline" disabled={loadingDetail} onclick={loadMoreMonitors}>Load more monitors <ArrowRight class="ml-1 size-4" /></Button>{/if}
        {:else}
          <div class="overflow-hidden rounded-lg border">
            <Table.Root>
              <Table.Caption>Evidence records returned for this view.</Table.Caption>
              <Table.Header><Table.Row class="bg-muted/50 hover:bg-muted/50"><Table.Head>Monitor</Table.Head><Table.Head>Outcome</Table.Head><Table.Head>Recorded</Table.Head><Table.Head>Evidence</Table.Head></Table.Row></Table.Header>
              <Table.Body>
                {#each detailEvidence as item, i (`${item.id ?? item.event_id ?? item.evidence_id ?? i}`)}
                  <Table.Row><Table.Cell class="font-medium">{item.monitor_name ?? item.monitor?.name ?? 'Monitor'}</Table.Cell><Table.Cell>{item.outcome ?? item.event_type ?? 'Evidence recorded'}</Table.Cell><Table.Cell class="text-muted-foreground">{formatDate(item.created_at ?? item.occurred_at ?? '')}</Table.Cell><Table.Cell class="font-mono text-xs">{item.id ?? item.evidence_id ?? '—'}</Table.Cell></Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
          {#if detailEvidence.length === 0}<p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No evidence records are available in this view.</p>{/if}
          {#if detailHasMore}<Button variant="outline" disabled={loadingDetail} onclick={loadMoreEvidence}>Load more evidence <ArrowRight class="ml-1 size-4" /></Button>{/if}
        {/if}
      </section>
    {/if}
  {/if}
</section>
