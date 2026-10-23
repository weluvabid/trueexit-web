<svelte:options runes={true} />
<script lang="ts">
  import * as v from 'valibot';
  import { ApiClientError } from '../../lib/client/api-client';
  import { settingsAcknowledgementSchema, settingsInvitationSchema, settingsMemberSchema } from '../../lib/client/api-schemas';
  import type { SettingsInvitationContract, SettingsMemberContract } from '../../lib/client/api-schemas';
  import { parseApiBody } from '../../lib/client/api-schemas';
  import { getCachedSettingsResponse, getSettingsErrorCode, listSettingsData, requestSettingsApi, settingsErrorMessage } from '../../lib/client/settings-api';
  import { formatDateTime } from '../../lib/client/date-format';

  let { workspaceId = '', canManageWorkspace = false, refreshKey = 0 }: { workspaceId?: string; canManageWorkspace?: boolean; refreshKey?: number } = $props();

  type Member = SettingsMemberContract;
  type Invitation = SettingsInvitationContract;

  let members = $state<Member[]>([]);
  let invitations = $state<Invitation[]>([]);
  let invitationsUnavailable = $state(false);
  let loading = $state(false);
  let busyKey = $state('');
  let error = $state('');
  let notice = $state('');
  let inviteEmail = $state('');

  let generation = 0;
  let mutationGeneration = 0;

  function isMemberRole(value: string): value is 'admin' | 'member' {
    return value === 'admin' || value === 'member';
  }

  function handleRoleChange(member: Member, value: string) {
    if (isMemberRole(value)) void changeRole(member, value);
  }

  $effect(() => {
    void loadPeople(workspaceId);
    // A parent refresh invalidates the current people load without changing workspace.
    void refreshKey;
  });

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
    members = [];
    invitations = [];
    try { if (cachedMembers?.response.ok) members = listSettingsData(settingsMemberSchema, cachedMembers.body); }
    catch { members = []; } // Cached data is revalidated before use.
    try { if (cachedInvitations?.response.ok) invitations = listSettingsData(settingsInvitationSchema, cachedInvitations.body); }
    catch { invitations = []; } // Cached data is revalidated before use.
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
      if (result.response.ok) {
        try { members = listSettingsData(settingsMemberSchema, result.body); }
        catch (caught) { error = caught instanceof ApiClientError ? settingsErrorMessage(caught.status, caught.code) : settingsErrorMessage(200, 'invalid_response'); }
      } else if (result.response.status !== 403 && result.response.status !== 404) {
        error = settingsErrorMessage(result.response.status, getSettingsErrorCode(result.body));
      }
    } else {
      error = settingsErrorMessage(0, 'network_error');
    }

    if (invitationsSettled.status === 'fulfilled') {
      const result = invitationsSettled.value;
      invitationsUnavailable = result.response.status === 404;
      if (result.response.ok) {
        try { invitations = listSettingsData(settingsInvitationSchema, result.body); }
        catch (caught) { if (!error) error = caught instanceof ApiClientError ? settingsErrorMessage(caught.status, caught.code) : settingsErrorMessage(200, 'invalid_response'); }
      } else if (result.response.status !== 403 && result.response.status !== 404 && !error) {
        error = settingsErrorMessage(result.response.status, getSettingsErrorCode(result.body));
      }
    } else if (!error) {
      error = settingsErrorMessage(0, 'network_error');
    }
    loading = false;
  }

  async function perform<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    key: string, id: string, path: string, schema: TSchema, init: RequestInit = {},
  ): Promise<{ ok: boolean; value: v.InferOutput<TSchema> | null }> {
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
      return { ok: true, value: parseApiBody(schema, body, { status: response.status }) };
    } catch (caught) {
      if (id === workspaceId) error = caught instanceof ApiClientError
        ? settingsErrorMessage(caught.status, caught.code)
        : settingsErrorMessage(0, 'network_error');
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
    const result = await perform('invite', id, `/workspaces/${encodeURIComponent(id)}/invitations`, settingsInvitationSchema, {
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
    const result = await perform('role', id, `/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(member.user_id)}`, settingsMemberSchema, {
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
    const result = await perform('remove-member', id, `/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(member.user_id)}`, settingsAcknowledgementSchema, { method: 'DELETE' });
    if (!result.ok || id !== workspaceId) return;
    members = members.filter((item) => item.user_id !== member.user_id);
    notice = `${member.email} removed from this workspace.`;
  }

  async function revokeInvitation(invitation: Invitation) {
    const id = workspaceId;
    if (!id || !canManageWorkspace) return;
    if (!confirm(`Revoke the invitation for ${invitation.email}?`)) return;
    const result = await perform('revoke-invitation', id, `/workspaces/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitation.id)}`, settingsAcknowledgementSchema, { method: 'DELETE' });
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
        <tr><td><strong>{member.display_name || member.email}</strong><small>{member.email}</small></td><td>{#if member.account_owner}<span class="settings-pill">Account owner</span>{:else if canManageWorkspace}<select aria-label={`Role for ${member.email}`} value={member.role ?? 'member'} onchange={(event) => handleRoleChange(member, event.currentTarget.value)} disabled={!!busyKey}><option value="member">Member</option><option value="admin">Admin</option></select>{:else}<span class="settings-pill">{member.role ?? 'Member'}</span>{/if}</td><td>{#if canManageWorkspace && !member.account_owner}<button class="settings-text-button settings-text-button--danger" type="button" onclick={() => removeMember(member)} disabled={!!busyKey}>Remove</button>{:else}<span class="settings-note">Protected</span>{/if}</td></tr>
      {/each}
    </tbody></table></div>
  {:else if !loading}<p class="settings-empty">No member records are available for this workspace, or you don’t have permission to view them.</p>{/if}
</section>

<section class="settings-card" aria-labelledby="settings-invitations-title">
  <div class="settings-card__heading"><div><p class="settings-kicker">INVITATIONS</p><h2 id="settings-invitations-title">Bring the right people in.</h2><p>Invitations are recorded by the API. Email delivery is currently stubbed and is not sent automatically.</p></div><span class="settings-card__symbol">↗</span></div>
  {#if canManageWorkspace}
    <form class="settings-inline-form" onsubmit={sendInvitation}><label class="settings-field"><span>Email address</span><input bind:value={inviteEmail} type="email" maxlength="320" required placeholder="teammate@company.com" /></label><button class="settings-button settings-button--primary" type="submit" disabled={!!busyKey}>{busyKey === 'invite' ? 'Adding…' : 'Create invitation'}</button></form>
  {:else}<p class="settings-note">Only workspace owners and admins can manage invitations.</p>{/if}
  {#if invitations.length}<div class="settings-list">{#each invitations as invitation (invitation.id)}<div class="settings-list-row"><div><strong>{invitation.email}</strong><small>Expires {formatDate(invitation.expires_at)} · {invitation.role}</small></div>{#if canManageWorkspace}<button class="settings-text-button settings-text-button--danger" type="button" onclick={() => revokeInvitation(invitation)} disabled={!!busyKey}>Revoke</button>{/if}</div>{/each}</div>{:else if invitationsUnavailable}<p class="settings-empty">Invitations are currently unavailable for this workspace.</p>{:else if !loading}<p class="settings-empty">No pending invitations.</p>{/if}
</section>
