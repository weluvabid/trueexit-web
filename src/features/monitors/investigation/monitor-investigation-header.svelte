<script lang="ts">
  import { Badge } from '@/components/ui/badge/index.js';
  import { formatInvestigationDate, formatInvestigationLabel } from '@/lib/client/investigation-format';
  import type { InvestigationMonitorContract } from '@/lib/client/api-schemas';

  let { monitor }: { monitor: InvestigationMonitorContract } = $props();
</script>

<header class="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-5 sm:p-6">
  <div class="min-w-0 space-y-2">
    <p class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Monitor investigation · Configuration v{monitor.current_config_version ?? '—'}</p>
    <h1 class="break-words text-2xl font-semibold tracking-tight">{monitor.name}</h1>
    <p class="max-w-3xl text-sm text-muted-foreground">{monitor.description || 'No description added.'}</p>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <Badge variant={monitor.status === 'enabled' ? 'default' : 'secondary'} class="capitalize">{formatInvestigationLabel(monitor.status)}</Badge>
    <Badge variant="outline">Cadence: {monitor.cadence_seconds ? `${monitor.cadence_seconds}s` : 'Unavailable'}</Badge>
    <span class="text-xs text-muted-foreground">Updated {formatInvestigationDate(monitor.updated_at)}</span>
  </div>
</header>
