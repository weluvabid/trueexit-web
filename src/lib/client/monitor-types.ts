import type {
  MonitorContract,
  MonitorDetailContract,
  PrimitiveValue,
} from './api-schemas';

export type MonitorStatus = MonitorContract['status'];
export type Monitor = MonitorContract;
export type Primitive = PrimitiveValue;
export type MonitorConfigVersion = NonNullable<MonitorDetailContract['config_versions']>[number];
export type FieldDefinition = MonitorConfigVersion['config']['fields'][number];
export type MonitorDetail = MonitorDetailContract;
