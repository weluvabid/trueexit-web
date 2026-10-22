<script lang="ts">
  let {
    label = 'Loading…',
    compact = false
  }: {
    label?: string;
    compact?: boolean;
  } = $props();
</script>

<div class:loading-state--compact={compact} class="loading-state" role="status" aria-live="polite" aria-atomic="true">
  <span class="loading-state__spinner" aria-hidden="true"></span>
  <span>{label}</span>
</div>

<style>
  .loading-state { display: flex; min-height: 112px; align-items: center; justify-content: center; gap: 11px; padding: 24px; border: 1px solid var(--color-border); border-radius: 17px; background: var(--color-surface); color: var(--color-text-secondary); font-size: 12px; }
  .loading-state--compact { min-height: 0; justify-content: flex-start; padding: 0; border: 0; border-radius: 0; background: transparent; }
  .loading-state__spinner { width: 16px; height: 16px; flex: 0 0 auto; border: 2px solid color-mix(in srgb, var(--color-accent) 18%, var(--color-border)); border-top-color: var(--color-accent); border-radius: 50%; animation: loading-state-spin 750ms linear infinite; }
  @keyframes loading-state-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .loading-state__spinner { animation-duration: 1.8s; } }
</style>
