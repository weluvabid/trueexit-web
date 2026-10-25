<svelte:options runes={true} />
<script lang="ts">
  import * as Table from '@/components/ui/table/index.js';
  import { Badge } from '@/components/ui/badge/index.js';
  import type { Monitor } from '@/lib/client/monitor-types';
  import { formatMonitorCadence, formatMonitorDate } from '@/lib/client/monitor-format';
  import MonitorInventoryRowActions from '@/features/monitors/inventory/monitor-inventory-row-actions.svelte';

  let {
    monitors = [],
    workspaceId,
    loadingMonitors = false,
    tagBusy = false,
    creating = false,
    busyMonitorId = '',
    onManageTags,
    onEditMonitor,
    onLifecycleAction,
  }: {
    monitors?: Monitor[];
    workspaceId: string;
    loadingMonitors?: boolean;
    tagBusy?: boolean;
    creating?: boolean;
    busyMonitorId?: string;
    onManageTags: (monitor: Monitor) => void;
    onEditMonitor: (monitor: Monitor) => void;
    onLifecycleAction: (monitor: Monitor, action: 'pause' | 'resume' | 'archive' | 'restore') => void;
  } = $props();
</script>

        <div class="overflow-hidden rounded-lg border" aria-busy={loadingMonitors}>
          <Table.Root class="min-w-6xl">
            <Table.Caption>Monitor inventory and lifecycle controls.</Table.Caption>
            <Table.Header>
              <Table.Row class="bg-muted/50 hover:bg-muted/50">
                <Table.Head class="w-[28%]">Monitor</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Cadence</Table.Head>
                <Table.Head>Configuration</Table.Head>
                <Table.Head>Last updated</Table.Head>
                <Table.Head class="text-right">Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each monitors as monitor (monitor.id)}
                <Table.Row>
                  <Table.Cell class="max-w-[24rem] whitespace-normal">
                    <div class="min-w-0 space-y-1">
                      <a class="font-medium underline-offset-4 hover:underline" href={`/monitors/${encodeURIComponent(monitor.id)}?workspace_id=${encodeURIComponent(workspaceId)}`}>{monitor.name}</a>
                      <p class="line-clamp-2 text-xs text-muted-foreground">{monitor.description || 'No description added yet.'}</p>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge variant={monitor.status === 'enabled' ? 'default' : 'secondary'} class="capitalize">{monitor.status}</Badge>
                  </Table.Cell>
                  <Table.Cell>{formatMonitorCadence(monitor.cadence_seconds)}</Table.Cell>
                  <Table.Cell>v{monitor.current_config_version}</Table.Cell>
                  <Table.Cell>{formatMonitorDate(monitor.updated_at)}</Table.Cell>
                  <Table.Cell>
                    <MonitorInventoryRowActions
                      {monitor}
                      {workspaceId}
                      {tagBusy}
                      {creating}
                      {busyMonitorId}
                      {onManageTags}
                      {onEditMonitor}
                      {onLifecycleAction}
                    />
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>