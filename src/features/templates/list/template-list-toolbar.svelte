<script lang="ts">
  let {
    query = $bindable(),
    loading,
    templateCount,
    onSearchInput,
  }: {
    query: string;
    loading: boolean;
    templateCount: number;
    onSearchInput: () => void;
  } = $props();
</script>

<div class="template-toolbar">
  <label class="template-search">
    <span class="sr-only">Search templates</span>
    <span aria-hidden="true">⌕</span>
    <input bind:value={query} oninput={onSearchInput} placeholder="Search names, descriptions, fields…" />
  </label>
  <span class="template-count">{loading ? 'Loading…' : `${templateCount} template${templateCount === 1 ? '' : 's'} on this page`}</span>
</div>
