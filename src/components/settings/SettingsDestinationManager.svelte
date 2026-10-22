<script lang="ts">
  import './SettingsDestinationManager.css';
  import { getCachedSettingsResponse, getSettingsErrorCode, listSettingsData, requestSettingsApi, settingsErrorMessage } from '../../lib/client/settings-api';
  import { buildNotificationChannelConfig, type NotificationChannelKind } from '../../lib/client/settings-channel-config';

  export let workspaceId = '';
  export let canManageWorkspace = false;

  type ChannelKind = NotificationChannelKind;
  type Channel = {
    id: string;
    label: string;
    type: ChannelKind;
    priority: number;
    enabled: boolean;
    configured: boolean;
    total_attempts?: number;
    successful_attempts?: number;
  };
  type CreateForm = { label: string; type: ChannelKind; priority: number; enabled: boolean; address: string; headers: string };
  type EditForm = { id: string; label: string; priority: number; enabled: boolean; type: ChannelKind; address: string; headers: string; configTouched: boolean };

  let channels: Channel[] = [];
  let loading = false;
  let busyKey = '';
  let error = '';
  let notice = '';
  let showCreateForm = false;
  let generation = 0;
  let createForm: CreateForm = { label: '', type: 'webhook', priority: 0, enabled: true, address: '', headers: '' };
  let editForm: EditForm = { id: '', label: '', priority: 0, enabled: true, type: 'webhook', address: '', headers: '', configTouched: false };
  let activeWorkspaceId = '';

  $: if (workspaceId !== activeWorkspaceId) {
    activeWorkspaceId = workspaceId;
    void loadChannels(workspaceId);
  }

  async function request(path: string, init: RequestInit = {}) {
    return requestSettingsApi(path, init);
  }

  async function perform<T = unknown>(key: string, path: string, init: RequestInit = {}): Promise<T | null> {
    busyKey = key;
    error = '';
    notice = '';
    try {
      const { response, body } = await request(path, init);
      if (!response.ok) {
        error = settingsErrorMessage(response.status, getSettingsErrorCode(body));
        return null;
      }
      return body as T;
    } catch {
      error = settingsErrorMessage(0, 'network_error');
      return null;
    } finally {
      busyKey = '';
    }
  }

  async function loadChannels(id: string) {
    const requestGeneration = ++generation;
    error = '';
    notice = '';
    if (!id) { channels = []; loading = false; return; }
    const path = `/workspaces/${encodeURIComponent(id)}/channels`;
    const cached = getCachedSettingsResponse(path);
    channels = cached?.response.ok ? listSettingsData<Channel>(cached.body) : [];
    loading = !cached;
    try {
      const { response, body } = await request(path);
      if (requestGeneration !== generation || id !== workspaceId) return;
      if (response.ok) channels = listSettingsData<Channel>(body);
      else if (response.status !== 403 && response.status !== 404) error = settingsErrorMessage(response.status, getSettingsErrorCode(body));
    } catch {
      if (requestGeneration === generation) error = settingsErrorMessage(0, 'network_error');
    } finally {
      if (requestGeneration === generation) loading = false;
    }
  }

  function channelConfig(type: ChannelKind, address: string, headersText: string): Record<string, unknown> | null {
    const result = buildNotificationChannelConfig(type, address, headersText);
    if (!result.ok) { error = result.error; return null; }
    return result.config;
  }

  async function validateChannel(id: string, type: ChannelKind, config: Record<string, unknown>): Promise<boolean> {
    if (!id || id !== workspaceId) return false;
    const result = await perform<{ valid?: boolean; duplicate?: boolean; existing_channel?: { id: string; label: string } | null }>(
      'validate-channel', `/workspaces/${encodeURIComponent(id)}/channels/validate`,
      { method: 'POST', body: JSON.stringify({ type, config }) },
    );
    if (!result) return false;
    if (result.duplicate && result.existing_channel) {
      error = `This configuration matches “${result.existing_channel.label}”. Choose the existing destination instead.`;
      return false;
    }
    if (result.valid === false) { error = 'The destination configuration was not valid.'; return false; }
    return true;
  }

  async function createChannel(event: SubmitEvent) {
    event.preventDefault();
    if (!workspaceId || !canManageWorkspace) return;
    const id = workspaceId;
    const label = createForm.label.trim();
    if (!label || label.length > 80) { error = 'Enter a destination label between 1 and 80 characters.'; return; }
    if (!Number.isInteger(createForm.priority) || createForm.priority < 0 || createForm.priority > 1000) { error = 'Priority must be a whole number between 0 and 1000.'; return; }
    error = '';
    const config = channelConfig(createForm.type, createForm.address, createForm.headers);
    if (!config || !(await validateChannel(id, createForm.type, config)) || id !== workspaceId) return;
    const result = await perform<Channel>('create-channel', `/workspaces/${encodeURIComponent(id)}/channels`, {
      method: 'POST', body: JSON.stringify({ type: createForm.type, label, priority: createForm.priority, enabled: createForm.enabled, config }),
    });
    if (result && id === workspaceId) {
      channels = [...channels, result];
      createForm = { label: '', type: 'webhook', priority: 0, enabled: true, address: '', headers: '' };
      showCreateForm = false;
      notice = 'Destination saved. Secret values are not returned to the browser after saving.';
    }
  }

  function beginEditChannel(channel: Channel) {
    editForm = { id: channel.id, label: channel.label, priority: channel.priority ?? 0, enabled: channel.enabled, type: channel.type, address: '', headers: '', configTouched: false };
    error = '';
  }

  async function saveChannelEdit(event: SubmitEvent) {
    event.preventDefault();
    if (!workspaceId || !canManageWorkspace || !editForm.id) return;
    const id = workspaceId;
    const channelId = editForm.id;
    const label = editForm.label.trim();
    if (!label || label.length > 80) { error = 'Enter a destination label between 1 and 80 characters.'; return; }
    if (!Number.isInteger(editForm.priority) || editForm.priority < 0 || editForm.priority > 1000) { error = 'Priority must be a whole number between 0 and 1000.'; return; }
    const payload: Record<string, unknown> = { label, priority: editForm.priority, enabled: editForm.enabled };
    if (editForm.configTouched) {
      const config = channelConfig(editForm.type, editForm.address, editForm.headers);
      if (!config || !(await validateChannel(id, editForm.type, config)) || id !== workspaceId) return;
      payload.config = config;
    }
    const result = await perform<Channel>('edit-channel', `/workspaces/${encodeURIComponent(id)}/channels/${encodeURIComponent(channelId)}`, {
      method: 'PATCH', body: JSON.stringify(payload),
    });
    if (result && id === workspaceId) {
      channels = channels.map((item) => item.id === result.id ? result : item);
      editForm = { ...editForm, id: '', address: '', headers: '' };
      notice = 'Destination updated.';
    }
  }

  async function deleteChannel(channel: Channel) {
    if (!workspaceId || !canManageWorkspace) return;
    const id = workspaceId;
    if (!confirm(`Delete destination “${channel.label}”? It must first be unassigned from all monitors.`)) return;
    const result = await perform('delete-channel', `/workspaces/${encodeURIComponent(id)}/channels/${encodeURIComponent(channel.id)}`, { method: 'DELETE' });
    if (id === workspaceId && (result !== null || !error)) {
      channels = channels.filter((item) => item.id !== channel.id);
      notice = `Destination “${channel.label}” deleted.`;
    }
  }
