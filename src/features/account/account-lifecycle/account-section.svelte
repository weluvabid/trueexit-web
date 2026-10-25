<svelte:options runes={true} />
<script lang="ts">
  import type { SettingsAccountContract } from '@/lib/client/api-schemas';
  import type { WorkspaceContext } from '@/lib/client/workspace-bootstrap';

  type AccountForm = {
    newOwnerUserId: string;
    closureConfirm: boolean;
    createAccountName: string;
  };
  type SettingsUi = { appearancePreference: string; showCreateAccount: boolean };

  let {
    selectedAccount,
    selectedWorkspace,
    accountForm,
    settingsUi,
    busyKey,
    formatDate,
    cancelClosure,
    requestClosure,
    transferOwnership,
    createAccount,
  }: {
    selectedAccount: SettingsAccountContract | null;
    selectedWorkspace: WorkspaceContext | null;
    accountForm: AccountForm;
    settingsUi: SettingsUi;
    busyKey: string;
    formatDate: (value: string | null | undefined) => string;
    cancelClosure: () => void | Promise<void>;
    requestClosure: () => void | Promise<void>;
    transferOwnership: (event: SubmitEvent) => void | Promise<void>;
    createAccount: (event: SubmitEvent) => void | Promise<void>;
  } = $props();
</script>

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