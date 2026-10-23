/**
 * Canonical numeric representation of field primitives in the backend contract.
 * Keep editor-friendly names and wire values mapped here rather than repeating
 * numeric literals across editor, validation, and serialization modules.
 */
export const PrimitiveCode = {
  size: 0,
  count: 1,
  duration: 2,
  timestamp: 3,
  boolean: 4,
  categorical: 5,
  checksum: 6,
  text: 7,
} as const;

export type PrimitiveName = keyof typeof PrimitiveCode;
export type PrimitiveValue = (typeof PrimitiveCode)[PrimitiveName];

export const PRIMITIVE_VALUES = [
  PrimitiveCode.size,
  PrimitiveCode.count,
  PrimitiveCode.duration,
  PrimitiveCode.timestamp,
  PrimitiveCode.boolean,
  PrimitiveCode.categorical,
  PrimitiveCode.checksum,
  PrimitiveCode.text,
] as const satisfies readonly PrimitiveValue[];

const primitiveNames = Object.keys(PrimitiveCode) as PrimitiveName[];
const primitiveValues = Object.values(PrimitiveCode) as PrimitiveValue[];

export function isPrimitiveValue(value: unknown): value is PrimitiveValue {
  return typeof value === 'number' && Number.isInteger(value) && primitiveValues.includes(value as PrimitiveValue);
}

export function isTimestampPrimitive(value: unknown): value is typeof PrimitiveCode.timestamp {
  return value === PrimitiveCode.timestamp;
}

export function fieldPrimitiveToValue(primitive: PrimitiveName): PrimitiveValue {
  return PrimitiveCode[primitive];
}

export function fieldPrimitiveFromValue(value: number): PrimitiveName | null {
  return primitiveNames.find((name) => PrimitiveCode[name] === value) ?? null;
}

export const ChecksumAlgorithm = {
  sha256: 0,
} as const;

export const ChecksumEncoding = {
  hexadecimal: 0,
} as const;
