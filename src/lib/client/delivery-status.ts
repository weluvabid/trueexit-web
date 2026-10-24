/**
 * Semantic styling for delivery-summary statuses exposed by the backend.
 *
 * Unrecognized and missing values remain neutral; they must not imply success.
 */
const DELIVERY_STATUS_CLASSES: Record<string, string> = {
  succeeded: 'border-status-success-border bg-status-success-background text-status-success',
  failed: 'border-status-error-border bg-status-error-background text-status-error',
  partial: 'border-status-warning-border bg-status-warning-background text-status-warning',
  in_progress: 'border-status-info-border bg-status-info-background text-status-info',
  no_channels: 'border-status-neutral-border bg-status-neutral-background text-status-neutral',
};

const UNKNOWN_DELIVERY_STATUS_CLASSES =
  'border-status-neutral-border bg-status-neutral-background text-status-neutral';

export function getDeliveryStatusClasses(value: unknown): string {
  if (typeof value !== 'string') return UNKNOWN_DELIVERY_STATUS_CLASSES;
  return DELIVERY_STATUS_CLASSES[value] ?? UNKNOWN_DELIVERY_STATUS_CLASSES;
}
