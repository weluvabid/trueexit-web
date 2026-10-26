<svelte:options runes={true} />
<script lang="ts">
  import * as Tabs from '@/components/ui/tabs/index.js';

  type Section = 'profile' | 'account' | 'billing';
  let { section = $bindable() }: { section: Section } = $props();

  const sections = [
    { value: 'profile', label: 'Profile' },
    { value: 'account', label: 'Account' },
    { value: 'billing', label: 'Billing' },
  ] as const;
</script>

<Tabs.Root bind:value={section} class="w-full">
  <Tabs.List class="flex h-auto w-full max-w-full flex-nowrap items-center justify-start gap-1 overflow-x-auto overflow-y-hidden bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {#each sections as item (item.value)}
      <Tabs.Trigger value={item.value}>
        {item.label}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>
</Tabs.Root>
