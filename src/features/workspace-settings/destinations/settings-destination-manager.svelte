<svelte:options runes={true} />
<script lang="ts">
  import * as v from 'valibot';
  import { ApiClientError } from '../../../lib/client/api-client';

  import { getCachedSettingsResponse, getSettingsErrorCode, listSettingsData, requestSettingsApi, settingsErrorMessage } from '../../../lib/client/settings-api';
  import { settingsAcknowledgementSchema, settingsChannelSchema, settingsChannelValidationSchema } from '../../../lib/client/api-schemas';
  import type { SettingsChannelContract } from '../../../lib/client/api-schemas';
  import { parseApiBody } from '../../../lib/client/api-schemas';
  import { buildNotificationChannelConfig, type NotificationChannelKind } from '../../../lib/client/settings-channel-config';
  import * as Select from '../../../components/ui/select/index.js';
  import { Button } from '../../../components/ui/button/index.js';
  import { Input } from '../../../components/ui/input/index.js';
  import { Textarea } from '../../../components/ui/textarea/index.js';
  import { Label } from '../../../components/ui/label/index.js';
  import { Checkbox } from '../../../components/ui/checkbox/index.js';
  import { Badge } from '../../../components/ui/badge/index.js';
  import * as Alert from '../../../components/ui/alert/index.js';
  import { Plus, X, Pencil, Trash2, Webhook, Mail, MessageSquare, CheckCircle2, Settings2 } from '@lucide/svelte';

  let { workspaceId = '', canManageWorkspace = false }: { workspaceId?: string; canManageWorkspace?: boolean } = $props();

  type ChannelKind = NotificationChannelKind;
  type Channel = SettingsChannelContract;
  type CreateForm = { label: string; type: ChannelKind; priority: number; enabled: boolean; address: string; headers: string };
  type EditForm = { id: string; label: string; priority: number; enabled: boolean; type: ChannelKind; address: string; headers: string; configTouched: boolean };

  let channels = $state<Channel[]>([]);
  let loading = $state(false);
  let busyKey = $state('');
  let error = $state('');
  let notice = $state('');
  let showCreateForm = $state(false);
  let generation = 0;
  let createForm = $state<CreateForm>({ label: '', type: 'webhook', priority: 0, enabled: true, address: '', headers: '' });
  let editForm = $state<EditForm>({ id: '', label: '', priority: 0, enabled: true, type: 'webhook', address: '', headers: '', configTouched: false });


  $effect(() => {
    void loadChannels(workspaceId);
  });

  async function request(path: string, init: RequestInit = {}) {
    return requestSettingsApi(path, init);
  }

  async function perform<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    key: string, path: string, schema: TSchema, init: RequestInit = {},
  ): Promise<v.InferOutput<TSchema> | null> {
    busyKey = key;
    error = '';
    notice = '';
    try {
      const { response, body } = await request(path, init);
      if (!response.ok) {
        error = settingsErrorMessage(response.status, getSettingsErrorCode(body));
        return null;
      }
      return parseApiBody(schema, body, { status: response.status });
    } catch (caught) {
      error = caught instanceof ApiClientError
        ? settingsErrorMessage(caught.status, caught.code)
        : settingsErrorMessage(0, 'network_error');
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
    channels = [];
    if (cached?.response.ok) {
      try { channels = listSettingsData(settingsChannelSchema, cached.body); }
      catch { channels = []; } // Cached data is untrusted until validated.
    }
    loading = !cached;
    try {
      const { response, body } = await request(path);
      if (requestGeneration !== generation || id !== workspaceId) return;
      if (response.ok) channels = listSettingsData(settingsChannelSchema, body);
      else if (response.status !== 403 && response.status !== 404) error = settingsErrorMessage(response.status, getSettingsErrorCode(body));
    } catch (caught) {
      if (requestGeneration === generation) error = caught instanceof ApiClientError
        ? settingsErrorMessage(caught.status, caught.code)
        : settingsErrorMessage(0, 'network_error');
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
    const result = await perform(
      'validate-channel', `/workspaces/${encodeURIComponent(id)}/channels/validate`, settingsChannelValidationSchema,
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
    const result = await perform('create-channel', `/workspaces/${encodeURIComponent(id)}/channels`, settingsChannelSchema, {
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
    const result = await perform('edit-channel', `/workspaces/${encodeURIComponent(id)}/channels/${encodeURIComponent(channelId)}`, settingsChannelSchema, {
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
    const result = await perform('delete-channel', `/workspaces/${encodeURIComponent(id)}/channels/${encodeURIComponent(channel.id)}`, settingsAcknowledgementSchema, { method: 'DELETE' });
    if (id === workspaceId && (result !== null || !error)) {
      channels = channels.filter((item) => item.id !== channel.id);
      notice = `Destination “${channel.label}” deleted.`;
    }
  }
</script>

<section class="space-y-5 rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="settings-destinations-title">
  <header class="flex items-start gap-3">
    <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"><Webhook class="size-5 text-muted-foreground" /></div>
    <div class="min-w-0 flex-1 space-y-1">
      <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Notification routes</p>
      <h2 id="settings-destinations-title" class="text-lg font-semibold tracking-tight">Notification destinations</h2>
      <p class="text-sm text-muted-foreground">Secrets are never returned after saving. Destination setup is separate from provider delivery activation.</p>
    </div>
  </header>

  {#if error}
    <Alert.Root variant="destructive" role="alert">
      <Alert.Title>Couldn’t complete that.</Alert.Title>
      <Alert.Description>{error}{#if error.includes('verify your identity')} <a class="underline underline-offset-4" href="/login">Sign in again</a>{/if}</Alert.Description>
    </Alert.Root>
  {/if}
  {#if notice}
    <Alert.Root role="status">
      <Alert.Title>Update complete</Alert.Title>
      <Alert.Description>{notice}</Alert.Description>
    </Alert.Root>
  {/if}
  {#if loading}
    <p class="py-2 text-sm text-muted-foreground" aria-live="polite">Loading notification destinations…</p>
  {/if}

  <div class="grid gap-3 sm:grid-cols-3">
    <div class="rounded-lg border p-3"><p class="text-xs text-muted-foreground">Saved destinations</p><p class="mt-1 text-2xl font-semibold">{channels.length}</p></div>
    <div class="rounded-lg border p-3"><p class="text-xs text-muted-foreground">Enabled</p><p class="mt-1 text-2xl font-semibold">{channels.filter((item) => item.enabled).length}</p></div>
    <div class="rounded-lg border p-3"><p class="text-xs text-muted-foreground">Workspace limit</p><p class="mt-1 text-2xl font-semibold">25</p></div>
  </div>

  {#if channels.length}
    <div class="divide-y rounded-lg border">
      {#each channels as channel (channel.id)}
        <article class="flex flex-wrap items-start gap-3 p-4">
          <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            {#if channel.type === 'email'}<Mail class="size-5" />
            {:else if channel.type === 'slack'}<MessageSquare class="size-5" />
            {:else if channel.type === 'discord'}<MessageSquare class="size-5" />
            {:else}<Webhook class="size-5" />{/if}
          </div>
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-medium">{channel.label}</h3>
              <Badge variant={channel.enabled ? 'default' : 'secondary'}>{channel.enabled ? 'Enabled' : 'Disabled'}</Badge>
              {#if !channel.configured}<Badge variant="outline">Needs configuration</Badge>{/if}
            </div>
            <p class="text-xs text-muted-foreground">{channel.type.toUpperCase()} · Priority {channel.priority ?? 0} · {channel.configured ? 'Configured' : 'Not configured'}</p>
          </div>
          {#if canManageWorkspace}
            <div class="flex shrink-0 gap-1">
              <Button variant="outline" size="sm" onclick={() => beginEditChannel(channel)} disabled={!!busyKey}><Pencil class="mr-1 size-3.5" />Edit</Button>
              <Button variant="destructive" size="sm" onclick={() => deleteChannel(channel)} disabled={!!busyKey}><Trash2 class="mr-1 size-3.5" />Delete</Button>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {:else if !loading}
    <div class="rounded-lg border border-dashed p-8 text-center">
      <div class="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-muted"><Webhook class="size-5 text-muted-foreground" /></div>
      <p class="font-medium">No notification destinations yet</p>
      <p class="mt-1 text-sm text-muted-foreground">Add a destination to configure where TrueExit can route signals.</p>
    </div>
  {/if}

  {#if canManageWorkspace}
    <div>
      <Button onclick={() => { showCreateForm = !showCreateForm; editForm.id = ''; error = ''; }} disabled={channels.length >= 25 || !!busyKey}>
        {#if showCreateForm}<X class="mr-1 size-4" />Close form{:else}<Plus class="mr-1 size-4" />Add destination{/if}
      </Button>
    </div>
    {#if showCreateForm}
      <form class="space-y-5 rounded-lg border bg-muted/20 p-4 sm:p-5" onsubmit={createChannel}>
        <div class="flex items-center gap-2"><Settings2 class="size-4 text-muted-foreground" /><h3 class="font-semibold">New destination</h3></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="grid gap-2">
            <Label for="destination-provider">Provider</Label>
            <Select.Root type="single" value={createForm.type} onValueChange={(value) => { if (value === 'webhook' || value === 'email' || value === 'slack' || value === 'discord') createForm.type = value; }}>
              <Select.Trigger id="destination-provider"><Select.Value /></Select.Trigger>
              <Select.Content>
                <Select.Item value="webhook" label="Custom webhook">Custom webhook</Select.Item>
                <Select.Item value="email" label="Email">Email</Select.Item>
                <Select.Item value="slack" label="Slack incoming webhook">Slack incoming webhook</Select.Item>
                <Select.Item value="discord" label="Discord webhook">Discord webhook</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
          <div class="grid gap-2">
            <Label for="destination-label">Destination label</Label>
            <Input id="destination-label" bind:value={createForm.label} required maxlength={80} placeholder="Operations alerts" />
          </div>
          <div class="grid gap-2 sm:col-span-2">
            <Label for="destination-address">{createForm.type === 'email' ? 'Recipient email' : 'HTTPS webhook URL'}</Label>
            <Input id="destination-address" bind:value={createForm.address} required type={createForm.type === 'email' ? 'email' : 'url'} autocomplete="off" placeholder={createForm.type === 'email' ? 'ops@example.com' : 'https://hooks.example.com/…'} />
          </div>
          {#if createForm.type !== 'email'}
            <div class="grid gap-2 sm:col-span-2">
              <Label for="destination-headers">Custom headers <span class="font-normal text-muted-foreground">Optional JSON object</span></Label>
              <Textarea id="destination-headers" bind:value={createForm.headers} rows={3} spellcheck={false} placeholder={'{ "Authorization": "Bearer secret" }'} />
              <p class="text-xs text-muted-foreground">Encrypted by the API and never returned after saving.</p>
            </div>
          {/if}
          <div class="grid gap-2">
            <Label for="destination-priority">Priority <span class="font-normal text-muted-foreground">Lower runs first</span></Label>
            <Input id="destination-priority" bind:value={createForm.priority} type="number" min={0} max={1000} step={1} required />
          </div>
          <label class="flex min-h-9 items-center gap-2 text-sm">
            <Checkbox bind:checked={createForm.enabled} />
            Destination enabled
          </label>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p class="text-xs text-muted-foreground">Validation previews duplicates without contacting the destination.</p>
          <Button type="submit" disabled={!!busyKey}>
            <CheckCircle2 class="mr-1 size-4" />
            {busyKey === 'create-channel' || busyKey === 'validate-channel' ? 'Validating…' : 'Validate & save'}
          </Button>
        </div>
      </form>
    {/if}
  {:else}
    <p class="text-sm text-muted-foreground">You can view destinations, but only workspace owners and admins can change them.</p>
  {/if}

  {#if editForm.id}
    <form class="space-y-5 rounded-lg border p-4 sm:p-5" onsubmit={saveChannelEdit}>
      <header class="space-y-1">
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Edit destination</p>
        <h3 class="text-lg font-semibold">{editForm.label || 'Destination settings'}</h3>
        <p class="text-sm text-muted-foreground">Leave secret fields blank to preserve the existing encrypted configuration.</p>
      </header>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-2">
          <Label for="edit-destination-label">Label</Label>
          <Input id="edit-destination-label" bind:value={editForm.label} required maxlength={80} />
        </div>
        <div class="grid gap-2">
          <Label for="edit-destination-priority">Priority</Label>
          <Input id="edit-destination-priority" bind:value={editForm.priority} type="number" min={0} max={1000} step={1} required />
        </div>
        <div class="grid gap-2 sm:col-span-2">
          <Label for="edit-destination-address">{editForm.type === 'email' ? 'New recipient email (optional)' : 'New HTTPS webhook URL (optional)'}</Label>
          <Input id="edit-destination-address" bind:value={editForm.address} type={editForm.type === 'email' ? 'email' : 'url'} autocomplete="off" placeholder="Leave blank to preserve current secret" oninput={() => editForm.configTouched = true} />
        </div>
        {#if editForm.type !== 'email'}
          <div class="grid gap-2 sm:col-span-2">
            <Label for="edit-destination-headers">Replace custom headers <span class="font-normal text-muted-foreground">(optional JSON)</span></Label>
            <Textarea id="edit-destination-headers" bind:value={editForm.headers} rows={2} spellcheck={false} placeholder="Only used if replacing the destination config" oninput={() => editForm.configTouched = true} />
          </div>
        {/if}
        <label class="flex min-h-9 items-center gap-2 text-sm">
          <Checkbox bind:checked={editForm.enabled} />
          Destination enabled
        </label>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p class="text-xs text-muted-foreground">Secret configuration is never prefilled.</p>
        <div class="flex gap-2">
          <Button variant="outline" type="button" onclick={() => editForm.id = ''}>Cancel</Button>
          <Button type="submit" disabled={!!busyKey}>{busyKey === 'edit-channel' ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>
    </form>
  {/if}
</section>
