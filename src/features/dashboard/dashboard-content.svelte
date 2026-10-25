<svelte:options runes={true} />
<script lang="ts">
  import * as Table from '../../components/ui/table/index.js';
  import { Button } from '../../components/ui/button/index.js';
  import { Badge } from '../../components/ui/badge/index.js';
  import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert/index.js';
  import { Activity, ArrowRight, ArrowUpRight, CircleAlert, Info, Send } from '@lucide/svelte';
  import { formatRelativeDate, getAttentionSeverityClasses, type AttentionFilter } from '../../lib/client/dashboard-model';
  import type { DashboardEvidenceItem, DashboardMonitorItem } from '../../lib/client/api-schemas';
  import type { AttentionItem, DashboardResponse } from '../../lib/client/dashboard-queries';

  type View = 'overview' | 'attention' | 'signals' | 'monitors' | 'evidence';
  type ReasonCopy = Record<AttentionItem['reason'], { title: string; detail: string }>;
  type DateFormatter = (value: string | null | undefined) => string;

  let {
    dashboard,
    view,
    monitorTotal,
    attentionFilter,
    attentionFilters,
    attentionFilterDescriptions,
    filteredAttention,
    filterLabels,
    activityCopy,
    reasonCopy,
    loadingDetail,
    detailError,
    detailMonitors,
    detailEvidence,
    detailHasMore,
    formatDate,
    onOpenView,
    onOpenAttention,
    onChangeFilter,
    onRetryDetail,
    onLoadMoreMonitors,
    onLoadMoreEvidence,
  }: {
    dashboard: DashboardResponse;
    view: View;
    monitorTotal: number;
    attentionFilter: AttentionFilter;
    attentionFilters: readonly AttentionFilter[];
    attentionFilterDescriptions: Record<AttentionFilter, string>;
    filteredAttention: AttentionItem[];
    filterLabels: Record<AttentionFilter, string>;
    activityCopy: Record<string, string>;
    reasonCopy: ReasonCopy;
    loadingDetail: boolean;
    detailError: string;
    detailMonitors: DashboardMonitorItem[];
    detailEvidence: DashboardEvidenceItem[];
    detailHasMore: boolean;
    formatDate: DateFormatter;
    onOpenView: (view: View) => void;
    onOpenAttention: () => void;
    onChangeFilter: (filter: AttentionFilter) => void;
    onRetryDetail: () => void;
    onLoadMoreMonitors: () => void;
    onLoadMoreEvidence: () => void;
  } = $props();
