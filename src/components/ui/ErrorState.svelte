<script lang="ts">
  export let title = 'Something went wrong';
  export let message: string;
  export let retry: (() => void | Promise<void>) | undefined = undefined;
  export let retryLabel = 'Try again';
  export let retrying = false;
</script>

<section class="error-state" role="alert" aria-live="assertive" aria-atomic="true">
  <span class="error-state__mark" aria-hidden="true">!</span>
  <div class="error-state__content">
    <h3>{title}</h3>
    <p>{message}</p>
    {#if retry}
      <button class="error-state__retry" type="button" on:click={retry} disabled={retrying}>
        {#if retrying}<span class="error-state__spinner" aria-hidden="true"></span>{/if}
        {retrying ? 'Trying again…' : retryLabel}
      </button>
    {/if}
  </div>
</section>

<style>
  .error-state { display: flex; min-height: 112px; align-items: flex-start; gap: 13px; padding: 22px; border: 1px solid color-mix(in srgb, var(--color-error, #b54755) 22%, var(--color-border)); border-radius: 17px; background: color-mix(in srgb, var(--color-error, #b54755) 4%, var(--color-surface)); color: var(--color-text); }
  .error-state__mark { display: grid; width: 25px; height: 25px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--color-error, #b54755) 12%, var(--color-surface)); color: var(--color-error, #b54755); font-size: 13px; font-weight: 800; }
  .error-state__content { display: grid; min-width: 0; gap: 7px; }
  h3 { margin: 1px 0 0; font-size: 13px; font-weight: 700; }
  p { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.7; }
  .error-state__retry { display: inline-flex; width: fit-content; min-height: 34px; align-items: center; gap: 8px; margin-top: 3px; padding: 0 12px; border: 1px solid var(--color-border); border-radius: 9px; background: var(--color-surface); color: var(--color-text); font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }
  .error-state__retry:hover:not(:disabled) { border-color: color-mix(in srgb, var(--color-accent) 42%, var(--color-border)); }
  .error-state__retry:disabled { cursor: wait; opacity: .7; }
  .error-state__spinner { width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: error-state-spin 700ms linear infinite; }
  @keyframes error-state-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .error-state__spinner { animation-duration: 1.8s; } }
</style>
