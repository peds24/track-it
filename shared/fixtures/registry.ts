import { announcementFor } from '@/domain/whatsNew';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFn = (...args: any[]) => unknown;

/** Every function a fixture may name. Swift's runner (I3) mirrors this table. */
export const registry: Record<string, AnyFn> = {
  announcementFor,
};

/** JSON-safe, deterministic: Maps become objects (insertion order), undefined becomes null at the top level. */
export function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([k, v]) => [String(k), normalize(v)]));
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, normalize(v)]));
  }
  return value;
}
