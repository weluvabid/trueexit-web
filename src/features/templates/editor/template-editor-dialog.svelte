<svelte:options runes={true} />
<script lang="ts">
  import type { FieldDefinition, Primitive } from '../../../lib/client/template-types';
  import TemplateManualFieldEditor from '../fields/template-manual-field-editor.svelte';
  import TemplateJsonFieldDiscovery from '../fields/template-json-field-discovery.svelte';

  type Mode = 'create' | 'edit';
  type DiscoveredField = FieldDefinition & { source_type?: string };
  type PrimitiveOption = { value: Primitive; label: string };

  let {
    mode,
    name = $bindable(),
    description = $bindable(),
    fields = $bindable(),
    samplePayload = $bindable(),
    formTab = $bindable(),
    formError,
    saving,
    discovering,
    workspaceId,
    discovered,
    selectedDiscovered,
    discoveryError,
    discoveryWarnings,
    primitiveOptions,
    primitiveNames,
    onClose,
    onSubmit,
    onDiscover,
    onAddField,
    onRemoveField,
    onUpdateField,
    onAddSelected,
    onToggleDiscovered,
  }: {
    mode: Mode;
    name: string;
    description: string;
    fields: FieldDefinition[];
    samplePayload: string;
    formTab: 'json' | 'fields';
    formError: string;
    saving: boolean;
    discovering: boolean;
    workspaceId: string;
    discovered: DiscoveredField[];
    selectedDiscovered: string[];
    discoveryError: string;
    discoveryWarnings: string[];
    primitiveOptions: PrimitiveOption[];
    primitiveNames: Record<Primitive, string>;
    onClose: () => void;
    onSubmit: (event: SubmitEvent) => void | Promise<void>;
    onDiscover: () => void;
    onAddField: () => void;
    onRemoveField: (index: number) => void;
    onUpdateField: (index: number, key: keyof FieldDefinition, value: string | number) => void;
    onAddSelected: () => void;
    onToggleDiscovered: (field: DiscoveredField, checked: boolean) => void;
  } = $props();
</script>

<div class="template-overlay" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
  <section class="template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-form-title">
    <header class="template-dialog__header"><div><p class="template-eyebrow">{mode === 'create' ? 'NEW STARTING POINT' : 'CUSTOM TEMPLATE'}</p><h2 id="template-form-title">{mode === 'create' ? 'Create template' : 'Edit template'}</h2></div><button class="template-icon-button" type="button" aria-label="Close" onclick={onClose} disabled={saving}>×</button></header>
    {#if formError}<div class="template-alert" role="alert">{formError}</div>{/if}
    <form onsubmit={onSubmit}>
      <label class="template-label">Name<input bind:value={name} maxlength="120" required placeholder="e.g. Database backup" /></label>
      <label class="template-label">Description <span>Optional</span><textarea bind:value={description} maxlength="1000" rows="2" placeholder="What these fields are intended to verify" /></label>
      <nav class="template-editor-tabs" aria-label="Template field editor"><button type="button" class:active={formTab === 'json'} onclick={() => formTab = 'json'}>Paste JSON</button><button type="button" class:active={formTab === 'fields'} onclick={() => formTab = 'fields'}>Add fields</button></nav>
      {#if formTab === 'json'}
        <TemplateJsonFieldDiscovery
          bind:samplePayload
          {discovering}
          {workspaceId}
          {discovered}
          {selectedDiscovered}
          {discoveryError}
          {discoveryWarnings}
          {primitiveNames}
          onDiscover={onDiscover}
          onAddSelected={onAddSelected}
          onToggleDiscovered={onToggleDiscovered}
        />
      {:else}
        <TemplateManualFieldEditor {fields} {primitiveOptions} onAddField={onAddField} onRemoveField={onRemoveField} onUpdateField={onUpdateField} />
      {/if}
      <footer class="template-dialog__footer"><button class="template-button" type="button" onclick={onClose} disabled={saving}>Cancel</button><button class="template-button template-button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'create' ? 'Create template' : 'Save changes'}</button></footer>
    </form>
  </section>
</div>
