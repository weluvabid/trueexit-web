<svelte:options runes={true} />
<script lang="ts">
  import type { FieldDefinition, Primitive } from '../../lib/client/template-types';

  type PrimitiveOption = { value: Primitive; label: string };

  let { fields, primitiveOptions, onAddField, onRemoveField, onUpdateField }: {
    fields: FieldDefinition[];
    primitiveOptions: PrimitiveOption[];
    onAddField: () => void;
    onRemoveField: (index: number) => void;
    onUpdateField: (index: number, key: keyof FieldDefinition, value: string | number) => void;
  } = $props();
</script>

<section class="template-fields template-fields--editor">
  <div class="template-section-heading">
    <div>
      <h3>Define fields manually</h3>
      <p>Add a field and provide its JSON path and interpretation type. Nested paths use dot notation.</p>
    </div>
    <button class="template-button template-button--primary" type="button" onclick={onAddField}>＋ Add field</button>
  </div>
  {#each fields as field, index (index)}
    <div class="template-field-row">
      <label class="template-label">Field name
        <input value={field.name} oninput={(event) => onUpdateField(index, 'name', event.currentTarget.value)} required placeholder="processed_rows" />
      </label>
      <label class="template-label">JSON path
        <input value={field.path} oninput={(event) => onUpdateField(index, 'path', event.currentTarget.value)} required placeholder="backup.processed_rows" />
      </label>
      <label class="template-label">Type
        <select value={field.primitive} onchange={(event) => onUpdateField(index, 'primitive', Number(event.currentTarget.value))}>
          {#each primitiveOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
      <button class="template-icon-button" type="button" aria-label={`Remove field ${index + 1}`} onclick={() => onRemoveField(index)} disabled={fields.length === 1}>×</button>
    </div>
  {/each}
  <p class="template-muted template-small">At least one valid field is required. Advanced assertion, reasoning, and checksum metadata are preserved when editing existing fields.</p>
</section>

<style>
  .template-fields { border-top: 1px solid var(--border-subtle, #393545); margin-top: 1.4rem; padding-top: 1.3rem; }
  .template-fields--editor { margin-top: 1.25rem; }
  .template-section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
  .template-section-heading h3 { margin: 0 0 .35rem; font-size: 1rem; }
  .template-section-heading p { margin: 0; color: var(--text-muted, #a6a2b5); font-size: .82rem; line-height: 1.5; }
  .template-field-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(130px, .7fr) auto; align-items: end; gap: .65rem; margin-bottom: .7rem; padding: .9rem; border: 1px solid var(--border-subtle, #393545); border-radius: 12px; background: var(--surface-muted, #191720); }
  .template-label { display: flex; flex-direction: column; gap: .45rem; margin: 0; color: var(--text-secondary, #c2bdcf); font-size: .84rem; font-weight: 650; }
  .template-label input, .template-label select { box-sizing: border-box; width: 100%; min-width: 0; padding: .75rem .8rem; border: 1px solid var(--border-subtle, #373342); border-radius: 10px; background: var(--surface-input, #101016); color: var(--text-primary, #f3f0fb); font: inherit; font-weight: 400; }
  .template-icon-button { width: 2.5rem; height: 2.5rem; border: 1px solid var(--border-subtle, #393545); border-radius: 10px; background: var(--surface-input, #17151f); color: var(--text-secondary, #c7c1d4); font-size: 1.35rem; cursor: pointer; }
  .template-icon-button:disabled { opacity: .45; cursor: not-allowed; }
  .template-button { border: 1px solid var(--border-subtle, #393545); border-radius: 11px; padding: .65rem .9rem; background: var(--surface-input, #17151f); color: var(--text-primary, #f3f0fb); font: inherit; font-size: .9rem; cursor: pointer; white-space: nowrap; }
  .template-button--primary { border-color: transparent; background: linear-gradient(110deg, #6658e8, #8b6de8); color: #fff; }
  .template-muted { color: var(--text-muted, #a6a2b5); line-height: 1.55; }
  .template-small { font-size: .78rem; }
  :global(html[data-theme='light']) .template-field-row { background: #fbfaff; border-color: #e3deef; }
  :global(html[data-theme='light']) .template-label { color: #434a59; }
  :global(html[data-theme='light']) .template-label input, :global(html[data-theme='light']) .template-label select { background: #fff; color: #252936; border-color: #dce1eb; }
  :global(html[data-theme='light']) .template-icon-button, :global(html[data-theme='light']) .template-button { background: #fff; color: #242936; border-color: #dce1eb; }
  :global(html[data-theme='light']) .template-button--primary { background: linear-gradient(110deg, #6658e8, #8b6de8); color: #fff; border-color: transparent; }
  @media (max-width: 760px) {
    .template-field-row { grid-template-columns: 1fr 1fr; }
    .template-field-row .template-icon-button { justify-self: end; }
    .template-section-heading { flex-direction: column; }
  }
</style>
