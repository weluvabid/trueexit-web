<script lang="ts">
  import type { Template } from '@/lib/client/template-types';
  import TemplateCard from './template-card.svelte';
  import TemplateListToolbar from './template-list-toolbar.svelte';
  import TemplatePagination from './template-pagination.svelte';
  import TemplateListStatus from './template-list-status.svelte';

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

<TemplateListToolbar bind:query {loading} templateCount={templates.length} {onSearchInput} />

{#if listError || (loading && templates.length === 0) || templates.length === 0}
  <TemplateListStatus {listError} {loading} templateCount={templates.length} {query} {canManage} {onRetry} {onCreate} />
{:else}
  <div class="template-list" aria-busy={loading}>{#each templates as template (template.id)}
    <TemplateCard {template} {canManage} {saving} {onInspect} {onEdit} {onDelete} />
  {/each}</div>
  <TemplatePagination {pageIndex} {nextCursor} {loading} {onPreviousPage} {onNextPage} />
{/if}
