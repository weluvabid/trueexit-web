<svelte:options runes={true} />
<script lang="ts">
  import * as v from 'valibot';
  import { ApiClientError } from '@/lib/client/api-client';
  import { parseApiBody, settingsAccountCreateSchema, settingsAccountLifecycleSchema, settingsAcknowledgementSchema, settingsAccountSchema } from '@/lib/client/api-schemas';
  import type { SettingsAccountContract } from '@/lib/client/api-schemas';
  import { onMount } from 'svelte';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '@/lib/client/workspace-bootstrap';
  import { getCachedSettingsResponse, getSettingsErrorCode, listSettingsData, requestSettingsApi, settingsErrorMessage } from '@/lib/client/settings-api';
  import { formatDateTime } from '@/lib/client/date-format';
  import { readActiveWorkspaceId, resolveAndPersistWorkspaceId } from '@/lib/client/workspace-preference';
  import AccountSettingsNavigation from '@/features/account/navigation/account-settings-navigation.svelte';
  import ProfileSection from '@/features/account/profile/profile-section.svelte';
  import BillingSection from '@/features/account/billing/billing-section.svelte';
  import PreferencesSection from '@/features/account/preferences/preferences-section.svelte';
  import AccountSection from '@/features/account/account-lifecycle/account-section.svelte';




  type Account = SettingsAccountContract;
  let workspaces = $state<WorkspaceContext[]>([]);
  let selectedWorkspaceId = $state('');

  let accounts = $state<Account[]>([]);
  let loading = $state(true);
  let error = $state('');
  let notice = $state('');
  let section = $state<'profile' | 'preferences' | 'account' | 'billing'>('profile');
  let busyKey = $state('');
  // Form state is grouped by workflow so unrelated fields do not share one flat namespace.
  let accountForm = $state({ newOwnerUserId: '', closureConfirm: false, createAccountName: '' });
  let settingsUi = $state({ appearancePreference: 'system', showCreateAccount: false });
  let loadGeneration = 0;
  let sectionUrlReady = $state(false);
  let suppressSectionUrlWrite = false;

  const accountSections = ['profile', 'preferences', 'account', 'billing'] as const;

  function sectionFromUrl(): typeof section {
    const value = new URL(window.location.href).searchParams.get('section');
    return accountSections.includes(value as typeof accountSections[number])
      ? value as typeof section
      : 'profile';
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

  const selectedWorkspace = $derived(workspaces.find((item) => item.id === selectedWorkspaceId) ?? null);
  const selectedAccount = $derived(accounts.find((item) => item.account_id === selectedWorkspace?.account_id) ?? null);


  async function request(path: string, init: RequestInit = {}): Promise<{ response: Response; body: unknown }> {
    return requestSettingsApi(path, init);
  }

  async function perform<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    key: string, path: string, schema: TSchema, init: RequestInit = {},
  ): Promise<v.InferOutput<TSchema> | null> {
    busyKey = key;
    error = '';
    notice = '';
    try {
      const { response, body } = await request(path, init);
      if (!response.ok) {
        error = settingsErrorMessage(response.status, getSettingsErrorCode(body));
        return null;
      }
      return parseApiBody(schema, body, { status: response.status });
    } catch (caught) {
      error = caught instanceof ApiClientError
        ? settingsErrorMessage(caught.status, caught.code)
        : settingsErrorMessage(0, 'network_error');
      return null;
    } finally {
      busyKey = '';
    }
  }

  async function loadAll(keepNotice = false) {
    const generation = ++loadGeneration;
    // Seed the page from the query cache before deciding whether a blocking
    // loading state is needed. requestSettingsApi will revalidate stale data.
    const cachedAccounts = getCachedSettingsResponse('/accounts');
    const hasCachedAccounts = !!cachedAccounts?.response.ok;
    if (hasCachedAccounts) {
      try { accounts = listSettingsData(settingsAccountSchema, cachedAccounts.body); }
      catch { accounts = []; } // Reject stale/malformed cached data; the request below revalidates it.
    }
    loading = !hasCachedAccounts;
    if (!keepNotice) { error = ''; notice = ''; }
    try {
      const bootstrap = await loadWorkspaceBootstrap();
      if (generation !== loadGeneration) return;
      if (!bootstrap.workspaces.ok) {
        error = settingsErrorMessage(bootstrap.workspaces.status, bootstrap.workspaces.code);
        workspaces = [];
        return;
      }
      const workspaceBody = bootstrap.workspaces.data;
      workspaces = Array.isArray(workspaceBody?.data) ? workspaceBody.data : [];
      selectedWorkspaceId = resolveAndPersistWorkspaceId(
        workspaces,
        [selectedWorkspaceId, readActiveWorkspaceId()],
      );

      // Workspace settings do not depend on the accounts request completing.
      // Render the workspace controls once bootstrap resolves, then hydrate
      // account-specific controls as /accounts returns. This also prevents a
      // non-critical account endpoint failure from blocking the whole page.
      if (generation === loadGeneration) loading = false;

      const accountsResult = await request('/accounts');
      if (generation !== loadGeneration) return;
      if (accountsResult.response.ok) {
        try { accounts = listSettingsData(settingsAccountSchema, accountsResult.body); }
        catch (caught) { error = caught instanceof ApiClientError ? settingsErrorMessage(caught.status, caught.code) : settingsErrorMessage(200, 'invalid_response'); }
      } else if (accountsResult.response.status !== 404) error = settingsErrorMessage(accountsResult.response.status, getSettingsErrorCode(accountsResult.body));
    } catch (caught) {
      if (generation === loadGeneration) error = caught instanceof ApiClientError
        ? settingsErrorMessage(caught.status, caught.code)
        : settingsErrorMessage(0, 'network_error');
    } finally {
      if (generation === loadGeneration) loading = false;
    }
  }

  async function createAccount(event: SubmitEvent) {
    event.preventDefault();
    const name = accountForm.createAccountName.trim();
    if (!name || name.length > 120) { error = 'Enter an account workspace name up to 120 characters.'; return; }
    const result = await perform('create-account', '/accounts', settingsAccountCreateSchema, {
      method: 'POST', body: JSON.stringify({ workspace_name: name }),
    });
    if (result) {
      accounts = [...accounts, { account_id: result.account_id, lifecycle_status: 'active', scheduled_deletion_at: null, billing_cancellation_status: null }];
      if (result.workspace) {
        workspaces = [...workspaces, result.workspace];
        selectedWorkspaceId = result.workspace.id;
      }
      accountForm.createAccountName = ''; settingsUi.showCreateAccount = false;
      notice = 'Account and team workspace created.';
    }
  }

  async function transferOwnership(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedAccount || !selectedWorkspace?.account_owner) return;
    const userId = accountForm.newOwnerUserId.trim();
    if (!userId) { error = 'Enter the eligible new owner user ID.'; return; }
    if (!confirm('Transfer account ownership? You may lose owner privileges after the transfer.')) return;
    const result = await perform('transfer-account', `/accounts/${encodeURIComponent(selectedAccount.account_id)}/transfer`, settingsAcknowledgementSchema, {
      method: 'POST', body: JSON.stringify({ new_owner_user_id: userId }),
    });
    if (result) {
      accountForm.newOwnerUserId = '';
      notice = 'Ownership transfer completed. Refreshing workspace permissions.';
      await loadAll(true);
    }
  }

  async function requestClosure() {
    if (!selectedAccount || !selectedWorkspace?.account_owner || !accountForm.closureConfirm) return;
    if (!confirm('Schedule this account for closure? Monitoring will stop.')) return;
    const result = await perform(
      'close-account', `/accounts/${encodeURIComponent(selectedAccount.account_id)}/closure`, settingsAccountLifecycleSchema,
      { method: 'POST', body: JSON.stringify({ confirm: true }) },
    );
    if (result) {
      accounts = accounts.map((item) => item.account_id === selectedAccount.account_id
        ? { ...item, lifecycle_status: result.lifecycle_status ?? 'closure_scheduled', scheduled_deletion_at: result.scheduled_deletion_at ?? null }
        : item);
      accountForm.closureConfirm = false;
      notice = 'Account closure scheduled. Monitoring has stopped; review the recovery date below.';
    }
  }

  async function cancelClosure() {
    if (!selectedAccount || !selectedWorkspace?.account_owner) return;
    if (!confirm('Cancel the scheduled account closure?')) return;
    const result = await perform(
      'cancel-closure', `/accounts/${encodeURIComponent(selectedAccount.account_id)}/closure/cancel`, settingsAccountLifecycleSchema,
      { method: 'POST' },
    );
    if (result) {
      accounts = accounts.map((item) => item.account_id === selectedAccount.account_id
        ? { ...item, lifecycle_status: result.lifecycle_status ?? 'active', scheduled_deletion_at: null }
        : item);
      notice = 'Account closure cancelled.';
    }
  }

  function formatDate(value: string | null | undefined): string {
    return value ? formatDateTime(value, 'Date unavailable') : 'Not scheduled';
  }

  function saveAppearance(preference: string) {
    if (preference !== 'system' && preference !== 'light' && preference !== 'dark') return;
    settingsUi.appearancePreference = preference;
    const resolved = settingsUi.appearancePreference === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : settingsUi.appearancePreference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = settingsUi.appearancePreference;
    document.documentElement.style.colorScheme = resolved;
    const themeColor = document.querySelector<HTMLMetaElement>('[data-theme-color]');
    if (themeColor) themeColor.content = resolved === 'dark' ? themeColor.dataset.darkColor ?? '#0a0a0a' : themeColor.dataset.lightColor ?? '#ffffff';
    try { localStorage.setItem('trueexit.appearance', settingsUi.appearancePreference); } catch { /* Preference still applies for this page. */ }
  }

  onMount(() => {
    settingsUi.appearancePreference = document.documentElement.dataset.themePreference || 'system';
    section = sectionFromUrl();
    sectionUrlReady = true;
    window.addEventListener('popstate', handleSectionPopState);
    void loadAll();
    return () => window.removeEventListener('popstate', handleSectionPopState);
  });
