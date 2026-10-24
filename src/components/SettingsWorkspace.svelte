<svelte:options runes={true} />
<script lang="ts">
  import * as v from 'valibot';
  import { ApiClientError } from '../lib/client/api-client';
  import { parseApiBody, settingsAccountCreateSchema, settingsAccountLifecycleSchema, settingsAcknowledgementSchema, settingsAccountSchema, workspaceContextSchema } from '../lib/client/api-schemas';
  import type { SettingsAccountContract } from '../lib/client/api-schemas';
  import { can } from '../lib/client/permissions';
  import { onMount } from 'svelte';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';
  import { getCachedSettingsResponse, getSettingsErrorCode, listSettingsData, requestSettingsApi, settingsErrorMessage } from '../lib/client/settings-api';
  import { readActiveWorkspaceId, resolveAndPersistWorkspaceId } from '../lib/client/workspace-preference';
  import { formatDateTime } from '../lib/client/date-format';
  import SettingsSectionNavigation from './settings/SettingsSectionNavigation.svelte';
  import SettingsDestinationManager from './settings/SettingsDestinationManager.svelte';
  import SettingsPeopleManager from './settings/SettingsPeopleManager.svelte';
  import * as Select from './ui/select/index.js';

  let { mode = 'workspace' }: { mode?: 'workspace' | 'account' } = $props();

  type Account = SettingsAccountContract;
  let workspaces = $state<WorkspaceContext[]>([]);
  let selectedWorkspaceId = $state('');

  let accounts = $state<Account[]>([]);
  let peopleRefreshKey = $state(0);
  let loading = $state(true);
  let error = $state('');
  let notice = $state('');
  let section = $state<'workspace' | 'people' | 'destinations' | 'profile' | 'preferences' | 'security' | 'account'>('workspace');
  let busyKey = $state('');
  // Form state is grouped by workflow so unrelated fields do not share one flat namespace.
  let workspaceForm = $state({ name: '', newName: '', accountId: '' });
  let accountForm = $state({ newOwnerUserId: '', closureConfirm: false, createAccountName: '' });
  let settingsUi = $state({
    appearancePreference: 'system',
    showCreateWorkspace: false,
    showCreateAccount: false,
  });
  let loadGeneration = 0;

  const selectedWorkspace = $derived(workspaces.find((item) => item.id === selectedWorkspaceId) ?? null);
  const canManageWorkspace = $derived(can(selectedWorkspace, 'workspace.manage'));
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
      peopleRefreshKey += 1;
    } catch (caught) {
      if (generation === loadGeneration) error = caught instanceof ApiClientError
        ? settingsErrorMessage(caught.status, caught.code)
        : settingsErrorMessage(0, 'network_error');
    } finally {
      if (generation === loadGeneration) loading = false;
    }
  }

  async function renameWorkspace(event: SubmitEvent) {
    event.preventDefault();
    const name = workspaceForm.name.trim();
    if (!selectedWorkspace || !name || name.length > 120 || !canManageWorkspace) return;
    const result = await perform('rename', `/workspaces/${encodeURIComponent(selectedWorkspace.id)}`, workspaceContextSchema, {
      method: 'PATCH', body: JSON.stringify({ name }),
    });
    if (result) {
      workspaces = workspaces.map((item) => item.id === result.id ? result : item);
      workspaceForm.name = result.name;
      notice = 'Workspace name updated.';
    }
  }

  async function createWorkspace(event: SubmitEvent) {
    event.preventDefault();
    const name = workspaceForm.newName.trim();
    if (!name || name.length > 120) return;
    const payload: Record<string, string> = { name };
    if (workspaceForm.accountId) payload.account_id = workspaceForm.accountId;
    const result = await perform('create-workspace', '/workspaces', workspaceContextSchema, {
      method: 'POST', body: JSON.stringify(payload),
    });
    if (result) {
      workspaces = [...workspaces, result];
      selectedWorkspaceId = result.id;
      workspaceForm.name = result.name;
      settingsUi.showCreateWorkspace = false;
      workspaceForm.newName = '';
      peopleRefreshKey += 1;
      notice = 'Workspace created.';
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
      peopleRefreshKey += 1;
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
    document.querySelector('[data-theme-color]')?.setAttribute('content', resolved === 'dark' ? '#09090d' : '#f6f6f9');
    try { localStorage.setItem('trueexit.appearance', settingsUi.appearancePreference); } catch { /* Preference still applies for this page. */ }
  }

  onMount(() => {
    settingsUi.appearancePreference = document.documentElement.dataset.themePreference || 'system';
    if (mode === 'account') section = 'profile';
    void loadAll();
  });
</script>

<svelte:head>
  <title>Settings · TrueExit</title>
  <meta name="description" content="Manage TrueExit workspaces, access, notification destinations, and account lifecycle." />
</svelte:head>

<section class="settings-workspace">
  <header class="settings-intro">
    <div>
      <p class="eyebrow"><span class="eyebrow__dash"></span>{mode === 'account' ? 'YOUR ACCOUNT' : 'WORKSPACE CONTROL'}</p>
      <h1>{mode === 'account' ? 'Your account,' : 'Everything in'} <span>{mode === 'account' ? 'your terms.' : 'its place.'}</span></h1>
      <p class="settings-intro__copy">{mode === 'account' ? 'Manage your personal preferences and account-level actions. Workspace access stays with Workspace Settings.' : 'Manage workspace details, people, and notification destinations in one place.'}</p>
    </div>
  </header>

  {#if error}<div class="settings-alert settings-alert--error" role="alert"><strong>Couldn’t complete that.</strong><span>{error}</span>{#if error.includes('verify your identity')}<a href="/login">Sign in again ↗</a>{/if}</div>{/if}
  {#if notice}<div class="settings-alert settings-alert--success" role="status">{notice}</div>{/if}

  {#if loading}
    <div class="settings-loading" aria-live="polite"><span class="settings-spinner" aria-hidden="true"></span>{mode === 'account' ? 'Loading account settings…' : 'Loading workspace settings…'}</div>
  {:else}
    <div class="settings-layout">
      <SettingsSectionNavigation {mode} bind:section />

      <div class="settings-content">
        {#if mode === 'account' && section === 'profile'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">PROFILE</p><h2>Your identity, without duplicate records.</h2><p>TrueExit uses your signed-in identity for account access. Profile editing is not exposed by the current account API, so this page does not offer fields that cannot be saved.</p></div><span class="settings-card__symbol">◎</span></div>
            <div class="settings-profile-row"><span class="settings-profile-avatar">TE</span><div><strong>Signed-in identity</strong><p>Managed by your authentication provider</p></div><span class="settings-readonly-pill">READ ONLY</span></div>
          </section>
        {:else if mode === 'account' && section === 'preferences'}
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
          </section>
        {:else if mode === 'account' && section === 'security'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">SECURITY</p><h2>Account access stays deliberate.</h2><p>Authentication credentials and session management are handled by the sign-in provider. TrueExit does not currently expose password, session, or MFA management APIs here.</p></div><span class="settings-card__symbol">⌁</span></div>
            <div class="settings-security-note"><strong>Protected account actions</strong><p>Ownership transfer and account closure may require recent identity verification. If verification is required, TrueExit will stop the action and ask you to sign in again.</p></div>
          </section>
        {:else if section === 'workspace'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">WORKSPACE IDENTITY</p><h2>Give this space a name.</h2><p>Make it easy for your team to recognise the environment they’re working in.</p></div><span class="settings-card__symbol">⌘</span></div>
            <form class="settings-form" onsubmit={renameWorkspace}>
              <label class="settings-field"><span>Workspace name</span><input bind:value={workspaceForm.name} maxlength="120" required disabled={!canManageWorkspace} /></label>
              <div class="settings-form__footer"><span>{canManageWorkspace ? 'Changes apply to this workspace.' : 'Only workspace owners and admins can rename this space.'}</span><button class="settings-button settings-button--primary" type="submit" disabled={!canManageWorkspace || !!busyKey || workspaceForm.name.trim() === selectedWorkspace?.name}>{busyKey === 'rename' ? 'Saving…' : 'Save workspace'}</button></div>
            </form>
          </section>

          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">WORKSPACE DIRECTORY</p><h2>Keep work separated.</h2><p>Create a workspace inside an account you own, without leaving settings.</p></div><span class="settings-card__symbol">＋</span></div>
            {#if !settingsUi.showCreateWorkspace}
              <button class="settings-button settings-button--quiet" type="button" onclick={() => settingsUi.showCreateWorkspace = true} disabled={!accounts.length}>＋ Create workspace</button>
              {#if !accounts.length}<p class="settings-note">Creating a team workspace requires an account you own. Use Account Settings to create or manage an account.</p>{/if}
            {:else}
              <form class="settings-form" onsubmit={createWorkspace}>
                <label class="settings-field"><span>Workspace name</span><input bind:value={workspaceForm.newName} maxlength="120" required placeholder="Production operations" /></label>
                {#if accounts.length > 1}<label class="settings-field"><span>Account</span><select bind:value={workspaceForm.accountId} required><option value="">Choose an account</option>{#each accounts as account (account.account_id)}<option value={account.account_id}>{account.account_id.slice(0, 8)} · {account.lifecycle_status}</option>{/each}</select></label>{:else if accounts.length === 1}<p class="settings-note">This workspace will be created under your owned account.</p>{/if}
                <div class="settings-form__footer"><span>Account Owner permission required.</span><div><button class="settings-button settings-button--quiet" type="button" onclick={() => settingsUi.showCreateWorkspace = false}>Cancel</button><button class="settings-button settings-button--primary" type="submit" disabled={!!busyKey}>{busyKey === 'create-workspace' ? 'Creating…' : 'Create workspace'}</button></div></div>
              </form>
            {/if}
          </section>
        {:else if section === 'people'}
          <SettingsPeopleManager workspaceId={selectedWorkspaceId} {canManageWorkspace} refreshKey={peopleRefreshKey} />
        {:else if section === 'destinations'}
          <SettingsDestinationManager workspaceId={selectedWorkspaceId} {canManageWorkspace} />
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
