import XCTest
@testable import IrisCore

final class AddFlowTests: XCTestCase {
    func testVisionKitsUPCAAsEAN13BecomesTheTwelveDigitsMetronWants() {
        XCTAssertEqual(normalizedBarcode("0761941333509", for: [.upcA]), "761941333509")
    }

    func testAnISBNIsLeftAlone() {
        XCTAssertEqual(normalizedBarcode("9780593135204", for: [.ean13, .ean8]), "9780593135204")
        XCTAssertEqual(normalizedBarcode("0761941333509", for: [.ean13, .ean8]), "0761941333509", "a leading 0 is only dropped for UPC-A")
    }

    func testOnlyALeadingZeroIsDropped() {
        XCTAssertEqual(normalizedBarcode("9761941333509", for: [.upcA]), "9761941333509")
        XCTAssertEqual(normalizedBarcode("761941333509", for: [.upcA]), "761941333509")
    }

    func testWhitespaceIsTrimmed() {
        XCTAssertEqual(normalizedBarcode(" 9780593135204\n", for: [.ean13]), "9780593135204")
    }

    func testTheDemoCatalogueAnswersEveryKeyWithoutTheNetwork() async throws {
        let demo = DemoCatalogue()
        let books = try await demo.provider(for: .category(.book)).search("Hail Mary")
        XCTAssertEqual(books.first?.creator, "Andy Weir")
        XCTAssertNotNil(books.first?.year)
        for key: AddCatalogueKey in [.category(.show), .category(.movie), .category(.comic), .category(.manga), .comicCollection] {
            let hits = try await demo.provider(for: key).search("a")
            XCTAssertFalse(hits.isEmpty, key.rawValue)
        }
        let manga = try await demo.mangaISBN("9781612620244")
        XCTAssertEqual(manga.first?.title, "Attack on Titan 30")
        let issues = try await demo.comicUPC("761941333509", ean5: nil)
        XCTAssertFalse(issues.isEmpty)
    }
}
