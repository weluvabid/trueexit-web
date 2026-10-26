<svelte:options runes={true} />
<script lang="ts">
  import { createMutation, createQuery } from '@tanstack/svelte-query';
  import { Button } from '@/components/ui/button/index.js';
  import { Check, Pencil } from '@lucide/svelte';
  import * as Tooltip from '@/components/ui/tooltip/index.js';
  import { getSharedQueryClient } from '@/lib/client/query-client';
  import {
    accountSettingsErrorMessage,
    appearancePreferenceQueryOptions,
    profileInitials,
    profileQueryOptions,
    updateAppearancePreferenceMutationOptions,
    updateDisplayNameMutationOptions,
    validateDisplayName,
    type AppearancePreference,
  } from '@/lib/client/account-settings-api';

  const queryClient = getSharedQueryClient();
  const profileQuery = createQuery(() => profileQueryOptions(), () => queryClient);
  const appearanceQuery = createQuery(() => appearancePreferenceQueryOptions(), () => queryClient);
  const displayNameMutation = createMutation(() => updateDisplayNameMutationOptions(queryClient), () => queryClient);
  const appearanceMutation = createMutation(() => updateAppearancePreferenceMutationOptions(queryClient), () => queryClient);

  let editingDisplayName = $state(false);
  let displayNameDraft = $state('');
  let displayNameError = $state('');
  let displayNameNotice = $state('');
  let profileActionError = $state('');
  let avatarFailed = $state(false);

  const profile = $derived(profileQuery.data);
  const appearance = $derived(appearanceQuery.data?.theme ?? 'system');
  const displayNamePending = $derived(displayNameMutation.isPending);
  const appearancePending = $derived(appearanceMutation.isPending);
  const avatarInitials = $derived(profile ? profileInitials(profile) : 'TE');

  function beginDisplayNameEdit() {
    if (!profile) return;
    displayNameDraft = profile.display_name ?? '';
    displayNameError = '';
    displayNameNotice = '';
    editingDisplayName = true;
  }

  function cancelDisplayNameEdit() {
    displayNameDraft = profile?.display_name ?? '';
    displayNameError = '';
    editingDisplayName = false;
  }

  function saveDisplayName(event: SubmitEvent) {
    event.preventDefault();
    const validation = validateDisplayName(displayNameDraft);
    if (!validation.valid) {
      displayNameError = validation.reason === 'required'
        ? 'Display name cannot be empty.'
        : 'Display name must be 200 characters or fewer.';
      return;
    }

    displayNameError = '';
    displayNameNotice = '';
    profileActionError = '';
    displayNameMutation.mutate(validation.value, {
      onSuccess: (result) => {
        displayNameDraft = result.display_name;
        editingDisplayName = false;
        displayNameNotice = 'Display name saved.';
      },
      onError: (error) => {
        displayNameError = accountSettingsErrorMessage(error, 'Could not save your display name. Try again.');
      },
    });
  }

  function selectAppearance(theme: AppearancePreference) {
    if (theme === appearance || appearancePending) return;
    profileActionError = '';
    appearanceMutation.mutate(theme, {
      onError: (error) => {
        profileActionError = accountSettingsErrorMessage(error, 'Could not save your appearance preference. Your previous theme was restored.');
      },
    });
  }
</script>

