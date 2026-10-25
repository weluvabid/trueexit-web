<svelte:options runes={true} />
<script lang="ts">
  import type { FieldDefinition, Primitive } from '../../../lib/client/template-types';

  type DiscoveredField = FieldDefinition & { source_type?: string };

  let {
    samplePayload = $bindable(),
    discovering,
    workspaceId,
    discovered,
    selectedDiscovered,
    discoveryError,
    discoveryWarnings,
    primitiveNames,
    onDiscover,
    onAddSelected,
    onToggleDiscovered,
  }: {
    samplePayload: string;
    discovering: boolean;
    workspaceId: string;
    discovered: DiscoveredField[];
    selectedDiscovered: string[];
    discoveryError: string;
    discoveryWarnings: string[];
    primitiveNames: Record<Primitive, string>;
    onDiscover: () => void;
    onAddSelected: () => void;
    onToggleDiscovered: (field: DiscoveredField, checked: boolean) => void;
  } = $props();
</script>

<section class="template-discovery">
  <div class="template-section-heading">
    <div>
      <h3>Discover fields from JSON</h3>
      <p>Paste a representative JSON object. Choose discovered fields to add them to the template; sample values are never saved.</p>
    </div>
  </div>
  <label class="template-label">Sample JSON
    <textarea
      class="template-json-input"
      bind:value={samplePayload}
      rows="8"
      spellcheck="false"
      placeholder={`{
  "backup": {
    "size": 1024,
    "processed_rows": 42
  }
}`}
    />
  </label>
  <div class="template-actions">
    <button class="template-button template-button--primary" type="button" onclick={onDiscover} disabled={discovering || !workspaceId}>
      {discovering ? 'Discovering…' : 'Discover fields'}
    </button>
    {#if discovered.length}
      <button class="template-button" type="button" onclick={onAddSelected} disabled={!selectedDiscovered.length}>
        Add selected ({selectedDiscovered.length})
      </button>
    {/if}
  </div>
  {#if discoveryError}
    <p class="template-inline-error" role="alert">{discoveryError}</p>
  {/if}
  {#if discoveryWarnings.length}
    <p class="template-warning">Some values were skipped: {[...new Set(discoveryWarnings)].join(', ')}. Review the discovered fields before saving.</p>
  {/if}
  {#if discovered.length}
    <div class="template-discovered">
      {#each discovered as field}
        <label class="template-discovered__row">
          <input
            type="checkbox"
            checked={selectedDiscovered.includes(`${field.name}\\u0000${field.path}`)}
            onchange={(event) => onToggleDiscovered(field, event.currentTarget.checked)}
          />
          <span><strong>{field.name}</strong><small>{field.path}</small></span>
          <span>{primitiveNames[field.primitive] ?? 'Unknown'}</span>
        </label>
      {/each}
    </div>
  {/if}
</section>
