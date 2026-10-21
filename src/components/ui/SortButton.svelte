<script lang="ts">
  export let label: string;
  export let active = false;
  export let direction: 'asc' | 'desc' = 'asc';
  export let disabled = false;
  export let onSort: (() => void) | undefined = undefined;

  $: ariaSort = active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';
</script>

<th scope="col" aria-sort={ariaSort}>
  <button class:active type="button" class="sort-button" on:click={() => onSort?.()} disabled={disabled}>
    <span>{label}</span>
    <span class="sort-button__indicator" aria-hidden="true">{active ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    {#if active}<span class="sr-only">, sorted {direction === 'asc' ? 'ascending' : 'descending'}</span>{/if}
  </button>
</th>

<style>
  th { text-align: left; font: inherit; }
  .sort-button { display: inline-flex; align-items: center; gap: .4rem; padding: .25rem 0; border: 0; background: transparent; color: var(--color-text-secondary); font: inherit; font-size: .78rem; font-weight: 650; text-align: left; cursor: pointer; }
  .sort-button:hover, .sort-button.active { color: var(--color-text); }
  .sort-button:focus-visible { border-radius: .25rem; outline: 2px solid var(--color-accent); outline-offset: 3px; }
  .sort-button__indicator { color: var(--color-text-muted); font-size: .9rem; }
  .sort-button.active .sort-button__indicator { color: var(--color-accent); }
  .sort-button:disabled { cursor: not-allowed; opacity: .55; }
</style>
