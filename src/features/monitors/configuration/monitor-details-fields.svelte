<svelte:options runes={true} />
<script lang="ts">
  import type { MonitorEditorDraft } from '@/lib/client/monitor-editor-state';
  import MonitorCadenceConfiguration from '@/features/monitors/configuration/monitor-cadence-configuration.svelte';

  let {
    draft = $bindable(),
    cadenceError = $bindable(''),
    cadencePreview = $bindable('Every 5 minutes'),
  }: {
    draft: MonitorEditorDraft;
    cadenceError?: string;
    cadencePreview?: string;
  } = $props();
</script>

<section class="monitor-create-section" aria-labelledby="monitor-details-heading">
  <div class="monitor-create-section__heading">
    <span>01</span>
    <div>
      <h3 id="monitor-details-heading">Monitor details</h3>
      <p>Make it recognisable to your team.</p>
    </div>
  </div>
  <div class="monitor-form-grid">
    <label class="monitor-form-field monitor-form-field--wide">
      <span>Name <b>*</b></span>
      <input bind:value={draft.name} maxlength="200" required placeholder="e.g. Payments pipeline" autocomplete="off" />
    </label>
    <label class="monitor-form-field monitor-form-field--wide">
      <span>Description <small>Optional</small></span>
      <textarea bind:value={draft.description} maxlength="2000" rows="2" placeholder="What should this check tell you?"></textarea>
    </label>
    <MonitorCadenceConfiguration bind:draft={draft} bind:cadenceError={cadenceError} bind:cadencePreview={cadencePreview} />
  </div>
</section>
