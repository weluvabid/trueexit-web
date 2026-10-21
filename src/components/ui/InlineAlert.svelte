<script lang="ts">
  type Tone = 'info' | 'success' | 'warning' | 'danger';
  let {
    tone = 'info',
    title,
    children,
    dismissible = false,
    onDismiss
  }: {
    tone?: Tone;
    title?: string;
    children: import('svelte').Snippet;
    dismissible?: boolean;
    onDismiss?: () => void;
  } = $props();
</script>

<div class={`te-inline-alert te-inline-alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
  <span class="te-inline-alert__marker" aria-hidden="true"></span>
  <div class="te-inline-alert__content">
    {#if title}<strong class="te-inline-alert__title">{title}</strong>{/if}
    <div>{@render children()}</div>
  </div>
  {#if dismissible}
    <button class="te-inline-alert__dismiss" type="button" aria-label="Dismiss message" onclick={onDismiss}>×</button>
  {/if}
</div>
