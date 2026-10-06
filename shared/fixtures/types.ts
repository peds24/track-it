/** One language-neutral behaviour vector (spec §3). Expected values are
 * recorded from the TS implementation, never written by hand. */
export type FixtureCase = { name: string; fn: string; args: unknown[] };
