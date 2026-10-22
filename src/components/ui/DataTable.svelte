<svelte:options runes={true} />
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    loading = false,
    minWidth = '42rem',
    caption,
    children
  }: {
    label: string;
    loading?: boolean;
    minWidth?: string;
    caption?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="data-table-frame" aria-busy={loading}>
  <div class="data-table-frame__scroll" tabindex="0" role="region" aria-label={label}>
    <table style={`--data-table-min-width: ${minWidth}`}>
      {#if caption}<caption>{caption}</caption>{/if}
      {@render children?.()}
    </table>
  </div>
</div>

<style>
  .data-table-frame { min-width: 0; border: 1px solid var(--color-border); border-radius: .95rem; background: var(--color-surface); overflow: hidden; }
  .data-table-frame__scroll { max-width: 100%; overflow-x: auto; overscroll-behavior-inline: contain; }
  .data-table-frame__scroll:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  table { width: 100%; min-width: var(--data-table-min-width); border-collapse: separate; border-spacing: 0; color: var(--color-text); font-size: .88rem; }
  :global(thead th) { padding: .85rem 1rem; border-bottom: 1px solid var(--color-border); background: var(--color-surface-secondary); color: var(--color-text-secondary); font-size: .76rem; font-weight: 650; white-space: nowrap; }
  :global(tbody td) { padding: .95rem 1rem; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
  :global(tbody tr:last-child td) { border-bottom: 0; }
  :global(tbody tr:hover) { background: color-mix(in srgb, var(--color-surface-secondary) 48%, transparent); }
  :global(caption) { padding: .8rem 1rem; color: var(--color-text-secondary); text-align: left; font-size: .8rem; }
</style>
