<script lang="ts">
  let {
    listError,
    loading,
    templateCount,
    query,
    canManage,
    onRetry,
    onCreate,
  }: {
    listError: string;
    loading: boolean;
    templateCount: number;
    query: string;
    canManage: boolean;
    onRetry: () => void;
    onCreate: () => void;
  } = $props();
</script>

{#if listError}
  <div class="template-state template-state--error" role="alert">
    <p>{listError}</p>
    <button class="template-button" type="button" onclick={onRetry}>Try again</button>
  </div>
{:else if loading && templateCount === 0}
  <div class="template-state" aria-live="polite">Loading templates…</div>
{:else if templateCount === 0}
  <div class="template-state">
    <h2>{query ? 'No matching templates' : 'No templates yet'}</h2>
    <p>{query ? 'Try a different search term.' : 'Create a reusable set of field definitions, or discover fields from a representative JSON payload.'}</p>
    {#if !query && canManage}
      <button class="template-button template-button--primary" type="button" onclick={onCreate}>Create a template</button>
    {/if}
  </div>
{/if}
