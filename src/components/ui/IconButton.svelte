<svelte:options runes={true} />
<script lang="ts">
  let {
    label,
    title = label,
    disabled = false,
    pressed,
    class: className = '',
    children,
    ...rest
  }: {
    label: string;
    title?: string;
    disabled?: boolean;
    pressed?: boolean;
    class?: string;
    children: import('svelte').Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<button
  {...rest}
  type="button"
  class={`te-icon-button${className ? ` ${className}` : ''}`}
  aria-label={label}
  {title}
  aria-pressed={pressed}
  {disabled}
>
  {@render children()}
</button>
