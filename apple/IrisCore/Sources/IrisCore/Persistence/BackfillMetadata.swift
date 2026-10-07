import Foundation
import GRDB

public struct BackfillResult: Equatable, Sendable {
    public var filled = 0, skipped = 0, failed = 0
}

/// Minimum gap between two lookups against the same source. Metron allows
/// ~20 requests/min and each row costs two; AniList's limit is per minute too.
private let sourceGapMs: [String: Double] = ["metron": 3500, "anilist": 2000, "tmdb": 0, "google-books": 0]

private struct Pending: Sendable { let table: String, id: String, category: Category?, source: String, externalId: String }

/// `new Date().toISOString()`.
public func isoNow() -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: Date())
}

/// Port of src/data/backfillMetadata.ts (A22/A26): matched rows without
/// metadata (or genres) get one paced lookup; a row is stamped when the
/// lookup answered, left for next launch when it failed. COALESCE keeps
/// anything already stored. The read and each write are their own
/// transactions — the network is never awaited inside a write.
public func backfillMetadata(
    _ writer: some DatabaseWriter,
    resolve: @Sendable (String, Category) -> (any MetadataProvider)?,
    now: @Sendable () -> String = isoNow,
    sleep: @Sendable (Double) async -> Void = { try? await Task.sleep(for: .milliseconds($0)) }
) async -> BackfillResult {
    let pending: [Pending] = (try? await writer.read { db in
        func rows(_ table: String, _ sql: String) throws -> [Pending] {
            try Row.fetchAll(db, sql: sql).map { r in
                Pending(table: table, id: r["id"], category: Category(rawValue: r["media_type"] ?? ""), source: r["external_source"], externalId: r["external_id"])
            }
        }
        // No ORDER BY, as in TS: both platforms scan in rowid order.
        return try rows("series", """
            SELECT id, media_type, external_source, external_id FROM series
            WHERE external_source IS NOT NULL AND external_id IS NOT NULL
              AND (metadata_checked_at IS NULL OR genres_json IS NULL)
            """) + rows("entry", """
            SELECT id, media_type, external_source, external_id FROM entry
            WHERE series_id IS NULL AND external_source IS NOT NULL AND external_id IS NOT NULL
              AND (metadata_checked_at IS NULL OR genres_json IS NULL)
            """)
    }) ?? []

    var result = BackfillResult()
    var queried = Set<String>()
    for row in pending {
        // A standalone row's media_type is always a Category (book, movie); anything else resolves to nothing.
        let provider = row.category.flatMap { resolve(row.source, $0) } as? any DetailsProvider
        guard let provider else {
            let stamp = now()
            _ = try? await writer.write { db in
                try db.execute(
                    sql: "UPDATE \(row.table) SET metadata_checked_at = COALESCE(metadata_checked_at, ?), genres_json = COALESCE(genres_json, '[]') WHERE id = ?",
                    arguments: [stamp, row.id])
            }
            result.skipped += 1
            continue
        }
        let gap = sourceGapMs[row.source] ?? 0
        if gap > 0 && queried.contains(row.source) { await sleep(gap) }
        queried.insert(row.source)
        guard let metadata = await provider.details(row.externalId) else {
            result.failed += 1
            continue
        }
        let stamp = now()
        _ = try? await writer.write { db in
            try db.execute(sql: """
                UPDATE \(row.table) SET
                  cover_url = COALESCE(cover_url, ?),
                  creator = COALESCE(creator, ?),
                  description = COALESCE(description, ?),
                  release_year = COALESCE(release_year, ?),
                  metadata_checked_at = COALESCE(metadata_checked_at, ?),
                  genres_json = COALESCE(genres_json, ?)
                WHERE id = ?
                """, arguments: [metadata.coverUrl, metadata.creator, metadata.description, metadata.releaseYear, stamp,
                                 jsonText(metadata.genres ?? []), row.id])
        }
        result.filled += 1
    }
    return result
}
