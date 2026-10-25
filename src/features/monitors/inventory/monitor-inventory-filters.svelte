<svelte:options runes={true} />
<script lang="ts">
  import * as Select from '@/components/ui/select/index.js';
  import { Button } from '@/components/ui/button/index.js';
  import { Input } from '@/components/ui/input/index.js';
  import { Checkbox } from '@/components/ui/checkbox/index.js';
  import { Search, X, ArrowDown, ArrowUp } from '@lucide/svelte';
  import type { MonitorStatus } from '@/lib/client/monitor-types';
  import type { MonitorSort, WorkspaceTag } from '@/lib/client/monitor-queries';

  let {
    search = $bindable(''),
    statusFilter = $bindable<'all' | MonitorStatus>('all'),
    tagFilter = $bindable(''),
    sort = $bindable<MonitorSort>('updated_at'),
    direction = $bindable<'asc' | 'desc'>('desc'),
    includeArchived = $bindable(false),
    workspaceTags = [],
    onSearchInput,
    onApplyFilters,
    onClearFilters,
  }: {
    search?: string;
    statusFilter?: 'all' | MonitorStatus;
    tagFilter?: string;
    sort?: MonitorSort;
    direction?: 'asc' | 'desc';
    includeArchived?: boolean;
    workspaceTags?: WorkspaceTag[];
    onSearchInput: () => void;
    onApplyFilters: () => void;
    onClearFilters: () => void;
  } = $props();

  const monitorSortOptions: readonly MonitorSort[] = ['updated_at', 'created_at', 'name', 'id'];
  function isMonitorSort(value: string): value is MonitorSort {
    return monitorSortOptions.some((option) => option === value);
  }
</script>

<div class="flex flex-wrap items-end gap-3">
  <div class="relative min-w-56 flex-1">
    <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    <Input class="pl-9 pr-9" aria-label="Search monitor names" bind:value={search} oninput={onSearchInput} placeholder="Search monitors…" maxlength={200} />
    {#if search}
      <Button class="absolute right-1 top-1/2 size-7 -translate-y-1/2" variant="ghost" size="icon-sm" aria-label="Clear search" onclick={() => { search = ''; onApplyFilters(); }}>
        <X class="size-4" />
      </Button>
    {/if}
  </div>

  <div class="grid min-w-36 gap-1.5">
    <label class="text-xs font-medium text-muted-foreground" for="monitor-status-filter">Status</label>
    <Select.Root type="single" value={statusFilter} onValueChange={(value) => { if (value) { statusFilter = value as 'all' | MonitorStatus; onApplyFilters(); } }}>
      <Select.Trigger id="monitor-status-filter" class="w-full">
        <Select.Value placeholder="All active" />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all" label="All active">All active</Select.Item>
        <Select.Item value="enabled" label="Enabled">Enabled</Select.Item>
        <Select.Item value="disabled" label="Disabled">Disabled</Select.Item>
        <Select.Item value="archived" label="Archived">Archived</Select.Item>
      </Select.Content>
    </Select.Root>
  </div>

  <div class="grid min-w-36 gap-1.5">
    <label class="text-xs font-medium text-muted-foreground" for="monitor-tag-filter">Tag</label>
    <Select.Root type="single" value={tagFilter || '__trueexit_all_tags__'} onValueChange={(value) => { if (value) { tagFilter = value === '__trueexit_all_tags__' ? '' : value; onApplyFilters(); } }}>
      <Select.Trigger id="monitor-tag-filter" class="w-full">
        <Select.Value placeholder="All tags" />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="__trueexit_all_tags__" label="All tags">All tags</Select.Item>
        {#each workspaceTags as tag (tag.id)}
          <Select.Item value={tag.id} label={tag.name}>{tag.name}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <div class="grid min-w-40 gap-1.5">
    <label class="text-xs font-medium text-muted-foreground" for="monitor-sort-filter">Sort by</label>
    <Select.Root type="single" value={sort} onValueChange={(value) => { if (value && isMonitorSort(value)) { sort = value; onApplyFilters(); } }}>
      <Select.Trigger id="monitor-sort-filter" class="w-full">
        <Select.Value placeholder="Recently updated" />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="updated_at" label="Recently updated">Recently updated</Select.Item>
        <Select.Item value="created_at" label="Recently created">Recently created</Select.Item>
        <Select.Item value="name" label="Name">Name</Select.Item>
        <Select.Item value="id" label="Default order">Default order</Select.Item>
      </Select.Content>
    </Select.Root>
  </div>

  <Button variant="outline" onclick={() => { direction = direction === 'desc' ? 'asc' : 'desc'; onApplyFilters(); }} aria-label={`Sort ${direction === 'desc' ? 'ascending' : 'descending'}`} title={`Currently ${direction === 'desc' ? 'descending' : 'ascending'}`}>
    {#if direction === 'desc'}<ArrowDown class="size-4" />{:else}<ArrowUp class="size-4" />{/if}
    {direction === 'desc' ? 'Descending' : 'Ascending'}
  </Button>

  <label class="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
    <Checkbox bind:checked={includeArchived} onchange={onApplyFilters} />
    Include archived
  </label>

  <Button variant="ghost" onclick={onClearFilters} disabled={!search && statusFilter === 'all' && !tagFilter && !includeArchived}>
    Clear filters
  </Button>
</div>
