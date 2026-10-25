<svelte:options runes={true} />
<script lang="ts">
  import type { Template } from '../../../lib/client/template-types';

  let {
    template,
    formError,
    saving,
    onClose,
    onConfirm,
  }: {
    template: Template;
    formError: string;
    saving: boolean;
    onClose: () => void;
    onConfirm: () => void;
  } = $props();
</script>

<div class="template-overlay" role="presentation">
  <section class="template-confirm" role="alertdialog" aria-modal="true" aria-labelledby="template-delete-title">
    <p class="template-eyebrow">DELETE TEMPLATE</p>
    <h2 id="template-delete-title">Delete “{template.name}”?</h2>
    <p>Existing monitors will keep their copied field definitions. This cannot be undone.</p>
    {#if formError}
      <div class="template-alert" role="alert">{formError}</div>
    {/if}
    <footer class="template-dialog__footer">
      <button class="template-button" type="button" onclick={onClose} disabled={saving}>Cancel</button>
      <button class="template-button template-button--danger" type="button" onclick={onConfirm} disabled={saving}>
        {saving ? 'Deleting…' : 'Delete template'}
      </button>
    </footer>
  </section>
</div>
