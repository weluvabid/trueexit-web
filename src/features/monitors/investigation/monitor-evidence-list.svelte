<script lang="ts">
  import * as Table from '@/components/ui/table/index.js';
  import { Button } from '@/components/ui/button/index.js';
  import { Badge } from '@/components/ui/badge/index.js';
  import { Alert, AlertDescription } from '@/components/ui/alert/index.js';
  import { ChevronLeft, ChevronRight, RefreshCw } from '@lucide/svelte';
  import { formatInvestigationDate } from '@/lib/client/investigation-format';
  import type { investigationEvidenceSchema } from '@/lib/client/api-schemas';
  import type * as v from 'valibot';

  type Evidence = v.InferOutput<typeof investigationEvidenceSchema>;
  type EvidenceKind = 'verified' | 'rejected';

  let {
    kind,
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
    kind: EvidenceKind;
    items: Evidence[];
    loading: boolean;
    error: string;
    pageIndex: number;
    hasNext: boolean;
    onRetry: () => void;
    onInspect: (item: Evidence) => void;
    onPrevious: () => void;
    onNext: () => void;
  } = $props();

  const formatDate = formatInvestigationDate;
</script>

{#if loading}
  <p class="text-sm text-muted-foreground" aria-live="polite">Loading {kind === 'verified' ? 'verified' : 'rejected'} evidence…</p>
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
          <Table.Head>Evidence</Table.Head>
          <Table.Head>{kind === 'verified' ? 'Observed' : 'Rejected at'}</Table.Head>
          <Table.Head>Configuration</Table.Head>
          <Table.Head>{kind === 'verified' ? 'Request' : 'Reason'}</Table.Head>
          <Table.Head class="text-right"></Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each items as item (item.id)}
          <Table.Row>
            <Table.Cell>
              <div class="font-medium">{item.id.slice(0, 8)}…</div>
              <Badge variant={kind === 'verified' ? 'secondary' : 'destructive'}>{kind === 'verified' ? 'Verified' : 'Rejected'}</Badge>
            </Table.Cell>
            <Table.Cell>{formatDate(kind === 'verified' ? (item.observed_at ?? item.created_at) : item.created_at)}</Table.Cell>
            <Table.Cell>v{item.config_version}</Table.Cell>
            <Table.Cell>
              {#if kind === 'verified'}
                <code class="text-xs">{item.request_id.slice(0, 8)}…</code>
              {:else}
                <code class="text-xs">{item.reason?.code ?? 'Unknown reason'}</code>
              {/if}
            </Table.Cell>
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
  <p class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
    {kind === 'verified' ? 'No verified evidence records were returned for this monitor.' : 'No rejected evidence records were returned for this monitor.'}
  </p>
{/if}
