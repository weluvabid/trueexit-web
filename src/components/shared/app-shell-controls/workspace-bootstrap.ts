import { loadWorkspaceBootstrap, type WorkspaceContext } from '../../../lib/client/workspace-bootstrap';
import {
  readActiveWorkspaceId,
  resolveAndPersistWorkspaceId
} from '../../../lib/client/workspace-preference';

export type WorkspaceSelectionState = {
  workspaces: WorkspaceContext[];
  activeWorkspaceId: string;
  error: string;
};

/**
 * Loads the available workspaces and resolves the active workspace from
 * the URL, the saved preference, and the user's personal workspace.
 */
export async function loadWorkspaceSelection(): Promise<WorkspaceSelectionState> {
  try {
    const result = await loadWorkspaceBootstrap();
    if (!result.workspaces.ok) throw new Error('workspace_load_failed');

    const workspaces = result.workspaces.data.data;
    const me = result.me.ok ? result.me.data : null;
    const requested = new URLSearchParams(window.location.search).get('workspace_id');
    const storedWorkspace = readActiveWorkspaceId();
    const activeWorkspaceId = resolveAndPersistWorkspaceId(
      workspaces,
      [requested, storedWorkspace, me?.personal_workspace_id]
    );

    return {
      workspaces,
      activeWorkspaceId,
      error: workspaces.length ? '' : 'No accessible workspace was returned for this account.'
    };
  } catch {
    return {
      workspaces: [],
      activeWorkspaceId: '',
      error: 'Could not load workspaces. Refresh to try again.'
    };
  }
}
