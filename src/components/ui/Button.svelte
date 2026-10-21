<script lang="ts">
  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type Size = 'sm' | 'md' | 'lg';

  let {
    variant = 'secondary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    fullWidth = false,
    class: className = '',
    children,
    ...rest
  }: {
    variant?: Variant;
    size?: Size;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    class?: string;
    children: import('svelte').Snippet;
    [key: string]: unknown;
  } = $props();
</script>

<button
  {...rest}
  class={`te-button te-button--${variant} te-button--${size}${fullWidth ? ' te-button--full' : ''}${className ? ` ${className}` : ''}`}
  {type}
  disabled={disabled || loading}
  aria-busy={loading ? 'true' : undefined}
>
  {#if loading}<span class="te-button__spinner" aria-hidden="true"></span>{/if}
  {@render children()}
</button>
