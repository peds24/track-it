/** A value from an earlier step's result (0-based), optionally a dotted path
 * into it (array indexes allowed); `json: true` passes it JSON.stringify'd. */
export type Ref = { $ref: number; path?: string; json?: true };
export type Step = { call: string; args: unknown[] };
/** A sequence of repository calls on a fresh, migrated database (Iris I4). */
export type Scenario = { name: string; steps: Step[] };
