<script lang="ts">
  type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  let {
    tone = 'neutral',
    children,
    class: className = ''
  }: {
    tone?: Tone;
    children: import('svelte').Snippet;
    class?: string;
  } = $props();
</script>

<span class={`te-status-badge te-status-badge--${tone}${className ? ` ${className}` : ''}`}>
  <span class="te-status-badge__dot" aria-hidden="true"></span>
  {@render children()}
</span>
