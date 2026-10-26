import type { AppearancePreference } from '@/components/shared/app-shell-controls/appearance-preference';

const INITIAL_PREFERENCE_TIMEOUT_MS = 1_500;

/**
 * Read the account's theme before HTML is rendered so a first visit on a new
 * device can apply the persisted preference before the browser paints the page.
 * Fail closed to the local cache/system default when the API is unavailable.
 */
export async function loadInitialAppearancePreference(
  accessToken: string | null | undefined,
): Promise<AppearancePreference | null> {
  const rawBaseUrl = import.meta.env.TRUEEXIT_API_BASE_URL;
  if (!accessToken || !rawBaseUrl) return null;

  let endpoint: URL;
  try {
    const baseUrl = new URL(rawBaseUrl);
    if (
      !['http:', 'https:'].includes(baseUrl.protocol)
      || baseUrl.username
      || baseUrl.password
      || baseUrl.search
      || baseUrl.hash
    ) return null;
    endpoint = new URL(`${baseUrl.toString().replace(/\/+$/, '')}/me/preferences`);
  } catch {
    return null;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(INITIAL_PREFERENCE_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('theme' in body)) return null;
    const theme = body.theme;
    return theme === 'system' || theme === 'light' || theme === 'dark' ? theme : null;
  } catch {
    return null;
  }
}
