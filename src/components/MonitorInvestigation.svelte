<svelte:options runes={true} />
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { getSharedQueryClient } from '../lib/client/query-client';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';
  import * as Table from './ui/table/index.js';
  import * as Select from './ui/select/index.js';
  import * as Tabs from './ui/tabs/index.js';
  import { Button } from './ui/button/index.js';
  import { Badge } from './ui/badge/index.js';
  import { Alert, AlertDescription, AlertTitle } from './ui/alert/index.js';
  import { Separator } from './ui/separator/index.js';
  import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, X, FileSearch, Activity, Clock3, Bell, Database, AlertTriangle } from '@lucide/svelte';
  import { formatInvestigationDate, formatInvestigationValue, formatInvestigationLabel, getHealthCounts } from '../lib/client/investigation-format';
  import { buildInvestigationApiPath, getInvestigationErrorMessage, readInvestigationResource, investigationResourceQueryOptions, investigationQueryErrorMessage, type Resource } from '../lib/client/investigation-api';
  import { investigationDeliveryPageSchema, investigationDeliverySchema, investigationEvidencePageSchema, investigationEvidenceSchema, investigationHealthSchema, investigationHealthVersionSchema, investigationMonitorSchema, investigationRecordPageSchema, investigationRecordSchema } from '../lib/client/api-schemas';
  import type { InvestigationDeliveryContract, InvestigationEvidenceContract, InvestigationHealthVersionContract, InvestigationMonitorContract } from '../lib/client/api-schemas';
  import { readActiveWorkspaceId, writeActiveWorkspaceId, resolveAndPersistWorkspaceId } from '../lib/client/workspace-preference';

  type Page<T> = { data: T[]; page?: { next_cursor: string | null } };
  type Monitor = InvestigationMonitorContract;
  type Evidence = InvestigationEvidenceContract;
  type Delivery = InvestigationDeliveryContract;
  type JsonObject = Record<string, unknown>;

  let { monitorId }: { monitorId: string } = $props();

  let workspaces = $state<WorkspaceContext[]>([]);
  let workspaceId = $state('');
  let evidence = $state<Page<Evidence> | null>(null);
  let badEvidence = $state<Page<Evidence> | null>(null);
  let deliveries = $state<Page<Delivery> | null>(null);
  let selectedEvidence = $state<{ kind: 'verified' | 'rejected'; id: string; detail: Evidence & { trace_available?: boolean } } | null>(null);
  let selectedTrace = $state<JsonObject | null>(null);
  let selectedDelivery = $state<Delivery | null>(null);
  let selectedHealthVersion = $state<InvestigationHealthVersionContract | null>(null);
  let activeSection = $state<'evidence' | 'rejected' | 'deliveries'>('evidence');
  let bootLoading = $state(true);
  let evidenceLoading = $state(false);
  let rejectedLoading = $state(false);
  let deliveriesLoading = $state(false);
  let detailLoading = $state(false);
  let traceLoading = $state(false);
  let healthVersionLoading = $state(false);
  let bootError = $state('');
  let evidenceError = $state('');
  let rejectedError = $state('');
  let deliveriesError = $state('');
  let detailError = $state('');
  let traceError = $state('');
  let deliveryDetailError = $state('');
  let healthVersionError = $state('');
  let evidenceCursor = $state<string | null>(null);
  let rejectedCursor = $state<string | null>(null);
  let deliveryCursor = $state<string | null>(null);
  let evidenceCursorStack = $state<Array<string | null>>([null]);
  let rejectedCursorStack = $state<Array<string | null>>([null]);
  let deliveryCursorStack = $state<Array<string | null>>([null]);
  let evidencePageIndex = $state(0);
  let rejectedPageIndex = $state(0);
  let deliveryPageIndex = $state(0);
  let disposed = false;
  let workspaceGeneration = 0;
  let verifiedEvidenceGeneration = 0;
  let rejectedEvidenceGeneration = 0;
  let deliveryListGeneration = 0;
  let detailGeneration = 0;
  let traceGeneration = 0;
  let deliveryDetailGeneration = 0;
  let healthVersionGeneration = 0;

  function apiPath(path: string, extra: Record<string, string> = {}): string {
    return buildInvestigationApiPath(workspaceId, path, extra);
  }

  const readResource = readInvestigationResource;
  const messageFor = getInvestigationErrorMessage;

  const formatDate = formatInvestigationDate;
  const formatValue = formatInvestigationValue;
  const label = formatInvestigationLabel;
  const healthCounts = getHealthCounts;
  const queryClient = getSharedQueryClient();
  const monitorQuery = createQuery(
    () => investigationResourceQueryOptions(workspaceId, monitorId, `monitors/${encodeURIComponent(monitorId)}`, investigationMonitorSchema),
    () => queryClient,
  );
  const healthQuery = createQuery(
    () => investigationResourceQueryOptions(workspaceId, monitorId, `monitors/${encodeURIComponent(monitorId)}/health`, investigationHealthSchema),
    () => queryClient,
  );
  const healthHistoryQuery = createQuery(
    () => investigationResourceQueryOptions(workspaceId, monitorId, `monitors/${encodeURIComponent(monitorId)}/health/history`, investigationRecordPageSchema, { limit: '20' }),
    () => queryClient,
  );
  const monitor = $derived(monitorQuery.data ?? null);
  const health = $derived(healthQuery.data ?? null);
  const healthHistory = $derived(healthHistoryQuery.data ?? null);
  const monitorLoading = $derived(Boolean(workspaceId) && monitorQuery.isPending);
  const healthLoading = $derived(Boolean(workspaceId) && healthQuery.isPending);
  const healthHistoryLoading = $derived(Boolean(workspaceId) && healthHistoryQuery.isPending);
  const monitorError = $derived(monitorQuery.error && !monitorQuery.data ? investigationQueryErrorMessage(monitorQuery.error) : '');
  const healthError = $derived(healthQuery.error && !healthQuery.data ? investigationQueryErrorMessage(healthQuery.error) : '');
  const healthHistoryError = $derived(healthHistoryQuery.error && !healthHistoryQuery.data ? investigationQueryErrorMessage(healthHistoryQuery.error) : '');


  async function loadEvidencePage(kind: 'verified' | 'rejected', cursor: string | null = null, pageIndex = 0) {
    if (!workspaceId) return;
    const generation = workspaceGeneration;
    const requestId = kind === 'rejected' ? ++rejectedEvidenceGeneration : ++verifiedEvidenceGeneration;
    const rejected = kind === 'rejected';
    if (rejected) { rejectedLoading = true; rejectedError = ''; }
    else { evidenceLoading = true; evidenceError = ''; }
    const route = rejected ? `monitors/${encodeURIComponent(monitorId)}/bad-evidence` : `monitors/${encodeURIComponent(monitorId)}/evidence`;
    const extra: Record<string, string> = { limit: '20' };
    if (cursor) extra.cursor = cursor;
    const result = await readResource(apiPath(route, extra), investigationEvidencePageSchema);
    const latestRequestId = rejected ? rejectedEvidenceGeneration : verifiedEvidenceGeneration;
    if (generation !== workspaceGeneration || requestId !== latestRequestId) return;
    if (result.ok) {
      if (rejected) { badEvidence = result.data; rejectedCursor = result.data.page?.next_cursor ?? null; rejectedPageIndex = pageIndex; }
      else { evidence = result.data; evidenceCursor = result.data.page?.next_cursor ?? null; evidencePageIndex = pageIndex; }
    } else if (rejected) rejectedError = messageFor(result.status, result.code);
    else evidenceError = messageFor(result.status, result.code);
    if (rejected) rejectedLoading = false; else evidenceLoading = false;
  }

  async function loadDeliveryPage(cursor: string | null = null, pageIndex = 0) {
    if (!workspaceId) return;
    const generation = workspaceGeneration;
    const requestId = ++deliveryListGeneration;
    deliveriesLoading = true;
    deliveriesError = '';
    const extra: Record<string, string> = { limit: '20', monitor_id: monitorId };
    if (cursor) extra.cursor = cursor;
    const result = await readResource(apiPath(`workspaces/${encodeURIComponent(workspaceId)}/deliveries`, extra), investigationDeliveryPageSchema);
    if (generation !== workspaceGeneration || requestId !== deliveryListGeneration) return;
    if (result.ok) { deliveries = result.data; deliveryCursor = result.data.page?.next_cursor ?? null; deliveryPageIndex = pageIndex; }
    else deliveriesError = messageFor(result.status, result.code);
    deliveriesLoading = false;
  }

  async function openEvidence(kind: 'verified' | 'rejected', item: Evidence) {
    const generation = workspaceGeneration;
    const requestId = ++detailGeneration;
    traceGeneration += 1;
    deliveryDetailGeneration += 1;
    healthVersionGeneration += 1;
    selectedEvidence = null; selectedTrace = null; selectedDelivery = null; selectedHealthVersion = null;
    traceLoading = false;
    healthVersionLoading = false;
    healthVersionError = '';
    detailError = ''; traceError = ''; deliveryDetailError = ''; detailLoading = true;
    const prefix = kind === 'rejected' ? 'bad-evidence' : 'evidence';
    const result = await readResource(apiPath(`monitors/${encodeURIComponent(monitorId)}/${prefix}/${encodeURIComponent(item.id)}`), investigationEvidenceSchema);
    if (generation !== workspaceGeneration || requestId !== detailGeneration) return;
    if (result.ok) selectedEvidence = { kind, id: item.id, detail: result.data };
    else detailError = messageFor(result.status, result.code);
    detailLoading = false;
  }

  function closeSelectedEvidence() {
    detailGeneration += 1;
    traceGeneration += 1;
    selectedEvidence = null;
    selectedTrace = null;
    detailLoading = false;
    traceLoading = false;
    detailError = '';
    traceError = '';
  }

  function clearSelectedRecords() {
    closeSelectedEvidence();
    deliveryDetailGeneration += 1;
    healthVersionGeneration += 1;
    selectedDelivery = null;
    selectedHealthVersion = null;
    deliveryDetailError = '';
    healthVersionError = '';
    detailLoading = false;
    healthVersionLoading = false;
  }

  async function openTrace() {
    if (!selectedEvidence || selectedEvidence.detail.trace_available !== true) return;
    const generation = workspaceGeneration;
    const requestId = ++traceGeneration;
    const evidenceId = selectedEvidence.id;
    const evidenceKind = selectedEvidence.kind;
    traceLoading = true; traceError = ''; selectedTrace = null;
    const prefix = evidenceKind === 'rejected' ? 'bad-evidence' : 'evidence';
    const result = await readResource(apiPath(`monitors/${encodeURIComponent(monitorId)}/${prefix}/${encodeURIComponent(evidenceId)}/trace`), investigationRecordSchema);
    if (generation !== workspaceGeneration || requestId !== traceGeneration || selectedEvidence?.id !== evidenceId || selectedEvidence?.kind !== evidenceKind) return;
    if (result.ok) selectedTrace = result.data;
    else traceError = messageFor(result.status, result.code);
    traceLoading = false;
  }

  async function openDelivery(item: Delivery) {
    const generation = workspaceGeneration;
    const requestId = ++deliveryDetailGeneration;
    detailGeneration += 1;
    traceGeneration += 1;
    healthVersionGeneration += 1;
    closeSelectedEvidence();
    selectedHealthVersion = null;
    healthVersionLoading = false;
    selectedDelivery = null;
    healthVersionError = '';
    detailError = ''; traceError = ''; deliveryDetailError = ''; detailLoading = true;
    const result = await readResource(apiPath(`workspaces/${encodeURIComponent(workspaceId)}/deliveries/${encodeURIComponent(item.request_id)}`), investigationRecordSchema);
    if (generation !== workspaceGeneration || requestId !== deliveryDetailGeneration) return;
    if (result.ok) selectedDelivery = result.data;
    else deliveryDetailError = messageFor(result.status, result.code);
    detailLoading = false;
  }

  function closeSelectedDelivery() {
    deliveryDetailGeneration += 1;
    selectedDelivery = null;
    deliveryDetailError = '';
    detailLoading = false;
  }

  async function openHealthVersion(version: number) {
    const generation = workspaceGeneration;
    const requestId = ++healthVersionGeneration;
    selectedHealthVersion = null; healthVersionError = ''; healthVersionLoading = true;
    const result = await readResource(apiPath(`monitors/${encodeURIComponent(monitorId)}/health/history/${version}`), investigationHealthVersionSchema);
    if (generation !== workspaceGeneration || requestId !== healthVersionGeneration) return;
    if (result.ok) selectedHealthVersion = result.data;
    else healthVersionError = messageFor(result.status, result.code);
    healthVersionLoading = false;
  }

  function closeSelectedHealthVersion() {
    healthVersionGeneration += 1;
    selectedHealthVersion = null;
    healthVersionError = '';
    healthVersionLoading = false;
  }

  async function bootstrap() {
    bootLoading = true; bootError = '';
    try {
      const result = await loadWorkspaceBootstrap();
      if (disposed) return;
      if (!result.workspaces.ok) {
        bootError = messageFor(result.workspaces.status, result.workspaces.code);
        bootLoading = false;
        return;
      }
      workspaces = result.workspaces.data.data;
      const personalId = result.me.ok ? result.me.data.personal_workspace_id : null;
      const requestedWorkspaceId = new URLSearchParams(window.location.search).get('workspace_id');
      workspaceId = resolveAndPersistWorkspaceId(workspaces, [requestedWorkspaceId, readActiveWorkspaceId(), personalId]);
      workspaceGeneration += 1;
      bootLoading = false;
      if (!workspaceId) { bootError = 'No workspace is available to inspect this monitor.'; return; }
      await Promise.all([loadEvidencePage('verified'), loadEvidencePage('rejected'), loadDeliveryPage()]);
    } catch {
      if (!disposed) {
        bootError = messageFor(0, 'network_error');
        bootLoading = false;
      }
    }
  }

  async function changeWorkspace() {
    writeActiveWorkspaceId(workspaceId);
    workspaceGeneration += 1;
    verifiedEvidenceGeneration += 1;
    rejectedEvidenceGeneration += 1;
    deliveryListGeneration += 1;
    clearSelectedRecords();
    evidence = null; badEvidence = null; deliveries = null;
    evidenceCursor = null; rejectedCursor = null; deliveryCursor = null;
    evidenceCursorStack = [null]; rejectedCursorStack = [null]; deliveryCursorStack = [null];
    evidencePageIndex = 0; rejectedPageIndex = 0; deliveryPageIndex = 0;
    await Promise.all([loadEvidencePage('verified'), loadEvidencePage('rejected'), loadDeliveryPage()]);
  }

  function nextEvidence(kind: 'verified' | 'rejected') {
    if (kind === 'rejected' && rejectedCursor) {
      rejectedCursorStack = [...rejectedCursorStack.slice(0, rejectedPageIndex + 1), rejectedCursor];
      void loadEvidencePage('rejected', rejectedCursor, rejectedPageIndex + 1);
    } else if (kind === 'verified' && evidenceCursor) {
      evidenceCursorStack = [...evidenceCursorStack.slice(0, evidencePageIndex + 1), evidenceCursor];
      void loadEvidencePage('verified', evidenceCursor, evidencePageIndex + 1);
    }
  }

  function previousEvidence(kind: 'verified' | 'rejected') {
    if (kind === 'rejected' && rejectedPageIndex > 0) void loadEvidencePage('rejected', rejectedCursorStack[rejectedPageIndex - 1], rejectedPageIndex - 1);
    if (kind === 'verified' && evidencePageIndex > 0) void loadEvidencePage('verified', evidenceCursorStack[evidencePageIndex - 1], evidencePageIndex - 1);
  }

  function nextDeliveries() {
    if (!deliveryCursor) return;
    deliveryCursorStack = [...deliveryCursorStack.slice(0, deliveryPageIndex + 1), deliveryCursor];
    void loadDeliveryPage(deliveryCursor, deliveryPageIndex + 1);
  }

  function previousDeliveries() {
    if (deliveryPageIndex > 0) void loadDeliveryPage(deliveryCursorStack[deliveryPageIndex - 1], deliveryPageIndex - 1);
  }

  onMount(() => {
    disposed = false;
    void bootstrap();
  });

  onDestroy(() => {
    disposed = true;
    workspaceGeneration += 1;
    verifiedEvidenceGeneration += 1;
    rejectedEvidenceGeneration += 1;
    deliveryListGeneration += 1;
    detailGeneration += 1;
    traceGeneration += 1;
    deliveryDetailGeneration += 1;
    healthVersionGeneration += 1;
  });
