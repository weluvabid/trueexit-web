<script lang="ts">
  import * as Command from '../../ui/command/index.js';
  import { LayoutDashboard, Activity, Settings, FileText, Tags } from '@lucide/svelte';

  type SearchResult = { label: string; detail: string; href: string; kind: string };
  let {
    open = $bindable(false),
    query = $bindable(''),
    results,
    status,
    loading,
    onQueryChange
  }: {
    open?: boolean;
    query?: string;
    results: SearchResult[];
    status: string;
    loading: boolean;
    onQueryChange: (query: string) => void;
  } = $props();

  const navigationItems: SearchResult[] = [
    { label: 'Overview', detail: 'Dashboard and recent activity', href: '/', kind: 'overview' },
    { label: 'Monitors', detail: 'Monitor inventory and checks', href: '/monitors', kind: 'monitors' },
    { label: 'Settings', detail: 'Workspace settings and members', href: '/settings', kind: 'settings' },
    { label: 'Templates', detail: 'Global template library', href: '/templates', kind: 'templates' }
  ];

  function resultIcon(kind: string) {
    if (kind === 'overview') return LayoutDashboard;
    if (kind === 'monitors') return Activity;
    if (kind === 'settings') return Settings;
    if (kind === 'templates') return FileText;
    if (kind === 'tags') return Tags;
    return FileText;
  }
</script>

<Command.Dialog bind:open title="Quick navigation" description="Search navigation and workspace resources." class="top-[12%] translate-y-0 sm:top-[18%]">
  <Command.Input value={query} oninput={(event) => onQueryChange(event.currentTarget.value)} placeholder="Search destinations and workspace resources…" />
  <Command.List class="max-h-[min(65vh,32rem)]">
    <Command.Group heading="Navigation">
      {#each navigationItems as item (item.href)}
        {@const Icon = resultIcon(item.kind)}
        <Command.LinkItem href={item.href} value={`${item.label} ${item.detail}`} onSelect={() => { open = false; }}>
          <Icon class="size-4 text-muted-foreground" />
          <span>{item.label}</span><span class="ml-auto text-xs text-muted-foreground">{item.detail}</span>
        </Command.LinkItem>
      {/each}
    </Command.Group>
    {#if query.trim().length >= 2}
      <Command.Separator />
      <Command.Group heading="Workspace results">
        {#if loading}
          <div class="px-2 py-3 text-sm text-muted-foreground">Searching this workspace…</div>
        {:else if results.length}
          {#each results as item, index (`${item.kind}-${item.label}-${index}`)}
            {@const Icon = resultIcon(item.kind)}
            <Command.LinkItem href={item.href} value={`${item.label} ${item.detail}`} onSelect={() => { open = false; }}>
              <Icon class="size-4 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">{item.label}</span>
              <span class="max-w-[45%] truncate text-xs text-muted-foreground">{item.detail}</span>
            </Command.LinkItem>
          {/each}
        {:else if status}
          <div class="px-2 py-3 text-sm text-muted-foreground">{status}</div>
        {/if}
      </Command.Group>
    {/if}
    <Command.Empty>No matching navigation destinations.</Command.Empty>
  </Command.List>
</Command.Dialog>
