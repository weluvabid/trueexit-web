import { formatMonitorCadence } from './monitor-format';

export type WorkspaceTagOption = {
  id: string;
  name: string;
};

export type AddMonitorTagDraftInput = {
  input: string;
  selectedTagIds: readonly string[];
  newTagNames: readonly string[];
  workspaceTags: readonly WorkspaceTagOption[];
};

export type AddMonitorTagDraftResult =
  | { kind: 'unchanged' }
  | { kind: 'error'; message: string }
  | {
      kind: 'updated';
      selectedTagIds: string[];
      newTagNames: string[];
    };

/**
 * Apply tag-entry rules without mutating component state.
 * The caller owns applying the returned draft to the UI.
 */
export function addMonitorTagDraft(input: AddMonitorTagDraftInput): AddMonitorTagDraftResult {
  const name = input.input.trim().replace(/\s+/g, ' ');
  if (!name) return { kind: 'unchanged' };

  if (name.length > 40) {
    return { kind: 'error', message: 'Tag names must be 40 characters or fewer.' };
  }

  if (input.selectedTagIds.length + input.newTagNames.length >= 3) {
    return { kind: 'error', message: 'A monitor can have at most three tags.' };
  }

  const normalizedName = name.toLocaleLowerCase();
  const existing = input.workspaceTags.find((tag) => tag.name.toLocaleLowerCase() === normalizedName);
  let selectedTagIds = [...input.selectedTagIds];
  let newTagNames = [...input.newTagNames];

  if (existing) {
    if (!selectedTagIds.includes(existing.id)) selectedTagIds = [...selectedTagIds, existing.id];
  } else if (!newTagNames.some((tag) => tag.toLocaleLowerCase() === normalizedName)) {
    newTagNames = [...newTagNames, name];
  }

  return { kind: 'updated', selectedTagIds, newTagNames };
}

/** Return a new tag draft without the requested new tag. */
export function removeMonitorTagDraft(newTagNames: readonly string[], name: string): string[] {
  return newTagNames.filter((tag) => tag !== name);
}

export type CadenceDraft = {
  cadenceMode: 'interval';
  cadenceValue: string;
  cadenceUnit: 'seconds' | 'minutes' | 'hours';
  cadencePreview: string;
};

/** Convert a cadence in seconds into the editor's interval representation. */
export function getCadenceDraftFromSeconds(seconds: number): CadenceDraft {
  let cadenceValue: string;
  let cadenceUnit: CadenceDraft['cadenceUnit'];

  if (seconds % 3600 === 0) {
    cadenceValue = String(seconds / 3600);
    cadenceUnit = 'hours';
  } else if (seconds % 60 === 0) {
    cadenceValue = String(seconds / 60);
    cadenceUnit = 'minutes';
  } else {
    cadenceValue = String(seconds);
    cadenceUnit = 'seconds';
  }

  return {
    cadenceMode: 'interval',
    cadenceValue,
    cadenceUnit,
    cadencePreview: `Every ${formatMonitorCadence(seconds)}`,
  };
}
