import XCTest
@testable import Iris

/// I12: Done's feedback draft and data-sources version line, on this build.
final class AboutSheetsTests: XCTestCase {
    func testTheDraftIsIrisOnIOSAtThisVersion() throws {
        let url = try XCTUnwrap(FeedbackSheet.mailto("The scanner froze"))
        let parts = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
        XCTAssertEqual(parts.scheme, "mailto")
        XCTAssertEqual(parts.path, "serdiopedro@gmail.com")
        XCTAssertEqual(parts.queryItems?.first { $0.name == "subject" }?.value, "Iris feedback (v2.0.0)")
        XCTAssertEqual(parts.queryItems?.first { $0.name == "body" }?.value, "The scanner froze\n\n—\nIris 2.0.0 · iOS")
    }

    func testBlankMeansWhitespaceOnly() {
        XCTAssertTrue(FeedbackSheet.isBlank(" \n\t "))
        XCTAssertFalse(FeedbackSheet.isBlank(" a "))
    }

    func testTheVersionLine() {
        XCTAssertEqual(DataSourcesSheet.version(), "Iris v2.0.0 · iOS")
    }

    /// Review I2: Mail can accept the draft with no account set up and open
    /// its own setup screen — the draft must survive that, so it's only
    /// cleared when Mail can really send.
    func testWhatSendingDoesWithTheDraft() {
        XCTAssertEqual(FeedbackSheet.outcome(canSendMail: true, accepted: true), .sentClearAndClose)
        XCTAssertEqual(FeedbackSheet.outcome(canSendMail: false, accepted: true), .handedOffKeepDraft)
        XCTAssertEqual(FeedbackSheet.outcome(canSendMail: false, accepted: false), .noMailApp)
        XCTAssertEqual(FeedbackSheet.outcome(canSendMail: true, accepted: false), .noMailApp)
    }
}
