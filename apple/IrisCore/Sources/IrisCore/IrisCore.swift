/// Logic shared by the Iris iOS app: domain rules, persistence, providers.
/// No UI imports — the app target depends on this package, never the reverse.
public enum IrisCore {
    /// The SQLite schema version this package targets. Must equal
    /// `MIGRATIONS.length` in src/db/schema.ts so a backup or database moves
    /// between platforms (spec §3).
    public static let schemaVersion = 10
}
