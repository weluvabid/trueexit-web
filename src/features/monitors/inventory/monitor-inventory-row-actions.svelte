<svelte:options runes={true} />
<script lang="ts">
  import { Button } from '@/components/ui/button/index.js';
  import {
    ExternalLink, Tags, Pencil, Pause, Play, RotateCcw, Archive
  } from '@lucide/svelte';
  import type { Monitor } from '@/lib/client/monitor-types';

  let {
    monitor,
    workspaceId,
    tagBusy = false,
    creating = false,
    busyMonitorId = '',
    onManageTags,
    onEditMonitor,
    onLifecycleAction,
  }: {
    monitor: Monitor;
    workspaceId: string;
    tagBusy?: boolean;
    creating?: boolean;
    busyMonitorId?: string;
    onManageTags: (monitor: Monitor) => void;
    onEditMonitor: (monitor: Monitor) => void;
    onLifecycleAction: (monitor: Monitor, action: 'pause' | 'resume' | 'archive' | 'restore') => void;
  } = $props();
</script>

<div class="flex items-center justify-end gap-1">
  <Button variant="ghost" size="icon-sm" href={`/monitors/${encodeURIComponent(monitor.id)}?workspace_id=${encodeURIComponent(workspaceId)}`} aria-label={`Investigate ${monitor.name}`} title="Investigate">
    <ExternalLink class="size-4" />
  </Button>
  <Button variant="ghost" size="icon-sm" aria-label={`Manage tags for ${monitor.name}`} title="Manage tags" disabled={tagBusy || creating || !!busyMonitorId} onclick={() => onManageTags(monitor)}>
    <Tags class="size-4" />
  </Button>
  {#if monitor.status !== 'archived'}
    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${monitor.name}`} title="Edit monitor" disabled={!!busyMonitorId || creating} onclick={() => onEditMonitor(monitor)}>
      <Pencil class="size-4" />
    </Button>
  {/if}
  {#if monitor.status === 'enabled'}
    <Button variant="ghost" size="icon-sm" aria-label={`Pause ${monitor.name}`} title="Pause monitor" disabled={!!busyMonitorId} onclick={() => onLifecycleAction(monitor, 'pause')}>
      <Pause class="size-4" />
    </Button>
  {:else if monitor.status === 'disabled'}
    <Button variant="ghost" size="icon-sm" aria-label={`Resume ${monitor.name}`} title="Resume monitor" disabled={!!busyMonitorId} onclick={() => onLifecycleAction(monitor, 'resume')}>
      <Play class="size-4" />
    </Button>
  {:else}
    <Button variant="ghost" size="icon-sm" aria-label={`Restore ${monitor.name}`} title="Restore monitor" disabled={!!busyMonitorId} onclick={() => onLifecycleAction(monitor, 'restore')}>
      <RotateCcw class="size-4" />
    </Button>
  {/if}
  {#if monitor.status !== 'archived'}
    <Button variant="ghost" size="icon-sm" class="text-destructive hover:text-destructive" aria-label={`Archive ${monitor.name}`} title="Archive monitor" disabled={!!busyMonitorId} onclick={() => onLifecycleAction(monitor, 'archive')}>
      <Archive class="size-4" />
    </Button>
  {/if}
</div>
