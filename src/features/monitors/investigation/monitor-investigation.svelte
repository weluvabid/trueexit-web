<svelte:options runes={true} />
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { getSharedQueryClient } from '@/lib/client/query-client';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '@/lib/client/workspace-bootstrap';
  import * as Select from '@/components/ui/select/index.js';
  import * as Tabs from '@/components/ui/tabs/index.js';
  import { Button } from '@/components/ui/button/index.js';
  import { Badge } from '@/components/ui/badge/index.js';
  import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert/index.js';
  import { ArrowLeft, X, FileSearch, Activity, Clock3, Bell, Database, AlertTriangle } from '@lucide/svelte';
  import { formatInvestigationDate, formatInvestigationValue } from '@/lib/client/investigation-format';
  import MonitorInvestigationHeader from '@/features/monitors/investigation/monitor-investigation-header.svelte';
  import MonitorFieldHealth from '@/features/monitors/investigation/monitor-field-health.svelte';
  import MonitorHealthHistory from '@/features/monitors/investigation/monitor-health-history.svelte';
  import MonitorEvidenceList from '@/features/monitors/investigation/monitor-evidence-list.svelte';
  import MonitorDeliveryHistory from '@/features/monitors/investigation/monitor-delivery-history.svelte';
  import { buildInvestigationApiPath, getInvestigationErrorMessage, readInvestigationResource, investigationResourceQueryOptions, investigationQueryErrorMessage, type Resource } from '@/lib/client/investigation-api';
  import { investigationDeliveryPageSchema, investigationEvidencePageSchema, investigationEvidenceSchema, investigationHealthSchema, investigationHealthVersionSchema, investigationMonitorSchema, investigationRecordPageSchema, investigationRecordSchema } from '@/lib/client/api-schemas';
  import type { InvestigationDeliveryContract, InvestigationEvidenceContract, InvestigationHealthVersionContract, InvestigationMonitorContract } from '@/lib/client/api-schemas';
  import { readActiveWorkspaceId, writeActiveWorkspaceId, resolveAndPersistWorkspaceId } from '@/lib/client/workspace-preference';

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
      <MonitorInvestigationHeader {monitor} />

      <MonitorFieldHealth {health} loading={healthLoading} error={healthError} />

      <MonitorHealthHistory
        {healthHistory}
        loading={healthHistoryLoading}
        error={healthHistoryError}
        selectedVersion={selectedHealthVersion}
        versionLoading={healthVersionLoading}
        versionError={healthVersionError}
        onInspect={openHealthVersion}
        onCloseVersion={closeSelectedHealthVersion}
      />

      <section class="space-y-4" aria-labelledby="activity-heading">
        <div><p class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Observations and notifications</p><h2 id="activity-heading" class="mt-1 text-lg font-semibold">Evidence & delivery history</h2></div>
        <Tabs.Root bind:value={activeSection} class="w-full">
          <Tabs.List class="grid h-auto w-full grid-cols-1 sm:grid-cols-3">
            <Tabs.Trigger value="evidence"><FileSearch class="size-4" /> Verified evidence</Tabs.Trigger>
            <Tabs.Trigger value="rejected"><AlertTriangle class="size-4" /> Rejected evidence</Tabs.Trigger>
            <Tabs.Trigger value="deliveries"><Bell class="size-4" /> Delivery history</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="evidence" class="mt-4 space-y-3">
            <MonitorEvidenceList
              kind="verified"
              items={evidence?.data ?? []}
              loading={evidenceLoading}
              error={evidenceError}
              pageIndex={evidencePageIndex}
              hasNext={Boolean(evidenceCursor)}
              onRetry={() => loadEvidencePage('verified')}
              onInspect={(item) => openEvidence('verified', item)}
              onPrevious={() => previousEvidence('verified')}
              onNext={() => nextEvidence('verified')}
            />
          </Tabs.Content>
          <Tabs.Content value="rejected" class="mt-4 space-y-3">
            <MonitorEvidenceList
              kind="rejected"
              items={badEvidence?.data ?? []}
              loading={rejectedLoading}
              error={rejectedError}
              pageIndex={rejectedPageIndex}
              hasNext={Boolean(rejectedCursor)}
              onRetry={() => loadEvidencePage('rejected')}
              onInspect={(item) => openEvidence('rejected', item)}
              onPrevious={() => previousEvidence('rejected')}
              onNext={() => nextEvidence('rejected')}
            />
          </Tabs.Content>
          <Tabs.Content value="deliveries" class="mt-4 space-y-3">
            <MonitorDeliveryHistory
              items={deliveries?.data ?? []}
              loading={deliveriesLoading}
              error={deliveriesError}
              pageIndex={deliveryPageIndex}
              hasNext={Boolean(deliveryCursor)}
              onRetry={() => loadDeliveryPage()}
              onInspect={openDelivery}
              onPrevious={previousDeliveries}
              onNext={nextDeliveries}
            />
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
