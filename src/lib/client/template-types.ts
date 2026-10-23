export type Primitive = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type FieldDefinition = {
  name: string;
  path: string;
  primitive: Primitive;
  meta?: Record<string, unknown>;
};

export type Template = {
  id: string;
  owner_user_id: string | null;
  kind: 'built_in' | 'custom';
  name: string;
  description: string;
  fields: FieldDefinition[];
  version: number;
  created_at: string;
  updated_at: string;
};
