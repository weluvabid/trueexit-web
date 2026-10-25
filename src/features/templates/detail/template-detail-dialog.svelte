<script lang="ts">
  import type { Primitive, Template } from '@/lib/client/template-types';

  let {
    detail,
    detailLoading,
    detailError,
    primitiveNames,
    onClose,
  }: {
    detail: Template | null;
    detailLoading: boolean;
    detailError: string;
    primitiveNames: Record<Primitive, string>;
    onClose: () => void;
  } = $props();
</script>

<div class="template-overlay" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
  <section class="template-dialog template-dialog--detail" role="dialog" aria-modal="true" aria-labelledby="template-detail-title">
    <header class="template-dialog__header">
      <div><p class="template-eyebrow">FIELD DEFINITIONS</p><h2 id="template-detail-title">{detail?.name ?? 'Template details'}</h2></div>
      <button class="template-icon-button" type="button" aria-label="Close details" onclick={onClose}>×</button>
    </header>
    {#if detailLoading}
      <p class="template-muted">Loading template…</p>
    {:else if detailError}
      <div class="template-alert" role="alert">{detailError}</div>
    {:else if detail}
      <p class="template-muted">{detail.description || 'No description.'} · Version {detail.version}</p>
      <div class="template-detail-fields">
        {#each detail.fields as field}
          <article>
            <div><h3>{field.name}</h3><code>{field.path}</code></div>
            <span>{primitiveNames[field.primitive]}</span>
            {#if field.meta}
              <details><summary>Advanced rules</summary><pre>{JSON.stringify(field.meta, null, 2)}</pre></details>
            {/if}
          </article>
        {/each}
      </div>
      <p class="template-footnote">These definitions are copied into a monitor when selected. This template does not remain linked to that monitor.</p>
    {/if}
  </section>
</div>
