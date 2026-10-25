<script lang="ts">
  import * as Table from '@/components/ui/table/index.js';
  import { Button } from '@/components/ui/button/index.js';
  import { Badge } from '@/components/ui/badge/index.js';
  import { Alert, AlertDescription } from '@/components/ui/alert/index.js';
  import { ExternalLink, X } from '@lucide/svelte';
  import { formatInvestigationValue, formatInvestigationLabel, getHealthCounts } from '@/lib/client/investigation-format';
  import { getHealthStateTextClass } from '@/lib/client/health-status';
  import { investigationRecordPageSchema } from '@/lib/client/api-schemas';
  import type { InvestigationHealthVersionContract } from '@/lib/client/api-schemas';
  import type * as v from 'valibot';

  type HealthHistory = v.InferOutput<typeof investigationRecordPageSchema>;

  let {
    healthHistory,
    loading,
    error,
    selectedVersion,
    versionLoading,
    versionError,
    onInspect,
    onCloseVersion,
  }: {
    healthHistory: HealthHistory | null;
    loading: boolean;
    error: string;
    selectedVersion: InvestigationHealthVersionContract | null;
    versionLoading: boolean;
    versionError: string;
    onInspect: (version: number) => void;
    onCloseVersion: () => void;
  } = $props();

  const formatValue = formatInvestigationValue;
  const label = formatInvestigationLabel;
  const healthCounts = getHealthCounts;
</script>

<section class="space-y-4" aria-labelledby="history-heading">
  <div class="flex flex-wrap items-end justify-between gap-2">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Configuration epochs</p>
      <h2 id="history-heading" class="mt-1 text-lg font-semibold">Health history</h2>
    </div>
    <p class="text-xs text-muted-foreground">Version history is not a timestamped transition log.</p>
  </div>

  {#if error}
    <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  {:else if loading}
    <p class="rounded-lg border p-4 text-sm text-muted-foreground" aria-live="polite">Loading health history…</p>
  {:else if healthHistory?.data?.length}
    <div class="overflow-hidden rounded-lg border">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Configuration</Table.Head>
            <Table.Head>Snapshot</Table.Head>
            <Table.Head>Health summary</Table.Head>
            <Table.Head class="text-right">Inspect</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each healthHistory.data as version (version.config_version)}
            <Table.Row>
              <Table.Cell class="font-medium">v{version.config_version}</Table.Cell>
              <Table.Cell><Badge variant={version.is_current ? 'default' : 'secondary'}>{version.is_current ? 'Current' : 'Historical'}</Badge></Table.Cell>
              <Table.Cell>
                <div class="flex flex-wrap gap-2">
                  {#each healthCounts(version.health_summary) as [key, value]}
                    <span class="text-xs text-muted-foreground">{label(key)} <strong class={key === 'field_count' ? 'text-foreground' : getHealthStateTextClass(key)}>{formatValue(value)}</strong></span>
                  {/each}
                </div>
              </Table.Cell>
              <Table.Cell class="text-right">
                <Button variant="outline" size="sm" onclick={() => onInspect(version.config_version)}>Inspect <ExternalLink class="size-3.5" /></Button>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {:else}
    <p class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No persisted health history is available.</p>
  {/if}

  {#if versionLoading}
    <p class="text-sm text-muted-foreground" aria-live="polite">Loading selected health version…</p>
  {/if}
  {#if versionError}
    <Alert variant="destructive"><AlertDescription>{versionError}</AlertDescription></Alert>
  {/if}
  {#if selectedVersion}
    <article class="space-y-3 rounded-lg border bg-card p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="font-semibold">Configuration v{selectedVersion.config_version}</h3>
          <p class="mt-1 text-sm text-muted-foreground">{selectedVersion.is_current ? 'Current persisted snapshot' : 'Historical persisted snapshot'} · Cadence {selectedVersion.configuration?.cadence_seconds == null ? 'unavailable' : `${selectedVersion.configuration.cadence_seconds}s`}</p>
        </div>
        <Button variant="ghost" size="sm" onclick={onCloseVersion}><X class="size-4" /> Close</Button>
      </div>
      <details open>
        <summary class="cursor-pointer text-sm font-medium">Configuration and health snapshot</summary>
        <pre class="mt-3 max-h-[32rem] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify({ configuration: selectedVersion.configuration, health: selectedVersion.health }, null, 2)}</pre>
      </details>
    </article>
  {/if}
</section>
