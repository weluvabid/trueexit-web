<script lang="ts">
  import { Button } from '@/components/ui/button/index.js';
  import { X } from '@lucide/svelte';
  import type { InvestigationDeliveryContract } from '@/lib/client/api-schemas';

  type Delivery = InvestigationDeliveryContract;

  let {
    selectedDelivery,
    onClose,
  }: {
    selectedDelivery: Delivery | null;
    onClose: () => void;
  } = $props();
</script>

{#if selectedDelivery}
  <article class="space-y-3 rounded-lg border bg-card p-4 sm:p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div><p class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Read-only delivery inspection</p><h3 class="mt-1 font-semibold">Delivery record</h3></div>
      <Button variant="ghost" size="sm" onclick={onClose}><X class="size-4" /> Close</Button>
    </div>
    <p class="text-sm text-muted-foreground">Delivery status is derived from persisted per-channel state. Manual retry is not available here.</p>
    <details open><summary class="cursor-pointer text-sm font-medium">Delivery snapshot and bounded diagnostics</summary><pre class="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(selectedDelivery, null, 2)}</pre></details>
  </article>
{/if}
