<svelte:options runes={true} />
<script lang="ts">
  import { onMount } from 'svelte';
  import DashboardContent from '../features/dashboard/dashboard-content.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { getSharedQueryClient } from '../lib/client/query-client';
  import * as v from 'valibot';
  import { dashboardEvidenceItemSchema, dashboardMonitorItemSchema } from '../lib/client/api-schemas';
  import type { DashboardEvidenceItem, DashboardMonitorItem } from '../lib/client/api-schemas';
  import { dashboardErrorMessage, dashboardPageQueryOptions, dashboardQueryErrorMessage, dashboardQueryOptions, type DashboardResponse } from '../lib/client/dashboard-queries';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';
  import { readActiveWorkspaceId, writeActiveWorkspaceId, resolveAndPersistWorkspaceId } from '../lib/client/workspace-preference';
  import { formatDateTime } from '../lib/client/date-format';
  import { filterAttentionItems, getDashboardSummaryMetrics, type AttentionFilter } from '../lib/client/dashboard-model';
  import type { AttentionItem } from '../lib/client/dashboard-queries';
  import { Button } from './ui/button/index.js';
  import { Alert, AlertDescription, AlertTitle } from './ui/alert/index.js';
  import { Skeleton } from './ui/skeleton/index.js';
  import { ArrowUpRight, CircleAlert, Monitor } from '@lucide/svelte';

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
  const attentionFilterDescriptions: Record<AttentionFilter, string> = {
    all: 'Evidence and signals needing attention',
    submission_rejected: 'Evidence that failed validation',
    evidence_overdue: 'Expected evidence not received on time',
    health_signal: 'Configured fields requiring review',
  };

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
    <DashboardContent
      {dashboard}
      {view}
      {monitorTotal}
      {attentionFilter}
      {attentionFilters}
      {attentionFilterDescriptions}
      {filteredAttention}
      {filterLabels}
      {activityCopy}
      {reasonCopy}
      {loadingDetail}
      {detailError}
      {detailMonitors}
      {detailEvidence}
      {detailHasMore}
      {formatDate}
      onOpenView={openView}
      onOpenAttention={() => { attentionFilter = 'all'; openView('attention'); }}
      onChangeFilter={changeFilter}
      onRetryDetail={() => view === 'monitors' ? loadMonitorDetail() : loadEvidenceDetail()}
      onLoadMoreMonitors={loadMoreMonitors}
      onLoadMoreEvidence={loadMoreEvidence}
    />
  {/if}
</section>
