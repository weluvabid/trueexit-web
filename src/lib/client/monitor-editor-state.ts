export type ChannelKind = 'email' | 'webhook' | 'slack' | 'discord';
import { fieldPrimitiveFromValue, fieldPrimitiveToValue, type PrimitiveName } from './field-primitives';

export type FieldPrimitive = PrimitiveName;
export { fieldPrimitiveFromValue, fieldPrimitiveToValue };
export type MonitorField = { key: number; name: string; path: string; primitive: FieldPrimitive };
export type ExistingChannelSelection = { kind: 'existing'; channel_id: string; label: string };
export type NewChannelSelection = { kind: 'new'; type: ChannelKind; label: string; priority: number; enabled: boolean; config: Record<string, unknown>; displayLabel: string };
export type ChannelSelection = ExistingChannelSelection | NewChannelSelection;



export type MonitorEditorDraft = {
  name: string;
  description: string;
  cadenceMode: 'interval' | 'cron';
  cadenceValue: string;
  cadenceUnit: 'seconds' | 'minutes' | 'hours';
  cronExpression: string;
  fields: MonitorField[];
  nextFieldKey: number;
  channelSelection: ChannelSelection[];
  channelSelectionWorkspaceId: string;
};

export function createEmptyMonitorDraft(): MonitorEditorDraft {
  return {
    name: '',
    description: '',
    cadenceMode: 'interval',
    cadenceValue: '5',
    cadenceUnit: 'minutes',
    cronExpression: '*/5 * * * *',
    fields: [{ key: 1, name: '', path: '', primitive: 'count' }],
    nextFieldKey: 2,
    channelSelection: [],
    channelSelectionWorkspaceId: '',
  };
}

export function createMonitorDraft(input: {
  name: string;
  description?: string | null;
  fields: Array<{ name: string; path: string; primitive: FieldPrimitive }>;
  channelSelection: ChannelSelection[];
  workspaceId: string;
}): MonitorEditorDraft {
  const draft = createEmptyMonitorDraft();
  const fields = input.fields.map((field, index) => ({ ...field, key: index + 1 }));
  return {
    ...draft,
    name: input.name,
    description: input.description ?? '',
    fields: fields.length ? fields : draft.fields,
    nextFieldKey: fields.length + 1,
    channelSelection: input.channelSelection,
    channelSelectionWorkspaceId: input.workspaceId,
  };
}

export function serializeMonitorChannelSelection(selection: ChannelSelection[]) {
  return selection.map((item) => item.kind === 'existing'
    ? { kind: 'existing' as const, channel_id: item.channel_id }
    : {
        kind: 'new' as const,
        type: item.type,
        label: item.label,
        priority: item.priority,
        enabled: item.enabled,
        config: item.config,
      });
}
