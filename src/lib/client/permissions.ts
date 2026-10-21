/**
 * Central authorization boundary for frontend presentation decisions.
 *
 * The current adapter derives capabilities from the role/ownership context that
 * the existing API exposes. When the backend returns effective capabilities,
 * replace `resolveCapabilities` with an API-backed adapter; UI components should
 * continue consuming these capability names rather than interpreting roles.
 * Backend authorization remains authoritative in every case.
 */
export type WorkspaceAuthorizationContext = {
  id: string;
  personal: boolean;
  account_owner: boolean;
  role: 'admin' | 'member' | null;
};

export type TrueExitCapability =
  | 'workspace.view'
  | 'workspace.manage'
  | 'workspace.members.manage'
  | 'workspace.destinations.manage'
  | 'templates.view'
  | 'templates.create'
  | 'templates.update'
  | 'templates.delete'
  | 'monitors.view'
  | 'monitors.manage';

export type CapabilitySet = Readonly<Record<TrueExitCapability, boolean>>;

export interface PermissionAdapter {
  resolveCapabilities(context: WorkspaceAuthorizationContext): CapabilitySet;
}

/** Existing API adapter. Keep all role-to-capability assumptions isolated here. */
export const currentRolePermissionAdapter: PermissionAdapter = {
  resolveCapabilities(context) {
    const canAdministerWorkspace = context.personal || context.account_owner || context.role === 'admin';
    return Object.freeze({
      'workspace.view': true,
      'workspace.manage': canAdministerWorkspace,
      'workspace.members.manage': canAdministerWorkspace,
      'workspace.destinations.manage': canAdministerWorkspace,
      'templates.view': true,
      'templates.create': canAdministerWorkspace,
      'templates.update': canAdministerWorkspace,
      'templates.delete': canAdministerWorkspace,
      'monitors.view': true,
      'monitors.manage': canAdministerWorkspace,
    });
  },
};

// Swap this adapter in one place when effective capabilities become API-provided.
let activePermissionAdapter: PermissionAdapter = currentRolePermissionAdapter;

export function configurePermissionAdapter(adapter: PermissionAdapter): void {
  activePermissionAdapter = adapter;
}

export function resolveCapabilities(context: WorkspaceAuthorizationContext): CapabilitySet {
  return activePermissionAdapter.resolveCapabilities(context);
}

export function can(context: WorkspaceAuthorizationContext | null | undefined, capability: TrueExitCapability): boolean {
  return context ? resolveCapabilities(context)[capability] : false;
}
