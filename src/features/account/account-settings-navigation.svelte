<svelte:options runes={true} />
<script lang="ts">
  import * as Tabs from '@/components/ui/tabs/index.js';

  type Section = 'profile' | 'account' | 'billing';
  let { section = $bindable() }: { section: Section } = $props();

  const sections = [
    { value: 'profile', number: '01', label: 'Profile' },
    { value: 'account', number: '02', label: 'Account' },
    { value: 'billing', number: '03', label: 'Billing' },
  ] as const;
</script>

<Tabs.Root bind:value={section} class="w-full">
  <Tabs.List class="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
    {#each sections as item (item.value)}
      <Tabs.Trigger value={item.value} class="gap-2 px-3 py-2 text-sm">
        <span class="text-xs text-muted-foreground">{item.number}</span>
        {item.label}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>
</Tabs.Root>
