export type AppearancePreference = 'system' | 'light' | 'dark';
export type ResolvedAppearance = 'light' | 'dark';

const STORAGE_KEY = 'trueexit.appearance';

export function readAppearancePreference(): AppearancePreference {
  const fallback = document.documentElement.dataset.themePreference || 'system';
  try {
    const stored = localStorage.getItem(STORAGE_KEY) || fallback;
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return fallback === 'light' || fallback === 'dark' ? fallback : 'system';
  }
}

export function resolveAppearance(preference: AppearancePreference): ResolvedAppearance {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyAppearancePreference(
  preference: AppearancePreference,
  persist = true
): ResolvedAppearance {
  const resolved = resolveAppearance(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;

  const themeColor = document.querySelector<HTMLMetaElement>('[data-theme-color]');
  if (themeColor) {
    themeColor.content = resolved === 'dark'
      ? themeColor.dataset.darkColor ?? '#0a0a0a'
      : themeColor.dataset.lightColor ?? '#ffffff';
  }

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Theme still applies for this page when storage is unavailable.
    }
  }

  return resolved;
}
