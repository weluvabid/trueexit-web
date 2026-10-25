<svelte:options runes={true} />
<script lang="ts">
  import MonitorDetailsFields from '@/features/monitors/configuration/monitor-details-fields.svelte';
  import MonitorFieldConfiguration from '@/features/monitors/configuration/monitor-field-configuration.svelte';
  import MonitorDestinationConfiguration from '@/features/monitors/configuration/monitor-destination-configuration.svelte';
  import type { MonitorDetail } from '@/lib/client/monitor-types';
  import type { MonitorEditorDraft } from '@/lib/client/monitor-editor-state';
  import type { MonitorChannel } from '@/lib/client/monitor-queries';

  let {
    draft = $bindable(),
    workspaceId,
    fieldError = $bindable(''),
    cadenceError = $bindable(''),
    cadencePreview = $bindable('Every 5 minutes'),
    channels,
    channelsLoading,
    channelsError,
    canManageChannels,
    creating,
    editingMonitor,
    createError,
    loadingEdit = false,
    onsubmit,
    oncancel,
  }: {
    draft: MonitorEditorDraft;
    workspaceId: string;
    fieldError?: string;
    cadenceError?: string;
    cadencePreview?: string;
    channels: MonitorChannel[];
    channelsLoading: boolean;
    channelsError: string;
    canManageChannels: boolean;
    creating: boolean;
    editingMonitor: MonitorDetail | null;
    createError: string;
    loadingEdit?: boolean;
    onsubmit: (event: SubmitEvent) => void | Promise<void>;
    oncancel: () => void;
  } = $props();

  let fieldConfiguration = $state<InstanceType<typeof MonitorFieldConfiguration> | undefined>(undefined);

  export function resetFieldConfiguration() {
    fieldConfiguration?.reset();
  }

  export function applyPendingFieldJson(): boolean {
    return fieldConfiguration?.applyPendingJson() ?? true;
  }
</script>

<section class="monitor-create-modal monitor-create-page" aria-labelledby="monitor-create-title">
  <header class="monitor-create-modal__header">
    <div>
      <p class="eyebrow">{editingMonitor ? 'EDIT CHECK' : 'NEW CHECK'}</p>
      <h2 id="monitor-create-title">{editingMonitor ? 'Refine your signal.' : 'Give your signal a shape.'}</h2>
      <p>{editingMonitor ? 'Update the fields, cadence, and notification destinations for this monitor.' : 'Define the fields TrueExit should observe. A monitor always needs at least one valid field.'}</p>
    </div>
    <button class="monitor-button monitor-button--quiet" type="button" onclick={oncancel} disabled={creating}>← Back to monitors</button>
  </header>

  {#if createError}
    <div class="monitor-inline-alert" role="alert">{createError}</div>
  {/if}

  {#if loadingEdit}
    <div class="monitor-form-loading" role="status">
      <span class="monitor-loader" aria-hidden="true"></span>
      <div><strong>Loading monitor configuration</strong><p>Fetching the current fields and destinations before enabling edits.</p></div>
    </div>
  {:else}
    <form class="monitor-create-form" onsubmit={onsubmit}>
      <MonitorDetailsFields bind:draft bind:cadenceError bind:cadencePreview />

      <MonitorFieldConfiguration
        bind:this={fieldConfiguration}
        {draft}
        {workspaceId}
        bind:fieldError
      />

      <MonitorDestinationConfiguration
        bind:draft
        {channels}
        {channelsLoading}
        {channelsError}
        {canManageChannels}
      />

      <footer class="monitor-create-footer">
        <p>Fields are required. Destinations are optional. You can review everything before saving.</p>
        <div>
          <button class="monitor-button monitor-button--quiet" type="button" onclick={oncancel} disabled={creating}>Cancel</button>
          <button class="monitor-button monitor-button--primary" type="submit" disabled={creating}>
            {creating ? (editingMonitor ? 'Saving changes…' : 'Creating monitor…') : (editingMonitor ? 'Save changes' : 'Create monitor')}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </footer>
    </form>
  {/if}
</section>
