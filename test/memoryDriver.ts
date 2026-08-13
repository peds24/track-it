import Database from 'better-sqlite3';
import type { SqlDriver } from '@/db/driver';

/**
 * Test-only driver. `better-sqlite3` is synchronous; the methods are async so
 * that it satisfies the same `SqlDriver` interface as the Expo driver.
 */
export function createMemoryDriver(): SqlDriver {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  return {
    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },
    async all<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },
    async run(sql: string, params: readonly unknown[] = []): Promise<void> {
      db.prepare(sql).run(...params);
    },
    async transaction(fn: () => Promise<void>): Promise<void> {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
