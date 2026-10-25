<svelte:options runes={true} />
<script lang="ts">
  import type { MonitorEditorDraft, ChannelKind } from '@/lib/client/monitor-editor-state';
  import type { MonitorChannel } from '@/lib/client/monitor-queries';
  import { buildNotificationChannelConfig } from '@/lib/client/settings-channel-config';
  import * as Select from '@/components/ui/select/index.js';
  import * as Dialog from '@/components/ui/dialog/index.js';
  import { Button } from '@/components/ui/button/index.js';
  import { Input } from '@/components/ui/input/index.js';
  import { Textarea } from '@/components/ui/textarea/index.js';
  import { Label } from '@/components/ui/label/index.js';
  import { Badge } from '@/components/ui/badge/index.js';
  import { Alert, AlertDescription } from '@/components/ui/alert/index.js';
  import { Plus, X, RadioTower, Trash2 } from '@lucide/svelte';

  let {
    draft = $bindable(),
    channels = [],
    channelsLoading = false,
    channelsError = '',
    canManageChannels = false,
  }: {
    draft: MonitorEditorDraft;
    channels?: MonitorChannel[];
    channelsLoading?: boolean;
    channelsError?: string;
    canManageChannels?: boolean;
  } = $props();

  let selectedExistingChannelId = $state('');
  let newChannelOpen = $state(false);
  let newChannelType = $state<ChannelKind>('webhook');
  let newChannelLabel = $state('');
  let newChannelAddress = $state('');
  let newChannelPriority = $state(0);
  let newChannelError = $state('');
  let newChannelHeaders = $state('');

  const availableChannels = $derived(
    channels.filter((channel) => channel.enabled && !draft.channelSelection.some((item) => item.kind === 'existing' && item.channel_id === channel.id)),
  );

  const effectiveSelectedChannelId = $derived(
    availableChannels.some((channel) => channel.id === selectedExistingChannelId)
      ? selectedExistingChannelId
      : availableChannels[0]?.id ?? '',
  );

  function addExistingChannel() {
    if (!effectiveSelectedChannelId || draft.channelSelection.length >= 25) return;
    const channel = channels.find((item) => item.id === effectiveSelectedChannelId);
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

<section class="space-y-4">
  <div class="flex items-center gap-2">
    <div class="grid size-9 place-items-center rounded-lg bg-muted"><RadioTower class="size-4" /></div>
    <div><h3 class="text-sm font-semibold">Notification destinations</h3><p class="text-xs text-muted-foreground">Optional. Select saved destinations or configure one inline.</p></div>
  </div>

  {#if channelsError}<Alert variant="destructive"><AlertDescription>{channelsError}</AlertDescription></Alert>{/if}
  {#if channelsLoading}
    <p class="text-sm text-muted-foreground">Loading workspace destinations…</p>
  {:else if availableChannels.length > 0}
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div class="min-w-0 flex-1 space-y-1.5">
        <Label for="saved-monitor-destination">Saved destination</Label>
        <Select.Root type="single" value={effectiveSelectedChannelId} onValueChange={(value) => { if (value) selectedExistingChannelId = value; }}>
          <Select.Trigger id="saved-monitor-destination" class="w-full"><Select.Value placeholder="Choose a destination…" /></Select.Trigger>
          <Select.Content>
            {#each availableChannels as channel (channel.id)}
              <Select.Item value={channel.id} label={`${channel.label} · ${channel.type}`}>{channel.label} · {channel.type}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <Button type="button" variant="outline" onclick={addExistingChannel} disabled={!effectiveSelectedChannelId || draft.channelSelection.length >= 25}><Plus class="size-4" /> Add destination</Button>
    </div>
  {:else}
    <p class="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No saved destinations available to select.</p>
  {/if}

  {#if draft.channelSelection.length > 0}
    <div class="space-y-2" aria-label="Selected notification destinations">
      {#each draft.channelSelection as selection, index}
        <div class="flex items-center gap-3 rounded-md border p-3">
          <div class="grid size-8 shrink-0 place-items-center rounded-md bg-muted"><RadioTower class="size-4" /></div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{selection.kind === 'existing' ? selection.label : selection.displayLabel}</p>
            <p class="text-xs text-muted-foreground">{selection.kind === 'existing' ? 'Saved destination' : `New ${selection.type} destination`}</p>
          </div>
          <Badge variant="secondary">{selection.kind === 'existing' ? 'Saved' : 'New'}</Badge>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${selection.kind === 'existing' ? selection.label : selection.displayLabel}`} onclick={() => removeChannelSelection(index)}><Trash2 class="size-4 text-muted-foreground" /></Button>
        </div>
      {/each}
    </div>
  {/if}

  {#if canManageChannels}
    <Button type="button" variant="outline" onclick={() => { newChannelOpen = true; newChannelError = ''; }} disabled={draft.channelSelection.length >= 25}><Plus class="size-4" /> Add a channel</Button>
    <Dialog.Root open={newChannelOpen} onOpenChange={(open) => { newChannelOpen = open; if (!open) newChannelError = ''; }}>
      <Dialog.Content class="max-h-[min(85vh,48rem)] overflow-y-auto sm:max-w-xl">
        <Dialog.Header>
          <Dialog.Title>Add a channel</Dialog.Title>
          <Dialog.Description>Configure a notification destination and stage it in this monitor draft.</Dialog.Description>
        </Dialog.Header>
        {#if newChannelError}<Alert variant="destructive"><AlertDescription>{newChannelError}</AlertDescription></Alert>{/if}
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="new-channel-provider">Provider</Label>
            <Select.Root type="single" value={newChannelType} onValueChange={(value) => { if (value === 'webhook' || value === 'email' || value === 'slack' || value === 'discord') newChannelType = value; }}>
              <Select.Trigger id="new-channel-provider" class="w-full"><Select.Value /></Select.Trigger>
              <Select.Content>
                <Select.Item value="webhook">Custom webhook</Select.Item>
                <Select.Item value="email">Email</Select.Item>
                <Select.Item value="slack">Slack incoming webhook</Select.Item>
                <Select.Item value="discord">Discord webhook</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
          <div class="space-y-1.5">
            <Label for="new-channel-label">Destination label *</Label>
            <Input id="new-channel-label" bind:value={newChannelLabel} maxlength={80} placeholder="Operations alerts" />
          </div>
          <div class="space-y-1.5 sm:col-span-2">
            <Label for="new-channel-address">{newChannelType === 'email' ? 'Recipient email' : 'HTTPS webhook URL'} *</Label>
            <Input id="new-channel-address" bind:value={newChannelAddress} type={newChannelType === 'email' ? 'email' : 'url'} autocomplete="off" placeholder={newChannelType === 'email' ? 'ops@example.com' : newChannelType === 'slack' ? 'https://hooks.slack.com/services/…' : newChannelType === 'discord' ? 'https://discord.com/api/webhooks/…' : 'https://hooks.example.com/trueexit'} />
          </div>
          {#if newChannelType !== 'email'}
            <div class="space-y-1.5 sm:col-span-2">
              <Label for="new-channel-headers">Custom headers <span class="font-normal text-muted-foreground">Optional JSON object</span></Label>
              <Textarea id="new-channel-headers" bind:value={newChannelHeaders} rows={3} spellcheck="false" placeholder={'{ "Authorization": "Bearer …" }'} />
              <p class="text-xs text-muted-foreground">Stored encrypted. Never sent back to the browser after saving.</p>
            </div>
          {/if}
        </div>
        <Dialog.Footer>
          <p class="mr-auto max-w-xs text-xs text-muted-foreground">Channel settings are staged in this form and submitted with the monitor.</p>
          <Button type="button" variant="outline" onclick={() => { newChannelOpen = false; newChannelError = ''; }}>Cancel</Button>
          <Button type="button" onclick={addNewChannel}>Add to monitor</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  {:else}
    <p class="text-xs text-muted-foreground">You can select saved destinations. Configuring a new destination requires workspace owner or admin access.</p>
  {/if}
</section>
