<script lang="ts">
  let { mode, section = $bindable() }: { mode: 'workspace' | 'account'; section: 'workspace' | 'people' | 'destinations' | 'profile' | 'preferences' | 'security' | 'account' } = $props();
</script>

<nav class="settings-tabs" aria-label="Settings sections">
  {#if mode === 'workspace'}
    <button class:active={section === 'workspace'} type="button" onclick={() => section = 'workspace'}><span>01</span> General</button>
    <button class:active={section === 'people'} type="button" onclick={() => section = 'people'}><span>02</span> Members &amp; access</button>
    <button class:active={section === 'destinations'} type="button" onclick={() => section = 'destinations'}><span>03</span> Destinations</button>
  {:else}
    <button class:active={section === 'profile'} type="button" onclick={() => section = 'profile'}><span>01</span> Profile</button>
    <button class:active={section === 'preferences'} type="button" onclick={() => section = 'preferences'}><span>02</span> Preferences</button>
    <button class:active={section === 'security'} type="button" onclick={() => section = 'security'}><span>03</span> Security</button>
    <button class:active={section === 'account'} type="button" onclick={() => section = 'account'}><span>04</span> Account lifecycle</button>
  {/if}
</nav>
