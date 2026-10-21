<script lang="ts">
  export let page = 1;
  export let hasPrevious = false;
  export let hasNext = false;
  export let loading = false;
  export let previousLabel = 'Previous';
  export let nextLabel = 'Next';
  export let pageLabel = 'Page';
  export let onPrevious: (() => void) | undefined = undefined;
  export let onNext: (() => void) | undefined = undefined;
  export let summary = '';

  $: safePage = Math.max(1, Math.floor(Number(page) || 1));
</script>

<nav class="table-pagination" aria-label="List pagination" aria-busy={loading}>
  {#if summary}<p class="table-pagination__summary" aria-live="polite">{summary}</p>{:else}<span class="table-pagination__page" aria-live="polite">{pageLabel} {safePage}</span>{/if}
  <div class="table-pagination__actions">
    <button type="button" class="table-pagination__button" on:click={() => onPrevious?.()} disabled={!hasPrevious || loading}>
      <span aria-hidden="true">←</span> {previousLabel}
    </button>
    <span class="table-pagination__compact-page" aria-hidden="true">{safePage}</span>
    <button type="button" class="table-pagination__button" on:click={() => onNext?.()} disabled={!hasNext || loading}>
      {nextLabel} <span aria-hidden="true">→</span>
    </button>
  </div>
</nav>

<style>
  .table-pagination { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding-top: .9rem; }
  .table-pagination__summary, .table-pagination__page { margin: 0; color: var(--color-text-muted); font-size: .82rem; }
  .table-pagination__actions { display: flex; align-items: center; gap: .45rem; }
  .table-pagination__button { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; min-height: 2.35rem; padding: .45rem .7rem; border: 1px solid var(--color-border); border-radius: .7rem; background: var(--color-surface); color: var(--color-text); font: inherit; font-size: .82rem; cursor: pointer; }
  .table-pagination__button:hover:not(:disabled) { border-color: var(--color-accent); background: var(--color-surface-secondary); }
  .table-pagination__button:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  .table-pagination__button:disabled { cursor: not-allowed; opacity: .45; }
  .table-pagination__compact-page { display: none; color: var(--color-text-secondary); font-size: .82rem; }
  @media (max-width: 28rem) { .table-pagination { align-items: stretch; } .table-pagination__summary, .table-pagination__page { width: 100%; } .table-pagination__actions { justify-content: space-between; } .table-pagination__compact-page { display: inline; } }
</style>
