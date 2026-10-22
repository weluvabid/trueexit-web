<svelte:options runes={true} />
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { getSharedQueryClient } from '../lib/client/query-client';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';
  import '../styles/investigation.css';
  import { formatInvestigationDate, formatInvestigationValue, formatInvestigationLabel, getHealthCounts } from '../lib/client/investigation-format';
  import { buildInvestigationApiPath, getInvestigationErrorMessage, readInvestigationResource, investigationResourceQueryOptions, investigationQueryErrorMessage, type Resource } from '../lib/client/investigation-api';
  import { readActiveWorkspaceId, writeActiveWorkspaceId, resolveWorkspaceId } from '../lib/client/workspace-preference';

  type Page<T> = { data: T[]; page?: { next_cursor: string | null } };
  type Monitor = {
    id: string; workspace_id?: string; name: string; description?: string;
    status: 'enabled' | 'disabled' | 'archived'; cadence_seconds?: number;
    current_config_version?: number; created_at?: string; updated_at?: string;
    config_versions?: Array<{ version: number; cadence_seconds: number | null; config: { fields?: Array<{ name: string; path: string; primitive: number }> } }>;
  };
  type Evidence = { id: string; request_id: string; config_version: number; observed_at?: string | null; created_at?: string; fields?: Record<string, unknown>; reason?: { code: string; params?: unknown } };
  type Delivery = { request_id: string; monitor_id?: string; monitor_name?: string; mode?: string; evidence_outcome?: string; created_at?: string; updated_at?: string; status?: string; summary?: Record<string, unknown> };

  let { monitorId }: { monitorId: string } = $props();

  let workspaces = $state<WorkspaceContext[]>([]);
  let workspaceId = $state('');
  let evidence = $state<Page<Evidence> | null>(null);
  let badEvidence = $state<Page<Evidence> | null>(null);
  let deliveries = $state<Page<Delivery> | null>(null);
  let selectedEvidence = $state<{ kind: 'verified' | 'rejected'; id: string; detail: Record<string, any> } | null>(null);
  let selectedTrace = $state<Record<string, any> | null>(null);
  let selectedDelivery = $state<Record<string, any> | null>(null);
  let selectedHealthVersion = $state<Record<string, any> | null>(null);
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
    () => investigationResourceQueryOptions<Monitor>(workspaceId, monitorId, 'monitor', `monitors/${encodeURIComponent(monitorId)}`),
    () => queryClient,
  );
  const healthQuery = createQuery(
    () => investigationResourceQueryOptions<Record<string, any>>(workspaceId, monitorId, 'health', `monitors/${encodeURIComponent(monitorId)}/health`),
    () => queryClient,
  );
  const healthHistoryQuery = createQuery(
    () => investigationResourceQueryOptions<Page<Record<string, any>>>(workspaceId, monitorId, 'health-history', `monitors/${encodeURIComponent(monitorId)}/health/history`, { limit: '20' }),
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
    const result = await readResource<Page<Evidence>>(apiPath(route, extra));
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
    const result = await readResource<Page<Delivery>>(apiPath(`workspaces/${encodeURIComponent(workspaceId)}/deliveries`, extra));
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
    const result = await readResource<Record<string, any>>(apiPath(`monitors/${encodeURIComponent(monitorId)}/${prefix}/${encodeURIComponent(item.id)}`));
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
    const result = await readResource<Record<string, any>>(apiPath(`monitors/${encodeURIComponent(monitorId)}/${prefix}/${encodeURIComponent(evidenceId)}/trace`));
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
    const result = await readResource<Record<string, any>>(apiPath(`workspaces/${encodeURIComponent(workspaceId)}/deliveries/${encodeURIComponent(item.request_id)}`));
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
    const result = await readResource<Record<string, any>>(apiPath(`monitors/${encodeURIComponent(monitorId)}/health/history/${version}`));
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
      workspaceId = resolveWorkspaceId(workspaces, [requestedWorkspaceId, readActiveWorkspaceId(), personalId]);
      writeActiveWorkspaceId(workspaceId);
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

<section class="investigation" aria-busy={bootLoading || monitorLoading}>
  {#if bootLoading}
    <div class="investigation-state" aria-live="polite">Loading workspace and investigation…</div>
  {:else if bootError}
    <div class="investigation-state investigation-state--error" role="alert">{bootError}</div>
  {:else}
    <div class="investigation-toolbar">
      <a class="investigation-back" href="/monitors">← All monitors</a>
      <label class="investigation-workspace">Workspace
        <select bind:value={workspaceId} onchange={changeWorkspace} aria-label="Investigation workspace">
          {#each workspaces as workspace (workspace.id)}<option value={workspace.id}>{workspace.name}</option>{/each}
        </select>
      </label>
    </div>

    {#if monitorError}
      <div class="investigation-state investigation-state--error" role="alert">{monitorError}<a href="/monitors">Return to monitors</a></div>
    {:else if monitorLoading || !monitor}
      <div class="investigation-state" aria-live="polite">Loading monitor details…</div>
    {:else}
      <header class="investigation-header">
        <div>
          <p class="investigation-eyebrow">MONITOR INVESTIGATION · CONFIGURATION V{monitor.current_config_version ?? '—'}</p>
          <h1>{monitor.name}</h1>
          <p class="investigation-description">{monitor.description || 'No description added.'}</p>
        </div>
        <div class="investigation-header__meta"><span class={`investigation-status investigation-status--${monitor.status}`}>{label(monitor.status)}</span><span>Cadence: {monitor.cadence_seconds ? `${monitor.cadence_seconds}s` : 'Unavailable'}</span><span>Updated {formatDate(monitor.updated_at)}</span></div>
      </header>

      <section class="investigation-section" aria-labelledby="health-heading">
        <div class="investigation-section__heading"><div><p class="investigation-eyebrow">PERSISTED REASONING STATE</p><h2 id="health-heading">Field health</h2></div><span class="investigation-note">Field-level signals, not a monitor-wide verdict</span></div>
        {#if healthLoading}<p class="investigation-muted" aria-live="polite">Loading current health…</p>
        {:else if healthError}<p class="investigation-error" role="alert">{healthError}</p>
        {:else if health && Object.keys(health.health?.fields ?? {}).length}
          <div class="health-grid">
            {#each Object.entries(health.health.fields) as [fieldName, fieldState] (fieldName)}
              <article class="health-field"><div><h3>{fieldName}</h3><span class={`health-state health-state--${String(fieldState.state ?? 'unknown')}`}>{label(fieldState.state)}</span></div><dl><div><dt>Consecutive anomalies</dt><dd>{formatValue(fieldState.consecutive_anomalies)}</dd></div><div><dt>Consecutive healthy</dt><dd>{formatValue(fieldState.consecutive_healthy)}</dd></div></dl></article>
            {/each}
          </div>
        {:else if health}<p class="investigation-muted">No field-level health snapshot is currently available for this monitor.</p>{/if}
        {#if health && (health.health?.checkpoints || health.health?.adopted_baselines)}
          <details class="investigation-json"><summary>Checkpoint and adopted baseline state</summary><pre>{JSON.stringify({ checkpoints: health.health?.checkpoints ?? [], adopted_baselines: health.health?.adopted_baselines ?? {} }, null, 2)}</pre></details>
        {/if}
      </section>

      <section class="investigation-section" aria-labelledby="history-heading">
        <div class="investigation-section__heading"><div><p class="investigation-eyebrow">CONFIGURATION EPOCHS</p><h2 id="history-heading">Health history</h2></div><span class="investigation-note">Version history is not a timestamped transition log</span></div>
        {#if healthHistoryError}<p class="investigation-error" role="alert">{healthHistoryError}</p>
        {:else if healthHistoryLoading}<p class="investigation-muted">Loading health history…</p>
        {:else if healthHistory?.data?.length}
          <div class="history-list">{#each healthHistory.data as version (version.config_version)}<button class="history-row" type="button" onclick={() => openHealthVersion(version.config_version)}><span><strong>Configuration v{version.config_version}</strong><small>{version.is_current ? 'Current snapshot' : 'Historical snapshot'}</small></span><span class="history-counts">{#each healthCounts(version.health_summary) as [key, value]}<span>{label(key)} <b>{formatValue(value)}</b></span>{/each}</span><span aria-hidden="true">↗</span></button>{/each}</div>
        {:else}<p class="investigation-muted">No persisted health history is available.</p>{/if}
        {#if healthVersionLoading}<p class="investigation-muted">Loading selected health version…</p>{/if}
        {#if healthVersionError}<p class="investigation-error" role="alert">{healthVersionError}</p>{/if}
        {#if selectedHealthVersion}<div class="investigation-detail"><div class="investigation-detail__heading"><h3>Configuration v{selectedHealthVersion.config_version}</h3><button type="button" class="investigation-close" onclick={closeSelectedHealthVersion}>Close</button></div><p class="investigation-muted">{selectedHealthVersion.is_current ? 'Current persisted snapshot' : 'Historical persisted snapshot'} · Cadence {selectedHealthVersion.configuration?.cadence_seconds == null ? 'unavailable' : `${selectedHealthVersion.configuration.cadence_seconds}s`}</p><details open><summary>Configuration and health snapshot</summary><pre>{JSON.stringify({ configuration: selectedHealthVersion.configuration, health: selectedHealthVersion.health }, null, 2)}</pre></details></div>{/if}
      </section>

      <section class="investigation-section" aria-labelledby="activity-heading">
        <div class="investigation-section__heading"><div><p class="investigation-eyebrow">OBSERVATIONS AND NOTIFICATIONS</p><h2 id="activity-heading">Evidence & delivery history</h2></div></div>
        <div class="investigation-tabs" role="tablist" aria-label="Investigation records"><button type="button" role="tab" aria-selected={activeSection === 'evidence'} class:active={activeSection === 'evidence'} onclick={() => { activeSection = 'evidence'; clearSelectedRecords(); }}>Verified evidence</button><button type="button" role="tab" aria-selected={activeSection === 'rejected'} class:active={activeSection === 'rejected'} onclick={() => { activeSection = 'rejected'; clearSelectedRecords(); }}>Rejected evidence</button><button type="button" role="tab" aria-selected={activeSection === 'deliveries'} class:active={activeSection === 'deliveries'} onclick={() => { activeSection = 'deliveries'; clearSelectedRecords(); }}>Delivery history</button></div>

        {#if activeSection === 'evidence'}
          {#if evidenceLoading}<p class="investigation-muted" aria-live="polite">Loading verified evidence…</p>{:else if evidenceError}<p class="investigation-error" role="alert">{evidenceError}<button type="button" onclick={() => loadEvidencePage('verified')}>Retry</button></p>{:else if evidence?.data?.length}
            <div class="investigation-table-wrap"><table class="investigation-table"><thead><tr><th>Evidence</th><th>Observed</th><th>Configuration</th><th>Request</th><th></th></tr></thead><tbody>{#each evidence.data as item (item.id)}<tr><td><strong>{item.id.slice(0, 8)}…</strong><small>Verified</small></td><td>{formatDate(item.observed_at ?? item.created_at)}</td><td>v{item.config_version}</td><td><code>{item.request_id.slice(0, 8)}…</code></td><td><button type="button" class="investigation-link" onclick={() => openEvidence('verified', item)}>Inspect</button></td></tr>{/each}</tbody></table></div>
            <div class="investigation-pagination"><button type="button" onclick={() => previousEvidence('verified')} disabled={evidencePageIndex === 0 || evidenceLoading}>Previous</button><span>Page {evidencePageIndex + 1}</span><button type="button" onclick={() => nextEvidence('verified')} disabled={!evidenceCursor || evidenceLoading}>Next</button></div>
          {:else}<p class="investigation-muted">No verified evidence records were returned for this monitor.</p>{/if}
        {:else if activeSection === 'rejected'}
          {#if rejectedLoading}<p class="investigation-muted" aria-live="polite">Loading rejected evidence…</p>{:else if rejectedError}<p class="investigation-error" role="alert">{rejectedError}<button type="button" onclick={() => loadEvidencePage('rejected')}>Retry</button></p>{:else if badEvidence?.data?.length}
            <div class="investigation-table-wrap"><table class="investigation-table"><thead><tr><th>Evidence</th><th>Rejected at</th><th>Configuration</th><th>Reason</th><th></th></tr></thead><tbody>{#each badEvidence.data as item (item.id)}<tr><td><strong>{item.id.slice(0, 8)}…</strong><small>Rejected</small></td><td>{formatDate(item.created_at)}</td><td>v{item.config_version}</td><td><code>{item.reason?.code ?? 'Unknown reason'}</code></td><td><button type="button" class="investigation-link" onclick={() => openEvidence('rejected', item)}>Inspect</button></td></tr>{/each}</tbody></table></div>
            <div class="investigation-pagination"><button type="button" onclick={() => previousEvidence('rejected')} disabled={rejectedPageIndex === 0 || rejectedLoading}>Previous</button><span>Page {rejectedPageIndex + 1}</span><button type="button" onclick={() => nextEvidence('rejected')} disabled={!rejectedCursor || rejectedLoading}>Next</button></div>
          {:else}<p class="investigation-muted">No rejected evidence records were returned for this monitor.</p>{/if}
        {:else}
          {#if deliveriesLoading}<p class="investigation-muted" aria-live="polite">Loading delivery history…</p>{:else if deliveriesError}<p class="investigation-error" role="alert">{deliveriesError}<button type="button" onclick={() => loadDeliveryPage()}>Retry</button></p>{:else if deliveries?.data?.length}
            <div class="investigation-table-wrap"><table class="investigation-table"><thead><tr><th>Request</th><th>Evidence outcome</th><th>Delivery status</th><th>Recorded</th><th></th></tr></thead><tbody>{#each deliveries.data as item (item.request_id)}<tr><td><code>{item.request_id.slice(0, 8)}…</code></td><td>{label(item.evidence_outcome)}</td><td><span class={`delivery-state delivery-state--${String(item.status ?? item.summary?.status ?? 'unknown')}`}>{label(item.status ?? item.summary?.status)}</span></td><td>{formatDate(item.created_at ?? item.updated_at)}</td><td><button type="button" class="investigation-link" onclick={() => openDelivery(item)}>Inspect</button></td></tr>{/each}</tbody></table></div>
            <div class="investigation-pagination"><button type="button" onclick={previousDeliveries} disabled={deliveryPageIndex === 0 || deliveriesLoading}>Previous</button><span>Page {deliveryPageIndex + 1}</span><button type="button" onclick={nextDeliveries} disabled={!deliveryCursor || deliveriesLoading}>Next</button></div>
          {:else}<p class="investigation-muted">No persisted delivery records were returned. This does not imply provider delivery is enabled or disabled.</p>{/if}
        {/if}

        {#if detailLoading}<p class="investigation-muted" aria-live="polite">Loading selected record…</p>{/if}
        {#if detailError}<p class="investigation-error" role="alert">{detailError}</p>{/if}
        {#if selectedEvidence}
          <div class="investigation-detail"><div class="investigation-detail__heading"><div><p class="investigation-eyebrow">{selectedEvidence.kind === 'rejected' ? 'REJECTED EVIDENCE' : 'VERIFIED EVIDENCE'}</p><h3>Evidence record</h3></div><button type="button" class="investigation-close" onclick={closeSelectedEvidence}>Close</button></div><dl class="detail-grid"><div><dt>Evidence ID</dt><dd><code>{selectedEvidence.detail.id ?? selectedEvidence.id}</code></dd></div><div><dt>Request ID</dt><dd><code>{formatValue(selectedEvidence.detail.request_id)}</code></dd></div><div><dt>Configuration</dt><dd>v{formatValue(selectedEvidence.detail.config_version)}</dd></div><div><dt>{selectedEvidence.kind === 'rejected' ? 'Recorded at' : 'Observed at'}</dt><dd>{formatDate(selectedEvidence.detail.observed_at ?? selectedEvidence.detail.created_at)}</dd></div>{#if selectedEvidence.kind === 'rejected'}<div><dt>Rejection reason</dt><dd><code>{formatValue(selectedEvidence.detail.reason?.code)}</code></dd></div><div><dt>Reason parameters</dt><dd><pre>{JSON.stringify(selectedEvidence.detail.reason?.params ?? null, null, 2)}</pre></dd></div>{:else}<div class="detail-grid__wide"><dt>Verified fields</dt><dd><pre>{JSON.stringify(selectedEvidence.detail.fields ?? {}, null, 2)}</pre></dd></div>{/if}</dl>{#if selectedEvidence.detail.trace_available === true}<button type="button" class="investigation-primary" onclick={openTrace} disabled={traceLoading}>{traceLoading ? 'Loading trace…' : selectedTrace ? 'Refresh trace' : 'Load submitted trace'}</button><p class="investigation-muted">The original payload is fetched only on request when the API reports that a trace is available.</p>{:else}<p class="investigation-muted">The API reports that a trace is unavailable for this record.</p>{/if}{#if traceError}<p class="investigation-error" role="alert">{traceError}</p>{/if}{#if selectedTrace}<details open class="investigation-json"><summary>Trace payload and metadata</summary><pre>{JSON.stringify(selectedTrace, null, 2)}</pre></details>{/if}</div>
        {/if}
        {#if deliveryDetailError}<p class="investigation-error" role="alert">{deliveryDetailError}</p>{/if}
        {#if selectedDelivery}<div class="investigation-detail"><div class="investigation-detail__heading"><div><p class="investigation-eyebrow">READ-ONLY DELIVERY INSPECTION</p><h3>Delivery record</h3></div><button type="button" class="investigation-close" onclick={closeSelectedDelivery}>Close</button></div><p class="investigation-muted">Delivery status is derived from persisted per-channel state. Manual retry is not available here.</p><details open><summary>Delivery snapshot and bounded diagnostics</summary><pre>{JSON.stringify(selectedDelivery, null, 2)}</pre></details></div>{/if}
      </section>
    {/if}
  {/if}
</section>
