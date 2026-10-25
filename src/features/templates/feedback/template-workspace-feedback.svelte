<script lang="ts">
  let {
    bootError,
    notice,
    formError,
    formOpen,
    onRetryBootstrap,
    onDismissNotice,
  }: {
    bootError: string;
    notice: string;
    formError: string;
    formOpen: boolean;
    onRetryBootstrap: () => void;
    onDismissNotice: () => void;
  } = $props();
</script>

{#if bootError}
  <div class="template-alert" role="alert">
    {bootError}
    <button type="button" onclick={onRetryBootstrap}>Try again</button>
  </div>
{/if}

{#if notice}
  <div class="template-notice" role="status">
    {notice}
    <button type="button" aria-label="Dismiss message" onclick={onDismissNotice}>×</button>
  </div>
{/if}

{#if formError && !formOpen}
  <div class="template-alert" role="alert">{formError}</div>
{/if}
