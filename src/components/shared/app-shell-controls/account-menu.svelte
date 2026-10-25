<script lang="ts">
  import * as DropdownMenu from '../../ui/dropdown-menu/index.js';
  import { UserRound, LogOut, ArrowUpRight } from '@lucide/svelte';
  import { clearPersistedQueryCache } from '../../../lib/client/query-client';

  let {
    email = 'Signed in',
    initials = 'TE',
    open = $bindable(false),
    onNavigate
  }: {
    email?: string;
    initials?: string;
    open?: boolean;
    onNavigate: (href: string) => void;
  } = $props();

  function signOut() {
    void clearPersistedQueryCache().finally(() => window.location.assign('/logout'));
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="account-menu__trigger" aria-label="Open account menu">
    <span class="account-avatar" aria-hidden="true">{initials}</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="w-64" align="end">
    <div class="flex items-center gap-3 px-2 py-2">
      <span class="account-avatar account-avatar--large" aria-hidden="true">{initials}</span>
      <span class="min-w-0 truncate text-xs font-medium" title={email}>{email}</span>
    </div>
    <DropdownMenu.Separator />
    <DropdownMenu.Item onSelect={() => onNavigate('/account')}>
      <UserRound class="size-4" /> Account settings <ArrowUpRight class="ml-auto size-4" />
    </DropdownMenu.Item>
    <DropdownMenu.Item variant="destructive" onSelect={signOut}>
      <LogOut class="size-4" /> Sign out <ArrowUpRight class="ml-auto size-4" />
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
