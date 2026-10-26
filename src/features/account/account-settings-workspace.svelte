<svelte:options runes={true} />
<script lang="ts">
  import { onMount } from 'svelte';
  import AccountSettingsNavigation from '@/features/account/account-settings-navigation.svelte';
  import ProfileSection from '@/features/account/profile/profile-section.svelte';
  import BillingSection from '@/features/account/billing/billing-section.svelte';
  import AccountSection from '@/features/account/account/account-section.svelte';

  type Section = 'profile' | 'account' | 'billing';
  let section = $state<Section>('profile');
  let sectionUrlReady = $state(false);
  let suppressSectionUrlWrite = false;

  const accountSections = ['profile', 'account', 'billing'] as const;

  function sectionFromUrl(): Section {
    const value = new URL(window.location.href).searchParams.get('section');
    return accountSections.includes(value as Section) ? value as Section : 'profile';
  }

  function handleSectionPopState() {
    suppressSectionUrlWrite = true;
    section = sectionFromUrl();
    queueMicrotask(() => { suppressSectionUrlWrite = false; });
  }

  $effect(() => {
    const selectedSection = section;
    if (!sectionUrlReady || suppressSectionUrlWrite || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('section') === selectedSection) return;
    url.searchParams.set('section', selectedSection);
    window.history.pushState({}, '', url);
  });

  onMount(() => {
    section = sectionFromUrl();
    sectionUrlReady = true;
    window.addEventListener('popstate', handleSectionPopState);
    return () => window.removeEventListener('popstate', handleSectionPopState);
  });
</script>

<svelte:head>
  <title>Account Settings · TrueExit</title>
  <meta name="description" content="Manage your TrueExit profile, account lifecycle, and billing." />
</svelte:head>

<section class="settings-workspace mx-auto w-full max-w-[60rem] px-4 sm:px-6">
  <div class="settings-layout">
    <div class="sticky top-20 z-40 rounded-xl border border-border/60 bg-background/80 shadow-sm shadow-foreground/5 backdrop-blur-md">
      <AccountSettingsNavigation bind:section />
    </div>
    <div class="settings-content mt-6">
      {#if section === 'profile'}
        <ProfileSection />
      {:else if section === 'account'}
        <AccountSection />
      {:else if section === 'billing'}
        <BillingSection />
      {/if}
    </div>
  </div>
</section>
