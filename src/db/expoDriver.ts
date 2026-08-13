import * as SQLite from 'expo-sqlite';
import type { SqlDriver } from '@/db/driver';

export async function openExpoDatabase(name = 'trackit.db'): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA foreign_keys = ON');

  return {
    async exec(sql: string): Promise<void> {
      await db.execAsync(sql);
    },
    async all<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      return db.getAllAsync<T>(sql, params as SQLite.SQLiteBindValue[]);
    },
    async run(sql: string, params: readonly unknown[] = []): Promise<void> {
      await db.runAsync(sql, params as SQLite.SQLiteBindValue[]);
    },
    // `withTransactionAsync`, not `withExclusiveTransactionAsync`: the exclusive
    // variant opens a *second* connection and requires every statement inside to
    // run on the `txn` object it hands the callback. `SqlDriver.transaction`
    // takes a zero-argument callback whose statements go through this same
    // driver (this connection), so the exclusive variant would deadlock against
    // its own write lock. `withTransactionAsync` runs on this connection and is
    // also supported on web.
    async transaction(fn: () => Promise<void>): Promise<void> {
      await db.withTransactionAsync(async () => {
        await fn();
      });
    },
  };
}
