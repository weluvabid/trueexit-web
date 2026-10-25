<script lang="ts">
  import { Button } from '../../ui/button/index.js';
  import { Sun, Moon } from '@lucide/svelte';
  let { isDark, onToggle }: { isDark: boolean; onToggle: () => void } = $props();
</script>

<Button
  variant="ghost"
  size="icon"
  class="icon-button theme-toggle"
  onclick={onToggle}
  aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
  title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
>
  {#if isDark}<Sun class="size-5" />{:else}<Moon class="size-5" />{/if}
</Button>
