export function templateErrorMessage(status: number, code: string | null): string {
  if (status === 401) return 'Your session needs attention. Sign in again to continue.';
  if (status === 403) return 'You do not have permission to manage templates in this workspace.';
  if (status === 404) return 'This template or workspace is no longer available.';
  if (status === 409) {
    return code === 'version_conflict' || code === 'template_version_conflict'
      ? 'This template changed elsewhere. Reload it before saving your changes.'
      : 'This operation conflicts with the current state. Refresh and try again.';
  }
  if (status === 422) return 'The template was not accepted. Check its fields and try again.';
  if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
  if (status >= 500) return 'TrueExit could not complete this request right now. Try again shortly.';
  return code ? `The request could not be completed (${code}).` : 'The request could not be completed.';
}
