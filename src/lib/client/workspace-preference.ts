const ACTIVE_WORKSPACE_KEY = 'trueexit.active-workspace-id';

export type WorkspaceIdentity = { id: string };

/** Read the user's last selected workspace, tolerating restricted storage contexts. */
export function readActiveWorkspaceId(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Persist the selected workspace in one place across all workspace surfaces. */
export function writeActiveWorkspaceId(workspaceId: string): void {
  if (!workspaceId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
  } catch {
    // The active workspace still applies for the current page if storage is unavailable.
  }
}

/** Resolve requested URL selection first, then the saved preference, then fallback. */
export function resolveWorkspaceId<T extends WorkspaceIdentity>(
  workspaces: readonly T[],
  preferredIds: readonly (string | null | undefined)[],
): string {
  for (const preferredId of preferredIds) {
    if (preferredId && workspaces.some((workspace) => workspace.id === preferredId)) return preferredId;
  }
  return workspaces[0]?.id ?? '';
}

/**
 * Resolve a selection against the currently available workspaces and persist
 * only the validated result. Keeping this transition together prevents callers
 * from persisting an unvalidated URL or stale workspace identifier.
 */
export function resolveAndPersistWorkspaceId<T extends WorkspaceIdentity>(
  workspaces: readonly T[],
  preferredIds: readonly (string | null | undefined)[],
): string {
  const workspaceId = resolveWorkspaceId(workspaces, preferredIds);
  writeActiveWorkspaceId(workspaceId);
  return workspaceId;
}
