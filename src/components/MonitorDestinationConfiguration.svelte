<script lang="ts">
  import type { MonitorEditorDraft, ChannelKind } from '../lib/client/monitor-editor-state';
  import type { MonitorChannel } from '../lib/client/monitor-queries';
  import { buildNotificationChannelConfig } from '../lib/client/settings-channel-config';

  export let draft: MonitorEditorDraft;
  export let channels: MonitorChannel[] = [];
  export let channelsLoading = false;
  export let channelsError = '';
  export let canManageChannels = false;

  let selectedExistingChannelId = '';
  let newChannelOpen = false;
  let newChannelType: ChannelKind = 'webhook';
  let newChannelLabel = '';
  let newChannelAddress = '';
  let newChannelPriority = 0;
  let newChannelError = '';
  let newChannelHeaders = '';

  $: availableChannels = channels.filter((channel) => channel.enabled && !draft.channelSelection.some((item) => item.kind === 'existing' && item.channel_id === channel.id));
  $: if (!availableChannels.some((channel) => channel.id === selectedExistingChannelId)) {
    selectedExistingChannelId = availableChannels[0]?.id ?? '';
  }

  function addExistingChannel() {
    if (!selectedExistingChannelId || draft.channelSelection.length >= 25) return;
    const channel = channels.find((item) => item.id === selectedExistingChannelId);
    if (!channel || !channel.enabled || draft.channelSelection.some((item) => item.kind === 'existing' && item.channel_id === channel.id)) return;
    draft = { ...draft, channelSelection: [...draft.channelSelection, { kind: 'existing', channel_id: channel.id, label: channel.label }] };
  }

  function addNewChannel() {
    newChannelError = '';
    if (!canManageChannels) {
      newChannelError = 'Only a workspace owner or admin can configure a new destination. You can still select an existing destination.';
      return;
    }
    if (draft.channelSelection.length >= 25) {
      newChannelError = 'A monitor can select at most 25 destinations.';
      return;
    }

    const label = newChannelLabel.trim();
    if (!label || label.length > 80) {
      newChannelError = 'Enter a destination label between 1 and 80 characters.';
      return;
    }

    const result = buildNotificationChannelConfig(newChannelType, newChannelAddress, newChannelHeaders);
    if (!result.ok) {
      newChannelError = result.error;
      return;
    }

    draft = {
      ...draft,
      channelSelection: [...draft.channelSelection, {
        kind: 'new',
        type: newChannelType,
        label,
        priority: newChannelPriority,
        enabled: true,
        config: result.config,
        displayLabel: label,
      }],
    };
    newChannelLabel = '';
    newChannelAddress = '';
    newChannelPriority = 0;
    newChannelHeaders = '';
    newChannelOpen = false;
  }

  function removeChannelSelection(index: number) {
    draft = { ...draft, channelSelection: draft.channelSelection.filter((_, itemIndex) => itemIndex !== index) };
  }
</script>

