<svelte:options runes={true} />
<script lang="ts">
  import { Button } from '@/components/ui/button/index.js';
  import { ArrowUpDown, Plus } from '@lucide/svelte';
  import type { MonitorStatus } from '@/lib/client/monitor-types';

  let {
    search = '',
    statusFilter = 'all',
    tagFilter = '',
    includeArchived = false,
    workspaceId = '',
    loadingWorkspaces = false,
    onClearFilters,
    onNewMonitor,
  }: {
    search?: string;
    statusFilter?: 'all' | MonitorStatus;
    tagFilter?: string;
    includeArchived?: boolean;
    workspaceId?: string;
    loadingWorkspaces?: boolean;
    onClearFilters: () => void;
    onNewMonitor: () => void;
  } = $props();

  const hasActiveFilters = $derived(Boolean(search || statusFilter !== 'all' || tagFilter || includeArchived));
</script>

<div class="rounded-lg border border-dashed px-6 py-14 text-center">
  <div class="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
    <ArrowUpDown class="size-5" />
  </div>
  <h2 class="font-semibold">{hasActiveFilters ? 'No monitors match these filters' : 'Nothing to monitor yet'}</h2>
  <p class="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
    {hasActiveFilters
      ? 'Try another search or broaden the status or tag filter.'
      : 'There are no monitors in this view yet. Create one by defining the fields TrueExit should observe.'}
  </p>
  <div class="mt-4">
    {#if hasActiveFilters}
      <Button variant="outline" onclick={onClearFilters}>Clear filters</Button>
    {:else}
      <Button onclick={onNewMonitor} disabled={loadingWorkspaces || !workspaceId}>
        <Plus class="mr-1 size-4" /> Create your first monitor
      </Button>
    {/if}
  </div>
</div>
