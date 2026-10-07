import type { SqlDriver } from '@/db/driver';
import { migrate } from '@/db/schema';
import { createMemoryDriver } from '../../test/memoryDriver';
import { scenarioCalls } from './registry';
import type { Scenario } from './types';

const TABLES = ['series', 'entry', 'rating', 'app_meta'] as const;

function resolve(value: unknown, results: unknown[]): unknown {
  if (Array.isArray(value)) return value.map((v) => resolve(v, results));
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.$ref === 'number') {
      let v: unknown = results[o.$ref];
      for (const key of typeof o.path === 'string' ? o.path.split('.') : []) v = (v as Record<string, unknown>)[key];
      return o.json === true ? JSON.stringify(v) : v;
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolve(v, results)]));
  }
  return value;
}

/** Random ids → `#n`, numbered in insertion order: after each step, series
 * then entry ids, each by rowid. Swift numbers its own ids the same way. */
class IdTokens {
  private readonly tokens = new Map<string, string>();

  async learn(db: SqlDriver): Promise<void> {
    for (const table of ['series', 'entry']) {
      for (const { id } of await db.all<{ id: string }>(`SELECT id FROM ${table} ORDER BY rowid`)) {
        if (!this.tokens.has(id)) this.tokens.set(id, `#${this.tokens.size + 1}`);
      }
    }
  }

  normalize(value: unknown): unknown {
    if (value === undefined) return null;
    if (typeof value === 'string') {
      let out = value;
      for (const [id, token] of [...this.tokens].sort((a, b) => b[0].length - a[0].length)) out = out.split(id).join(token);
      return out;
    }
    if (value instanceof Map) return this.normalize(Object.fromEntries(value));
    if (Array.isArray(value)) return value.map((v) => this.normalize(v));
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, this.normalize(v)]),
      );
    }
    return value;
  }
}

export async function play(scenario: Scenario): Promise<Record<string, unknown>> {
  const db = createMemoryDriver();
  await migrate(db);
  const ids = new IdTokens();
  const results: unknown[] = [];
  const steps: Record<string, unknown>[] = [];
  for (const step of scenario.steps) {
    const call = scenarioCalls[step.call];
    if (!call) throw new Error(`No scenario call "${step.call}" (scenario "${scenario.name}")`);
    try {
      const result = await call(db, ...(resolve(step.args, results) as unknown[]));
      results.push(result);
      await ids.learn(db);
      steps.push({ call: step.call, args: step.args, result: ids.normalize(result) });
    } catch (e) {
      results.push(null);
      await ids.learn(db);
      steps.push({ call: step.call, args: step.args, throws: ids.normalize((e as Error).message) });
    }
  }
  const dump: Record<string, unknown> = {};
  for (const table of TABLES) dump[table] = ids.normalize(await db.all(`SELECT * FROM ${table} ORDER BY rowid`));
  return { name: scenario.name, steps, dump };
}
