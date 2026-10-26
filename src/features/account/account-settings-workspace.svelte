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
  <header class="settings-intro">
    <div>
      <p class="eyebrow"><span class="eyebrow__dash"></span>YOUR ACCOUNT</p>
      <h1>Your account, <span>your terms.</span></h1>
      <p class="settings-intro__copy">Manage your personal profile and account-level actions. Workspace access stays with Workspace Settings.</p>
    </div>
  </header>

  <div class="settings-layout">
    <AccountSettingsNavigation bind:section />
    <div class="settings-content">
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
