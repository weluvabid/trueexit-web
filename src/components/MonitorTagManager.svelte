<svelte:options runes={true} />
<script lang="ts">
  import type { Monitor } from '../lib/client/monitor-types';
  import type { WorkspaceTag } from '../lib/client/monitor-queries';
  import * as Dialog from './ui/dialog/index.js';
  import { Button } from './ui/button/index.js';
  import { Input } from './ui/input/index.js';
  import { Checkbox } from './ui/checkbox/index.js';
  import { Badge } from './ui/badge/index.js';
  import { Label } from './ui/label/index.js';
  import { Plus, X, LoaderCircle, Tags } from '@lucide/svelte';

  let {
    taggingMonitor = null,
    workspaceTags = [],
    monitorTagIds = $bindable([]),
    newTagNames = [],
    tagInput = $bindable(''),
    tagBusy = false,
    tagReady = false,
    tagError = '',
    onSubmit,
    onAddTag,
    onRemoveTag,
    onClose,
  }: {
    taggingMonitor?: Monitor | null;
    workspaceTags?: WorkspaceTag[];
    monitorTagIds?: string[];
    newTagNames?: string[];
    tagInput?: string;
    tagBusy?: boolean;
    tagReady?: boolean;
    tagError?: string;
    onSubmit: (event: SubmitEvent) => void;
    onAddTag: () => void;
    onRemoveTag: (name: string) => void;
    onClose: () => void;
  } = $props();
</script>

<Dialog.Root open={Boolean(taggingMonitor)} onOpenChange={(open) => { if (!open && !tagBusy) onClose(); }}>
  <Dialog.Content class="max-h-[min(85vh,48rem)] overflow-y-auto sm:max-w-xl">
    <Dialog.Header>
      <div class="flex items-center gap-3">
        <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"><Tags class="size-5" /></div>
        <div class="min-w-0">
          <Dialog.Title>Organise this monitor</Dialog.Title>
          <Dialog.Description>Tags are optional workspace labels. They do not change verification or health.</Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    {#if taggingMonitor}
      {#if tagError}<div class="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{tagError}</div>{/if}
      {#if tagBusy}
        <div class="flex items-center gap-2 py-8 text-sm text-muted-foreground" aria-live="polite"><LoaderCircle class="size-4 animate-spin" />Loading or saving tags…</div>
      {:else}
        <form class="space-y-6" onsubmit={onSubmit}>
          <section class="space-y-3">
            <div>
              <h3 class="text-sm font-semibold">Available tags</h3>
              <p class="text-sm text-muted-foreground">Select up to three labels for {taggingMonitor.name}.</p>
            </div>
            {#if workspaceTags.length > 0}
              <div class="grid gap-2 sm:grid-cols-2">
                {#each workspaceTags as tag (tag.id)}
                  <label class="flex min-w-0 cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50">
                    <Checkbox value={tag.id} bind:group={monitorTagIds} disabled={!monitorTagIds.includes(tag.id) && monitorTagIds.length + newTagNames.length >= 3} />
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
              <Button class="sm:self-end" type="button" variant="outline" onclick={onAddTag} disabled={!tagInput.trim() || monitorTagIds.length + newTagNames.length >= 3}><Plus class="size-4" /> Add tag</Button>
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

          <Dialog.Footer class="gap-2 sm:gap-2">
            <p class="mr-auto max-w-xs text-xs text-muted-foreground">Saving replaces this monitor’s complete tag assignment. Removing a tag here does not delete it from the workspace.</p>
            <Button variant="outline" type="button" onclick={onClose} disabled={tagBusy}>Cancel</Button>
            <Button type="submit" disabled={tagBusy || !tagReady}>Save tags</Button>
          </Dialog.Footer>
        </form>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
