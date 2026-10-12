import AVFoundation
import IrisCore
import SwiftUI
import Vision
import VisionKit

/// A9/A11: scan a book's, manga's or comic's barcode with VisionKit (spec
/// §2.2). Reports the first code, normalised (UPC-A arrives as EAN-13), and
/// closes. DEBUG `-IrisScan <code>` stands in for the camera — the simulator
/// has none.
struct BarcodeScanner: View {
    let kinds: [BarcodeKind]
    let onCode: (String) -> Void
    let onCancel: () -> Void

    @State private var access: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)

    var body: some View {
        NavigationStack {
            content
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("Scan barcode")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onCancel) } }
        }
        .task {
            #if DEBUG
            if let code = UserDefaults.standard.string(forKey: "IrisScan") {
                onCode(normalizedBarcode(code, for: kinds))
                return
            }
            #endif
            if access == .notDetermined {
                access = await AVCaptureDevice.requestAccess(for: .video) ? .authorized : .denied
            }
        }
    }

    @ViewBuilder private var content: some View {
        // isAvailable stays false until camera access is granted, so it is only
        // checked once access is known; isSupported (the hardware) is checked first.
        if !DataScannerViewController.isSupported {
            Self.unavailable
        } else if access == .denied || access == .restricted {
            IrisEmptyState("Camera access needed", symbol: .scan, message: "Camera access is needed to scan a barcode.")
        } else if access != .authorized {
            ProgressView()
        } else if !DataScannerViewController.isAvailable {
            Self.unavailable
        } else {
            DataScanner(symbologies: Self.symbologies(kinds)) { onCode(normalizedBarcode($0, for: kinds)) }
        }
    }

    private static var unavailable: some View {
        IrisEmptyState("Scanning isn’t available on this device", symbol: .scan, message: "Type the title instead.")
    }

    /// UPC-A is read as EAN-13 by Vision, so both ISBN and single-issue scans use .ean13.
    static func symbologies(_ kinds: [BarcodeKind]) -> [VNBarcodeSymbology] {
        var out: [VNBarcodeSymbology] = []
        if kinds.contains(.ean13) || kinds.contains(.upcA) { out.append(.ean13) }
        if kinds.contains(.ean8) { out.append(.ean8) }
        return out
    }
}

private struct DataScanner: UIViewControllerRepresentable {
    let symbologies: [VNBarcodeSymbology]
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: symbologies)],
            qualityLevel: .balanced, isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        try? scanner.startScanning()
        return scanner
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    @MainActor final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var reported = false
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ scanner: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !reported else { return }
            for case let .barcode(code) in items {
                if let payload = code.payloadStringValue {
                    reported = true
                    scanner.stopScanning()
                    onCode(payload)
                    return
                }
            }
        }
    }
}
