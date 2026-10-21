<script lang="ts">
  import { can } from '../lib/client/permissions';
  import { onMount } from 'svelte';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '../lib/client/workspace-bootstrap';

  export let mode: 'workspace' | 'account' = 'workspace';

  type Account = {
    account_id: string;
    lifecycle_status: string;
    scheduled_deletion_at: string | null;
    billing_cancellation_status: string | null;
  };
  type Member = {
    user_id: string;
    email: string;
    display_name: string | null;
    role: 'admin' | 'member' | null;
    account_owner: boolean;
  };
  type Invitation = {
    id: string;
    email: string;
    role: string;
    invited_by_user_id: string;
    expires_at: string;
    created_at?: string;
    email_delivery?: string;
  };
  type ChannelKind = 'email' | 'webhook' | 'slack' | 'discord';
  type Channel = {
    id: string;
    label: string;
    type: ChannelKind;
    priority: number;
    enabled: boolean;
    configured: boolean;
    total_attempts?: number;
    successful_attempts?: number;
  };
  type ApiError = { error?: { code?: string; details?: unknown }; request_id?: string };
  type AccountPage = { data: Account[] };
  type List<T> = { data: T[] };

  let workspaces: WorkspaceContext[] = [];
  let selectedWorkspaceId = '';
  let selectedWorkspace: WorkspaceContext | null = null;
  let accounts: Account[] = [];
  let members: Member[] = [];
  let invitations: Invitation[] = [];
  let channels: Channel[] = [];
  let loading = true;
  let error = '';
  let notice = '';
  let section: 'workspace' | 'people' | 'destinations' | 'profile' | 'preferences' | 'security' | 'account' = 'workspace';
  let appearancePreference = 'system';
  let busyKey = '';
  let workspaceName = '';
  let newWorkspaceName = '';
  let newWorkspaceAccountId = '';
  let inviteEmail = '';
  let newOwnerUserId = '';
  let closureConfirm = false;
  let channelLabel = '';
  let channelType: ChannelKind = 'webhook';
  let channelPriority = 0;
  let channelEnabled = true;
  let channelAddress = '';
  let channelHeaders = '';
  let editingChannelId = '';
  let editingChannelLabel = '';
  let editingChannelPriority = 0;
  let editingChannelEnabled = true;
  let editingChannelType: ChannelKind = 'webhook';
  let editingChannelAddress = '';
  let editingChannelHeaders = '';
  let editingChannelConfigTouched = false;
  let showNewChannel = false;
  let createAccountName = '';
  let showCreateWorkspace = false;
  let showCreateAccount = false;

  $: selectedWorkspace = workspaces.find((item) => item.id === selectedWorkspaceId) ?? null;
  $: canManageWorkspace = can(selectedWorkspace, 'workspace.manage');
  $: selectedAccount = accounts.find((item) => item.account_id === selectedWorkspace?.account_id) ?? null;
  $: ownedAccounts = accounts;

  function listData<T>(body: unknown): T[] {
    if (Array.isArray(body)) return body as T[];
    if (body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)) return body.data as T[];
    return [];
  }

  function getErrorCode(body: unknown): string | null {
    if (!body || typeof body !== 'object' || !('error' in body)) return null;
    const detail = (body as ApiError).error;
    return typeof detail?.code === 'string' ? detail.code : null;
  }

  function errorMessage(status: number, code: string | null): string {
    if (code === 'recent_authentication_required') return 'For security, verify your identity again, then retry this action.';
    if (code === 'channel_in_use') return 'This destination is still assigned to one or more monitors. Remove those assignments before deleting it.';
    if (code === 'channel_secret_migration_required') return 'This destination uses a legacy secret format. Its secret must be migrated before this change can be saved.';
    if (code === 'idempotency_key_reused') return 'This operation key was already used for a different request. Refresh the page before trying again.';
    if (status === 401) return 'Your session needs attention. Sign in again to continue.';
    if (status === 403) return 'You do not have permission to perform this action in this workspace.';
    if (status === 404) return 'This workspace or resource is no longer available. Refresh and try again.';
    if (status === 409) return 'The resource changed or is still in use. Refresh the current section and try again.';
    if (status === 422) return 'The request was not accepted. Check the entered values and try again.';
    if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
    if (status >= 500) return 'TrueExit could not complete this request right now. Try again shortly.';
    return code ? `The request could not be completed (${code}).` : 'The request could not be completed. Please try again.';
  }

  async function request(path: string, init: RequestInit = {}): Promise<{ response: Response; body: unknown }> {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (!['GET', 'HEAD'].includes(method) && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID());
    const response = await fetch(`/api/backend${path}`, {
      ...init, headers, credentials: 'same-origin', cache: 'no-store',
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    return { response, body };
  }

  async function perform<T = unknown>(key: string, path: string, init: RequestInit = {}): Promise<T | null> {
    busyKey = key;
    error = '';
    notice = '';
    try {
      const { response, body } = await request(path, init);
      if (!response.ok) {
        error = errorMessage(response.status, getErrorCode(body));
        return null;
      }
      return body as T;
    } catch {
      error = errorMessage(0, 'network_error');
      return null;
    } finally {
      busyKey = '';
    }
  }

  async function loadAll(keepNotice = false) {
    loading = true;
    if (!keepNotice) { error = ''; notice = ''; }
    try {
      const bootstrap = await loadWorkspaceBootstrap();
      if (!bootstrap.workspaces.ok) {
        error = errorMessage(bootstrap.workspaces.status, bootstrap.workspaces.code);
        workspaces = [];
        return;
      }
      const workspaceBody = bootstrap.workspaces.data;
      workspaces = Array.isArray(workspaceBody?.data) ? workspaceBody.data : [];
      let storedWorkspaceId = '';
      try { storedWorkspaceId = localStorage.getItem('trueexit.active-workspace-id') ?? ''; } catch { /* Storage may be unavailable. */ }
      if (!selectedWorkspaceId || !workspaces.some((item) => item.id === selectedWorkspaceId)) {
        selectedWorkspaceId = workspaces.find((item) => item.id === storedWorkspaceId)?.id ?? workspaces[0]?.id ?? '';
      }
      if (selectedWorkspaceId) { try { localStorage.setItem('trueexit.active-workspace-id', selectedWorkspaceId); } catch { /* Storage may be unavailable. */ } }
      if (!selectedWorkspaceId) {
        members = []; invitations = []; channels = [];
      }
      const accountsResult = await request('/accounts');
      if (accountsResult.response.ok) accounts = listData<Account>(accountsResult.body);
      else if (accountsResult.response.status !== 404) error = errorMessage(accountsResult.response.status, getErrorCode(accountsResult.body));
      if (selectedWorkspaceId) await loadWorkspaceSections();
    } catch {
      error = errorMessage(0, 'network_error');
    } finally {
      loading = false;
    }
  }

  async function loadWorkspaceSections() {
    if (!selectedWorkspaceId) return;
    const id = encodeURIComponent(selectedWorkspaceId);
    const [membersResult, invitationsResult, channelsResult] = await Promise.all([
      request(`/workspaces/${id}/members`),
      request(`/workspaces/${id}/invitations`),
      request(`/workspaces/${id}/channels`),
    ]);
    members = membersResult.response.ok ? listData<Member>(membersResult.body) : [];
    invitations = invitationsResult.response.ok ? listData<Invitation>(invitationsResult.body) : [];
    channels = channelsResult.response.ok ? listData<Channel>(channelsResult.body) : [];
    const failed = [membersResult, invitationsResult, channelsResult].find((item) => !item.response.ok && item.response.status !== 403 && item.response.status !== 404);
    if (failed && !error) error = errorMessage(failed.response.status, getErrorCode(failed.body));
  }


  async function selectWorkspace() {
    try { localStorage.setItem('trueexit.active-workspace-id', selectedWorkspaceId); } catch { /* Storage may be unavailable. */ }
    error = ''; notice = '';
    workspaceName = selectedWorkspace?.name ?? '';
    await loadWorkspaceSections();
  }

  async function renameWorkspace(event: SubmitEvent) {
    event.preventDefault();
    const name = workspaceName.trim();
    if (!selectedWorkspace || !name || name.length > 120 || !canManageWorkspace) return;
    const result = await perform<WorkspaceContext>('rename', `/workspaces/${encodeURIComponent(selectedWorkspace.id)}`, {
      method: 'PATCH', body: JSON.stringify({ name }),
    });
    if (result) {
      workspaces = workspaces.map((item) => item.id === result.id ? result : item);
      workspaceName = result.name;
      notice = 'Workspace name updated.';
    }
  }

  async function createWorkspace(event: SubmitEvent) {
    event.preventDefault();
    const name = newWorkspaceName.trim();
    if (!name || name.length > 120) return;
    const payload: Record<string, string> = { name };
    if (newWorkspaceAccountId) payload.account_id = newWorkspaceAccountId;
    const result = await perform<WorkspaceContext>('create-workspace', '/workspaces', {
      method: 'POST', body: JSON.stringify(payload),
    });
    if (result) {
      workspaces = [...workspaces, result];
      selectedWorkspaceId = result.id;
      workspaceName = result.name;
      showCreateWorkspace = false;
      newWorkspaceName = '';
      await loadWorkspaceSections();
      notice = 'Workspace created.';
    }
  }

  async function sendInvitation(event: SubmitEvent) {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!selectedWorkspace || !canManageWorkspace || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const result = await perform<Invitation>('invite', `/workspaces/${encodeURIComponent(selectedWorkspace.id)}/invitations`, {
      method: 'POST', body: JSON.stringify({ email }),
    });
    if (result) {
      invitations = [result, ...invitations.filter((item) => item.id !== result.id)];
      inviteEmail = '';
      notice = result.email_delivery === 'stubbed'
        ? 'Invitation recorded. Email delivery is not connected yet; share the invite through your current onboarding process.'
        : 'Invitation created.';
    }
  }

  async function changeRole(member: Member, role: 'admin' | 'member') {
    if (!selectedWorkspace || member.account_owner || !canManageWorkspace || member.role === role) return;
    const result = await perform('role', `/workspaces/${encodeURIComponent(selectedWorkspace.id)}/members/${encodeURIComponent(member.user_id)}`, {
      method: 'PATCH', body: JSON.stringify({ role }),
    });
    if (busyKey === '' && !error) {
      members = members.map((item) => item.user_id === member.user_id ? { ...item, role } : item);
      notice = `Role updated for ${member.email}.`;
    }
  }

  async function removeMember(member: Member) {
    if (!selectedWorkspace || member.account_owner || !canManageWorkspace) return;
    if (!confirm(`Remove ${member.email} from this workspace?`)) return;
    const result = await perform('remove-member', `/workspaces/${encodeURIComponent(selectedWorkspace.id)}/members/${encodeURIComponent(member.user_id)}`, { method: 'DELETE' });
    if (result !== null || !error) {
      members = members.filter((item) => item.user_id !== member.user_id);
      notice = `${member.email} removed from this workspace.`;
    }
  }

  async function revokeInvitation(invitation: Invitation) {
    if (!selectedWorkspace || !canManageWorkspace) return;
    if (!confirm(`Revoke the invitation for ${invitation.email}?`)) return;
    const result = await perform('revoke-invitation', `/workspaces/${encodeURIComponent(selectedWorkspace.id)}/invitations/${encodeURIComponent(invitation.id)}`, { method: 'DELETE' });
    if (result !== null || !error) {
      invitations = invitations.filter((item) => item.id !== invitation.id);
      notice = `Invitation for ${invitation.email} revoked.`;
    }
  }

  function channelConfig(type: ChannelKind, address: string, headersText: string): Record<string, unknown> | null {
    const value = address.trim();
    if (type === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 320) {
        error = 'Enter a valid recipient email address.'; return null;
      }
      return { to: value };
    }
    let parsed: URL;
    try { parsed = new URL(value); } catch { error = 'Enter a valid HTTPS webhook URL.'; return null; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
      error = 'Webhook destinations must use HTTPS and cannot contain embedded credentials or fragments.'; return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (type === 'slack' && !(['hooks.slack.com', 'hooks.slack-gov.com'].includes(host) && parsed.pathname.startsWith('/services/'))) {
      error = 'Use a supported Slack incoming-webhook URL.'; return null;
    }
    if (type === 'discord' && !(host === 'discord.com' || host === 'discordapp.com') || (type === 'discord' && !parsed.pathname.startsWith('/api/webhooks/'))) {
      error = 'Use a supported Discord webhook URL.'; return null;
    }
    const config: Record<string, unknown> = { url: value };
    if (headersText.trim()) {
      try {
        const parsedHeaders: unknown = JSON.parse(headersText);
        if (!parsedHeaders || typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders) ||
            Object.values(parsedHeaders).some((entry) => typeof entry !== 'string')) {
          error = 'Custom headers must be a JSON object with string values.'; return null;
        }
        config.headers = parsedHeaders;
      } catch {
        error = 'Custom headers must be valid JSON.'; return null;
      }
    }
    return config;
  }

  async function validateChannel(type: ChannelKind, label: string, priority: number, enabled: boolean, config: Record<string, unknown>) {
    if (!selectedWorkspace) return false;
    const result = await perform<{ valid?: boolean; duplicate?: boolean; existing_channel?: { id: string; label: string } | null }>(
      'validate-channel', `/workspaces/${encodeURIComponent(selectedWorkspace.id)}/channels/validate`,
      { method: 'POST', body: JSON.stringify({ type, config }) },
    );
    if (!result) return false;
    if (result.duplicate && result.existing_channel) {
      error = `This configuration matches “${result.existing_channel.label}”. Choose the existing destination instead.`;
      return false;
    }
    if (result.valid === false) {
      error = 'The destination configuration was not valid.';
      return false;
    }
    return true;
  }

  async function createChannel(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedWorkspace || !canManageWorkspace) return;
    const label = channelLabel.trim();
    if (!label || label.length > 80) { error = 'Enter a destination label between 1 and 80 characters.'; return; }
    if (!Number.isInteger(channelPriority) || channelPriority < 0 || channelPriority > 1000) { error = 'Priority must be a whole number between 0 and 1000.'; return; }
    error = '';
    const config = channelConfig(channelType, channelAddress, channelHeaders);
    if (!config) return;
    if (!(await validateChannel(channelType, label, channelPriority, channelEnabled, config))) return;
    const result = await perform<Channel>('create-channel', `/workspaces/${encodeURIComponent(selectedWorkspace.id)}/channels`, {
      method: 'POST', body: JSON.stringify({ type: channelType, label, priority: channelPriority, enabled: channelEnabled, config }),
    });
    if (result) {
      channels = [...channels, result];
      channelLabel = ''; channelAddress = ''; channelHeaders = ''; channelPriority = 0; channelEnabled = true;
      showNewChannel = false;
      notice = 'Destination saved. Secret values are not returned to the browser after saving.';
    }
  }

  function beginEditChannel(channel: Channel) {
    editingChannelId = channel.id;
    editingChannelLabel = channel.label;
    editingChannelPriority = channel.priority ?? 0;
    editingChannelEnabled = channel.enabled;
    editingChannelType = channel.type;
    editingChannelAddress = '';
    editingChannelHeaders = '';
    editingChannelConfigTouched = false;
    error = '';
  }

  async function saveChannelEdit(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedWorkspace || !canManageWorkspace || !editingChannelId) return;
    const label = editingChannelLabel.trim();
    if (!label || label.length > 80) { error = 'Enter a destination label between 1 and 80 characters.'; return; }
    if (!Number.isInteger(editingChannelPriority) || editingChannelPriority < 0 || editingChannelPriority > 1000) { error = 'Priority must be a whole number between 0 and 1000.'; return; }
    const payload: Record<string, unknown> = { label, priority: editingChannelPriority, enabled: editingChannelEnabled };
    if (editingChannelConfigTouched) {
      const config = channelConfig(editingChannelType, editingChannelAddress, editingChannelHeaders);
      if (!config) return;
      if (!(await validateChannel(editingChannelType, label, editingChannelPriority, editingChannelEnabled, config))) return;
      payload.config = config;
    }
    const result = await perform<Channel>('edit-channel', `/workspaces/${encodeURIComponent(selectedWorkspace.id)}/channels/${encodeURIComponent(editingChannelId)}`, {
      method: 'PATCH', body: JSON.stringify(payload),
    });
    if (result) {
      channels = channels.map((item) => item.id === result.id ? result : item);
      editingChannelId = '';
      editingChannelAddress = ''; editingChannelHeaders = '';
      notice = 'Destination updated.';
    }
  }

  async function deleteChannel(channel: Channel) {
    if (!selectedWorkspace || !canManageWorkspace) return;
    if (!confirm(`Delete destination “${channel.label}”? It must first be unassigned from all monitors.`)) return;
    const result = await perform('delete-channel', `/workspaces/${encodeURIComponent(selectedWorkspace.id)}/channels/${encodeURIComponent(channel.id)}`, { method: 'DELETE' });
    if (result !== null || !error) {
      channels = channels.filter((item) => item.id !== channel.id);
      notice = `Destination “${channel.label}” deleted.`;
    }
  }

  async function createAccount(event: SubmitEvent) {
    event.preventDefault();
    const name = createAccountName.trim();
    if (!name || name.length > 120) { error = 'Enter an account workspace name up to 120 characters.'; return; }
    const result = await perform<{ account_id: string; workspace: WorkspaceContext }>('create-account', '/accounts', {
      method: 'POST', body: JSON.stringify({ workspace_name: name }),
    });
    if (result) {
      accounts = [...accounts, { account_id: result.account_id, lifecycle_status: 'active', scheduled_deletion_at: null, billing_cancellation_status: null }];
      if (result.workspace) {
        workspaces = [...workspaces, result.workspace];
        selectedWorkspaceId = result.workspace.id;
      }
      createAccountName = ''; showCreateAccount = false;
      await loadWorkspaceSections();
      notice = 'Account and team workspace created.';
    }
  }

  async function transferOwnership(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedAccount || !selectedWorkspace?.account_owner) return;
    const userId = newOwnerUserId.trim();
    if (!userId) { error = 'Enter the eligible new owner user ID.'; return; }
    if (!confirm('Transfer account ownership? You may lose owner privileges after the transfer.')) return;
    const result = await perform('transfer-account', `/accounts/${encodeURIComponent(selectedAccount.account_id)}/transfer`, {
      method: 'POST', body: JSON.stringify({ new_owner_user_id: userId }),
    });
    if (result) {
      newOwnerUserId = '';
      notice = 'Ownership transfer completed. Refreshing workspace permissions.';
      await loadAll(true);
    }
  }

  async function requestClosure() {
    if (!selectedAccount || !selectedWorkspace?.account_owner || !closureConfirm) return;
    if (!confirm('Schedule this account for closure? Monitoring will stop.')) return;
    const result = await perform<{ scheduled_deletion_at?: string | null; lifecycle_status?: string }>(
      'close-account', `/accounts/${encodeURIComponent(selectedAccount.account_id)}/closure`,
      { method: 'POST', body: JSON.stringify({ confirm: true }) },
    );
    if (result) {
      accounts = accounts.map((item) => item.account_id === selectedAccount.account_id
        ? { ...item, lifecycle_status: result.lifecycle_status ?? 'closure_scheduled', scheduled_deletion_at: result.scheduled_deletion_at ?? null }
        : item);
      closureConfirm = false;
      notice = 'Account closure scheduled. Monitoring has stopped; review the recovery date below.';
    }
  }

  async function cancelClosure() {
    if (!selectedAccount || !selectedWorkspace?.account_owner) return;
    if (!confirm('Cancel the scheduled account closure?')) return;
    const result = await perform<{ lifecycle_status?: string }>(
      'cancel-closure', `/accounts/${encodeURIComponent(selectedAccount.account_id)}/closure/cancel`,
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
    if (!value) return 'Not scheduled';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function saveAppearance(event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    appearancePreference = target.value;
    const resolved = appearancePreference === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : appearancePreference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = appearancePreference;
    document.documentElement.style.colorScheme = resolved;
    document.querySelector('[data-theme-color]')?.setAttribute('content', resolved === 'dark' ? '#09090d' : '#f6f6f9');
    try { localStorage.setItem('trueexit.appearance', appearancePreference); } catch { /* Preference still applies for this page. */ }
  }

  onMount(() => {
    appearancePreference = document.documentElement.dataset.themePreference || 'system';
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
      <nav class="settings-tabs" aria-label="Settings sections">
        {#if mode === 'workspace'}
          <button class:active={section === 'workspace'} type="button" on:click={() => section = 'workspace'}><span>01</span> General</button>
          <button class:active={section === 'people'} type="button" on:click={() => section = 'people'}><span>02</span> Members & access</button>
          <button class:active={section === 'destinations'} type="button" on:click={() => section = 'destinations'}><span>03</span> Destinations</button>
        {:else}
          <button class:active={section === 'profile'} type="button" on:click={() => section = 'profile'}><span>01</span> Profile</button>
          <button class:active={section === 'preferences'} type="button" on:click={() => section = 'preferences'}><span>02</span> Preferences</button>
          <button class:active={section === 'security'} type="button" on:click={() => section = 'security'}><span>03</span> Security</button>
          <button class:active={section === 'account'} type="button" on:click={() => section = 'account'}><span>04</span> Account lifecycle</button>
        {/if}
      </nav>

      <div class="settings-content">
        {#if mode === 'account' && section === 'profile'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">PROFILE</p><h2>Your identity, without duplicate records.</h2><p>TrueExit uses your signed-in identity for account access. Profile editing is not exposed by the current account API, so this page does not offer fields that cannot be saved.</p></div><span class="settings-card__symbol">◎</span></div>
            <div class="settings-profile-row"><span class="settings-profile-avatar">TE</span><div><strong>Signed-in identity</strong><p>Managed by your authentication provider</p></div><span class="settings-readonly-pill">READ ONLY</span></div>
          </section>
        {:else if mode === 'account' && section === 'preferences'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">PREFERENCES</p><h2>Make TrueExit feel right.</h2><p>Choose how the interface appears on this device. Your preference is stored locally and does not change workspace data.</p></div><span class="settings-card__symbol">◐</span></div>
            <label class="settings-field settings-preference-field"><span>Appearance</span><select bind:value={appearancePreference} on:change={saveAppearance}><option value="system">Use system setting</option><option value="light">Light</option><option value="dark">Dark</option></select><small>Applies immediately, including the application shell.</small></label>
          </section>
        {:else if mode === 'account' && section === 'security'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">SECURITY</p><h2>Account access stays deliberate.</h2><p>Authentication credentials and session management are handled by the sign-in provider. TrueExit does not currently expose password, session, or MFA management APIs here.</p></div><span class="settings-card__symbol">⌁</span></div>
            <div class="settings-security-note"><strong>Protected account actions</strong><p>Ownership transfer and account closure may require recent identity verification. If verification is required, TrueExit will stop the action and ask you to sign in again.</p></div>
          </section>
        {:else if section === 'workspace'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">WORKSPACE IDENTITY</p><h2>Give this space a name.</h2><p>Make it easy for your team to recognise the environment they’re working in.</p></div><span class="settings-card__symbol">⌘</span></div>
            <form class="settings-form" on:submit={renameWorkspace}>
              <label class="settings-field"><span>Workspace name</span><input bind:value={workspaceName} maxlength="120" required disabled={!canManageWorkspace} /></label>
              <div class="settings-form__footer"><span>{canManageWorkspace ? 'Changes apply to this workspace.' : 'Only workspace owners and admins can rename this space.'}</span><button class="settings-button settings-button--primary" type="submit" disabled={!canManageWorkspace || !!busyKey || workspaceName.trim() === selectedWorkspace?.name}>{busyKey === 'rename' ? 'Saving…' : 'Save workspace'}</button></div>
            </form>
          </section>

          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">WORKSPACE DIRECTORY</p><h2>Keep work separated.</h2><p>Create a workspace inside an account you own, without leaving settings.</p></div><span class="settings-card__symbol">＋</span></div>
            {#if !showCreateWorkspace}
              <button class="settings-button settings-button--quiet" type="button" on:click={() => showCreateWorkspace = true} disabled={!ownedAccounts.length}>＋ Create workspace</button>
              {#if !ownedAccounts.length}<p class="settings-note">Creating a team workspace requires an account you own. Use Account Settings to create or manage an account.</p>{/if}
            {:else}
              <form class="settings-form" on:submit={createWorkspace}>
                <label class="settings-field"><span>Workspace name</span><input bind:value={newWorkspaceName} maxlength="120" required placeholder="Production operations" /></label>
                {#if ownedAccounts.length > 1}<label class="settings-field"><span>Account</span><select bind:value={newWorkspaceAccountId} required><option value="">Choose an account</option>{#each ownedAccounts as account (account.account_id)}<option value={account.account_id}>{account.account_id.slice(0, 8)} · {account.lifecycle_status}</option>{/each}</select></label>{:else if ownedAccounts.length === 1}<p class="settings-note">This workspace will be created under your owned account.</p>{/if}
                <div class="settings-form__footer"><span>Account Owner permission required.</span><div><button class="settings-button settings-button--quiet" type="button" on:click={() => showCreateWorkspace = false}>Cancel</button><button class="settings-button settings-button--primary" type="submit" disabled={!!busyKey}>{busyKey === 'create-workspace' ? 'Creating…' : 'Create workspace'}</button></div></div>
              </form>
            {/if}
          </section>
        {:else if section === 'people'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">TEAM DIRECTORY</p><h2>The people behind the signals.</h2><p>Review access and adjust workspace roles. Account-owner safeguards are enforced by the API.</p></div><span class="settings-card__symbol">◎</span></div>
            {#if members.length}
              <div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Person</th><th>Access</th><th>Actions</th></tr></thead><tbody>
                {#each members as member (member.user_id)}
                  <tr><td><strong>{member.display_name || member.email}</strong><small>{member.email}</small></td><td>{#if member.account_owner}<span class="settings-pill">Account owner</span>{:else if canManageWorkspace}<select aria-label={`Role for ${member.email}`} value={member.role ?? 'member'} on:change={(event) => changeRole(member, (event.currentTarget as HTMLSelectElement).value as 'admin' | 'member')} disabled={!!busyKey}><option value="member">Member</option><option value="admin">Admin</option></select>{:else}<span class="settings-pill">{member.role ?? 'Member'}</span>{/if}</td><td>{#if canManageWorkspace && !member.account_owner}<button class="settings-text-button settings-text-button--danger" type="button" on:click={() => removeMember(member)} disabled={!!busyKey}>Remove</button>{:else}<span class="settings-note">Protected</span>{/if}</td></tr>
                {/each}
              </tbody></table></div>
            {:else}<p class="settings-empty">No member records are available for this workspace, or you don’t have permission to view them.</p>{/if}
          </section>
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">INVITATIONS</p><h2>Bring the right people in.</h2><p>Invitations are recorded by the API. Email delivery is currently stubbed and is not sent automatically.</p></div><span class="settings-card__symbol">↗</span></div>
            {#if canManageWorkspace}
              <form class="settings-inline-form" on:submit={sendInvitation}><label class="settings-field"><span>Email address</span><input bind:value={inviteEmail} type="email" maxlength="320" required placeholder="teammate@company.com" /></label><button class="settings-button settings-button--primary" type="submit" disabled={!!busyKey}>{busyKey === 'invite' ? 'Adding…' : 'Create invitation'}</button></form>
            {:else}<p class="settings-note">Only workspace owners and admins can manage invitations.</p>{/if}
            {#if invitations.length}<div class="settings-list">{#each invitations as invitation (invitation.id)}<div class="settings-list-row"><div><strong>{invitation.email}</strong><small>Expires {formatDate(invitation.expires_at)} · {invitation.role}</small></div>{#if canManageWorkspace}<button class="settings-text-button settings-text-button--danger" type="button" on:click={() => revokeInvitation(invitation)} disabled={!!busyKey}>Revoke</button>{/if}</div>{/each}</div>{:else}<p class="settings-empty">No pending invitations.</p>{/if}
          </section>
        {:else if section === 'destinations'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">NOTIFICATION ROUTES</p><h2>Choose where signals land.</h2><p>Secrets are never returned after saving. Destination setup is separate from provider delivery activation.</p></div><span class="settings-card__symbol">↗</span></div>
            <div class="settings-destination-summary"><span><strong>{channels.length}</strong> saved destinations</span><span><strong>{channels.filter((item) => item.enabled).length}</strong> enabled</span><span>Maximum 25 per workspace</span></div>
            {#if channels.length}
              <div class="settings-destination-list">{#each channels as channel (channel.id)}
                <article class="settings-destination">
                  <div class="settings-destination__mark">{channel.type === 'email' ? '@' : channel.type === 'slack' ? 'S' : channel.type === 'discord' ? 'D' : '↗'}</div>
                  <div class="settings-destination__body"><div class="settings-destination__title"><strong>{channel.label}</strong><span class:settings-pill--off={!channel.enabled} class="settings-pill">{channel.enabled ? 'Enabled' : 'Disabled'}</span></div><p>{channel.type.toUpperCase()} · Priority {channel.priority ?? 0} · {channel.configured ? 'Configured' : 'Needs configuration'}</p></div>
                  {#if canManageWorkspace}<div class="settings-destination__actions"><button class="settings-text-button" type="button" on:click={() => beginEditChannel(channel)} disabled={!!busyKey}>Edit</button><button class="settings-text-button settings-text-button--danger" type="button" on:click={() => deleteChannel(channel)} disabled={!!busyKey}>Delete</button></div>{/if}
                </article>
              {/each}</div>
            {:else}<p class="settings-empty">No notification destinations saved yet.</p>{/if}
            {#if canManageWorkspace}
              <button class="settings-button settings-button--primary" type="button" on:click={() => { showNewChannel = !showNewChannel; editingChannelId = ''; error = ''; }} disabled={channels.length >= 25 || !!busyKey}>{showNewChannel ? '− Close form' : '＋ Add destination'}</button>
              {#if showNewChannel}
                <form class="settings-channel-form" on:submit={createChannel}>
                  <div class="settings-form-grid">
                    <label class="settings-field"><span>Provider</span><select bind:value={channelType}><option value="webhook">Custom webhook</option><option value="email">Email</option><option value="slack">Slack incoming webhook</option><option value="discord">Discord webhook</option></select></label>
                    <label class="settings-field"><span>Destination label</span><input bind:value={channelLabel} required maxlength="80" placeholder="Operations alerts" /></label>
                    <label class="settings-field settings-field--wide"><span>{channelType === 'email' ? 'Recipient email' : 'HTTPS webhook URL'}</span><input bind:value={channelAddress} required type={channelType === 'email' ? 'email' : 'url'} autocomplete="off" placeholder={channelType === 'email' ? 'ops@example.com' : 'https://hooks.example.com/…'} /></label>
                    {#if channelType !== 'email'}<label class="settings-field settings-field--wide"><span>Custom headers <small>Optional JSON object</small></span><textarea bind:value={channelHeaders} rows="3" spellcheck="false" placeholder={'{ "Authorization": "Bearer secret" }'}></textarea><small>Encrypted by the API and never returned after saving.</small></label>{/if}
                    <label class="settings-field"><span>Priority <small>Lower runs first</small></span><input bind:value={channelPriority} type="number" min="0" max="1000" step="1" required /></label>
                    <label class="settings-check"><input bind:checked={channelEnabled} type="checkbox" /><span>Destination enabled</span></label>
                  </div>
                  <div class="settings-form__footer"><span>Validation previews duplicates without contacting the destination.</span><button class="settings-button settings-button--primary" type="submit" disabled={!!busyKey}>{busyKey === 'create-channel' || busyKey === 'validate-channel' ? 'Validating…' : 'Validate & save'}</button></div>
                </form>
              {/if}
            {:else}<p class="settings-note">You can view destinations, but only workspace owners and admins can change them.</p>{/if}

            {#if editingChannelId}
              <form class="settings-channel-form settings-channel-form--edit" on:submit={saveChannelEdit}>
                <div class="settings-card__heading"><div><p class="settings-kicker">EDIT DESTINATION</p><h2>{editingChannelLabel || 'Destination settings'}</h2><p>Leave the secret fields blank to preserve the existing encrypted configuration.</p></div></div>
                <div class="settings-form-grid">
                  <label class="settings-field"><span>Label</span><input bind:value={editingChannelLabel} required maxlength="80" /></label>
                  <label class="settings-field"><span>Priority</span><input bind:value={editingChannelPriority} type="number" min="0" max="1000" step="1" required /></label>
                  <label class="settings-field settings-field--wide"><span>{editingChannelType === 'email' ? 'New recipient email (optional)' : 'New HTTPS webhook URL (optional)'}</span><input bind:value={editingChannelAddress} type={editingChannelType === 'email' ? 'email' : 'url'} autocomplete="off" placeholder="Leave blank to preserve current secret" on:input={() => editingChannelConfigTouched = true} /></label>
                  {#if editingChannelType !== 'email'}<label class="settings-field settings-field--wide"><span>Replace custom headers (optional JSON)</span><textarea bind:value={editingChannelHeaders} rows="2" spellcheck="false" placeholder="Only used if replacing the destination config" on:input={() => editingChannelConfigTouched = true}></textarea></label>{/if}
                  <label class="settings-check"><input bind:checked={editingChannelEnabled} type="checkbox" /><span>Destination enabled</span></label>
                </div>
                <div class="settings-form__footer"><span>Secret configuration is never prefilled.</span><div><button class="settings-button settings-button--quiet" type="button" on:click={() => editingChannelId = ''}>Cancel</button><button class="settings-button settings-button--primary" type="submit" disabled={!!busyKey}>{busyKey === 'edit-channel' ? 'Saving…' : 'Save changes'}</button></div></div>
              </form>
            {/if}
          </section>
        {:else if section === 'account'}
          <section class="settings-card">
            <div class="settings-card__heading"><div><p class="settings-kicker">ACCOUNT STATUS</p><h2>Know where your account stands.</h2><p>Account actions are restricted to the account owner and may require recent identity verification.</p></div><span class="settings-card__symbol">◈</span></div>
            {#if selectedAccount}
              <div class="settings-account-status"><div><span>Lifecycle status</span><strong>{selectedAccount.lifecycle_status.replaceAll('_', ' ')}</strong></div><div><span>Scheduled deletion</span><strong>{formatDate(selectedAccount.scheduled_deletion_at)}</strong></div><div><span>Billing cancellation</span><strong>{selectedAccount.billing_cancellation_status ?? 'Not reported'}</strong></div></div>
              {#if selectedWorkspace?.account_owner}
                {#if selectedAccount.scheduled_deletion_at || selectedAccount.lifecycle_status.includes('closure')}
                  <div class="settings-danger-zone settings-danger-zone--closure"><div class="settings-danger-zone__copy"><h3>Closure is scheduled.</h3><p>Monitoring has stopped for this account. If the recovery window is still open, you can cancel the scheduled closure.</p></div><button class="settings-button settings-button--primary" type="button" on:click={cancelClosure} disabled={!!busyKey}>{busyKey === 'cancel-closure' ? 'Cancelling…' : 'Cancel closure'}</button></div>
                {:else}
                  <div class="settings-danger-zone settings-danger-zone--closure"><div class="settings-danger-zone__copy"><h3>Schedule account closure</h3><p>This stops monitoring and schedules deletion. Billing cancellation status is reported by the API; do not assume a billing provider action has completed.</p><label class="settings-check"><input bind:checked={closureConfirm} type="checkbox" /><span>I understand monitoring will stop and this account will be scheduled for deletion.</span></label></div><button class="settings-button settings-button--danger" type="button" on:click={requestClosure} disabled={!closureConfirm || !!busyKey}>{busyKey === 'close-account' ? 'Scheduling…' : 'Schedule closure'}</button></div>
                {/if}
                <form class="settings-form settings-transfer-form" on:submit={transferOwnership}>
                  <div><p class="settings-kicker">OWNERSHIP</p><h3>Transfer account ownership</h3><p>Enter the eligible user ID provided by your identity or workspace administration workflow.</p></div>
                  <label class="settings-field"><span>New owner user ID</span><input bind:value={newOwnerUserId} required autocomplete="off" placeholder="User ID" /></label>
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
              {#if !showCreateAccount}<button class="settings-button settings-button--quiet" type="button" on:click={() => showCreateAccount = true}>＋ Create account</button>
              {:else}<form class="settings-inline-form" on:submit={createAccount}><label class="settings-field"><span>Initial workspace name</span><input bind:value={createAccountName} maxlength="120" required placeholder="Acme operations" /></label><button class="settings-button settings-button--primary" type="submit" disabled={!!busyKey}>{busyKey === 'create-account' ? 'Creating…' : 'Create account'}</button></form>{/if}
            </div>
          </section>
        {/if}
      </div>
    </div>
  {/if}
</section>
