<script lang="ts">
  import * as Popover from '../../ui/popover/index.js';
  import * as Command from '../../ui/command/index.js';
  import { ChevronDown, Check } from '@lucide/svelte';
  import type { WorkspaceContext } from '../../../lib/client/workspace-bootstrap';

  let {
    workspaces,
    activeWorkspaceId,
    workspaceLoading,
    workspaceError,
    workspaceMenuOpen = $bindable(false),
    workspaceSearchQuery = $bindable(''),
    onChooseWorkspace
  }: {
    workspaces: WorkspaceContext[];
    activeWorkspaceId: string;
    workspaceLoading: boolean;
    workspaceError: string;
    workspaceMenuOpen?: boolean;
    workspaceSearchQuery?: string;
    onChooseWorkspace: (id: string) => void;
  } = $props();
</script>

<Popover.Root bind:open={workspaceMenuOpen}>
  <Popover.Trigger
    class="workspace-switcher__trigger"
    disabled={workspaceLoading || !!workspaceError || !workspaces.length}
    aria-label="Switch workspace"
  >
    <span class="workspace-switcher__name">{#if workspaceLoading}Loading workspace…{:else if workspaceError}{workspaces.length ? 'Workspace unavailable' : 'No workspace'}{:else}{workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name || 'Choose workspace'}{/if}</span>
    <ChevronDown class="size-4 shrink-0" />
  </Popover.Trigger>
  <Popover.Content
    class="w-80 max-w-[calc(100vw-1.5rem)] gap-0 p-2"
    align="center"
    sideOffset={8}
    aria-label="Switch workspace"
  >
    <Command.Root class="min-h-0">
      <Command.Input bind:value={workspaceSearchQuery} placeholder="Search workspaces…" aria-label="Search workspaces" />
      <Command.List class="mt-3 w-full max-h-72">
        <Command.Empty>No matching workspaces.</Command.Empty>
        <Command.Group class="w-full">
          {#each workspaces as workspace (workspace.id)}
            <Command.Item
              value={`${workspace.name} ${workspace.personal ? 'Personal' : ''}`}
              onSelect={() => { workspaceSearchQuery = ''; onChooseWorkspace(workspace.id); }}
              class="relative box-border w-full cursor-pointer gap-2 px-3 py-2.5"
            >
              <span class="min-w-0 flex-1 truncate pr-8">{workspace.name}{workspace.personal ? ' · Personal' : ''}</span>
              {#if workspace.id === activeWorkspaceId}<Check class="pointer-events-none absolute right-3 size-4 shrink-0" />{/if}
            </Command.Item>
          {/each}
        </Command.Group>
        {#if workspaceError}<div class="px-3 py-2 text-xs text-muted-foreground">{workspaceError}</div>{/if}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