</script>

<section class="settings-card" aria-labelledby="settings-destinations-title">
  <div class="settings-card__heading"><div><p class="settings-kicker">NOTIFICATION ROUTES</p><h2 id="settings-destinations-title">Choose where signals land.</h2><p>Secrets are never returned after saving. Destination setup is separate from provider delivery activation.</p></div><span class="settings-card__symbol">↗</span></div>
  {#if error}<div class="settings-alert settings-alert--error" role="alert"><strong>Couldn’t complete that.</strong><span>{error}</span>{#if error.includes('verify your identity')}<a href="/login">Sign in again ↗</a>{/if}</div>{/if}
  {#if notice}<div class="settings-alert settings-alert--success" role="status">{notice}</div>{/if}
  {#if loading}<p class="settings-empty" aria-live="polite">Loading notification destinations…</p>{/if}
  <div class="settings-destination-summary"><span><strong>{channels.length}</strong> saved destinations</span><span><strong>{channels.filter((item) => item.enabled).length}</strong> enabled</span><span>Maximum 25 per workspace</span></div>
  {#if channels.length}
    <div class="settings-destination-list">{#each channels as channel (channel.id)}
      <article class="settings-destination"><div class="settings-destination__mark">{channel.type === 'email' ? '@' : channel.type === 'slack' ? 'S' : channel.type === 'discord' ? 'D' : '↗'}</div>
        <div class="settings-destination__body"><div class="settings-destination__title"><strong>{channel.label}</strong><span class:settings-pill--off={!channel.enabled} class="settings-pill">{channel.enabled ? 'Enabled' : 'Disabled'}</span></div><p>{channel.type.toUpperCase()} · Priority {channel.priority ?? 0} · {channel.configured ? 'Configured' : 'Needs configuration'}</p></div>
        {#if canManageWorkspace}<div class="settings-destination__actions"><button class="settings-text-button" type="button" on:click={() => beginEditChannel(channel)} disabled={!!busyKey}>Edit</button><button class="settings-text-button settings-text-button--danger" type="button" on:click={() => deleteChannel(channel)} disabled={!!busyKey}>Delete</button></div>{/if}
      </article>
    {/each}</div>
  {:else if !loading}<p class="settings-empty">No notification destinations saved yet.</p>{/if}
  {#if canManageWorkspace}
    <button class="settings-button settings-button--primary" type="button" on:click={() => { showCreateForm = !showCreateForm; editForm.id = ''; error = ''; }} disabled={channels.length >= 25 || !!busyKey}>{showCreateForm ? '− Close form' : '＋ Add destination'}</button>
    {#if showCreateForm}
      <form class="settings-channel-form" on:submit={createChannel}><div class="settings-form-grid">
        <label class="settings-field"><span>Provider</span><select bind:value={createForm.type}><option value="webhook">Custom webhook</option><option value="email">Email</option><option value="slack">Slack incoming webhook</option><option value="discord">Discord webhook</option></select></label>
        <label class="settings-field"><span>Destination label</span><input bind:value={createForm.label} required maxlength="80" placeholder="Operations alerts" /></label>
        <label class="settings-field settings-field--wide"><span>{createForm.type === 'email' ? 'Recipient email' : 'HTTPS webhook URL'}</span><input bind:value={createForm.address} required type={createForm.type === 'email' ? 'email' : 'url'} autocomplete="off" placeholder={createForm.type === 'email' ? 'ops@example.com' : 'https://hooks.example.com/…'} /></label>
        {#if createForm.type !== 'email'}<label class="settings-field settings-field--wide"><span>Custom headers <small>Optional JSON object</small></span><textarea bind:value={createForm.headers} rows="3" spellcheck="false" placeholder={'{ "Authorization": "Bearer secret" }'}></textarea><small>Encrypted by the API and never returned after saving.</small></label>{/if}
        <label class="settings-field"><span>Priority <small>Lower runs first</small></span><input bind:value={createForm.priority} type="number" min="0" max="1000" step="1" required /></label><label class="settings-check"><input bind:checked={createForm.enabled} type="checkbox" /><span>Destination enabled</span></label>
      </div><div class="settings-form__footer"><span>Validation previews duplicates without contacting the destination.</span><button class="settings-button settings-button--primary" type="submit" disabled={!!busyKey}>{busyKey === 'create-channel' || busyKey === 'validate-channel' ? 'Validating…' : 'Validate & save'}</button></div></form>
    {/if}
  {:else}<p class="settings-note">You can view destinations, but only workspace owners and admins can change them.</p>{/if}
  {#if editForm.id}
    <form class="settings-channel-form settings-channel-form--edit" on:submit={saveChannelEdit}><div class="settings-card__heading"><div><p class="settings-kicker">EDIT DESTINATION</p><h2>{editForm.label || 'Destination settings'}</h2><p>Leave the secret fields blank to preserve the existing encrypted configuration.</p></div></div>
      <div class="settings-form-grid"><label class="settings-field"><span>Label</span><input bind:value={editForm.label} required maxlength="80" /></label><label class="settings-field"><span>Priority</span><input bind:value={editForm.priority} type="number" min="0" max="1000" step="1" required /></label>
        <label class="settings-field settings-field--wide"><span>{editForm.type === 'email' ? 'New recipient email (optional)' : 'New HTTPS webhook URL (optional)'}</span><input bind:value={editForm.address} type={editForm.type === 'email' ? 'email' : 'url'} autocomplete="off" placeholder="Leave blank to preserve current secret" on:input={() => editForm.configTouched = true} /></label>
        {#if editForm.type !== 'email'}<label class="settings-field settings-field--wide"><span>Replace custom headers (optional JSON)</span><textarea bind:value={editForm.headers} rows="2" spellcheck="false" placeholder="Only used if replacing the destination config" on:input={() => editForm.configTouched = true}></textarea></label>{/if}
        <label class="settings-check"><input bind:checked={editForm.enabled} type="checkbox" /><span>Destination enabled</span></label></div>
      <div class="settings-form__footer"><span>Secret configuration is never prefilled.</span><div><button class="settings-button settings-button--quiet" type="button" on:click={() => editForm.id = ''}>Cancel</button><button class="settings-button settings-button--primary" type="submit" disabled={!!busyKey}>{busyKey === 'edit-channel' ? 'Saving…' : 'Save changes'}</button></div></div>
    </form>
  {/if}
</section>
