<svelte:options runes={true} />
<script lang="ts">
  import * as v from 'valibot';
  import { onMount } from 'svelte';
  import { createMutation, createQuery } from '@tanstack/svelte-query';
  import { AlertTriangle, KeyRound, MonitorSmartphone, Plus, ShieldCheck, Users } from '@lucide/svelte';
  import * as AlertDialog from '@/components/ui/alert-dialog';
  import { Button } from '@/components/ui/button';
  import { ApiClientError } from '@/lib/client/api-client';
    import { getSharedQueryClient } from '@/lib/client/query-client';
  import {
    accountSessionErrorMessage,
    accountSessionQueryOptions,
    requestPasswordResetMutationOptions,
    revokeAllAccountSessionsMutationOptions,
  } from '@/lib/client/account-settings-api';
  import { parseApiBody, settingsAccountCreateSchema, settingsAccountLifecycleSchema, settingsAcknowledgementSchema, settingsAccountSchema } from '@/lib/client/api-schemas';
  import type { SettingsAccountContract } from '@/lib/client/api-schemas';
  import { loadWorkspaceBootstrap, type WorkspaceContext } from '@/lib/client/workspace-bootstrap';
  import { getCachedSettingsResponse, getSettingsErrorCode, listSettingsData, requestSettingsApi, settingsErrorMessage } from '@/lib/client/settings-api';
  import { formatDateTime } from '@/lib/client/date-format';
  import { readActiveWorkspaceId, resolveAndPersistWorkspaceId } from '@/lib/client/workspace-preference';

  type Account = SettingsAccountContract;
  type ConfirmationAction = 'transfer' | 'closure' | 'cancel-closure' | 'revoke-all' | null;
  let workspaces = $state<WorkspaceContext[]>([]);
  let selectedWorkspaceId = $state('');
  let accounts = $state<Account[]>([]);
  let loading = $state(true);
  let error = $state('');
  let notice = $state('');
  let busyKey = $state('');
  let accountForm = $state({ newOwnerUserId: '', closureConfirm: false, createAccountName: '' });
  let settingsUi = $state({ showCreateAccount: false });
  let confirmationOpen = $state(false);
  let confirmationAction = $state<ConfirmationAction>(null);
  let loadGeneration = 0;

  const selectedWorkspace = $derived(workspaces.find((item) => item.id === selectedWorkspaceId) ?? null);
  const selectedAccount = $derived(accounts.find((item) => item.account_id === selectedWorkspace?.account_id) ?? null);
  const accountQueryClient = getSharedQueryClient();
  const sessionsQuery = createQuery(() => accountSessionQueryOptions(), () => accountQueryClient);
  const passwordResetMutation = createMutation(() => requestPasswordResetMutationOptions(), () => accountQueryClient);
  const revokeAllSessionsMutation = createMutation(() => revokeAllAccountSessionsMutationOptions(accountQueryClient), () => accountQueryClient);
  const sessions = $derived(sessionsQuery.data?.data ?? []);

  const confirmationDetails = $derived.by(() => {
    switch (confirmationAction) {
      case 'transfer': return {
        title: 'Transfer account ownership?',
        description: 'You may lose owner privileges after this transfer. Only continue if you have verified the new owner.',
        action: 'Transfer ownership',
      };
      case 'closure': return {
        title: 'Schedule account closure?',
        description: 'Monitoring will stop and this account will be scheduled for deletion. Billing cancellation is not guaranteed by this action.',
        action: 'Schedule closure',
      };
      case 'cancel-closure': return {
        title: 'Cancel account closure?',
        description: 'If the recovery window is still open, this will cancel the scheduled closure.',
        action: 'Cancel closure',
      };
      case 'revoke-all': return {
        title: 'Revoke all active sessions?',
        description: 'All active sessions returned by the API will be revoked. This may include the browser you are using now, and you may need to sign in again. To sign out only this browser, use the application Sign out control.',
        action: 'Revoke all sessions',
      };
      default: return { title: '', description: '', action: 'Continue' };
    }
  });

  function openConfirmation(action: Exclude<ConfirmationAction, null>) {
    confirmationAction = action;
    confirmationOpen = true;
  }

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

  async function loadAccountData(keepNotice = false) {
    const generation = ++loadGeneration;
    const cachedAccounts = getCachedSettingsResponse('/accounts');
    const hasCachedAccounts = !!cachedAccounts?.response.ok;
    if (hasCachedAccounts) {
      try { accounts = listSettingsData(settingsAccountSchema, cachedAccounts.body); }
      catch { accounts = []; }
    }
    loading = !hasCachedAccounts;
    if (!keepNotice) { error = ''; notice = ''; }
    try {
      const bootstrap = await loadWorkspaceBootstrap();
      if (generation !== loadGeneration) return;
      if (!bootstrap.workspaces.ok) {
        error = settingsErrorMessage(bootstrap.workspaces.status, bootstrap.workspaces.code);
        workspaces = [];
        accounts = [];
        return;
      }
      const workspaceBody = bootstrap.workspaces.data;
      workspaces = Array.isArray(workspaceBody?.data) ? workspaceBody.data : [];
      selectedWorkspaceId = resolveAndPersistWorkspaceId(workspaces, [selectedWorkspaceId, readActiveWorkspaceId()]);
      if (generation === loadGeneration && hasCachedAccounts) loading = false;

      const accountsResult = await request('/accounts');
      if (generation !== loadGeneration) return;
      if (accountsResult.response.ok) {
        try { accounts = listSettingsData(settingsAccountSchema, accountsResult.body); }
        catch (caught) {
          error = caught instanceof ApiClientError
            ? settingsErrorMessage(caught.status, caught.code)
            : settingsErrorMessage(200, 'invalid_response');
        }
      } else if (accountsResult.response.status !== 404) {
        error = settingsErrorMessage(accountsResult.response.status, getSettingsErrorCode(accountsResult.body));
      }
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
      accountForm.createAccountName = '';
      settingsUi.showCreateAccount = false;
      notice = 'Account and team workspace created.';
    }
  }

  async function transferOwnership() {
    if (!selectedAccount || !selectedWorkspace?.account_owner) return;
    const userId = accountForm.newOwnerUserId.trim();
    if (!userId) { error = 'Enter the eligible new owner user ID.'; return; }
    const result = await perform('transfer-account', `/accounts/${encodeURIComponent(selectedAccount.account_id)}/transfer`, settingsAcknowledgementSchema, {
      method: 'POST', body: JSON.stringify({ new_owner_user_id: userId }),
    });
    if (result) {
      accountForm.newOwnerUserId = '';
      notice = 'Ownership transfer completed. Refreshing workspace permissions.';
      await loadAccountData(true);
    }
  }

  async function requestClosure() {
    if (!selectedAccount || !selectedWorkspace?.account_owner || !accountForm.closureConfirm) return;
    const result = await perform('close-account', `/accounts/${encodeURIComponent(selectedAccount.account_id)}/closure`, settingsAccountLifecycleSchema, {
      method: 'POST', body: JSON.stringify({ confirm: true }),
    });
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
    const result = await perform('cancel-closure', `/accounts/${encodeURIComponent(selectedAccount.account_id)}/closure/cancel`, settingsAccountLifecycleSchema, { method: 'POST' });
    if (result) {
      accounts = accounts.map((item) => item.account_id === selectedAccount.account_id
        ? { ...item, lifecycle_status: result.lifecycle_status ?? 'active', scheduled_deletion_at: null }
        : item);
      notice = 'Account closure cancelled.';
    }
  }

  async function submitPasswordReset() {
    if (passwordResetMutation.isPending) return;
    error = '';
    notice = '';
    try {
      const result = await passwordResetMutation.mutateAsync();
      if (result.requested) notice = 'Check your email for password-reset instructions.';
      else error = 'The password-reset request could not be confirmed. Please try again.';
    } catch (caught) {
      error = accountSessionErrorMessage(caught, 'Could not request a password reset. Please try again.');
    }
  }

  async function revokeAllSessions() {
    if (revokeAllSessionsMutation.isPending) return;
    error = '';
    notice = '';
    try {
      const result = await revokeAllSessionsMutation.mutateAsync();
      notice = result.revoked_count === 1
        ? 'Revocation requested for 1 session.'
        : `Revocation requested for ${result.revoked_count} sessions.`;
    } catch (caught) {
      error = accountSessionErrorMessage(caught, 'Could not revoke all sessions. Some sessions may have been revoked; the list is being refreshed.');
    }
  }

  async function confirmPendingAction() {
    const action = confirmationAction;
    confirmationOpen = false;
    confirmationAction = null;
    switch (action) {
      case 'transfer': await transferOwnership(); break;
      case 'closure': await requestClosure(); break;
      case 'cancel-closure': await cancelClosure(); break;
      case 'revoke-all': await revokeAllSessions(); break;
    }
  }

  function formatDate(value: string | null | undefined): string {
    return value ? formatDateTime(value, 'Date unavailable') : 'Not scheduled';
  }

  function formatStatus(value: string | null | undefined): string {
    if (!value) return 'Not reported';
    return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function sessionDeviceLabel(userAgent: string | null): string {
    if (!userAgent) return 'Device details unavailable';
    const browser = userAgent.includes('Edg/') ? 'Microsoft Edge'
      : userAgent.includes('Firefox/') ? 'Firefox'
      : userAgent.includes('Chrome/') && !userAgent.includes('Edg/') ? 'Chrome'
      : userAgent.includes('Safari/') && !userAgent.includes('Chrome/') ? 'Safari'
      : userAgent.includes('OPR/') ? 'Opera'
      : 'Browser';
    const platform = /iPhone|iPad/.test(userAgent) ? 'iOS'
      : /Android/.test(userAgent) ? 'Android'
      : /Mac OS/.test(userAgent) ? 'macOS'
      : /Windows/.test(userAgent) ? 'Windows'
      : /Linux/.test(userAgent) ? 'Linux'
      : 'device';
    return `${browser} on ${platform}`;
  }

  onMount(() => {
    void loadAccountData();
    return () => { loadGeneration += 1; };
  });
</script>

<div class="space-y-6 sm:space-y-8">
  {#if error}<div class="flex items-start gap-3 rounded-xl border border-status-error-border/40 bg-status-error-background/30 p-4 text-sm" role="alert"><AlertTriangle class="mt-0.5 size-4 shrink-0 text-status-error" aria-hidden="true" /><div><p class="font-medium">Couldn’t complete that.</p><p class="mt-1 text-muted-foreground">{error}</p>{#if error.includes('verify your identity')}<a class="mt-2 inline-flex underline underline-offset-4" href="/login">Sign in again ↗</a>{/if}</div></div>{/if}
  {#if notice}<div class="rounded-xl border border-status-success-border/40 bg-status-success-background/30 px-4 py-3 text-sm text-foreground" role="status">{notice}</div>{/if}

  <section class="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <div class="flex items-start gap-3 sm:gap-4">
      <div class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60"><KeyRound class="size-5 text-muted-foreground" aria-hidden="true" /></div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-semibold tracking-[0.16em] text-muted-foreground">PASSWORD</p>
        <h2 class="mt-2 text-lg font-semibold tracking-tight">Reset your password</h2>
        <p class="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Request a password-reset email for the verified email address on your account. TrueExit will ask your sign-in provider to send instructions; reset tokens are never handled here.</p>
        <div class="mt-4"><Button variant="outline" onclick={submitPasswordReset} disabled={passwordResetMutation.isPending}>{passwordResetMutation.isPending ? 'Requesting…' : 'Send reset instructions'}</Button></div>
      </div>
    </div>
  </section>

  <section class="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <div class="flex items-start gap-3 sm:gap-4">
      <div class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60"><MonitorSmartphone class="size-5 text-muted-foreground" aria-hidden="true" /></div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-semibold tracking-[0.16em] text-muted-foreground">SESSIONS</p>
        <h2 class="mt-2 text-lg font-semibold tracking-tight">Where you’re signed in</h2>
        <p class="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Review active sessions and revoke access when you no longer trust a session. Some details depend on your sign-in provider.</p>
      </div>
    </div>

    {#if sessionsQuery.isPending && !sessionsQuery.data}
      <div class="mt-5 flex items-center gap-3 rounded-xl border border-border bg-background/50 px-4 py-5 text-sm text-muted-foreground" role="status" aria-live="polite"><span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>Loading sessions…</div>
    {:else if sessionsQuery.error && !sessionsQuery.data}
      <div class="mt-5 rounded-xl border border-status-error-border/40 bg-status-error-background/20 p-4" role="alert"><p class="text-sm">{accountSessionErrorMessage(sessionsQuery.error, 'Could not load your sessions.')}</p><Button class="mt-3" variant="outline" onclick={() => void sessionsQuery.refetch()}>Try again</Button></div>
    {:else}
      {#if sessionsQuery.error}<div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-warning-border/40 bg-status-warning-background/20 p-3 text-sm" role="status"><span>Could not refresh sessions. Showing the last available results.</span><Button variant="outline" size="sm" onclick={() => void sessionsQuery.refetch()}>Retry</Button></div>{/if}
      {#if sessions.length === 0}
        <div class="mt-5 rounded-xl border border-dashed border-border px-4 py-8 text-center"><ShieldCheck class="mx-auto size-6 text-muted-foreground" aria-hidden="true" /><p class="mt-3 font-medium">No active sessions found</p><p class="mt-1 text-sm text-muted-foreground">The sign-in provider returned no active sessions for your account.</p></div>
      {:else}
        <div class="mt-5 space-y-3">
          {#each sessions as session (session.id)}
            <article class="rounded-xl border border-border bg-background/60 p-4 sm:p-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0"><p class="font-medium">{sessionDeviceLabel(session.user_agent)}</p><p class="mt-1 text-xs text-muted-foreground">{session.auth_method ? formatStatus(session.auth_method) : 'Authentication method unavailable'}</p></div>
                <span class="inline-flex shrink-0 items-center rounded-full border border-status-neutral-border/40 bg-muted/50 px-2.5 py-1 text-xs font-medium">{formatStatus(session.status ?? 'active')}</span>
              </div>
              <dl class="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div class="min-w-0"><dt class="text-xs text-muted-foreground">IP address</dt><dd class="mt-1 break-all">{session.ip_address ?? 'Unavailable'}</dd></div>
                <div class="min-w-0"><dt class="text-xs text-muted-foreground">Device / browser details</dt><dd class="mt-1 break-words text-muted-foreground">{session.user_agent ?? 'Unavailable'}</dd></div>
                <div><dt class="text-xs text-muted-foreground">Created</dt><dd class="mt-1">{formatDate(session.created_at)}</dd></div>
                <div><dt class="text-xs text-muted-foreground">Last updated</dt><dd class="mt-1">{formatDate(session.updated_at)}</dd></div>
                <div><dt class="text-xs text-muted-foreground">Expires</dt><dd class="mt-1">{formatDate(session.expires_at)}</dd></div>
              </dl>
            </article>
          {/each}
        </div>
        <div class="mt-4 rounded-xl border border-status-warning-border/30 bg-status-warning-background/10 p-4">
          <p class="text-sm text-muted-foreground">TrueExit cannot currently distinguish this browser's session from other sessions using the available API response. Individual revocation is disabled to avoid accidentally revoking the session you are using. Use the application Sign out control to sign out this browser.</p>
        </div>
      {/if}
      <div class="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div class="min-w-0"><h3 class="font-medium">Revoke all active sessions</h3><p class="mt-1 text-sm leading-5 text-muted-foreground">Revokes every active session returned by the API. This may include the browser you are using now, so you may need to sign in again.</p></div>
        <Button variant="destructive" class="shrink-0" onclick={() => openConfirmation('revoke-all')} disabled={revokeAllSessionsMutation.isPending || sessions.length === 0}>{revokeAllSessionsMutation.isPending ? 'Revoking sessions…' : 'Revoke all sessions'}</Button>
      </div>
    {/if}
  </section>

  {#if loading}
    <div class="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-8 text-sm text-muted-foreground" role="status" aria-live="polite"><span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>Loading account details…</div>
  {:else}
    <section class="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div class="flex items-start gap-3 sm:gap-4"><div class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60"><ShieldCheck class="size-5 text-muted-foreground" aria-hidden="true" /></div><div class="min-w-0 flex-1"><p class="text-xs font-semibold tracking-[0.16em] text-muted-foreground">ACCOUNT STATUS</p><h2 class="mt-2 text-lg font-semibold tracking-tight">Know where your account stands</h2><p class="mt-1 text-sm leading-6 text-muted-foreground">Account actions are restricted to the account owner and may require recent identity verification.</p></div></div>
      {#if selectedAccount}
        <dl class="mt-5 grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-border bg-background/60 p-4"><dt class="text-xs text-muted-foreground">Lifecycle status</dt><dd class="mt-2 font-medium">{formatStatus(selectedAccount.lifecycle_status)}</dd></div>
          <div class="rounded-xl border border-border bg-background/60 p-4"><dt class="text-xs text-muted-foreground">Scheduled deletion</dt><dd class="mt-2 font-medium">{formatDate(selectedAccount.scheduled_deletion_at)}</dd></div>
          <div class="rounded-xl border border-border bg-background/60 p-4"><dt class="text-xs text-muted-foreground">Billing cancellation</dt><dd class="mt-2 font-medium">{formatStatus(selectedAccount.billing_cancellation_status)}</dd></div>
        </dl>
        {#if selectedWorkspace?.account_owner}
          {#if selectedAccount.scheduled_deletion_at || selectedAccount.lifecycle_status.includes('closure')}
            <div class="mt-5 flex flex-col gap-4 rounded-xl border border-status-warning-border/40 bg-status-warning-background/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 class="font-medium">Closure is scheduled</h3><p class="mt-1 text-sm leading-5 text-muted-foreground">Monitoring has stopped for this account. If the recovery window is still open, you can cancel the scheduled closure.</p></div><Button variant="outline" class="shrink-0" onclick={() => openConfirmation('cancel-closure')} disabled={!!busyKey}>{busyKey === 'cancel-closure' ? 'Cancelling…' : 'Cancel closure'}</Button></div>
          {:else}
            <div class="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5"><h3 class="font-medium">Schedule account closure</h3><p class="mt-1 text-sm leading-5 text-muted-foreground">This stops monitoring and requests account closure. Scheduled deletion processing is not yet operational, and billing cancellation is not guaranteed by this action.</p><label class="mt-4 flex items-start gap-3 text-sm"><input class="mt-1 size-4 shrink-0 accent-current" bind:checked={accountForm.closureConfirm} type="checkbox" /><span>I understand monitoring will stop and this account will be scheduled for closure.</span></label><div class="mt-4"><Button variant="destructive" onclick={() => openConfirmation('closure')} disabled={!accountForm.closureConfirm || !!busyKey}>{busyKey === 'close-account' ? 'Scheduling…' : 'Schedule closure'}</Button></div></div>
          {/if}
        {:else}
          <p class="mt-4 rounded-lg border border-border bg-background/50 p-3 text-sm text-muted-foreground">Account lifecycle actions are only available to the account owner.</p>
        {/if}
      {:else}
        <p class="mt-5 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">This workspace is not associated with an account you own, or account details are unavailable.</p>
      {/if}
    </section>

    <section class="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div class="flex items-start gap-3 sm:gap-4"><div class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60"><Users class="size-5 text-muted-foreground" aria-hidden="true" /></div><div><p class="text-xs font-semibold tracking-[0.16em] text-muted-foreground">OWNERSHIP</p><h2 class="mt-2 text-lg font-semibold tracking-tight">Account ownership</h2><p class="mt-1 text-sm leading-6 text-muted-foreground">Transfer ownership only to an eligible user ID supplied by your identity or workspace administration workflow.</p></div></div>
      {#if selectedAccount && selectedWorkspace?.account_owner}
        <form class="mt-5 space-y-4" onsubmit={(event) => { event.preventDefault(); if (accountForm.newOwnerUserId.trim()) openConfirmation('transfer'); }}>
          <label class="block space-y-2 text-sm font-medium"><span>New owner user ID</span><input class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" bind:value={accountForm.newOwnerUserId} required autocomplete="off" placeholder="User ID" /></label>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p class="text-xs text-muted-foreground">Requires recent authentication.</p><Button type="submit" variant="outline" disabled={!!busyKey || !accountForm.newOwnerUserId.trim()}>{busyKey === 'transfer-account' ? 'Transferring…' : 'Transfer ownership'}</Button></div>
        </form>
      {:else}<p class="mt-4 text-sm text-muted-foreground">Ownership transfer is only available to the account owner.</p>{/if}
    </section>

    <section class="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div class="flex items-start gap-3 sm:gap-4"><div class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60"><Plus class="size-5 text-muted-foreground" aria-hidden="true" /></div><div><p class="text-xs font-semibold tracking-[0.16em] text-muted-foreground">NEW ACCOUNT</p><h2 class="mt-2 text-lg font-semibold tracking-tight">Start a separate account</h2><p class="mt-1 text-sm leading-6 text-muted-foreground">Creates an account and its initial team workspace. Recent authentication is required.</p></div></div>
      {#if !settingsUi.showCreateAccount}
        <div class="mt-4"><Button variant="outline" onclick={() => settingsUi.showCreateAccount = true}>Create account</Button></div>
      {:else}
        <form class="mt-5 space-y-4" onsubmit={createAccount}><label class="block space-y-2 text-sm font-medium"><span>Initial workspace name</span><input class="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" bind:value={accountForm.createAccountName} maxlength="120" required placeholder="Acme operations" /></label><div class="flex flex-wrap gap-2"><Button type="submit" disabled={!!busyKey}>{busyKey === 'create-account' ? 'Creating…' : 'Create account'}</Button><Button type="button" variant="ghost" onclick={() => { settingsUi.showCreateAccount = false; accountForm.createAccountName = ''; }}>Cancel</Button></div></form>
      {/if}
    </section>
  {/if}
</div>

<AlertDialog.Root bind:open={confirmationOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{confirmationDetails.title}</AlertDialog.Title>
      <AlertDialog.Description>{confirmationDetails.description}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={() => { confirmationAction = null; }}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action variant={confirmationAction === 'closure' || confirmationAction === 'revoke-all' ? 'destructive' : 'default'} onclick={() => void confirmPendingAction()}>{confirmationDetails.action}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
