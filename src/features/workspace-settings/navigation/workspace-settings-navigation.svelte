<svelte:options runes={true} />
<script lang="ts">
  import * as Tabs from '../../../components/ui/tabs/index.js';

  let { section = $bindable() }: { section: 'workspace' | 'people' | 'destinations' | 'profile' | 'preferences' | 'account' | 'billing' } = $props();

  const sections = [
    { value: 'workspace', number: '01', label: 'General' },
    { value: 'people', number: '02', label: 'Members & access' },
    { value: 'destinations', number: '03', label: 'Destinations' },
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
