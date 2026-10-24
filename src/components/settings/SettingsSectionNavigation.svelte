<svelte:options runes={true} />
<script lang="ts">
  import * as Tabs from '../ui/tabs/index.js';

  let { mode, section = $bindable() }: { mode: 'workspace' | 'account'; section: 'workspace' | 'people' | 'destinations' | 'profile' | 'preferences' | 'security' | 'account' } = $props();

  const workspaceSections = [
    { value: 'workspace', number: '01', label: 'General' },
    { value: 'people', number: '02', label: 'Members & access' },
    { value: 'destinations', number: '03', label: 'Destinations' },
  ] as const;
  const accountSections = [
    { value: 'profile', number: '01', label: 'Profile' },
    { value: 'preferences', number: '02', label: 'Preferences' },
    { value: 'security', number: '03', label: 'Security' },
    { value: 'account', number: '04', label: 'Account lifecycle' },
  ] as const;

  const activeSections = $derived(mode === 'workspace' ? workspaceSections : accountSections);
</script>

<Tabs.Root
  bind:value={section}
  class="w-full"
>
  <Tabs.List class="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
    {#each activeSections as item (item.value)}
      <Tabs.Trigger value={item.value} class="gap-2 px-3 py-2 text-sm">
        <span class="text-xs text-muted-foreground">{item.number}</span>
        {item.label}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>
</Tabs.Root>
