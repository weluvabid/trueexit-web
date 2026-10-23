import type { PrimitiveValue, TemplateContract } from './api-schemas';

export type Primitive = PrimitiveValue;
export type FieldDefinition = TemplateContract['fields'][number];
export type Template = TemplateContract;
