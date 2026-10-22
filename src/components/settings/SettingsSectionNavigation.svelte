<script lang="ts">
  export let mode: 'workspace' | 'account';
  export let section: 'workspace' | 'people' | 'destinations' | 'profile' | 'preferences' | 'security' | 'account';
</script>

<nav class="settings-tabs" aria-label="Settings sections">
  {#if mode === 'workspace'}
    <button class:active={section === 'workspace'} type="button" on:click={() => section = 'workspace'}><span>01</span> General</button>
    <button class:active={section === 'people'} type="button" on:click={() => section = 'people'}><span>02</span> Members &amp; access</button>
    <button class:active={section === 'destinations'} type="button" on:click={() => section = 'destinations'}><span>03</span> Destinations</button>
  {:else}
    <button class:active={section === 'profile'} type="button" on:click={() => section = 'profile'}><span>01</span> Profile</button>
    <button class:active={section === 'preferences'} type="button" on:click={() => section = 'preferences'}><span>02</span> Preferences</button>
    <button class:active={section === 'security'} type="button" on:click={() => section = 'security'}><span>03</span> Security</button>
    <button class:active={section === 'account'} type="button" on:click={() => section = 'account'}><span>04</span> Account lifecycle</button>
  {/if}
</nav>
