import IrisCore
import SwiftUI
import UIKit
import XCTest
@testable import Iris

final class ComponentContractTests: XCTestCase {
    static let repoRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    static func contract() throws -> String {
        try String(contentsOf: repoRoot.appendingPathComponent("design/iris/components.md"), encoding: .utf8)
    }

    /// `## IrisName` headings, in order.
    static func componentHeadings() throws -> [String] {
        try contract().split(separator: "\n").compactMap { line in
            line.hasPrefix("## Iris") ? String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces) : nil
        }
    }

    /// Rows of the IrisSymbol table: case → (sf, material).
    static func symbolTable() throws -> [String: (sf: String, material: String)] {
        let pattern = /^\| `([a-zA-Z]+)` \| `([a-z0-9.]+)` \| `([a-z_]+)` \|$/
        var rows: [String: (sf: String, material: String)] = [:]
        for line in try contract().split(separator: "\n") {
            if let m = String(line).wholeMatch(of: pattern) { rows[String(m.1)] = (String(m.2), String(m.3)) }
        }
        return rows
    }

    func testContractNamesTheSpecVocabulary() throws {
        XCTAssertEqual(try Self.componentHeadings(), [
            "IrisShelfRow", "IrisCover", "IrisProgress", "IrisCategoryChip", "IrisPrimaryButton",
            "IrisSheet", "IrisEmptyState", "IrisRatingBadge", "IrisComparisonCard", "IrisSymbol",
        ])
    }

    func testEverySymbolCaseIsInTheContractWithItsSFName() throws {
        let table = try Self.symbolTable()
        XCTAssertEqual(Set(table.keys), Set(IrisSymbol.allCases.map(\.rawValue)), "components.md symbol table ≠ IrisSymbol")
        for symbol in IrisSymbol.allCases {
            XCTAssertEqual(table[symbol.rawValue]?.sf, symbol.systemName, "\(symbol)")
        }
    }

    func testEverySFSymbolExistsOnThisIOS() {
        for symbol in IrisSymbol.allCases {
            XCTAssertNotNil(UIImage(systemName: symbol.systemName), "\(symbol.systemName) is not an SF Symbol here")
        }
    }

    func testCategoryDisplay() {
        XCTAssertEqual(IrisCore.Category.allCases.map(\.label), ["Show", "Movie", "Book", "Comic", "Manga"])
        XCTAssertEqual(IrisCore.Category.allCases.map(\.plural), ["shows", "movies", "books", "comics", "manga"])
        XCTAssertEqual(IrisCore.Category.allCases.map(\.symbol), [.show, .movie, .book, .comic, .manga])
    }
}
