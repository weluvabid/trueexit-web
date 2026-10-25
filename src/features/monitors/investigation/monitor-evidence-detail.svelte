<script lang="ts">
  import { Button } from '@/components/ui/button/index.js';
  import { Alert, AlertDescription } from '@/components/ui/alert/index.js';
  import { Database, X } from '@lucide/svelte';
  import { formatInvestigationDate, formatInvestigationValue } from '@/lib/client/investigation-format';
  import type { investigationEvidenceSchema } from '@/lib/client/api-schemas';
  import type * as v from 'valibot';

  type Evidence = v.InferOutput<typeof investigationEvidenceSchema>;
  type SelectedEvidence = {
    kind: 'verified' | 'rejected';
    id: string;
    detail: Evidence & { trace_available?: boolean };
  };
  type JsonObject = Record<string, unknown>;

  let {
    selectedEvidence,
    traceLoading,
    traceError,
    selectedTrace,
    onClose,
    onLoadTrace,
  }: {
    selectedEvidence: SelectedEvidence | null;
    traceLoading: boolean;
    traceError: string;
    selectedTrace: JsonObject | null;
    onClose: () => void;
    onLoadTrace: () => void;
  } = $props();

  const formatDate = formatInvestigationDate;
  const formatValue = formatInvestigationValue;
</script>

{#if selectedEvidence}
  <article class="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{selectedEvidence.kind === 'rejected' ? 'Rejected evidence' : 'Verified evidence'}</p>
        <h3 class="mt-1 font-semibold">Evidence record</h3>
      </div>
      <Button variant="ghost" size="sm" onclick={onClose}><X class="size-4" /> Close</Button>
    </div>
    <dl class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div><dt class="text-xs text-muted-foreground">Evidence ID</dt><dd class="mt-1 break-all text-sm"><code>{selectedEvidence.detail.id ?? selectedEvidence.id}</code></dd></div>
      <div><dt class="text-xs text-muted-foreground">Request ID</dt><dd class="mt-1 break-all text-sm"><code>{formatValue(selectedEvidence.detail.request_id)}</code></dd></div>
      <div><dt class="text-xs text-muted-foreground">Configuration</dt><dd class="mt-1 text-sm">v{formatValue(selectedEvidence.detail.config_version)}</dd></div>
      <div><dt class="text-xs text-muted-foreground">{selectedEvidence.kind === 'rejected' ? 'Recorded at' : 'Observed at'}</dt><dd class="mt-1 text-sm">{formatDate(selectedEvidence.detail.observed_at ?? selectedEvidence.detail.created_at)}</dd></div>
      {#if selectedEvidence.kind === 'rejected'}
        <div><dt class="text-xs text-muted-foreground">Rejection reason</dt><dd class="mt-1 text-sm"><code>{formatValue(selectedEvidence.detail.reason?.code)}</code></dd></div>
        <div class="sm:col-span-2"><dt class="text-xs text-muted-foreground">Reason parameters</dt><dd class="mt-1"><pre class="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(selectedEvidence.detail.reason?.params ?? null, null, 2)}</pre></dd></div>
      {:else}
        <div class="sm:col-span-2 xl:col-span-3"><dt class="text-xs text-muted-foreground">Verified fields</dt><dd class="mt-1"><pre class="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(selectedEvidence.detail.fields ?? {}, null, 2)}</pre></dd></div>
      {/if}
    </dl>
    {#if selectedEvidence.detail.trace_available === true}
      <div class="space-y-2">
        <Button onclick={onLoadTrace} disabled={traceLoading}><Database class="size-4" />{traceLoading ? 'Loading trace…' : selectedTrace ? 'Refresh trace' : 'Load submitted trace'}</Button>
        <p class="text-xs text-muted-foreground">The original payload is fetched only on request when the API reports that a trace is available.</p>
      </div>
    {:else}
      <p class="text-sm text-muted-foreground">The API reports that a trace is unavailable for this record.</p>
    {/if}
    {#if traceError}<Alert variant="destructive"><AlertDescription>{traceError}</AlertDescription></Alert>{/if}
    {#if selectedTrace}<details open><summary class="cursor-pointer text-sm font-medium">Trace payload and metadata</summary><pre class="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(selectedTrace, null, 2)}</pre></details>{/if}
  </article>
{/if}
