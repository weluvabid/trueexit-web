<script lang="ts">
  import { getCachedSettingsResponse, getSettingsErrorCode, listSettingsData, requestSettingsApi, settingsErrorMessage } from '../../lib/client/settings-api';
  import { formatDateTime } from '../../lib/client/date-format';

  export let workspaceId = '';
  export let canManageWorkspace = false;
  export let refreshKey = 0;

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

  let members: Member[] = [];
  let invitations: Invitation[] = [];
  let invitationsUnavailable = false;
  let loading = false;
  let busyKey = '';
  let error = '';
  let notice = '';
  let inviteEmail = '';
  let activeWorkspaceId = '';
  let generation = 0;
  let mutationGeneration = 0;

  let activeRefreshKey = -1;
  $: if (workspaceId !== activeWorkspaceId || refreshKey !== activeRefreshKey) {
    activeWorkspaceId = workspaceId;
    activeRefreshKey = refreshKey;
    void loadPeople(workspaceId);
  }

  async function request(path: string, init: RequestInit = {}) {
    return requestSettingsApi(path, init);
  }

  async function loadPeople(id: string) {
    const currentGeneration = ++generation;
    mutationGeneration += 1;
    busyKey = '';
    error = '';
    notice = '';
    inviteEmail = '';
    if (!id) { members = []; invitations = []; invitationsUnavailable = false; loading = false; return; }
    const encodedId = encodeURIComponent(id);
    const cachedMembers = getCachedSettingsResponse(`/workspaces/${encodedId}/members`);
    const cachedInvitations = getCachedSettingsResponse(`/workspaces/${encodedId}/invitations`);
    members = cachedMembers?.response.ok ? listSettingsData<Member>(cachedMembers.body) : [];
    invitations = cachedInvitations?.response.ok ? listSettingsData<Invitation>(cachedInvitations.body) : [];
    invitationsUnavailable = cachedInvitations?.response.status === 404;
    // Member availability controls the section's loading state. The invitations
    // endpoint is independent and must not keep the whole People section loading.
    loading = !cachedMembers;
    const [membersSettled, invitationsSettled] = await Promise.allSettled([
      request(`/workspaces/${encodedId}/members`),
      request(`/workspaces/${encodedId}/invitations`),
    ]);
    if (currentGeneration !== generation || id !== workspaceId) return;

    if (membersSettled.status === 'fulfilled') {
      const result = membersSettled.value;
      if (result.response.ok) members = listSettingsData<Member>(result.body);
      else if (result.response.status !== 403 && result.response.status !== 404) {
        error = settingsErrorMessage(result.response.status, getSettingsErrorCode(result.body));
      }
    } else {
      error = settingsErrorMessage(0, 'network_error');
    }

    if (invitationsSettled.status === 'fulfilled') {
      const result = invitationsSettled.value;
      invitationsUnavailable = result.response.status === 404;
      if (result.response.ok) invitations = listSettingsData<Invitation>(result.body);
      else if (result.response.status !== 403 && result.response.status !== 404 && !error) {
        error = settingsErrorMessage(result.response.status, getSettingsErrorCode(result.body));
      }
    } else if (!error) {
      error = settingsErrorMessage(0, 'network_error');
    }
    loading = false;
  }

  async function perform<T = unknown>(key: string, id: string, path: string, init: RequestInit = {}): Promise<{ ok: boolean; value: T | null }> {
    const currentMutation = ++mutationGeneration;
    busyKey = key;
    error = '';
    notice = '';
    try {
      const { response, body } = await request(path, init);
      if (id !== workspaceId) return { ok: false, value: null };
      if (!response.ok) {
        error = settingsErrorMessage(response.status, getSettingsErrorCode(body));
        return { ok: false, value: null };
      }
      return { ok: true, value: body as T | null };
    } catch {
      if (id === workspaceId) error = settingsErrorMessage(0, 'network_error');
      return { ok: false, value: null };
    } finally {
      if (currentMutation === mutationGeneration) busyKey = '';
    }
  }

  async function sendInvitation(event: SubmitEvent) {
    event.preventDefault();
    const id = workspaceId;
    const email = inviteEmail.trim();
    if (!id || !canManageWorkspace || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const result = await perform<Invitation>('invite', id, `/workspaces/${encodeURIComponent(id)}/invitations`, {
      method: 'POST', body: JSON.stringify({ email }),
    });
    if (!result.ok || !result.value || id !== workspaceId) return;
    const invitation = result.value;
    invitations = [invitation, ...invitations.filter((item) => item.id !== invitation.id)];
    inviteEmail = '';
    notice = invitation.email_delivery === 'stubbed'
      ? 'Invitation recorded. Email delivery is not connected yet; share the invite through your current onboarding process.'
      : 'Invitation created.';
  }

  async function changeRole(member: Member, role: 'admin' | 'member') {
    const id = workspaceId;
    if (!id || member.account_owner || !canManageWorkspace || member.role === role) return;
    const result = await perform<Member>('role', id, `/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(member.user_id)}`, {
      method: 'PATCH', body: JSON.stringify({ role }),
    });
    if (!result.ok || id !== workspaceId) return;
    members = members.map((item) => item.user_id === member.user_id ? { ...item, role: result.value?.role ?? role } : item);
    notice = `Role updated for ${member.email}.`;
  }

  async function removeMember(member: Member) {
    const id = workspaceId;
    if (!id || member.account_owner || !canManageWorkspace) return;
    if (!confirm(`Remove ${member.email} from this workspace?`)) return;
    const result = await perform<unknown>('remove-member', id, `/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(member.user_id)}`, { method: 'DELETE' });
    if (!result.ok || id !== workspaceId) return;
    members = members.filter((item) => item.user_id !== member.user_id);
    notice = `${member.email} removed from this workspace.`;
  }

  async function revokeInvitation(invitation: Invitation) {
    const id = workspaceId;
    if (!id || !canManageWorkspace) return;
    if (!confirm(`Revoke the invitation for ${invitation.email}?`)) return;
    const result = await perform<unknown>('revoke-invitation', id, `/workspaces/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitation.id)}`, { method: 'DELETE' });
    if (!result.ok || id !== workspaceId) return;
    invitations = invitations.filter((item) => item.id !== invitation.id);
    notice = `Invitation for ${invitation.email} revoked.`;
  }

  function formatDate(value: string | null | undefined): string {
    return value ? formatDateTime(value, 'Date unavailable') : 'Not scheduled';
  }
</script>

<section class="settings-card" aria-labelledby="settings-people-title">
  <div class="settings-card__heading"><div><p class="settings-kicker">TEAM DIRECTORY</p><h2 id="settings-people-title">The people behind the signals.</h2><p>Review access and adjust workspace roles. Account-owner safeguards are enforced by the API.</p></div><span class="settings-card__symbol">◎</span></div>
  {#if error}<div class="settings-alert settings-alert--error" role="alert"><strong>Couldn’t complete that.</strong><span>{error}</span>{#if error.includes('verify your identity')}<a href="/login">Sign in again ↗</a>{/if}</div>{/if}
  {#if notice}<div class="settings-alert settings-alert--success" role="status">{notice}</div>{/if}
  {#if loading}<p class="settings-empty" aria-live="polite">Loading workspace members…</p>{/if}
  {#if members.length}
    <div class="settings-table-wrap"><table class="settings-table"><thead><tr><th>Person</th><th>Access</th><th>Actions</th></tr></thead><tbody>
      {#each members as member (member.user_id)}
        <tr><td><strong>{member.display_name || member.email}</strong><small>{member.email}</small></td><td>{#if member.account_owner}<span class="settings-pill">Account owner</span>{:else if canManageWorkspace}<select aria-label={`Role for ${member.email}`} value={member.role ?? 'member'} on:change={(event) => changeRole(member, (event.currentTarget as HTMLSelectElement).value as 'admin' | 'member')} disabled={!!busyKey}><option value="member">Member</option><option value="admin">Admin</option></select>{:else}<span class="settings-pill">{member.role ?? 'Member'}</span>{/if}</td><td>{#if canManageWorkspace && !member.account_owner}<button class="settings-text-button settings-text-button--danger" type="button" on:click={() => removeMember(member)} disabled={!!busyKey}>Remove</button>{:else}<span class="settings-note">Protected</span>{/if}</td></tr>
      {/each}
    </tbody></table></div>
  {:else if !loading}<p class="settings-empty">No member records are available for this workspace, or you don’t have permission to view them.</p>{/if}
</section>

<section class="settings-card" aria-labelledby="settings-invitations-title">
  <div class="settings-card__heading"><div><p class="settings-kicker">INVITATIONS</p><h2 id="settings-invitations-title">Bring the right people in.</h2><p>Invitations are recorded by the API. Email delivery is currently stubbed and is not sent automatically.</p></div><span class="settings-card__symbol">↗</span></div>
  {#if canManageWorkspace}
    <form class="settings-inline-form" on:submit={sendInvitation}><label class="settings-field"><span>Email address</span><input bind:value={inviteEmail} type="email" maxlength="320" required placeholder="teammate@company.com" /></label><button class="settings-button settings-button--primary" type="submit" disabled={!!busyKey}>{busyKey === 'invite' ? 'Adding…' : 'Create invitation'}</button></form>
  {:else}<p class="settings-note">Only workspace owners and admins can manage invitations.</p>{/if}
  {#if invitations.length}<div class="settings-list">{#each invitations as invitation (invitation.id)}<div class="settings-list-row"><div><strong>{invitation.email}</strong><small>Expires {formatDate(invitation.expires_at)} · {invitation.role}</small></div>{#if canManageWorkspace}<button class="settings-text-button settings-text-button--danger" type="button" on:click={() => revokeInvitation(invitation)} disabled={!!busyKey}>Revoke</button>{/if}</div>{/each}</div>{:else if invitationsUnavailable}<p class="settings-empty">Invitations are currently unavailable for this workspace.</p>{:else if !loading}<p class="settings-empty">No pending invitations.</p>{/if}
</section>