</script>

<svelte:head>
  <title>Account Settings · TrueExit</title>
  <meta name="description" content="Manage your TrueExit profile, preferences, account lifecycle, and billing." />
</svelte:head>

<section class="settings-workspace">
  <header class="settings-intro">
    <div>
      <p class="eyebrow"><span class="eyebrow__dash"></span>YOUR ACCOUNT</p>
      <h1>Your account, <span>your terms.</span></h1>
      <p class="settings-intro__copy">Manage your personal preferences and account-level actions. Workspace access stays with Workspace Settings.</p>
    </div>
  </header>

  {#if error}<div class="settings-alert settings-alert--error" role="alert"><strong>Couldn’t complete that.</strong><span>{error}</span>{#if error.includes('verify your identity')}<a href="/login">Sign in again ↗</a>{/if}</div>{/if}
  {#if notice}<div class="settings-alert settings-alert--success" role="status">{notice}</div>{/if}

  {#if loading}
    <div class="settings-loading" aria-live="polite"><span class="settings-spinner" aria-hidden="true"></span>Loading account settings…</div>
  {:else}
    <div class="settings-layout">
      <AccountSettingsNavigation bind:section />
      <div class="settings-content">
        {#if section === 'profile'}
          <ProfileSection />
        {:else if section === 'preferences'}
          <PreferencesSection appearancePreference={settingsUi.appearancePreference} onAppearanceChange={saveAppearance} />
        {:else if section === 'billing'}
          <BillingSection />
        {:else if section === 'account'}
          <AccountSection
            selectedAccount={selectedAccount}
            selectedWorkspace={selectedWorkspace}
            accountForm={accountForm}
            settingsUi={settingsUi}
            busyKey={busyKey}
            formatDate={formatDate}
            cancelClosure={cancelClosure}
            requestClosure={requestClosure}
            transferOwnership={transferOwnership}
            createAccount={createAccount}
          />
        {/if}
      </div>
    </div>
  {/if}
</section>
