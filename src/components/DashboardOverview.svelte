<script lang="ts">
  import { onMount } from 'svelte';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';

  type DashboardSummary = {
    active_monitors: number;
    disabled_monitors: number;
    evidence_received_recently: number;
    needs_attention: number;
    awaiting_first_evidence: number;
    health_distribution: {
      field_count: number;
      normal: number;
      suspected: number;
      confirmed: number;
      ongoing: number;
      recovered: number;
      unknown: number;
    };
    evidence_outcomes_24h: { accepted: number; rejected: number; total: number };
    delivery_outcomes_24h: {
      succeeded: number;
      failed: number;
      partial: number;
      in_progress: number;
      no_channels: number;
      total: number;
    };
    attention_conditions: { submission_rejected: number; evidence_overdue: number; health_signal: number };
  };

  type AttentionItem = {
    monitor_id: string;
    monitor_name: string;
    reason: 'submission_rejected' | 'evidence_overdue' | 'health_signal' | string;
    severity: string;
    occurred_at: string | null;
    last_valid_evidence_at: string | null;
    action: { kind: 'view_evidence' | 'investigate_monitor' | string };
  };

  type ActivityItem = {
    event_id: string;
    monitor_id: string;
    monitor_name: string;
    event_type: string;
    occurred_at: string;
  };

  type DashboardResponse = {
    generated_at: string;
    summary: DashboardSummary;
    attention_items: AttentionItem[];
    recent_evidence_activity: ActivityItem[];
  };

  type Resource<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null };

  let workspaces: WorkspaceContext[] = [];
  let selectedWorkspaceId = '';
  let dashboard: DashboardResponse | null = null;
  let bootstrapping = true;
  let loadingDashboard = false;
  let bootstrapError = '';
  let dashboardError = '';
  let requestSequence = 0;

  const reasonCopy: Record<string, { title: string; detail: string }> = {
    submission_rejected: {
      title: 'A submission was rejected',
      detail: 'Inspect the evidence to understand why it did not pass validation.',
    },
    evidence_overdue: {
      title: 'Evidence is overdue',
      detail: 'This monitor has not received valid evidence within its expected window.',
    },
    health_signal: {
      title: 'A field health signal needs review',
      detail: 'Review the configured field states; this is not independent proof of an outage.',
    },
  };

  const activityCopy: Record<string, string> = {
    accepted: 'Evidence accepted',
    evidence_accepted: 'Evidence accepted',
    rejected: 'Evidence rejected',
    evidence_rejected: 'Evidence rejected',
  };

  function messageForCode(code: string | null, status: number): string {
    if (status === 401) return 'Your session needs attention. Sign in again to continue.';
    if (status === 403) return 'You do not have permission to view this workspace.';
    if (status === 404) return 'This workspace is no longer available.';
    if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
    if (status >= 500) return 'TrueExit could not load this information right now. Try again shortly.';
    return code ? `The request could not be completed (${code}).` : 'The request could not be completed. Please try again.';
  }

  function formatDate(value: string | null): string {
    if (!value) return 'No valid evidence recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  async function loadDashboard(workspaceId: string) {
    const sequence = ++requestSequence;
    selectedWorkspaceId = workspaceId;
    dashboard = null;
    dashboardError = '';
    if (!workspaceId) return;
    loadingDashboard = true;

    try {
      const response = await fetch(`/api/backend/workspaces/${encodeURIComponent(workspaceId)}/dashboard`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const body: unknown = await response.json().catch(() => null);
      if (sequence !== requestSequence) return;
      if (!response.ok) {
        const errorBody = body as { error?: { code?: string } } | null;
        dashboardError = messageForCode(errorBody?.error?.code ?? null, response.status);
        return;
      }
      dashboard = body as DashboardResponse;
    } catch {
      if (sequence === requestSequence) dashboardError = messageForCode('network_error', 0);
    } finally {
      if (sequence === requestSequence) loadingDashboard = false;
    }
  }

  async function bootstrap() {
    bootstrapping = true;
    bootstrapError = '';
    const result = await loadWorkspaceBootstrap();
    if (!result.me.ok && !result.workspaces.ok) {
      bootstrapError = messageForCode(result.me.code ?? result.workspaces.code, result.me.status || result.workspaces.status);
      bootstrapping = false;
      return;
    }
    if (!result.workspaces.ok) {
      bootstrapError = messageForCode(result.workspaces.code, result.workspaces.status);
      bootstrapping = false;
      return;
    }

    workspaces = result.workspaces.data.data;
    const personalId = result.me.ok ? result.me.data.personal_workspace_id : null;
    const initialWorkspace = workspaces.find((workspace) => workspace.id === personalId) ?? workspaces[0];
    bootstrapping = false;
    if (initialWorkspace) await loadDashboard(initialWorkspace.id);
  }

  onMount(() => {
    void bootstrap();
  });
</script>

<section class="dashboard-overview" aria-labelledby="dashboard-title">
  <div class="dashboard-heading">
    <div>
      <p class="eyebrow">YOUR WORKSPACE, AT A GLANCE</p>
      <h2 id="dashboard-title">The current picture</h2>
      <p class="dashboard-subtitle">Live workspace data from TrueExit. Updated when you open or refresh this view.</p>
    </div>
    {#if workspaces.length > 1}
      <label class="dashboard-workspace-picker">
        <span>Workspace</span>
        <select value={selectedWorkspaceId} on:change={(event) => loadDashboard(event.currentTarget.value)} disabled={loadingDashboard}>
          {#each workspaces as workspace (workspace.id)}
            <option value={workspace.id}>{workspace.name}</option>
          {/each}
        </select>
      </label>
    {:else if workspaces.length === 1}
      <span class="dashboard-workspace-name">{workspaces[0].name}</span>
    {/if}
  </div>

  {#if bootstrapping}
    <div class="dashboard-state" aria-live="polite"><span class="dashboard-loader" aria-hidden="true"></span>Loading your workspace…</div>
  {:else if bootstrapError}
    <div class="dashboard-state dashboard-state--error" role="alert">
      <p>{bootstrapError}</p>
      <button class="dashboard-retry" type="button" on:click={bootstrap}>Try again</button>
    </div>
  {:else if workspaces.length === 0}
    <div class="dashboard-state dashboard-state--empty">
      <h3>No workspace yet</h3>
      <p>Your account is authenticated, but there are no workspaces available to show. Workspace creation will be available in a later phase.</p>
    </div>
  {:else if loadingDashboard}
    <div class="dashboard-state" aria-live="polite"><span class="dashboard-loader" aria-hidden="true"></span>Loading workspace activity…</div>
  {:else if dashboardError}
    <div class="dashboard-state dashboard-state--error" role="alert">
      <p>{dashboardError}</p>
      <button class="dashboard-retry" type="button" on:click={() => loadDashboard(selectedWorkspaceId)}>Try again</button>
    </div>
  {:else if dashboard}
    <div class="dashboard-stat-grid" aria-label="Workspace summary">
      <article class="dashboard-stat">
        <span class="dashboard-stat__label">Active monitors</span>
        <strong>{dashboard.summary.active_monitors}</strong>
        <span class="dashboard-stat__note">Currently enabled</span>
      </article>
      <article class="dashboard-stat">
        <span class="dashboard-stat__label">Needs attention</span>
        <strong>{dashboard.summary.needs_attention}</strong>
        <span class="dashboard-stat__note">Unique monitors flagged</span>
      </article>
      <article class="dashboard-stat">
        <span class="dashboard-stat__label">Evidence · 24 hours</span>
        <strong>{dashboard.summary.evidence_outcomes_24h.total}</strong>
        <span class="dashboard-stat__note">{dashboard.summary.evidence_outcomes_24h.accepted} accepted · {dashboard.summary.evidence_outcomes_24h.rejected} rejected</span>
      </article>
      <article class="dashboard-stat">
        <span class="dashboard-stat__label">Disabled monitors</span>
        <strong>{dashboard.summary.disabled_monitors}</strong>
        <span class="dashboard-stat__note">Not currently running</span>
      </article>
    </div>

    <div class="dashboard-detail-grid">
      <section class="dashboard-card" aria-labelledby="attention-title">
        <div class="dashboard-card__heading">
          <div>
            <p class="eyebrow">WHAT MAY NEED YOU</p>
            <h3 id="attention-title">Attention</h3>
          </div>
          <span class="dashboard-count">{dashboard.attention_items.length}</span>
        </div>
        {#if dashboard.attention_items.length}
          <ul class="dashboard-list">
            {#each dashboard.attention_items as item (`${item.monitor_id}-${item.reason}-${item.occurred_at ?? ''}`)}
              <li class="dashboard-attention-item">
                <span class="dashboard-attention-mark" aria-hidden="true"></span>
                <div class="dashboard-list__body">
                  <strong>{item.monitor_name}</strong>
                  <span class="dashboard-list__title">{reasonCopy[item.reason]?.title ?? 'Monitor needs review'}</span>
                  <p>{reasonCopy[item.reason]?.detail ?? 'Review this monitor for more context.'}</p>
                  <span class="dashboard-list__meta">{formatDate(item.occurred_at ?? item.last_valid_evidence_at)}</span>
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="dashboard-inline-empty"><span aria-hidden="true">✳</span><p>No attention items are currently reported for this workspace.</p></div>
        {/if}
      </section>

      <section class="dashboard-card" aria-labelledby="activity-title">
        <div class="dashboard-card__heading">
          <div>
            <p class="eyebrow">RECENT SIGNALS</p>
            <h3 id="activity-title">Evidence activity</h3>
          </div>
          <span class="dashboard-count">{dashboard.recent_evidence_activity.length}</span>
        </div>
        {#if dashboard.recent_evidence_activity.length}
          <ul class="dashboard-list dashboard-list--activity">
            {#each dashboard.recent_evidence_activity as item (item.event_id)}
              <li class="dashboard-activity-item">
                <span class="dashboard-activity-mark" aria-hidden="true"></span>
                <div class="dashboard-list__body">
                  <strong>{item.monitor_name}</strong>
                  <span class="dashboard-list__title">{activityCopy[item.event_type] ?? 'Evidence activity recorded'}</span>
                  <span class="dashboard-list__meta">{formatDate(item.occurred_at)}</span>
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="dashboard-inline-empty"><span aria-hidden="true">◌</span><p>No recent evidence activity has been recorded.</p></div>
        {/if}
      </section>
    </div>
    <p class="dashboard-footnote">Summary generated {formatDate(dashboard.generated_at)}. Health counts are field-level signals, not a single monitor-wide health verdict.</p>
  {/if}
</section>
