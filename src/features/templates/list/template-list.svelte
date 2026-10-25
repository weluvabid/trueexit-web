<script lang="ts">
  import type { Template } from '@/lib/client/template-types';
  import TemplateCard from './template-card.svelte';

  let {
    templates,
    query = $bindable(),
    loading,
    listError,
    nextCursor,
    pageIndex,
    canManage,
    saving,
    onSearchInput,
    onRetry,
    onCreate,
    onInspect,
    onEdit,
    onDelete,
    onPreviousPage,
    onNextPage,
  }: {
    templates: Template[];
    query: string;
    loading: boolean;
    listError: string;
    nextCursor: string | null;
    pageIndex: number;
    canManage: boolean;
    saving: boolean;
    onSearchInput: () => void;
    onRetry: () => void;
    onCreate: () => void;
    onInspect: (template: Template) => void;
    onEdit: (template: Template) => void;
    onDelete: (template: Template) => void;
    onPreviousPage: () => void;
    onNextPage: () => void;
  } = $props();
</script>

<div class="template-toolbar"><label class="template-search"><span class="sr-only">Search templates</span><span aria-hidden="true">⌕</span><input bind:value={query} oninput={onSearchInput} placeholder="Search names, descriptions, fields…" /></label><span class="template-count">{loading ? 'Loading…' : `${templates.length} template${templates.length === 1 ? '' : 's'} on this page`}</span></div>

{#if listError}<div class="template-state template-state--error" role="alert"><p>{listError}</p><button class="template-button" type="button" onclick={onRetry}>Try again</button></div>
{:else if loading && templates.length === 0}<div class="template-state" aria-live="polite">Loading templates…</div>
{:else if templates.length === 0}<div class="template-state"><h2>{query ? 'No matching templates' : 'No templates yet'}</h2><p>{query ? 'Try a different search term.' : 'Create a reusable set of field definitions, or discover fields from a representative JSON payload.'}</p>{#if !query && canManage}<button class="template-button template-button--primary" type="button" onclick={onCreate}>Create a template</button>{/if}</div>
{:else}
  <div class="template-list" aria-busy={loading}>{#each templates as template (template.id)}
    <TemplateCard {template} {canManage} {saving} {onInspect} {onEdit} {onDelete} />
  {/each}</div>
  <nav class="template-pagination" aria-label="Template list pages"><button class="template-button" type="button" onclick={onPreviousPage} disabled={pageIndex === 0 || loading}>← Previous</button><span>Page {pageIndex + 1}</span><button class="template-button" type="button" onclick={onNextPage} disabled={!nextCursor || loading}>Next →</button></nav>
{/if}
