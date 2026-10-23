<svelte:options runes={true} />
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    search = $bindable(''),
    searchLabel = 'Search records',
    searchPlaceholder = 'Search…',
    clearLabel = 'Clear search',
    searchId = 'table-search',
    resultSummary = '',
    disabled = false,
    onSearchChange,
    children
  }: {
    search: string;
    searchLabel?: string;
    searchPlaceholder?: string;
    clearLabel?: string;
    searchId?: string;
    resultSummary?: string;
    disabled?: boolean;
    onSearchChange?: (value: string) => void;
    children?: Snippet;
  } = $props();

  function updateSearch(value: string) {
    search = value;
    onSearchChange?.(value);
  }

  function handleInput(event: Event) {
    const target = event.currentTarget;
    if (target instanceof HTMLInputElement) updateSearch(target.value);
  }
</script>

<div class="table-toolbar" aria-label="List controls">
  <div class="table-toolbar__controls">
    <label class="table-toolbar__search" for={searchId}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.2 4.2"/></svg>
      <span class="sr-only">{searchLabel}</span>
      <input id={searchId} type="search" value={search} oninput={handleInput} placeholder={searchPlaceholder} disabled={disabled} autocomplete="off" />
      {#if search}
        <button type="button" class="table-toolbar__clear" aria-label={clearLabel} onclick={() => updateSearch('')} disabled={disabled}>×</button>
      {/if}
    </label>
    <div class="table-toolbar__filters">{@render children?.()}</div>
  </div>
  {#if resultSummary}
    <p class="table-toolbar__summary" aria-live="polite">{resultSummary}</p>
  {/if}
</div>

<style>
  .table-toolbar { display: grid; gap: .7rem; min-width: 0; }
  .table-toolbar__controls { display: flex; align-items: center; gap: .65rem; flex-wrap: wrap; min-width: 0; }
  .table-toolbar__search { display: flex; align-items: center; gap: .55rem; min-width: min(100%, 15rem); flex: 1 1 15rem; min-height: 2.65rem; padding: 0 .75rem; border: 1px solid var(--color-border); border-radius: .8rem; background: var(--color-surface); color: var(--color-text-secondary); }
  .table-toolbar__search:focus-within { border-color: var(--color-accent); outline: 2px solid color-mix(in srgb, var(--color-accent) 20%, transparent); outline-offset: 1px; }
  .table-toolbar__search svg { width: 1rem; height: 1rem; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.7; }
  .table-toolbar__search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--color-text); font: inherit; }
  .table-toolbar__search input::placeholder { color: var(--color-text-muted); }
  .table-toolbar__clear { display: grid; place-items: center; width: 1.65rem; height: 1.65rem; flex: 0 0 auto; border: 0; border-radius: .45rem; background: transparent; color: var(--color-text-secondary); font: inherit; font-size: 1.15rem; cursor: pointer; }
  .table-toolbar__clear:hover { background: var(--color-surface-secondary); }
  .table-toolbar__filters { display: flex; align-items: center; gap: .55rem; flex-wrap: wrap; }
  .table-toolbar__summary { margin: 0; color: var(--color-text-muted); font-size: .82rem; }
  @media (max-width: 38rem) { .table-toolbar__controls, .table-toolbar__filters { align-items: stretch; } .table-toolbar__filters { width: 100%; } .table-toolbar__filters :global(select) { max-width: 100%; } }
</style>
