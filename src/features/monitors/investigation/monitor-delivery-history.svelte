<script lang="ts">
  import * as Table from '@/components/ui/table/index.js';
  import { Button } from '@/components/ui/button/index.js';
  import { Badge } from '@/components/ui/badge/index.js';
  import { Alert, AlertDescription } from '@/components/ui/alert/index.js';
  import { ChevronLeft, ChevronRight, RefreshCw } from '@lucide/svelte';
  import { formatInvestigationDate, formatInvestigationLabel } from '@/lib/client/investigation-format';
  import { getDeliveryStatusClasses } from '@/lib/client/delivery-status';
  import type { investigationDeliverySchema } from '@/lib/client/api-schemas';
  import type * as v from 'valibot';

  type Delivery = v.InferOutput<typeof investigationDeliverySchema>;

  let {
    items,
    loading,
    error,
    pageIndex,
    hasNext,
    onRetry,
    onInspect,
    onPrevious,
    onNext,
  }: {
    items: Delivery[];
    loading: boolean;
    error: string;
    pageIndex: number;
    hasNext: boolean;
    onRetry: () => void;
    onInspect: (item: Delivery) => void;
    onPrevious: () => void;
    onNext: () => void;
  } = $props();

  const formatDate = formatInvestigationDate;
  const label = formatInvestigationLabel;
</script>

{#if loading}
  <p class="text-sm text-muted-foreground" aria-live="polite">Loading delivery history…</p>
{:else if error}
  <Alert variant="destructive">
    <AlertDescription>{error}</AlertDescription>
    <Button variant="outline" size="sm" class="mt-2 w-fit" onclick={onRetry}><RefreshCw class="size-4" /> Retry</Button>
  </Alert>
{:else if items.length}
  <div class="overflow-hidden rounded-lg border">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>Request</Table.Head>
          <Table.Head>Evidence outcome</Table.Head>
          <Table.Head>Delivery status</Table.Head>
          <Table.Head>Recorded</Table.Head>
          <Table.Head class="text-right"></Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each items as item (item.request_id)}
          <Table.Row>
            <Table.Cell><code class="text-xs">{item.request_id.slice(0, 8)}…</code></Table.Cell>
            <Table.Cell>{label(item.evidence_outcome)}</Table.Cell>
            <Table.Cell><Badge variant="outline" class={getDeliveryStatusClasses(item.status ?? item.summary?.status)}>{label(item.status ?? item.summary?.status)}</Badge></Table.Cell>
            <Table.Cell>{formatDate(item.created_at ?? item.updated_at)}</Table.Cell>
            <Table.Cell class="text-right"><Button variant="outline" size="sm" onclick={() => onInspect(item)}>Inspect</Button></Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-muted-foreground">Page {pageIndex + 1}</p>
    <div class="flex gap-2">
      <Button variant="outline" size="sm" onclick={onPrevious} disabled={pageIndex === 0 || loading}><ChevronLeft class="size-4" /> Previous</Button>
      <Button variant="outline" size="sm" onclick={onNext} disabled={!hasNext || loading}>Next <ChevronRight class="size-4" /></Button>
    </div>
  </div>
{:else}
  <p class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No persisted delivery records were returned. This does not imply provider delivery is enabled or disabled.</p>
{/if}
