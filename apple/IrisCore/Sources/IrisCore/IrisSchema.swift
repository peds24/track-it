/// The SQLite schema the IrisCore package targets. Not named `IrisCore`:
/// a type named like its module shadows the module, so callers could no
/// longer write `IrisCore.Status` to tell the domain's types apart from
/// SwiftUI's or Foundation's.
public enum IrisSchema {
    /// Must equal `MIGRATIONS.length` in src/db/schema.ts so a backup or
    /// database moves between platforms (spec §3).
    public static let version = 10
}
