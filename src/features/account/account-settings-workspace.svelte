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
  import * as Select from '@/components/ui/select/index.js';
  import AccountSettingsNavigation from '@/features/account/navigation/account-settings-navigation.svelte';




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
    if (mode === 'account') section = 'profile';
    void loadAll();
  });

  onMount(() => {
    settingsUi.appearancePreference = document.documentElement.dataset.themePreference || 'system';
    section = 'profile';
    void loadAll();
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
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">PROFILE</p><h2>Your identity, without duplicate records.</h2><p>TrueExit uses your signed-in identity for account access. Profile editing is not exposed by the current account API, so this page does not offer fields that cannot be saved.</p></div><span class="settings-card__symbol">◎</span></div>
            <div class="settings-profile-row"><span class="settings-profile-avatar">TE</span><div><strong>Signed-in identity</strong><p>Managed by your authentication provider</p></div><span class="settings-readonly-pill">READ ONLY</span></div>
          </section>
        {:else if section === 'preferences'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">PREFERENCES</p><h2>Make TrueExit feel right.</h2><p>Choose how the interface appears on this device. Your preference is stored locally and does not change workspace data.</p></div><span class="settings-card__symbol">◐</span></div>
            <div class="settings-field settings-preference-field">
              <span>Appearance</span>
              <Select.Root type="single" value={settingsUi.appearancePreference} onValueChange={saveAppearance}>
                <Select.Trigger aria-label="Appearance preference" class="w-full max-w-sm">
                  <Select.Value placeholder="Use system setting" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="system" label="Use system setting">Use system setting</Select.Item>
                  <Select.Item value="light" label="Light">Light</Select.Item>
                  <Select.Item value="dark" label="Dark">Dark</Select.Item>
                </Select.Content>
              </Select.Root>
              <small>Applies immediately, including the application shell.</small>
            </div>
            <div class="settings-security-note"><strong>Timezone preference outstanding</strong><p>Timezone selection will be added here. Preference persistence and consistent timestamp display are tracked for the backend completion pass.</p></div>
          </section>
        {:else if section === 'billing'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">BILLING</p><h2>Billing belongs here.</h2><p>Subscription and payment management will be connected here as the billing integration is completed.</p></div><span class="settings-card__symbol">⌁</span></div>
            <div class="settings-security-note"><strong>Billing integration outstanding</strong><p>The billing section is intentionally visible while subscription, payment, and invoice integrations are completed.</p></div>
          </section>
        {:else if section === 'account'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">ACCOUNT STATUS</p><h2>Know where your account stands.</h2><p>Account actions are restricted to the account owner and may require recent identity verification.</p></div><span class="settings-card__symbol">◈</span></div>
            {#if selectedAccount}
              <div class="settings-account-status"><div><span>Lifecycle status</span><strong>{selectedAccount.lifecycle_status.replaceAll('_', ' ')}</strong></div><div><span>Scheduled deletion</span><strong>{formatDate(selectedAccount.scheduled_deletion_at)}</strong></div><div><span>Billing cancellation</span><strong>{selectedAccount.billing_cancellation_status ?? 'Not reported'}</strong></div></div>
              {#if selectedWorkspace?.account_owner}
                {#if selectedAccount.scheduled_deletion_at || selectedAccount.lifecycle_status.includes('closure')}
                  <div class="settings-danger-zone settings-danger-zone--closure"><div class="settings-danger-zone__copy"><h3>Closure is scheduled.</h3><p>Monitoring has stopped for this account. If the recovery window is still open, you can cancel the scheduled closure.</p></div><button class="settings-button settings-button--primary" type="button" onclick={cancelClosure} disabled={!!busyKey}>{busyKey === 'cancel-closure' ? 'Cancelling…' : 'Cancel closure'}</button></div>
                {:else}
                  <div class="settings-danger-zone settings-danger-zone--closure"><div class="settings-danger-zone__copy"><h3>Schedule account closure</h3><p>This stops monitoring and schedules deletion. Billing cancellation status is reported by the API; do not assume a billing provider action has completed.</p><label class="settings-check"><input bind:checked={accountForm.closureConfirm} type="checkbox" /><span>I understand monitoring will stop and this account will be scheduled for deletion.</span></label></div><button class="settings-button settings-button--danger" type="button" onclick={requestClosure} disabled={!accountForm.closureConfirm || !!busyKey}>{busyKey === 'close-account' ? 'Scheduling…' : 'Schedule closure'}</button></div>
                {/if}
                <form class="settings-form settings-transfer-form" onsubmit={transferOwnership}>
                  <div><p class="settings-kicker">OWNERSHIP</p><h3>Transfer account ownership</h3><p>Enter the eligible user ID provided by your identity or workspace administration workflow.</p></div>
                  <label class="settings-field"><span>New owner user ID</span><input bind:value={accountForm.newOwnerUserId} required autocomplete="off" placeholder="User ID" /></label>
                  <div class="settings-form__footer"><span>Requires recent authentication.</span><button class="settings-button settings-button--quiet" type="submit" disabled={!!busyKey}>{busyKey === 'transfer-account' ? 'Transferring…' : 'Transfer ownership'}</button></div>
                </form>
              {:else}
                <p class="settings-note">Account lifecycle actions are only available to the account owner.</p>
              {/if}
            {:else}
              <p class="settings-empty">This workspace is not associated with an account you own, or account details are unavailable.</p>
            {/if}
            <div class="settings-account-create">
              <div><p class="settings-kicker">NEW ACCOUNT</p><h3>Start a separate account.</h3><p>Creates an account and its initial team workspace. Recent authentication is required.</p></div>
              {#if !settingsUi.showCreateAccount}<button class="settings-button settings-button--quiet" type="button" onclick={() => settingsUi.showCreateAccount = true}>＋ Create account</button>
              {:else}<form class="settings-inline-form" onsubmit={createAccount}><label class="settings-field"><span>Initial workspace name</span><input bind:value={accountForm.createAccountName} maxlength="120" required placeholder="Acme operations" /></label><button class="settings-button settings-button--primary" type="submit" disabled={!!busyKey}>{busyKey === 'create-account' ? 'Creating…' : 'Create account'}</button></form>{/if}
            </div>
          </section>
        {/if}
      </div>
    </div>
  {/if}
</section>
