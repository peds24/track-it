import { advance, completeUnits, ongoingPlaceholder, setPosition } from '@/domain/advance';
import {
  activityLine,
  cleanDescription,
  creatorLine,
  daysBetween,
  decodeEntities,
  formatDate,
  formatDuration,
  formatRelative,
  initialsOf,
  timelineOf,
  yearOf,
} from '@/domain/formatters';
import { genresFrom, withGenres } from '@/domain/genres';
import { isStatusValid, modeFor } from '@/domain/mode';
import {
  answer,
  formatScore,
  isPlaced,
  matchupReason,
  pickOpponent,
  placeInRanking,
  scoreAt,
  scoresFor,
  similarity,
  startRanking,
  type Answer,
  type RankedItem,
  type RatingProfile,
  type Sentiment,
} from '@/domain/rating';
import { currentSeason, ordinalFor, positionIn, seasonSegments } from '@/domain/seasons';
import { parseSeriesTitle, stripBareTrailingNumber } from '@/domain/seriesTitle';
import { nextEntry, progressFor, shelfForEntry, shelfForSeries } from '@/domain/shelf';
import {
  assertEntryInvariants,
  assertIsoTimestamp,
  assertMediaTypeMatchesParent,
  assertOrdinal,
  isIsoTimestamp,
  isStandaloneMediaType,
} from '@/domain/validate';
import { announcementFor } from '@/domain/whatsNew';

/** A whole ranking session as one vector: the opponents asked, in order,
 * and where the candidate lands. Not a TS export; Swift mirrors it (I3). */
function rankingScenario(candidate: RatingProfile, sentiment: Sentiment, ranking: RankedItem[], answers: Answer[]) {
  let session = startRanking(candidate, sentiment, ranking);
  const opponents: string[] = [];
  for (const choice of answers) {
    if (session.opponent === null) break;
    opponents.push(session.bucket[session.opponent]!.key);
    session = answer(session, choice);
  }
  return { opponents, lo: session.lo, comparisons: session.comparisons, placed: isPlaced(session) };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFn = (...args: any[]) => unknown;

/** Every function a fixture may name. Swift's runner (I3) mirrors this table. */
export const registry: Record<string, AnyFn> = {
  advance,
  setPosition,
  ongoingPlaceholder,
  completeUnits,
  shelfForEntry,
  shelfForSeries,
  progressFor,
  nextEntry,
  modeFor,
  isStatusValid,
  isStandaloneMediaType,
  isIsoTimestamp,
  assertIsoTimestamp,
  assertOrdinal,
  assertMediaTypeMatchesParent,
  assertEntryInvariants,
  parseSeriesTitle,
  stripBareTrailingNumber,
  genresFrom,
  withGenres,
  decodeEntities,
  cleanDescription,
  yearOf,
  initialsOf,
  creatorLine,
  timelineOf,
  daysBetween,
  formatDuration,
  formatRelative,
  formatDate,
  activityLine,
  seasonSegments,
  currentSeason,
  ordinalFor,
  positionIn,
  scoreAt,
  scoresFor,
  similarity,
  matchupReason,
  pickOpponent,
  startRanking,
  answer,
  isPlaced,
  placeInRanking,
  formatScore,
  rankingScenario,
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
