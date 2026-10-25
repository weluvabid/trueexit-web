<script lang="ts">
  import type { Template } from '@/lib/client/template-types';

  let {
    template,
    canManage,
    saving,
    onInspect,
    onEdit,
    onDelete,
  }: {
    template: Template;
    canManage: boolean;
    saving: boolean;
    onInspect: (template: Template) => void;
    onEdit: (template: Template) => void;
    onDelete: (template: Template) => void;
  } = $props();
</script>

<article class="template-card">
  <div class="template-card__main">
    <div class="template-card__title">
      <h2>{template.name}</h2>
      <span class={`template-kind ${template.kind === 'built_in' ? 'template-kind--built-in' : ''}`}>
        {template.kind === 'built_in' ? 'Built-in' : 'Custom'}
      </span>
    </div>
    <p>{template.description || 'No description.'}</p>
    <div class="template-card__meta">
      <span>{template.fields.length} field{template.fields.length === 1 ? '' : 's'}</span>
      <span>Version {template.version}</span>
      <span>{template.fields.slice(0, 3).map((field) => field.name).join(' · ')}{template.fields.length > 3 ? ' …' : ''}</span>
    </div>
  </div>
  <div class="template-card__actions">
    <button class="template-button" type="button" onclick={() => onInspect(template)} disabled={saving}>Inspect fields</button>
    {#if template.kind === 'custom' && canManage}
      <button class="template-button" type="button" onclick={() => onEdit(template)} disabled={saving}>Edit</button>
      <button class="template-button template-button--danger" type="button" onclick={() => onDelete(template)} disabled={saving}>Delete</button>
    {/if}
  </div>
</article>
