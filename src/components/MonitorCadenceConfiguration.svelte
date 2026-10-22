<script lang="ts">
  import type { MonitorEditorDraft } from '../lib/client/monitor-editor-state';
  import { formatMonitorCadence } from '../lib/client/monitor-format';
  import { resolveMonitorCadence } from '../lib/client/monitor-editor-validation';

  export let draft: MonitorEditorDraft;
  export let cadenceError = '';
  export let cadencePreview = 'Every 5 minutes';

  function updateDraft<K extends keyof MonitorEditorDraft>(key: K, value: MonitorEditorDraft[K]) {
    draft = { ...draft, [key]: value };
  }

  function resolveCadence() {
    const cadence = resolveMonitorCadence(draft);
    cadenceError = cadence.ok ? '' : cadence.error;
    if (cadence.ok) cadencePreview = cadence.preview;
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

<div class="monitor-cadence-control">
  <span class="monitor-cadence-label">Check cadence</span>
  <div class="monitor-field-modes monitor-field-modes--compact" role="tablist" aria-label="Cadence input mode">
    <button type="button" role="tab" aria-selected={draft.cadenceMode === 'interval'} class:active={draft.cadenceMode === 'interval'} on:click={() => { updateDraft('cadenceMode', 'interval'); cadenceError = ''; }}>Interval</button>
    <button type="button" role="tab" aria-selected={draft.cadenceMode === 'cron'} class:active={draft.cadenceMode === 'cron'} on:click={() => { updateDraft('cadenceMode', 'cron'); cadenceError = ''; }}>Cron</button>
  </div>
  {#if draft.cadenceMode === 'interval'}
    <div class="monitor-cadence-input">
      <label class="monitor-form-field"><span class="sr-only">Interval amount</span><input type="number" min="1" step="1" value={draft.cadenceValue} on:input={(event) => { updateDraft('cadenceValue', event.currentTarget.value); resolveCadence(); }} /></label>
      <label class="monitor-form-field"><span class="sr-only">Interval unit</span><select value={draft.cadenceUnit} on:change={(event) => { updateDraft('cadenceUnit', event.currentTarget.value as MonitorEditorDraft['cadenceUnit']); resolveCadence(); }}><option value="seconds">Seconds</option><option value="minutes">Minutes</option><option value="hours">Hours</option></select></label>
    </div>
    <small class="monitor-form-hint">Minimum interval: 15 seconds.</small>
  {:else}
    <label class="monitor-form-field"><span>Cron expression</span><input value={draft.cronExpression} on:input={(event) => { updateDraft('cronExpression', event.currentTarget.value); resolveCadence(); }} placeholder="*/30 * * * * *" spellcheck="false" /><small>Fixed intervals only. Seconds syntax: <code>*/30 * * * * *</code>; minutes syntax: <code>*/5 * * * *</code>.</small></label>
  {/if}
  {#if cadenceError}<p class="monitor-form-error" role="alert">{cadenceError}</p>{:else}<p class="monitor-cadence-preview">Resolved schedule <strong>{draft.cadenceMode === 'interval' ? `Every ${draft.cadenceValue || '…'} ${draft.cadenceUnit}` : cadencePreview}</strong></p>{/if}
</div>
