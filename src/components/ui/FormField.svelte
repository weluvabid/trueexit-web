<script lang="ts">
  let {
    id,
    label,
    hint,
    error,
    required = false,
    class: className = '',
    children
  }: {
    id: string;
    label: string;
    hint?: string;
    error?: string;
    required?: boolean;
    class?: string;
    children: import('svelte').Snippet;
  } = $props();

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
</script>

<div class={`te-form-field${error ? ' te-form-field--invalid' : ''}${className ? ` ${className}` : ''}`}>
  <label class="te-form-field__label" for={id}>
    {label}
    {#if required}<span class="te-form-field__required" aria-hidden="true">*</span>{/if}
  </label>
  {@render children()}
  {#if hint && !error}
    <p class="te-form-field__hint" id={hintId}>{hint}</p>
  {/if}
  {#if error}
    <p class="te-form-field__error" id={errorId} role="alert">{error}</p>
  {/if}
</div>
