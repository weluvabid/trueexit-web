<script lang="ts">
  let { pageIndex, nextCursor, loading, onPreviousPage, onNextPage }: {
    pageIndex: number;
    nextCursor: string | null;
    loading: boolean;
    onPreviousPage: () => void;
    onNextPage: () => void;
  } = $props();
</script>

<nav class="template-pagination" aria-label="Template list pages">
  <button class="template-button" type="button" onclick={onPreviousPage} disabled={pageIndex === 0 || loading}>← Previous</button>
  <span>Page {pageIndex + 1}</span>
  <button class="template-button" type="button" onclick={onNextPage} disabled={!nextCursor || loading}>Next →</button>
</nav>
