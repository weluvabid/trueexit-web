<script lang="ts">
  import type { Monitor } from '../lib/client/monitor-types';
  import type { WorkspaceTag } from '../lib/client/monitor-queries';

  export let taggingMonitor: Monitor | null = null;
  export let workspaceTags: WorkspaceTag[] = [];
  export let monitorTagIds: string[] = [];
  export let newTagNames: string[] = [];
  export let tagInput = '';
  export let tagBusy = false;
  export let tagReady = false;
  export let tagError = '';
  export let onSubmit: (event: SubmitEvent) => void;
  export let onAddTag: () => void;
  export let onRemoveTag: (name: string) => void;
  export let onClose: () => void;
</script>

{#if taggingMonitor}
  <div class="monitor-modal-backdrop" role="presentation">
    <section class="monitor-create-modal monitor-tag-modal" role="dialog" aria-modal="true" aria-labelledby="monitor-tags-title">
      <header class="monitor-create-modal__header">
        <div><p class="eyebrow">WORKSPACE LABELS</p><h2 id="monitor-tags-title">Organise this monitor.</h2><p>Tags are optional labels shared across monitors. They do not change verification or health.</p></div>
        <button class="monitor-modal-close" type="button" aria-label="Close tag manager" on:click={onClose} disabled={tagBusy}>×</button>
      </header>
      {#if tagError}<div class="monitor-inline-alert" role="alert">{tagError}</div>{/if}
      {#if tagBusy}
        <div class="monitor-state" aria-live="polite"><span class="monitor-loader" aria-hidden="true"></span>Loading tags…</div>
      {:else}
        <form class="monitor-create-form" on:submit={onSubmit}>
          <div class="monitor-create-section">
            <div class="monitor-create-section__heading"><span>01</span><div><h3>Available tags</h3><p>Select up to three labels for {taggingMonitor.name}.</p></div></div>
            {#if workspaceTags.length > 0}
              <div class="monitor-tag-options">
                {#each workspaceTags as tag (tag.id)}
                  <label class="monitor-tag-option"><input type="checkbox" value={tag.id} bind:group={monitorTagIds} disabled={!monitorTagIds.includes(tag.id) && monitorTagIds.length + newTagNames.length >= 3} /><span>{tag.name}</span><small>{tag.monitor_count} monitor{tag.monitor_count === 1 ? '' : 's'}</small></label>
                {/each}
              </div>
            {:else}
              <p class="monitor-form-hint">No workspace tags yet. Create one below.</p>
            {/if}
          </div>
          <div class="monitor-create-section">
            <div class="monitor-create-section__heading"><span>02</span><div><h3>Create a tag</h3><p>New tags become reusable across this workspace.</p></div></div>
            <div class="monitor-channel-add"><label class="monitor-form-field"><span>Tag name</span><input bind:value={tagInput} maxlength="40" placeholder="e.g. Customer-facing" /></label><button class="monitor-button monitor-button--quiet" type="button" on:click={onAddTag} disabled={!tagInput.trim() || monitorTagIds.length + newTagNames.length >= 3}>Add tag</button></div>
            {#if newTagNames.length > 0}
              <div class="monitor-selected-channels" aria-label="New tags to create">
                {#each newTagNames as tag (tag)}
                  <div class="monitor-selected-channel"><span class="monitor-selected-channel__icon" aria-hidden="true">＋</span><span><strong>{tag}</strong><small>Will be created and assigned on save</small></span><button type="button" aria-label={`Remove ${tag}`} on:click={() => onRemoveTag(tag)}>×</button></div>
                {/each}
              </div>
            {/if}
          </div>
          <footer class="monitor-create-footer"><p>Saving replaces this monitor's complete tag assignment. Removing a tag here does not delete it from the workspace.</p><div><button class="monitor-button monitor-button--quiet" type="button" on:click={onClose} disabled={tagBusy}>Cancel</button><button class="monitor-button monitor-button--primary" type="submit" disabled={tagBusy || !tagReady}>{tagBusy ? 'Saving tags…' : 'Save tags'} <span aria-hidden="true">↗</span></button></div></footer>
        </form>
      {/if}
    </section>
  </div>
{/if}
