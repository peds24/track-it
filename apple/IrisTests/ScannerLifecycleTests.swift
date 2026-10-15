import XCTest
@testable import Iris

/// I9 minor: the camera session stops when the scanner goes away, and is
/// started once — not again on every SwiftUI update.
@MainActor
final class ScannerLifecycleTests: XCTestCase {
    final class FakeSession: ScanSession {
        var starts = 0, stops = 0
        var isScanning = false
        func startScanning() throws { starts += 1; isScanning = true }
        func stopScanning() { stops += 1; isScanning = false }
    }

    func testTeardownStopsTheSession() {
        let session = FakeSession()
        ScannerLifecycle.begin(session)
        ScannerLifecycle.end(session)
        XCTAssertEqual(session.stops, 1)
        XCTAssertFalse(session.isScanning)
    }

    func testBeginningTwiceStartsOnce() {
        let session = FakeSession()
        ScannerLifecycle.begin(session)
        ScannerLifecycle.begin(session)
        XCTAssertEqual(session.starts, 1)
    }

    func testEndingAStoppedSessionIsANoOp() {
        let session = FakeSession()
        ScannerLifecycle.end(session)
        XCTAssertEqual(session.stops, 0)
    }
}
