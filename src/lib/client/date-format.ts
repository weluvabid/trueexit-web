/** Format an ISO-like date value consistently across workspace surfaces. */
export function formatDateTime(
  value: unknown,
  unavailable = 'Time unavailable',
): string {
  if (typeof value !== 'string' || !value) return unavailable;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unavailable;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