<div class="monitor-create-section">
  <div class="monitor-create-section__heading"><span>03</span><div><h3>Notification destinations</h3><p>Optional. Select saved destinations or configure one inline.</p></div></div>
  {#if channelsError}<p class="monitor-form-error" role="alert">{channelsError}</p>{/if}
  {#if channelsLoading}
    <p class="monitor-form-hint">Loading workspace destinations…</p>
  {:else if availableChannels.length > 0}
    <div class="monitor-channel-add"><label class="monitor-form-field"><span>Saved destination</span><select bind:value={selectedExistingChannelId}><option value="">Choose a destination…</option>{#each availableChannels as channel (channel.id)}<option value={channel.id}>{channel.label} · {channel.type}</option>{/each}</select></label><button class="monitor-button monitor-button--quiet" type="button" on:click={addExistingChannel} disabled={!selectedExistingChannelId || draft.channelSelection.length >= 25}>Add destination</button></div>
  {:else}
    <p class="monitor-form-hint">No saved destinations available to select.</p>
  {/if}
  {#if draft.channelSelection.length > 0}
    <div class="monitor-selected-channels" aria-label="Selected notification destinations">
      {#each draft.channelSelection as selection, index}
        <div class="monitor-selected-channel"><span class="monitor-selected-channel__icon" aria-hidden="true">{selection.kind === 'existing' ? '↗' : '＋'}</span><span><strong>{selection.kind === 'existing' ? selection.label : selection.displayLabel}</strong><small>{selection.kind === 'existing' ? 'Saved destination' : `New ${selection.type} destination`}</small></span><button type="button" aria-label={`Remove ${selection.kind === 'existing' ? selection.label : selection.displayLabel}`} on:click={() => removeChannelSelection(index)}>×</button></div>
      {/each}
    </div>
  {/if}
  {#if canManageChannels}
    <button class="monitor-inline-configure" type="button" on:click={() => { newChannelOpen = !newChannelOpen; newChannelError = ''; }}>{newChannelOpen ? '− Close channel setup' : '＋ Add a channel'}</button>
    {#if newChannelOpen}
      <div class="monitor-channel-modal-backdrop" role="presentation" on:click={(event) => { if (event.target === event.currentTarget) newChannelOpen = false; }}>
        <section class="monitor-new-channel-panel" role="dialog" aria-modal="true" aria-labelledby="monitor-channel-modal-title">
          <header class="monitor-channel-modal__header"><div><p class="eyebrow">NOTIFICATION DESTINATION</p><h3 id="monitor-channel-modal-title">Add a channel</h3><p>Configure a destination and add it to this monitor draft.</p></div><button class="monitor-modal-close" type="button" aria-label="Close channel setup" on:click={() => { newChannelOpen = false; newChannelError = ''; }}>×</button></header>
          {#if newChannelError}<p class="monitor-form-error" role="alert">{newChannelError}</p>{/if}
          <div class="monitor-form-grid">
            <label class="monitor-form-field"><span>Provider</span><select bind:value={newChannelType}><option value="webhook">Custom webhook</option><option value="email">Email</option><option value="slack">Slack incoming webhook</option><option value="discord">Discord webhook</option></select></label>
            <label class="monitor-form-field"><span>Destination label <b>*</b></span><input bind:value={newChannelLabel} maxlength="80" placeholder="Operations alerts" /></label>
            <label class="monitor-form-field monitor-form-field--wide"><span>{newChannelType === 'email' ? 'Recipient email' : 'HTTPS webhook URL'} <b>*</b></span><input bind:value={newChannelAddress} type={newChannelType === 'email' ? 'email' : 'url'} autocomplete="off" placeholder={newChannelType === 'email' ? 'ops@example.com' : newChannelType === 'slack' ? 'https://hooks.slack.com/services/…' : newChannelType === 'discord' ? 'https://discord.com/api/webhooks/…' : 'https://hooks.example.com/trueexit'} /></label>
            {#if newChannelType !== 'email'}<label class="monitor-form-field monitor-form-field--wide"><span>Custom headers <small>Optional JSON object</small></span><textarea bind:value={newChannelHeaders} rows="2" spellcheck="false" placeholder={'{ "Authorization": "Bearer …" }'}></textarea><small>Stored encrypted. Never sent back to the browser after saving.</small></label>{/if}
          </div>
          <div class="monitor-new-channel-actions"><p>Channel settings are staged in this form and submitted with the monitor.</p><div><button class="monitor-button monitor-button--quiet" type="button" on:click={() => { newChannelOpen = false; newChannelError = ''; }}>Cancel</button><button class="monitor-button monitor-button--primary" type="button" on:click={addNewChannel}>Add to monitor</button></div></div>
        </section>
      </div>
    {/if}
  {:else}
    <p class="monitor-form-hint">You can select saved destinations. Configuring a new destination requires workspace owner or admin access.</p>
  {/if}
</div>