<Tooltip.Provider>
<div class="space-y-6">
  {#if profileQuery.isPending && !profile}
    <div class="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-8 text-sm text-muted-foreground" role="status" aria-live="polite">
      <span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>
      Loading profile…
    </div>
  {:else if profileQuery.isError && !profile}
    <section class="rounded-xl border border-destructive/30 bg-card p-6" role="alert">
      <h2 class="font-semibold">Your profile couldn’t be loaded</h2>
      <p class="mt-2 text-sm text-muted-foreground">{accountSettingsErrorMessage(profileQuery.error, 'Could not load your profile. Try again.')}</p>
      <Button class="mt-4" variant="outline" onclick={() => void profileQuery.refetch()}>Try again</Button>
    </section>
  {:else if profile}
    <section class="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div class="flex flex-col gap-5 sm:flex-row sm:items-start">
        {#if profile.profile_picture_url && !avatarFailed}
          <img
            src={profile.profile_picture_url}
            alt=""
            referrerpolicy="no-referrer"
            onerror={() => { avatarFailed = true; }}
            class="size-16 shrink-0 rounded-full border border-border object-cover"
          />
        {:else}
          <div class="flex size-16 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-lg font-semibold" aria-hidden="true">{avatarInitials}</div>
        {/if}
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-xl font-semibold tracking-tight">{profile.display_name?.trim() || 'Your profile'}</h2>
            {#if profile.email_verified}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <span {...props} tabindex="0" role="img" aria-label="Email verified" class="inline-flex size-7 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400">
                      <Check class="size-5" strokeWidth={2.5} aria-hidden="true" />
                    </span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content>Email verified</Tooltip.Content>
              </Tooltip.Root>
            {/if}
          </div>
          <p class="mt-1 break-words text-sm text-muted-foreground">{profile.email}</p>
          <p class="mt-3 text-sm text-muted-foreground">Your name and email come from your sign-in provider. Your display name is managed by TrueExit.</p>
        </div>
      </div>
      {#if profileQuery.isFetching}
        <p class="mt-4 text-xs text-muted-foreground" role="status">Refreshing profile…</p>
      {:else if profileQuery.isError}
        <p class="mt-4 text-xs text-muted-foreground" role="status">Your saved profile is shown, but the latest refresh failed.</p>
      {/if}
    </section>

    <section class="rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="personal-information-heading">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Profile</p>
          <h2 id="personal-information-heading" class="mt-1 text-lg font-semibold">Personal information</h2>
          <p class="mt-1 text-sm text-muted-foreground">Identity details are managed by your authentication provider.</p>
        </div>
        <span class="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">WorkOS managed</span>
      </div>

      <dl class="mt-5 grid gap-4 sm:grid-cols-2">
        <div class="min-w-0 cursor-not-allowed rounded-lg bg-muted/40 p-3.5">
          <dt class="text-xs font-medium text-muted-foreground">First name</dt>
          <dd class="mt-1 break-words text-sm font-medium">{profile.first_name?.trim() || 'Not provided'}</dd>
        </div>
        <div class="min-w-0 cursor-not-allowed rounded-lg bg-muted/40 p-3.5">
          <dt class="text-xs font-medium text-muted-foreground">Last name</dt>
          <dd class="mt-1 break-words text-sm font-medium">{profile.last_name?.trim() || 'Not provided'}</dd>
        </div>
        <div class="min-w-0 cursor-not-allowed rounded-lg bg-muted/40 p-3.5 sm:col-span-2">
          <dt class="text-xs font-medium text-muted-foreground">Email address</dt>
          <dd class="mt-1 break-all text-sm font-medium">{profile.email}</dd>
        </div>
      </dl>
    </section>

    <section class="rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="display-name-heading">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">TrueExit profile</p>
          <div class="flex items-center gap-2">
            <h2 id="display-name-heading" class="mt-1 text-lg font-semibold">Display name</h2>
            {#if !editingDisplayName}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <Button {...props} variant="ghost" size="icon" class="size-8" aria-label="Edit display name" onclick={beginDisplayNameEdit}>
                      <Pencil class="size-4" aria-hidden="true" />
                    </Button>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content>Edit display name</Tooltip.Content>
              </Tooltip.Root>
            {/if}
          </div>
          <p class="mt-1 text-sm text-muted-foreground">Choose how your name appears within TrueExit.</p>
        </div>
      </div>

      {#if displayNameNotice}
        <p class="mt-4 text-sm text-emerald-700 dark:text-emerald-400" role="status">{displayNameNotice}</p>
      {/if}
      {#if displayNameError && !editingDisplayName}
        <p class="mt-4 text-sm text-destructive" role="alert">{displayNameError}</p>
      {/if}
      {#if editingDisplayName}
        <form class="mt-4 space-y-3" onsubmit={saveDisplayName}>
          <label for="display-name" class="block text-sm font-medium">Display name</label>
          <input
            id="display-name"
            bind:value={displayNameDraft}
            autocomplete="nickname"
            required
            aria-invalid={Boolean(displayNameError)}
            aria-describedby={displayNameError ? 'display-name-error' : 'display-name-hint'}
            class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            disabled={displayNamePending}
          />
          <p id="display-name-hint" class="text-xs text-muted-foreground">Up to 200 characters. Leading and trailing whitespace is removed when saved.</p>
          {#if displayNameError}<p id="display-name-error" class="text-sm text-destructive" role="alert">{displayNameError}</p>{/if}
          <div class="flex flex-wrap gap-2 pt-1">
            <Button type="submit" disabled={displayNamePending}>{displayNamePending ? 'Saving…' : 'Save changes'}</Button>
            <Button type="button" variant="outline" disabled={displayNamePending} onclick={cancelDisplayNameEdit}>Cancel</Button>
          </div>
        </form>
      {:else}
        <div class="mt-4 rounded-lg bg-muted/40 px-3.5 py-3">
          <p class="text-sm font-medium">{profile.display_name?.trim() || 'No display name set'}</p>
        </div>
      {/if}
    </section>

    <section class="rounded-xl border border-border bg-card p-5 sm:p-6" aria-labelledby="appearance-heading">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Preferences</p>
        <h2 id="appearance-heading" class="mt-1 text-lg font-semibold">Appearance</h2>
        <p class="mt-1 text-sm text-muted-foreground">Choose how TrueExit looks. Your preference is saved to your account.</p>
      </div>

      {#if appearanceQuery.isError}
        <p class="mt-3 text-sm text-muted-foreground" role="status">Could not refresh the saved preference. Your current theme remains available.</p>
      {/if}
      {#if profileActionError}
        <p class="mt-3 text-sm text-destructive" role="alert">{profileActionError}</p>
      {/if}
      <div class="mt-4 grid gap-3 sm:grid-cols-3" role="group" aria-label="Theme preference">
        {#each [{ value: 'system', label: 'System', description: 'Follow your device' }, { value: 'light', label: 'Light', description: 'Use a light appearance' }, { value: 'dark', label: 'Dark', description: 'Use a dark appearance' }] as option (option.value)}
          <button
            type="button"
            aria-pressed={appearance === option.value}
            disabled={appearancePending}
            onclick={() => selectAppearance(option.value as AppearancePreference)}
            class={`rounded-lg border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-wait disabled:opacity-60 ${appearance === option.value ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/50'}`}
          >
            <span class="block text-sm font-medium">{option.label}</span>
            <span class="mt-1 block text-xs text-muted-foreground">{option.description}</span>
          </button>
        {/each}
      </div>
      {#if appearancePending}
        <p class="mt-3 text-xs text-muted-foreground" role="status">Saving appearance preference…</p>
      {/if}
    </section>
  {/if}
</div>
</Tooltip.Provider>
