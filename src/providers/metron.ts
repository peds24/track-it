import { generateEntries } from '@/providers/manual';
import type { MetadataProvider, SearchResult, SeriesDraft } from '@/providers/types';

const BASE_URL = 'https://metron.cloud/api';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * A minimal, dependency-free base64 encoder for the Basic-auth header. RN's
 * Hermes runtime does not reliably expose a global `btoa` across SDK/engine
 * combinations, and this needs no more than encoding a username:password
 * pair, so a small local implementation avoids depending on either the
 * platform global or a new package for one line of work.
 */
function toBase64(input: string): string {
  const bytes = utf8Bytes(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : BASE64_CHARS[b2 & 0x3f];
  }
  return out;
}

function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

type MetronSeriesRef = { id: number; name: string };
type MetronIssueListItem = { id: number; issue: string; series: MetronSeriesRef };
type MetronIssueListResponse = { results?: MetronIssueListItem[] };
type MetronIssueDetail = { id: number; series: MetronSeriesRef };
type MetronSeriesDetail = { issue_count?: number };

function toResults(body: MetronIssueListResponse): SearchResult[] {
  return (body.results ?? []).map((item) => ({
    id: String(item.id),
    // Metron's own display label, e.g. "Amazing Spider-Man (2018) #1".
    title: item.issue,
    category: 'comic',
    count: 1,
  }));
}

/**
 * Metron — comics only (D5). Issue-level data, not collected editions (those
 * are Google Books' job). Auth is HTTP Basic against a real user account,
 * the only auth model Metron offers — there is no app-scoped key to embed.
 */
export class MetronProvider implements MetadataProvider {
  readonly id = 'metron';

  private credentials(): { username: string; password: string } | null {
    const username = process.env.EXPO_PUBLIC_METRON_USERNAME;
    const password = process.env.EXPO_PUBLIC_METRON_PASSWORD;
    if (!username || !password) return null;
    return { username, password };
  }

  private async get<T>(path: string): Promise<T> {
    const creds = this.credentials();
    if (!creds) {
      throw new Error(
        'Metron search needs EXPO_PUBLIC_METRON_USERNAME/EXPO_PUBLIC_METRON_PASSWORD',
      );
    }
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Basic ${toBase64(`${creds.username}:${creds.password}`)}` },
    });
    if (!response.ok) throw new Error(`Metron request failed: ${response.status}`);
    return (await response.json()) as T;
  }

  /** A plain title query, e.g. from search-as-you-type — matched against the
   * issue's series name (`series_name`, confirmed against Metron's current
   * API README rather than assumed). */
  async search(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    const body = await this.get<MetronIssueListResponse>(
      `/issue/?series_name=${encodeURIComponent(trimmed)}`,
    );
    return toResults(body);
  }

  /**
   * The barcode path (A9): a scanned UPC-A alone identifies a series, not a
   * specific issue — the 5-digit EAN-5 supplemental printed beside it is what
   * actually pins the issue number, and `expo-camera` cannot read that
   * symbology at all. Given both codes, concatenate them for Metron's exact
   * `upc` filter — a single confident match. Given only the UPC-A (the
   * supplemental prompt was skipped), fall back to `upc_starts_with` — a
   * prefix match Metron documents specifically for "mobile barcode scanners
   * that only read the 12-digit UPC-A" — and let every candidate issue come
   * back as a pickable list, the same as a text search would.
   */
  async searchByUpc(upcA: string, ean5?: string): Promise<SearchResult[]> {
    const trimmedUpc = upcA.trim();
    const trimmedEan5 = ean5?.trim();
    const param =
      trimmedEan5 && trimmedEan5.length > 0
        ? `upc=${encodeURIComponent(trimmedUpc + trimmedEan5)}`
        : `upc_starts_with=${encodeURIComponent(trimmedUpc)}`;
    const body = await this.get<MetronIssueListResponse>(`/issue/?${param}`);
    return toResults(body);
  }

  /**
   * A matched issue names its series; the series endpoint gives a real issue
   * count (`issue_count`). Entries are still generated the `ManualProvider`
   * way — numbered "Issue 1".."Issue N" — just against that real total
   * instead of a guess, the same trade TMDB makes for a show.
   */
  async hydrate(result: SearchResult): Promise<SeriesDraft> {
    if (result.id === this.id) return generateEntries(result); // no real match — typed title.

    const issue = await this.get<MetronIssueDetail>(`/issue/${encodeURIComponent(result.id)}/`);
    const series = await this.get<MetronSeriesDetail>(
      `/series/${encodeURIComponent(String(issue.series.id))}/`,
    );
    const total = series.issue_count ?? 0;

    const draft = generateEntries({
      ...result,
      title: issue.series.name,
      count: total > 0 ? total : result.count,
    });
    return { ...draft, externalSource: this.id, externalId: result.id };
  }
}