</script>

<svelte:head>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="mx-auto flex w-full min-w-0 flex-col gap-6" aria-busy={bootLoading || monitorLoading}>
  {#if bootLoading}
    <div class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground" aria-live="polite">
      <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>
      Loading workspace and investigation…
    </div>
  {:else if bootError}
    <Alert variant="destructive"><AlertTriangle class="size-4" /><AlertTitle>Could not load investigation</AlertTitle><AlertDescription>{bootError}</AlertDescription></Alert>
  {:else}
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex min-w-0 flex-col gap-3">
        <Button variant="ghost" size="sm" href="/monitors" class="-ml-2 w-fit"><ArrowLeft class="size-4" /> All monitors</Button>
        <div class="grid gap-2">
          <label class="text-xs font-medium text-muted-foreground" for="investigation-workspace">Workspace</label>
          <Select.Root type="single" value={workspaceId} onValueChange={(value) => { if (value && value !== workspaceId) { workspaceId = value; changeWorkspace(); } }}>
            <Select.Trigger id="investigation-workspace" class="w-64 max-w-full"><Select.Value placeholder="Select workspace" /></Select.Trigger>
            <Select.Content>
              {#each workspaces as workspace (workspace.id)}
                <Select.Item value={workspace.id} label={workspace.name}>{workspace.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
    </div>

    {#if monitorError}
      <Alert variant="destructive"><AlertTriangle class="size-4" /><AlertTitle>Could not load monitor</AlertTitle><AlertDescription>{monitorError}</AlertDescription><Button variant="outline" href="/monitors" class="mt-2 w-fit">Return to monitors</Button></Alert>
    {:else if monitorLoading || !monitor}
      <div class="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground" aria-live="polite">
        <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>
        Loading monitor details…
      </div>
    {:else}
      <header class="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-5 sm:p-6">
        <div class="min-w-0 space-y-2">
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Monitor investigation · Configuration v{monitor.current_config_version ?? '—'}</p>
          <h1 class="break-words text-2xl font-semibold tracking-tight">{monitor.name}</h1>
          <p class="max-w-3xl text-sm text-muted-foreground">{monitor.description || 'No description added.'}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant={monitor.status === 'enabled' ? 'default' : monitor.status === 'archived' ? 'destructive' : 'secondary'} class="capitalize">{label(monitor.status)}</Badge>
          <Badge variant="outline">Cadence: {monitor.cadence_seconds ? `${monitor.cadence_seconds}s` : 'Unavailable'}</Badge>
          <span class="text-xs text-muted-foreground">Updated {formatDate(monitor.updated_at)}</span>
        </div>
      </header>

      <section class="space-y-4" aria-labelledby="health-heading">
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div><p class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Persisted reasoning state</p><h2 id="health-heading" class="mt-1 text-lg font-semibold">Field health</h2></div>
          <p class="text-xs text-muted-foreground">Field-level signals, not a monitor-wide verdict.</p>
        </div>
        {#if healthLoading}
          <p class="rounded-lg border p-4 text-sm text-muted-foreground" aria-live="polite">Loading current health…</p>
        {:else if healthError}
          <Alert variant="destructive"><AlertDescription>{healthError}</AlertDescription></Alert>
        {:else if health && Object.keys(health.health?.fields ?? {}).length}
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {#each Object.entries(health.health?.fields ?? {}) as [fieldName, fieldState] (fieldName)}
              <article class="rounded-lg border bg-card p-4">
                <div class="flex flex-wrap items-start justify-between gap-2"><h3 class="break-words font-medium">{fieldName}</h3><Badge variant={String(fieldState.state ?? 'unknown') === 'healthy' ? 'default' : String(fieldState.state ?? 'unknown') === 'unknown' ? 'secondary' : 'outline'} class="capitalize">{label(fieldState.state)}</Badge></div>
                <Separator class="my-4" />
                <dl class="grid grid-cols-2 gap-3 text-sm">
                  <div><dt class="text-xs text-muted-foreground">Consecutive anomalies</dt><dd class="mt-1 font-medium">{formatValue(fieldState.consecutive_anomalies)}</dd></div>
                  <div><dt class="text-xs text-muted-foreground">Consecutive healthy</dt><dd class="mt-1 font-medium">{formatValue(fieldState.consecutive_healthy)}</dd></div>
                </dl>
              </article>
            {/each}
          </div>
        {:else if health}
          <p class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No field-level health snapshot is currently available for this monitor.</p>
        {/if}
        {#if health && (health.health?.checkpoints || health.health?.adopted_baselines)}
          <details class="rounded-lg border p-4">
            <summary class="cursor-pointer text-sm font-medium">Checkpoint and adopted baseline state</summary>
            <pre class="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify({ checkpoints: health.health?.checkpoints ?? [], adopted_baselines: health.health?.adopted_baselines ?? {} }, null, 2)}</pre>
          </details>
        {/if}
      </section>

      <section class="space-y-4" aria-labelledby="history-heading">
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div><p class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Configuration epochs</p><h2 id="history-heading" class="mt-1 text-lg font-semibold">Health history</h2></div>
          <p class="text-xs text-muted-foreground">Version history is not a timestamped transition log.</p>
        </div>
        {#if healthHistoryError}
          <Alert variant="destructive"><AlertDescription>{healthHistoryError}</AlertDescription></Alert>
        {:else if healthHistoryLoading}
          <p class="rounded-lg border p-4 text-sm text-muted-foreground">Loading health history…</p>
        {:else if healthHistory?.data?.length}
          <div class="overflow-hidden rounded-lg border">
            <Table.Root>
              <Table.Header><Table.Row><Table.Head>Configuration</Table.Head><Table.Head>Snapshot</Table.Head><Table.Head>Health summary</Table.Head><Table.Head class="text-right">Inspect</Table.Head></Table.Row></Table.Header>
              <Table.Body>
                {#each healthHistory.data as version (version.config_version)}
                  <Table.Row>
                    <Table.Cell class="font-medium">v{version.config_version}</Table.Cell>
                    <Table.Cell><Badge variant={version.is_current ? 'default' : 'secondary'}>{version.is_current ? 'Current' : 'Historical'}</Badge></Table.Cell>
                    <Table.Cell><div class="flex flex-wrap gap-2">{#each healthCounts(version.health_summary) as [key, value]}<span class="text-xs text-muted-foreground">{label(key)} <strong class="text-foreground">{formatValue(value)}</strong></span>{/each}</div></Table.Cell>
                    <Table.Cell class="text-right"><Button variant="outline" size="sm" onclick={() => openHealthVersion(version.config_version)}>Inspect <ExternalLink class="size-3.5" /></Button></Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        {:else}
          <p class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No persisted health history is available.</p>
        {/if}
        {#if healthVersionLoading}<p class="text-sm text-muted-foreground">Loading selected health version…</p>{/if}
        {#if healthVersionError}<Alert variant="destructive"><AlertDescription>{healthVersionError}</AlertDescription></Alert>{/if}
        {#if selectedHealthVersion}
          <article class="space-y-3 rounded-lg border bg-card p-4">
            <div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-semibold">Configuration v{selectedHealthVersion.config_version}</h3><p class="mt-1 text-sm text-muted-foreground">{selectedHealthVersion.is_current ? 'Current persisted snapshot' : 'Historical persisted snapshot'} · Cadence {selectedHealthVersion.configuration?.cadence_seconds == null ? 'unavailable' : `${selectedHealthVersion.configuration.cadence_seconds}s`}</p></div><Button variant="ghost" size="sm" onclick={closeSelectedHealthVersion}><X class="size-4" /> Close</Button></div>
            <details open><summary class="cursor-pointer text-sm font-medium">Configuration and health snapshot</summary><pre class="mt-3 max-h-[32rem] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify({ configuration: selectedHealthVersion.configuration, health: selectedHealthVersion.health }, null, 2)}</pre></details>
          </article>
        {/if}
      </section>

      <section class="space-y-4" aria-labelledby="activity-heading">
        <div><p class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Observations and notifications</p><h2 id="activity-heading" class="mt-1 text-lg font-semibold">Evidence & delivery history</h2></div>
        <Tabs.Root bind:value={activeSection} class="w-full">
          <Tabs.List class="grid h-auto w-full grid-cols-1 sm:grid-cols-3">
            <Tabs.Trigger value="evidence"><FileSearch class="size-4" /> Verified evidence</Tabs.Trigger>
            <Tabs.Trigger value="rejected"><AlertTriangle class="size-4" /> Rejected evidence</Tabs.Trigger>
            <Tabs.Trigger value="deliveries"><Bell class="size-4" /> Delivery history</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="evidence" class="mt-4 space-y-3">
            {#if evidenceLoading}<p class="text-sm text-muted-foreground" aria-live="polite">Loading verified evidence…</p>
            {:else if evidenceError}<Alert variant="destructive"><AlertDescription>{evidenceError}</AlertDescription><Button variant="outline" size="sm" class="mt-2 w-fit" onclick={() => loadEvidencePage('verified')}><RefreshCw class="size-4" /> Retry</Button></Alert>
            {:else if evidence?.data?.length}
              <div class="overflow-hidden rounded-lg border"><Table.Root>
                <Table.Header><Table.Row><Table.Head>Evidence</Table.Head><Table.Head>Observed</Table.Head><Table.Head>Configuration</Table.Head><Table.Head>Request</Table.Head><Table.Head class="text-right"> </Table.Head></Table.Row></Table.Header>
                <Table.Body>{#each evidence.data as item (item.id)}<Table.Row><Table.Cell><div class="font-medium">{item.id.slice(0, 8)}…</div><Badge variant="secondary">Verified</Badge></Table.Cell><Table.Cell>{formatDate(item.observed_at ?? item.created_at)}</Table.Cell><Table.Cell>v{item.config_version}</Table.Cell><Table.Cell><code class="text-xs">{item.request_id.slice(0, 8)}…</code></Table.Cell><Table.Cell class="text-right"><Button variant="outline" size="sm" onclick={() => openEvidence('verified', item)}>Inspect</Button></Table.Cell></Table.Row>{/each}</Table.Body>
              </Table.Root></div>
              <div class="flex flex-wrap items-center justify-between gap-3"><p class="text-sm text-muted-foreground">Page {evidencePageIndex + 1}</p><div class="flex gap-2"><Button variant="outline" size="sm" onclick={() => previousEvidence('verified')} disabled={evidencePageIndex === 0 || evidenceLoading}><ChevronLeft class="size-4" /> Previous</Button><Button variant="outline" size="sm" onclick={() => nextEvidence('verified')} disabled={!evidenceCursor || evidenceLoading}>Next <ChevronRight class="size-4" /></Button></div></div>
            {:else}<p class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No verified evidence records were returned for this monitor.</p>{/if}
          </Tabs.Content>
          <Tabs.Content value="rejected" class="mt-4 space-y-3">
            {#if rejectedLoading}<p class="text-sm text-muted-foreground" aria-live="polite">Loading rejected evidence…</p>
            {:else if rejectedError}<Alert variant="destructive"><AlertDescription>{rejectedError}</AlertDescription><Button variant="outline" size="sm" class="mt-2 w-fit" onclick={() => loadEvidencePage('rejected')}><RefreshCw class="size-4" /> Retry</Button></Alert>
            {:else if badEvidence?.data?.length}
              <div class="overflow-hidden rounded-lg border"><Table.Root>
                <Table.Header><Table.Row><Table.Head>Evidence</Table.Head><Table.Head>Rejected at</Table.Head><Table.Head>Configuration</Table.Head><Table.Head>Reason</Table.Head><Table.Head class="text-right"></Table.Head></Table.Row></Table.Header>
                <Table.Body>{#each badEvidence.data as item (item.id)}<Table.Row><Table.Cell><div class="font-medium">{item.id.slice(0, 8)}…</div><Badge variant="destructive">Rejected</Badge></Table.Cell><Table.Cell>{formatDate(item.created_at)}</Table.Cell><Table.Cell>v{item.config_version}</Table.Cell><Table.Cell><code class="text-xs">{item.reason?.code ?? 'Unknown reason'}</code></Table.Cell><Table.Cell class="text-right"><Button variant="outline" size="sm" onclick={() => openEvidence('rejected', item)}>Inspect</Button></Table.Cell></Table.Row>{/each}</Table.Body>
              </Table.Root></div>
              <div class="flex flex-wrap items-center justify-between gap-3"><p class="text-sm text-muted-foreground">Page {rejectedPageIndex + 1}</p><div class="flex gap-2"><Button variant="outline" size="sm" onclick={() => previousEvidence('rejected')} disabled={rejectedPageIndex === 0 || rejectedLoading}><ChevronLeft class="size-4" /> Previous</Button><Button variant="outline" size="sm" onclick={() => nextEvidence('rejected')} disabled={!rejectedCursor || rejectedLoading}>Next <ChevronRight class="size-4" /></Button></div></div>
            {:else}<p class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No rejected evidence records were returned for this monitor.</p>{/if}
          </Tabs.Content>
          <Tabs.Content value="deliveries" class="mt-4 space-y-3">
            {#if deliveriesLoading}<p class="text-sm text-muted-foreground" aria-live="polite">Loading delivery history…</p>
            {:else if deliveriesError}<Alert variant="destructive"><AlertDescription>{deliveriesError}</AlertDescription><Button variant="outline" size="sm" class="mt-2 w-fit" onclick={() => loadDeliveryPage()}><RefreshCw class="size-4" /> Retry</Button></Alert>
            {:else if deliveries?.data?.length}
              <div class="overflow-hidden rounded-lg border"><Table.Root>
                <Table.Header><Table.Row><Table.Head>Request</Table.Head><Table.Head>Evidence outcome</Table.Head><Table.Head>Delivery status</Table.Head><Table.Head>Recorded</Table.Head><Table.Head class="text-right"></Table.Head></Table.Row></Table.Header>
                <Table.Body>{#each deliveries.data as item (item.request_id)}<Table.Row><Table.Cell><code class="text-xs">{item.request_id.slice(0, 8)}…</code></Table.Cell><Table.Cell>{label(item.evidence_outcome)}</Table.Cell><Table.Cell><Badge variant={String(item.status ?? item.summary?.status ?? 'unknown') === 'delivered' ? 'default' : 'secondary'} class="capitalize">{label(item.status ?? item.summary?.status)}</Badge></Table.Cell><Table.Cell>{formatDate(item.created_at ?? item.updated_at)}</Table.Cell><Table.Cell class="text-right"><Button variant="outline" size="sm" onclick={() => openDelivery(item)}>Inspect</Button></Table.Cell></Table.Row>{/each}</Table.Body>
              </Table.Root></div>
              <div class="flex flex-wrap items-center justify-between gap-3"><p class="text-sm text-muted-foreground">Page {deliveryPageIndex + 1}</p><div class="flex gap-2"><Button variant="outline" size="sm" onclick={previousDeliveries} disabled={deliveryPageIndex === 0 || deliveriesLoading}><ChevronLeft class="size-4" /> Previous</Button><Button variant="outline" size="sm" onclick={nextDeliveries} disabled={!deliveryCursor || deliveriesLoading}>Next <ChevronRight class="size-4" /></Button></div></div>
            {:else}<p class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No persisted delivery records were returned. This does not imply provider delivery is enabled or disabled.</p>{/if}
          </Tabs.Content>
        </Tabs.Root>

        {#if detailLoading}<p class="text-sm text-muted-foreground" aria-live="polite">Loading selected record…</p>{/if}
        {#if detailError}<Alert variant="destructive"><AlertDescription>{detailError}</AlertDescription></Alert>{/if}
        {#if selectedEvidence}
          <article class="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
            <div class="flex flex-wrap items-start justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{selectedEvidence.kind === 'rejected' ? 'Rejected evidence' : 'Verified evidence'}</p><h3 class="mt-1 font-semibold">Evidence record</h3></div><Button variant="ghost" size="sm" onclick={closeSelectedEvidence}><X class="size-4" /> Close</Button></div>
            <dl class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div><dt class="text-xs text-muted-foreground">Evidence ID</dt><dd class="mt-1 break-all text-sm"><code>{selectedEvidence.detail.id ?? selectedEvidence.id}</code></dd></div>
              <div><dt class="text-xs text-muted-foreground">Request ID</dt><dd class="mt-1 break-all text-sm"><code>{formatValue(selectedEvidence.detail.request_id)}</code></dd></div>
              <div><dt class="text-xs text-muted-foreground">Configuration</dt><dd class="mt-1 text-sm">v{formatValue(selectedEvidence.detail.config_version)}</dd></div>
              <div><dt class="text-xs text-muted-foreground">{selectedEvidence.kind === 'rejected' ? 'Recorded at' : 'Observed at'}</dt><dd class="mt-1 text-sm">{formatDate(selectedEvidence.detail.observed_at ?? selectedEvidence.detail.created_at)}</dd></div>
              {#if selectedEvidence.kind === 'rejected'}<div><dt class="text-xs text-muted-foreground">Rejection reason</dt><dd class="mt-1 text-sm"><code>{formatValue(selectedEvidence.detail.reason?.code)}</code></dd></div><div class="sm:col-span-2"><dt class="text-xs text-muted-foreground">Reason parameters</dt><dd class="mt-1"><pre class="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(selectedEvidence.detail.reason?.params ?? null, null, 2)}</pre></dd></div>{:else}<div class="sm:col-span-2 xl:col-span-3"><dt class="text-xs text-muted-foreground">Verified fields</dt><dd class="mt-1"><pre class="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(selectedEvidence.detail.fields ?? {}, null, 2)}</pre></dd></div>{/if}
            </dl>
            {#if selectedEvidence.detail.trace_available === true}
              <div class="space-y-2"><Button onclick={openTrace} disabled={traceLoading}><Database class="size-4" />{traceLoading ? 'Loading trace…' : selectedTrace ? 'Refresh trace' : 'Load submitted trace'}</Button><p class="text-xs text-muted-foreground">The original payload is fetched only on request when the API reports that a trace is available.</p></div>
            {:else}<p class="text-sm text-muted-foreground">The API reports that a trace is unavailable for this record.</p>{/if}
            {#if traceError}<Alert variant="destructive"><AlertDescription>{traceError}</AlertDescription></Alert>{/if}
            {#if selectedTrace}<details open><summary class="cursor-pointer text-sm font-medium">Trace payload and metadata</summary><pre class="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(selectedTrace, null, 2)}</pre></details>{/if}
          </article>
        {/if}
        {#if deliveryDetailError}<Alert variant="destructive"><AlertDescription>{deliveryDetailError}</AlertDescription></Alert>{/if}
        {#if selectedDelivery}
          <article class="space-y-3 rounded-lg border bg-card p-4 sm:p-5">
            <div class="flex flex-wrap items-start justify-between gap-3"><div><p class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Read-only delivery inspection</p><h3 class="mt-1 font-semibold">Delivery record</h3></div><Button variant="ghost" size="sm" onclick={closeSelectedDelivery}><X class="size-4" /> Close</Button></div>
            <p class="text-sm text-muted-foreground">Delivery status is derived from persisted per-channel state. Manual retry is not available here.</p>
            <details open><summary class="cursor-pointer text-sm font-medium">Delivery snapshot and bounded diagnostics</summary><pre class="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(selectedDelivery, null, 2)}</pre></details>
          </article>
        {/if}
      </section>
    {/if}
  {/if}
</main>
