import type { EntryMediaType, UnitLabel } from '@/domain/types';

/**
 * Entry invariants, enforced in domain/ because the spec puts them here: every
 * write path (creation and import alike) has to agree on what a well-formed
 * entry is, and there is no delete or edit UI in v1 to repair one that slipped
 * through. This module stays pure — no db/, data/, ui/ or React imports.
 */

/** The media types an entry may carry when it has no parent series (D1). */
export type StandaloneMediaType = 'book' | 'movie';

const STANDALONE_MEDIA_TYPES: readonly string[] = ['book', 'movie'];

/**
 * A parentless entry is a book or a movie. Written as a type guard so read paths
 * can narrow to a `Category` by checking rather than asserting: an unchecked
 * `as Category` on stored data turns a corrupt row into a value outside the
 * union, which then matches no filter chip and cannot be removed.
 */
export function isStandaloneMediaType(mediaType: string): mediaType is StandaloneMediaType {
  return STANDALONE_MEDIA_TYPES.includes(mediaType);
}

/**
 * ISO-8601 date or date-time. The regex rejects the many strings `Date.parse`
 * accepts loosely (`"March 3 2026"`, `"300"`), because every sort in the app
 * compares these strings lexicographically — a non-ISO stamp silently corrupts
 * the ordering of the whole library.
 */
const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export function isIsoTimestamp(value: string): boolean {
  return ISO_8601.test(value) && !Number.isNaN(Date.parse(value));
}

export function assertIsoTimestamp(value: string | null | undefined, field: string): void {
  if (value === null || value === undefined) return;
  if (!isIsoTimestamp(value)) {
    throw new Error(`${field} must be an ISO-8601 timestamp, got: ${value}`);
  }
}

/** Ordinals number the units of a series: 1, 2, 3 — never negative, never fractional. */
export function assertOrdinal(value: number | null | undefined, field = 'ordinal'): void {
  if (value === null || value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative whole number, got: ${String(value)}`);
  }
}

/**
 * The parent/child invariant: an entry with a parent is tracked in the parent's
 * unit, and an entry without one is a standalone book or movie. Violating it
 * means an episode advanced under read-mode rules, or a row with a category no
 * filter can reach.
 */
export function assertMediaTypeMatchesParent(
  mediaType: EntryMediaType,
  parentUnitLabel: UnitLabel | null,
  label = 'entry',
): void {
  if (parentUnitLabel === null) {
    if (!isStandaloneMediaType(mediaType)) {
      throw new Error(`${label} has no parent series, so its media type must be book or movie, got: ${mediaType}`);
    }
    return;
  }
  if (mediaType !== parentUnitLabel) {
    throw new Error(
      `${label} has media type ${mediaType} but its series is tracked in ${parentUnitLabel}s`,
    );
  }
}

export type EntryInvariants = {
  /** Used only to name the offending row in error messages. */
  label?: string;
  mediaType: EntryMediaType;
  /** The parent series' unit label, or null when the entry has no parent. */
  parentUnitLabel: UnitLabel | null;
  ordinal?: number | null;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

/** Every entry invariant in one call, so no write path can enforce a subset. */
export function assertEntryInvariants(input: EntryInvariants): void {
  const label = input.label ?? 'entry';
  assertMediaTypeMatchesParent(input.mediaType, input.parentUnitLabel, label);
  assertOrdinal(input.ordinal, `${label} ordinal`);
  assertIsoTimestamp(input.createdAt, `${label} createdAt`);
  assertIsoTimestamp(input.startedAt, `${label} startedAt`);
  assertIsoTimestamp(input.finishedAt, `${label} finishedAt`);
}
