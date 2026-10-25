<script lang="ts">
  import { Alert, AlertDescription } from '@/components/ui/alert/index.js';
  import { Badge } from '@/components/ui/badge/index.js';
  import { Separator } from '@/components/ui/separator/index.js';
  import { formatInvestigationValue } from '@/lib/client/investigation-format';
  import { getHealthStateClasses, getHealthStateLabel } from '@/lib/client/health-status';
  import { investigationHealthSchema } from '@/lib/client/api-schemas';
  import type * as v from 'valibot';

  type Health = v.InferOutput<typeof investigationHealthSchema>;

  let {
    health,
    loading,
    error,
  }: {
    health: Health | null;
    loading: boolean;
    error: string;
  } = $props();
</script>

<section class="space-y-4" aria-labelledby="health-heading">
  <div class="flex flex-wrap items-end justify-between gap-2">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Persisted reasoning state</p>
      <h2 id="health-heading" class="mt-1 text-lg font-semibold">Field health</h2>
    </div>
    <p class="text-xs text-muted-foreground">Field-level signals, not a monitor-wide verdict.</p>
  </div>

  {#if loading}
    <p class="rounded-lg border p-4 text-sm text-muted-foreground" aria-live="polite">Loading current health…</p>
  {:else if error}
    <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  {:else if health && Object.keys(health.health?.fields ?? {}).length}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {#each Object.entries(health.health?.fields ?? {}) as [fieldName, fieldState] (fieldName)}
        <article class="rounded-lg border bg-card p-4">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <h3 class="break-words font-medium">{fieldName}</h3>
            <Badge variant="outline" class={getHealthStateClasses(fieldState.state)}>{getHealthStateLabel(fieldState.state)}</Badge>
          </div>
          <Separator class="my-4" />
          <dl class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt class="text-xs text-muted-foreground">Consecutive anomalies</dt>
              <dd class="mt-1 font-medium">{formatInvestigationValue(fieldState.consecutive_anomalies)}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">Consecutive healthy</dt>
              <dd class="mt-1 font-medium">{formatInvestigationValue(fieldState.consecutive_healthy)}</dd>
            </div>
          </dl>
        </article>
      {/each}
    </div>
  {:else if health}
    <p class="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No field-level health snapshot is currently available for this monitor.</p>
  {/if}

  {#if health && (health.health?.checkpoints || health.health?.adopted_baselines)}
    <details class="rounded-lg border p-4">
      <summary class="cursor-pointer text-sm font-medium">Checkpoint and adopted baseline state</summary>
      <pre class="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify({ checkpoints: health.health?.checkpoints ?? [], adopted_baselines: health.health?.adopted_baselines ?? {} }, null, 2)}</pre>
    </details>
  {/if}
</section>
