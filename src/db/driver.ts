/**
 * The single seam between SQL and the platform.
 *
 * `expo-sqlite` is a native module and cannot run in a Node test process, so
 * repositories depend on this interface and never on `expo-sqlite` directly.
 * The same SQL then runs against `better-sqlite3` in tests and `expo-sqlite`
 * in the app.
 */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  run(sql: string, params?: readonly unknown[]): Promise<void>;
  transaction(fn: () => Promise<void>): Promise<void>;
}
