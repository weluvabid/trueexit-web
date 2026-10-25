<svelte:options runes={true} />
<script lang="ts">
  import { Button } from '@/components/ui/button/index.js';
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';

  let {
    pageIndex = 0,
    nextCursor = null,
    loadingMonitors = false,
    onPreviousPage,
    onNextPage,
  }: {
    pageIndex?: number;
    nextCursor?: string | null;
    loadingMonitors?: boolean;
    onPreviousPage: () => void;
    onNextPage: () => void;
  } = $props();
</script>

<nav class="flex flex-wrap items-center justify-between gap-3" aria-label="Monitor list pages">
  <p class="text-sm text-muted-foreground">Page {pageIndex + 1}</p>
  <div class="flex items-center gap-2">
    <Button variant="outline" onclick={onPreviousPage} disabled={pageIndex === 0 || loadingMonitors}>
      <ChevronLeft class="size-4" /> Previous
    </Button>
    <Button variant="outline" onclick={onNextPage} disabled={!nextCursor || loadingMonitors}>
      Next <ChevronRight class="size-4" />
    </Button>
  </div>
</nav>
