import Foundation
import XCTest
@testable import IrisCore

final class HTTPResponseTests: XCTestCase {
    /// A captive portal's HTML answered with 200: a short message a person can
    /// read, not a DecodingError dump (I5 review).
    func testANonJSONBodyThrowsAShortDomainError() {
        let response = HTTPResponse(status: 200, body: Data("<html>Sign in to Wi-Fi</html>".utf8))
        XCTAssertThrowsError(try response.json()) { error in
            XCTAssertEqual(error as? DomainError, DomainError("The server's response wasn't readable"))
        }
    }
}
