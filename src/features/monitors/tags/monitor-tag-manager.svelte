<svelte:options runes={true} />
<script lang="ts">
  import type { Monitor } from '@/lib/client/monitor-types';
  import type { WorkspaceTag } from '@/lib/client/monitor-queries';
  import * as Dialog from '@/components/ui/dialog/index.js';
  import { Button } from '@/components/ui/button/index.js';
  import { LoaderCircle, Tags } from '@lucide/svelte';
  import MonitorAvailableTags from './monitor-available-tags.svelte';
  import MonitorTagDrafts from './monitor-tag-drafts.svelte';

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
          <MonitorAvailableTags
            {workspaceTags}
            bind:monitorTagIds
            newTagCount={newTagNames.length}
          />

          <MonitorTagDrafts
            bind:tagInput
            monitorTagCount={monitorTagIds.length + newTagNames.length}
            {newTagNames}
            onAddTag={onAddTag}
            onRemoveTag={onRemoveTag}
          />

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
