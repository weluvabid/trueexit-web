<svelte:options runes={true} />
<script lang="ts">
  import * as v from 'valibot';
  import { ApiClientError } from '../../lib/client/api-client';
  import { settingsAcknowledgementSchema, settingsInvitationSchema, settingsMemberSchema } from '../../lib/client/api-schemas';
  import type { SettingsInvitationContract, SettingsMemberContract } from '../../lib/client/api-schemas';
  import { parseApiBody } from '../../lib/client/api-schemas';
  import { getCachedSettingsResponse, getSettingsErrorCode, listSettingsData, requestSettingsApi, settingsErrorMessage } from '../../lib/client/settings-api';
  import { formatDateTime } from '../../lib/client/date-format';
  import * as Table from '../ui/table/index.js';
  import * as Select from '../ui/select/index.js';
  import { Button } from '../ui/button/index.js';
  import { Input } from '../ui/input/index.js';
  import { Label } from '../ui/label/index.js';
  import { Badge } from '../ui/badge/index.js';
  import * as Alert from '../ui/alert/index.js';
  import { UserPlus, ShieldCheck, Trash2, Mail, Clock, RefreshCw } from '@lucide/svelte';

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

<div class="space-y-6">
  <section class="space-y-4 rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="settings-people-title">
    <header class="flex items-start gap-3">
      <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"><ShieldCheck class="size-5 text-muted-foreground" /></div>
      <div class="min-w-0 space-y-1">
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Team directory</p>
        <h2 id="settings-people-title" class="text-lg font-semibold tracking-tight">Workspace members</h2>
        <p class="text-sm text-muted-foreground">Review access and adjust workspace roles. Account-owner safeguards are enforced by the API.</p>
      </div>
    </header>

    {#if error}
      <Alert.Root variant="destructive" role="alert">
        <Alert.Title>Couldn’t complete that.</Alert.Title>
        <Alert.Description>{error}{#if error.includes('verify your identity')} <a class="underline underline-offset-4" href="/login">Sign in again</a>{/if}</Alert.Description>
      </Alert.Root>
    {/if}
    {#if notice}
      <Alert.Root role="status">
        <Alert.Title>Update complete</Alert.Title>
        <Alert.Description>{notice}</Alert.Description>
      </Alert.Root>
    {/if}
    {#if loading}
      <p class="py-3 text-sm text-muted-foreground" aria-live="polite">Loading workspace members…</p>
    {/if}

    {#if members.length}
      <div class="overflow-hidden rounded-lg border">
        <Table.Root class="min-w-[38rem]">
          <Table.Header>
            <Table.Row class="bg-muted/50 hover:bg-muted/50">
              <Table.Head>Person</Table.Head>
              <Table.Head>Access</Table.Head>
              <Table.Head class="text-right">Actions</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each members as member (member.user_id)}
              <Table.Row>
                <Table.Cell class="whitespace-normal">
                  <div class="min-w-0">
                    <p class="font-medium">{member.display_name || member.email}</p>
                    <p class="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  {#if member.account_owner}
                    <Badge variant="outline"><ShieldCheck class="mr-1 size-3" />Account owner</Badge>
                  {:else if canManageWorkspace}
                    <Select.Root type="single" value={member.role ?? 'member'} onValueChange={(value) => handleRoleChange(member, value)} disabled={!!busyKey}>
                      <Select.Trigger class="w-32" aria-label={`Role for ${member.email}`}>
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="member" label="Member">Member</Select.Item>
                        <Select.Item value="admin" label="Admin">Admin</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  {:else}
                    <Badge variant="secondary" class="capitalize">{member.role ?? 'member'}</Badge>
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right">
                  {#if canManageWorkspace && !member.account_owner}
                    <Button variant="destructive" size="sm" onclick={() => removeMember(member)} disabled={!!busyKey}>
                      <Trash2 class="mr-1 size-3.5" />Remove
                    </Button>
                  {:else}
                    <span class="text-xs text-muted-foreground">Protected</span>
                  {/if}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {:else if !loading}
      <div class="rounded-lg border border-dashed p-8 text-center">
        <p class="font-medium">No member records available</p>
        <p class="mt-1 text-sm text-muted-foreground">The workspace may have no visible member records, or you may not have permission to view them.</p>
      </div>
    {/if}
  </section>

  <section class="space-y-4 rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="settings-invitations-title">
    <header class="flex items-start gap-3">
      <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"><Mail class="size-5 text-muted-foreground" /></div>
      <div class="min-w-0 space-y-1">
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Invitations</p>
        <h2 id="settings-invitations-title" class="text-lg font-semibold tracking-tight">Invite teammates</h2>
        <p class="text-sm text-muted-foreground">Invitations are recorded by the API. Email delivery is currently stubbed and is not sent automatically.</p>
      </div>
    </header>

    {#if canManageWorkspace}
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" onsubmit={sendInvitation}>
        <div class="grid flex-1 gap-2">
          <Label for="settings-invite-email">Email address</Label>
          <Input id="settings-invite-email" bind:value={inviteEmail} type="email" maxlength={320} required placeholder="teammate@company.com" />
        </div>
        <Button type="submit" disabled={!!busyKey}>
          <UserPlus class="mr-1 size-4" />
          {busyKey === 'invite' ? 'Adding…' : 'Create invitation'}
        </Button>
      </form>
    {:else}
      <p class="text-sm text-muted-foreground">Only workspace owners and admins can manage invitations.</p>
    {/if}

    {#if invitations.length}
      <div class="divide-y rounded-lg border">
        {#each invitations as invitation (invitation.id)}
          <div class="flex flex-wrap items-center justify-between gap-3 p-4">
            <div class="min-w-0">
              <p class="font-medium">{invitation.email}</p>
              <p class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock class="size-3.5" /> Expires {formatDate(invitation.expires_at)} · <span class="capitalize">{invitation.role}</span></p>
            </div>
            {#if canManageWorkspace}
              <Button variant="destructive" size="sm" onclick={() => revokeInvitation(invitation)} disabled={!!busyKey}>
                <Trash2 class="mr-1 size-3.5" />Revoke
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    {:else if invitationsUnavailable}
      <p class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Invitations are currently unavailable for this workspace.</p>
    {:else if !loading}
      <p class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No pending invitations.</p>
    {/if}
  </section>
</div>
