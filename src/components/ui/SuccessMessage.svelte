<script lang="ts">
  let {
    message,
    title,
    dismissible = false,
    onDismiss
  }: {
    message: string;
    title?: string;
    dismissible?: boolean;
    onDismiss?: () => void;
  } = $props();
</script>

<div class="success-message" role="status" aria-live="polite" aria-atomic="true">
  <span class="success-message__mark" aria-hidden="true">✓</span>
  <div class="success-message__copy">
    {#if title}<strong>{title}</strong>{/if}
    <span>{message}</span>
  </div>
  {#if dismissible}
    <button type="button" class="success-message__dismiss" aria-label="Dismiss success message" onclick={() => onDismiss?.()}>×</button>
  {/if}
</div>

<style>
  .success-message { display: flex; align-items: flex-start; gap: 11px; padding: 13px 15px; border: 1px solid color-mix(in srgb, var(--color-success, #268365) 23%, var(--color-border)); border-radius: 12px; background: color-mix(in srgb, var(--color-success, #268365) 6%, var(--color-surface)); color: var(--color-text); }
  .success-message__mark { display: grid; width: 22px; height: 22px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--color-success, #268365) 13%, var(--color-surface)); color: var(--color-success, #268365); font-size: 12px; font-weight: 800; }
  .success-message__copy { display: grid; gap: 3px; padding-top: 2px; color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
  .success-message__copy strong { color: var(--color-text); font-size: 12px; font-weight: 700; }
  .success-message__dismiss { display: grid; width: 27px; height: 27px; flex: 0 0 auto; place-items: center; margin: -3px -4px -3px auto; border: 0; border-radius: 7px; background: transparent; color: var(--color-text-muted); font-size: 19px; cursor: pointer; }
  .success-message__dismiss:hover { background: var(--color-surface-secondary); color: var(--color-text); }
</style>