</script>

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
          <button type="button" class="rounded-lg p-2 text-left transition-colors hover:bg-muted" onclick={() => onOpenView('monitors')}>
            <span class="mb-2 block size-2 rounded-full bg-primary"></span><strong class="block text-xl tabular-nums">{dashboard.summary.active_monitors}</strong><span class="text-xs text-muted-foreground">Active</span>
          </button>
          <button type="button" class="rounded-lg p-2 text-left transition-colors hover:bg-muted" onclick={() => onOpenView('monitors')}>
            <span class="mb-2 block size-2 rounded-full bg-muted-foreground"></span><strong class="block text-xl tabular-nums">{dashboard.summary.disabled_monitors}</strong><span class="text-xs text-muted-foreground">Disabled</span>
          </button>
          <button type="button" class="rounded-lg p-2 text-left transition-colors hover:bg-muted" onclick={onOpenAttention}>
            <span class="mb-2 block size-2 rounded-full bg-status-warning"></span><strong class="block text-xl tabular-nums">{dashboard.summary.needs_attention}</strong><span class="text-xs text-muted-foreground">Attention</span>
          </button>
        </div>
      </section>

      <section class="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5">
        <div class="flex items-start justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Last 24 hours</p><h2 class="mt-1 text-lg font-semibold">Evidence</h2></div><Button variant="ghost" size="sm" onclick={() => onOpenView('evidence')}>View all <ArrowRight class="ml-1 size-4" /></Button></div>
        <div><p class="text-4xl font-semibold tracking-tight">{dashboard.summary.evidence_outcomes_24h.total}</p><p class="mt-1 text-sm text-muted-foreground">records received</p></div>
        <Separator />
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="flex items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-muted" onclick={() => onOpenView('evidence')}><span class="flex items-center gap-2 text-sm text-muted-foreground"><span class="size-2 rounded-full bg-primary"></span>Accepted</span><strong class="text-lg tabular-nums">{dashboard.summary.evidence_outcomes_24h.accepted}</strong></button>
          <button type="button" class="flex items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-muted" onclick={() => onOpenView('evidence')}><span class="flex items-center gap-2 text-sm text-muted-foreground"><span class="size-2 rounded-full bg-destructive"></span>Rejected</span><strong class="text-lg tabular-nums">{dashboard.summary.evidence_outcomes_24h.rejected}</strong></button>
        </div>
      </section>

      <section class="min-w-0 rounded-xl border bg-card p-5 lg:col-span-3">
        <div class="mb-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-700 dark:text-sky-300" aria-live="polite">
          <p class="flex min-w-0 items-center gap-2"><Info class="size-4 shrink-0" /><span>{attentionFilterDescriptions[attentionFilter]}</span></p>
        </div>
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">What may need you</p><h2 class="mt-1 text-lg font-semibold">Attention queue</h2></div><Badge variant="outline" class={dashboard.summary.needs_attention > 0 ? 'border-destructive/40 bg-destructive/10 text-destructive' : ''}>{dashboard.summary.needs_attention} items</Badge></div>
        <div class="mb-4 -mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter attention preview">
          {#each attentionFilters as filter}
            <Button class="shrink-0 whitespace-nowrap" size="sm" variant={attentionFilter === filter ? 'secondary' : 'outline'} aria-pressed={attentionFilter === filter} onclick={() => onChangeFilter(filter)}>{filterLabels[filter]}</Button>
          {/each}
        </div>
        {#if filteredAttention.length}
          <div class="divide-y">
            {#each filteredAttention.slice(0, 5) as item (`${item.monitor_id}-${item.reason}-${item.occurred_at ?? ''}`)}
              <div class="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
                <CircleAlert class={`size-4 shrink-0 ${item.reason === 'health_signal' ? 'text-status-warning' : 'text-destructive'}`} />
                <strong class="min-w-0 flex-1 truncate text-sm" title={item.monitor_name}>{item.monitor_name}</strong>
                <span class="shrink-0 text-right text-xs text-muted-foreground">{formatRelativeDate(item.occurred_at ?? item.last_valid_evidence_at, Date.now(), formatDate) || (item.reason === 'evidence_overdue' ? 'Awaiting ping' : '—')}</span>
                <Button variant="ghost" size="icon-sm" class="shrink-0" href={`/monitors/${encodeURIComponent(item.monitor_id)}`} aria-label={`Investigate ${item.monitor_name}`}><ArrowUpRight class="size-4" /></Button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="rounded-lg border border-dashed px-4 py-8 text-center"><p class="text-sm text-muted-foreground">{attentionFilter === 'all' ? 'Nothing needs your attention right now.' : `No ${filterLabels[attentionFilter].toLowerCase()} items are currently reported.`}</p></div>
        {/if}
        <div class="mt-4"><Button variant="outline" onclick={() => onOpenView('attention')}>View all attention <ArrowRight class="ml-1 size-4" /></Button></div>
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
        <div class="mt-4"><Button variant="outline" onclick={() => onOpenView('signals')}>View all activity <ArrowRight class="ml-1 size-4" /></Button></div>
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
        <div><Button variant="ghost" size="sm" class="-ml-2 mb-2" onclick={() => onOpenView('overview')}><ArrowRight class="mr-1 size-4 rotate-180" />Overview</Button><p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Workspace detail</p><h2 class="text-xl font-semibold tracking-tight">{view === 'attention' ? 'Attention queue' : view === 'signals' ? 'Recent signals' : view === 'monitors' ? 'Monitors' : 'Evidence · last 24 hours'}</h2></div>
        {#if view === 'attention'}<Badge variant="secondary">{dashboard.summary.needs_attention} items</Badge>{/if}
      </div>
      {#if view === 'attention'}
        <div class="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-700 dark:text-sky-300" aria-live="polite"><p class="flex min-w-0 items-center gap-2"><Info class="size-4 shrink-0" /><span>{attentionFilterDescriptions[attentionFilter]}</span></p></div>
        <div class="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter attention items">{#each attentionFilters as filter}<Button class="shrink-0 whitespace-nowrap" size="sm" variant={attentionFilter === filter ? 'secondary' : 'outline'} aria-pressed={attentionFilter === filter} onclick={() => onChangeFilter(filter)}>{filterLabels[filter]}</Button>{/each}</div>
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
        <Alert variant="destructive"><CircleAlert class="size-4" /><AlertTitle>Details could not be loaded</AlertTitle><AlertDescription class="flex flex-wrap items-center justify-between gap-3"><span>{detailError}</span><Button variant="outline" size="sm" onclick={onRetryDetail}>Try again</Button></AlertDescription></Alert>
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
        {#if detailHasMore}<Button variant="outline" disabled={loadingDetail} onclick={onLoadMoreMonitors}>Load more monitors <ArrowRight class="ml-1 size-4" /></Button>{/if}
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
        {#if detailHasMore}<Button variant="outline" disabled={loadingDetail} onclick={onLoadMoreEvidence}>Load more evidence <ArrowRight class="ml-1 size-4" /></Button>{/if}
      {/if}
    </section>
  {/if}
