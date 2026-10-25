<svelte:options runes={true} />
<script lang="ts">
  import type { WorkspaceTag } from '@/lib/client/monitor-queries';
  import { Checkbox } from '@/components/ui/checkbox/index.js';

  let {
    workspaceTags = [],
    monitorTagIds = $bindable([]),
    newTagCount = 0,
  }: {
    workspaceTags?: WorkspaceTag[];
    monitorTagIds?: string[];
    newTagCount?: number;
  } = $props();
</script>

<section class="space-y-3">
  <div>
    <h3 class="text-sm font-semibold">Available tags</h3>
    <p class="text-sm text-muted-foreground">Select up to three labels for this monitor.</p>
  </div>
  {#if workspaceTags.length > 0}
    <div class="grid gap-2 sm:grid-cols-2">
      {#each workspaceTags as tag (tag.id)}
        <label class="flex min-w-0 cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50">
          <Checkbox value={tag.id} bind:group={monitorTagIds} disabled={!monitorTagIds.includes(tag.id) && monitorTagIds.length + newTagCount >= 3} />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{tag.name}</span>
            <span class="block text-xs text-muted-foreground">{tag.monitor_count} monitor{tag.monitor_count === 1 ? '' : 's'}</span>
          </span>
        </label>
      {/each}
    </div>
  {:else}
    <p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No workspace tags yet. Create one below.</p>
  {/if}
</section>
