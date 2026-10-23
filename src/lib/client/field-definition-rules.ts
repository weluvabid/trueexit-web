/**
 * Shared invariants for field definitions used by monitor and template editors.
 * Domain-specific validation and user-facing messages remain with each editor.
 */
export function hasDuplicateValues(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export function normalizeFieldName(name: string): string {
  return name.trim();
}

export function normalizeFieldPath(path: string): string {
  return path.trim();
}

/** A dot-separated path must not contain empty segments. */
export function isValidFieldPath(path: string): boolean {
  const normalizedPath = normalizeFieldPath(path);
  return normalizedPath.length > 0 && normalizedPath.split('.').every((segment) => segment.trim().length > 0);
}

/** Detect both exact duplicates and parent/child collisions such as `a` and `a.b`. */
export function findConflictingFieldPath(
  candidate: string,
  existingPaths: readonly string[],
): string | null {
  const path = normalizeFieldPath(candidate);
  for (const existingValue of existingPaths) {
    const existing = normalizeFieldPath(existingValue);
    if (existing === path || existing.startsWith(`${path}.`) || path.startsWith(`${existing}.`)) {
      return existing;
    }
  }
  return null;
}

