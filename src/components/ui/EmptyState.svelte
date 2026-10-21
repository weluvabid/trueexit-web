<script lang="ts">
  let {
    title,
    description,
    children,
    class: className = ''
  }: {
    title: string;
    description?: string;
    children?: import('svelte').Snippet;
    class?: string;
  } = $props();
</script>

<section class={`te-empty-state${className ? ` ${className}` : ''}`} aria-label={title}>
  <div class="te-empty-state__mark" aria-hidden="true">↗</div>
  <h3 class="te-empty-state__title">{title}</h3>
  {#if description}<p class="te-empty-state__description">{description}</p>{/if}
  {#if children}
    <div class="te-empty-state__actions">{@render children()}</div>
  {/if}
</section>
