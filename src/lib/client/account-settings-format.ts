import { formatDateTime } from './date-format';

/** Convert API status values into readable labels without changing their meaning. */
export function formatAccountStatus(value: string | null | undefined): string {
  if (!value) return 'Not reported';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Format account dates while distinguishing absent dates from unavailable session metadata. */
export function formatAccountDateTime(
  value: string | null | undefined,
  missingValue = 'Not scheduled',
): string {
  if (!value) return missingValue;
  return formatDateTime(value, 'Date unavailable');
}

/** Derive a conservative browser/platform label from a user-agent string. */
export function formatSessionDeviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Device details unavailable';

  const browser = userAgent.includes('Edg/') || userAgent.includes('EdgiOS/')
    ? 'Microsoft Edge'
    : userAgent.includes('OPR/') || userAgent.includes('OPiOS/')
      ? 'Opera'
      : userAgent.includes('FxiOS/') || userAgent.includes('Firefox/')
        ? 'Firefox'
        : userAgent.includes('CriOS/') || userAgent.includes('Chrome/')
          ? 'Chrome'
          : userAgent.includes('Safari/') && !userAgent.includes('Chromium/')
            ? 'Safari'
            : 'Browser';

  const platform = /iPhone|iPad|iPod/u.test(userAgent)
    ? 'iOS'
    : /Android/u.test(userAgent)
      ? 'Android'
      : /Mac OS/u.test(userAgent)
        ? 'macOS'
        : /Windows/u.test(userAgent)
          ? 'Windows'
          : /Linux/u.test(userAgent)
            ? 'Linux'
            : 'device';

  return `${browser} on ${platform}`;
}
