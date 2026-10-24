<svelte:options runes={true} />
<script lang="ts">
  import type { MonitorEditorDraft } from '../lib/client/monitor-editor-state';
  import { formatMonitorCadence } from '../lib/client/monitor-format';
  import { resolveMonitorCadence } from '../lib/client/monitor-editor-validation';
  import * as Select from './ui/select/index.js';
  import * as Tabs from './ui/tabs/index.js';
  import { Input } from './ui/input/index.js';
  import { Label } from './ui/label/index.js';
  import { Alert, AlertDescription } from './ui/alert/index.js';
  import { Clock3 } from '@lucide/svelte';

  let {
    draft = $bindable(),
    cadenceError = $bindable(''),
    cadencePreview = $bindable('Every 5 minutes'),
  }: {
    draft: MonitorEditorDraft;
    cadenceError?: string;
    cadencePreview?: string;
  } = $props();

  function updateDraft<K extends keyof MonitorEditorDraft>(key: K, value: MonitorEditorDraft[K]) {
    draft = { ...draft, [key]: value };
  }

  function resolveCadence() {
    const cadence = resolveMonitorCadence(draft);
    cadenceError = cadence.ok ? '' : cadence.error;
    if (cadence.ok) cadencePreview = cadence.preview;
  }

  function isCadenceUnit(value: string): value is MonitorEditorDraft['cadenceUnit'] {
    return value === 'seconds' || value === 'minutes' || value === 'hours';
  }

  function updateCadenceUnit(value: string) {
    if (!isCadenceUnit(value)) return;
    updateDraft('cadenceUnit', value);
    resolveCadence();
  }

  export function setCadenceSeconds(seconds: number) {
    if (seconds % 3600 === 0) {
      draft = { ...draft, cadenceValue: String(seconds / 3600), cadenceUnit: 'hours' };
    } else if (seconds % 60 === 0) {
      draft = { ...draft, cadenceValue: String(seconds / 60), cadenceUnit: 'minutes' };
    } else {
      draft = { ...draft, cadenceValue: String(seconds), cadenceUnit: 'seconds' };
    }
    draft = { ...draft, cadenceMode: 'interval' };
    cadencePreview = `Every ${formatMonitorCadence(seconds)}`;
    cadenceError = '';
  }
</script>

<section class="space-y-4">
  <div class="flex items-center gap-2">
    <div class="grid size-9 place-items-center rounded-lg bg-muted"><Clock3 class="size-4" /></div>
    <div><Label class="text-sm font-semibold">Check cadence</Label><p class="text-xs text-muted-foreground">Choose a fixed interval or provide a cron expression.</p></div>
  </div>

  <Tabs.Root value={draft.cadenceMode} onValueChange={(value) => { if (value === 'interval' || value === 'cron') { updateDraft('cadenceMode', value); cadenceError = ''; } }}>
    <Tabs.List>
      <Tabs.Trigger value="interval">Interval</Tabs.Trigger>
      <Tabs.Trigger value="cron">Cron expression</Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="interval" class="pt-4">
      <div class="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <div class="space-y-1.5">
          <Label for="monitor-cadence-value">Interval amount</Label>
          <Input id="monitor-cadence-value" type="number" min="1" step="1" value={draft.cadenceValue} oninput={(event) => { updateDraft('cadenceValue', event.currentTarget.value); resolveCadence(); }} />
        </div>
        <div class="space-y-1.5">
          <Label for="monitor-cadence-unit">Interval unit</Label>
          <Select.Root type="single" value={draft.cadenceUnit} onValueChange={updateCadenceUnit}>
            <Select.Trigger id="monitor-cadence-unit" class="w-full"><Select.Value /></Select.Trigger>
            <Select.Content>
              <Select.Item value="seconds">Seconds</Select.Item>
              <Select.Item value="minutes">Minutes</Select.Item>
              <Select.Item value="hours">Hours</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      <p class="mt-2 text-xs text-muted-foreground">Minimum interval: 15 seconds.</p>
    </Tabs.Content>
    <Tabs.Content value="cron" class="space-y-2 pt-4">
      <div class="space-y-1.5">
        <Label for="monitor-cron-expression">Cron expression</Label>
        <Input id="monitor-cron-expression" value={draft.cronExpression} oninput={(event) => { updateDraft('cronExpression', event.currentTarget.value); resolveCadence(); }} placeholder="*/30 * * * * *" spellcheck="false" />
      </div>
      <p class="text-xs text-muted-foreground">Fixed intervals only. Seconds syntax: <code>*/30 * * * * *</code>; minutes syntax: <code>*/5 * * * *</code>.</p>
    </Tabs.Content>
  </Tabs.Root>

  {#if cadenceError}
    <Alert variant="destructive"><AlertDescription>{cadenceError}</AlertDescription></Alert>
  {:else}
    <div class="rounded-md border bg-muted/30 p-3 text-sm">
      <span class="text-muted-foreground">Resolved schedule</span>
      <p class="mt-1 font-medium">{draft.cadenceMode === 'interval' ? `Every ${draft.cadenceValue || '…'} ${draft.cadenceUnit}` : cadencePreview}</p>
    </div>
  {/if}
</section>
