<svelte:options runes={true} />
<script lang="ts">
  import * as v from 'valibot';
  import { ApiClientError } from '@/lib/client/api-client';
  import { parseApiBody, settingsAccountSchema, workspaceContextSchema } from '@/lib/client/api-schemas';
  import type { SettingsAccountContract } from '@/lib/client/api-schemas';
  import { can } from '@/lib/client/permissions';
  import { onMount } from 'svelte';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '@/lib/client/workspace-bootstrap';
  import { getCachedSettingsResponse, getSettingsErrorCode, listSettingsData, requestSettingsApi, settingsErrorMessage } from '@/lib/client/settings-api';
  import { readActiveWorkspaceId, resolveAndPersistWorkspaceId } from '@/lib/client/workspace-preference';
  import SettingsDestinationManager from '@/features/workspace-settings/destinations/settings-destination-manager.svelte';
  import SettingsPeopleManager from '@/features/workspace-settings/members/settings-people-manager.svelte';
  import WorkspaceSettingsNavigation from '@/features/workspace-settings/navigation/workspace-settings-navigation.svelte';




  type Account = SettingsAccountContract;
  let workspaces = $state<WorkspaceContext[]>([]);
  let selectedWorkspaceId = $state('');

  let accounts = $state<Account[]>([]);
  let peopleRefreshKey = $state(0);
  let loading = $state(true);
  let error = $state('');
  let notice = $state('');
  let section = $state<'workspace' | 'people' | 'destinations'>('workspace');
  let busyKey = $state('');
  // Form state is grouped by workflow so unrelated fields do not share one flat namespace.
  let workspaceForm = $state({ name: '', newName: '', accountId: '' });
  let settingsUi = $state({ showCreateWorkspace: false });
  let loadGeneration = 0;

  const selectedWorkspace = $derived(workspaces.find((item) => item.id === selectedWorkspaceId) ?? null);
  const canManageWorkspace = $derived(can(selectedWorkspace, 'workspace.manage'));


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

  onMount(() => {
    void loadAll();
  });
</script>

<svelte:head>
  <title>Workspace Settings · TrueExit</title>
  <meta name="description" content="Manage workspace details, members, access, and notification destinations." />
</svelte:head>

<section class="settings-workspace">
  <header class="settings-intro">
    <div>
      <p class="eyebrow"><span class="eyebrow__dash"></span>WORKSPACE CONTROL</p>
      <h1>Everything in <span>its place.</span></h1>
      <p class="settings-intro__copy">Manage workspace details, people, and notification destinations in one place.</p>
    </div>
  </header>

  {#if error}<div class="settings-alert settings-alert--error" role="alert"><strong>Couldn’t complete that.</strong><span>{error}</span>{#if error.includes('verify your identity')}<a href="/login">Sign in again ↗</a>{/if}</div>{/if}
  {#if notice}<div class="settings-alert settings-alert--success" role="status">{notice}</div>{/if}

  {#if loading}
    <div class="settings-loading" aria-live="polite"><span class="settings-spinner" aria-hidden="true"></span>Loading workspace settings…</div>
  {:else}
    <div class="settings-layout">
      <WorkspaceSettingsNavigation bind:section />
      <div class="settings-content">
        {#if section === 'workspace'}
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
        {/if}
      </div>
    </div>
  {/if}
</section>
