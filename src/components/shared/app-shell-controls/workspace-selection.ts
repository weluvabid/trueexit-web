/**
 * Preserves the current page when switching workspaces, except that
 * monitor detail routes carry the selected workspace in their query string.
 */
export function createWorkspaceSwitchUrl(currentUrl: string, workspaceId: string): string {
  const url = new URL(currentUrl);
  if (url.pathname.startsWith('/monitors/')) {
    url.searchParams.set('workspace_id', workspaceId);
  } else {
    url.searchParams.delete('workspace_id');
  }
  return url.toString();
}
