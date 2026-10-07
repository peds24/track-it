// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "IrisCore",
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "IrisCore", targets: ["IrisCore"]),
    ],
    dependencies: [
        // Spec §2.2: plain SQLite, so the schema is the TS app's schema, not a lookalike.
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "7.0.0"),
    ],
    targets: [
        .target(name: "IrisCore", dependencies: [.product(name: "GRDB", package: "GRDB.swift")]),
        .testTarget(name: "IrisCoreTests", dependencies: ["IrisCore", .product(name: "GRDB", package: "GRDB.swift")]),
    ]
)
