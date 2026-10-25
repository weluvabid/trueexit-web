<svelte:options runes={true} />
<script lang="ts">
  import { Button } from '@/components/ui/button/index.js';
  import { Input } from '@/components/ui/input/index.js';
  import { Badge } from '@/components/ui/badge/index.js';
  import { Label } from '@/components/ui/label/index.js';
  import { Plus, X } from '@lucide/svelte';

  let {
    tagInput = $bindable(''),
    monitorTagCount = 0,
    newTagNames = [],
    onAddTag,
    onRemoveTag,
  }: {
    tagInput?: string;
    monitorTagCount?: number;
    newTagNames?: string[];
    onAddTag: () => void;
    onRemoveTag: (name: string) => void;
  } = $props();
</script>

<section class="space-y-3">
  <div>
    <h3 class="text-sm font-semibold">Create a tag</h3>
    <p class="text-sm text-muted-foreground">New tags become reusable across this workspace.</p>
  </div>
  <div class="flex flex-col gap-2 sm:flex-row">
    <div class="min-w-0 flex-1 space-y-1.5">
      <Label for="new-monitor-tag">Tag name</Label>
      <Input id="new-monitor-tag" bind:value={tagInput} maxlength={40} placeholder="e.g. Customer-facing" />
    </div>
    <Button class="sm:self-end" type="button" variant="outline" onclick={onAddTag} disabled={!tagInput.trim() || monitorTagCount >= 3}><Plus class="size-4" /> Add tag</Button>
  </div>
  {#if newTagNames.length > 0}
    <div class="flex flex-wrap gap-2" aria-label="New tags to create">
      {#each newTagNames as tag (tag)}
        <Badge variant="secondary" class="gap-1.5 py-1 pl-2.5 pr-1.5">
          {tag}
          <button type="button" aria-label={`Remove ${tag}`} class="rounded-full p-0.5 hover:bg-background" onclick={() => onRemoveTag(tag)}><X class="size-3" /></button>
        </Badge>
      {/each}
    </div>
    <p class="text-xs text-muted-foreground">New tags will be created and assigned when saved.</p>
  {/if}
</section>
