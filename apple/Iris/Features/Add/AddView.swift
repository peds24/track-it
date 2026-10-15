import IrisCore
import SwiftUI

/// The Add sheet (I9, spec §6): categories → comic mode → search → confirm,
/// in one navigation stack. Copy and steps are app/add.tsx's.
struct AddView: View {
    @State var model: AddModel
    @Environment(\.dismiss) private var dismiss
    @State private var path: [Step] = []
    @State private var scanning = false
    /// A scanned code, routed once the scanner has closed: an alert presented
    /// while the cover is still dismissing is dropped (the EAN-5 prompt was).
    @State private var scannedCode: String?
    @State private var ean5 = ""

    enum Step: Hashable { case comicMode, search, confirm }

    /// A step goes on once: a double tap can't push it twice (I9 minor).
    static func pushing(_ step: Step, onto path: [Step]) -> [Step] {
        path.contains(step) ? path : path + [step]
    }

    var body: some View {
        NavigationStack(path: Binding(get: { path }, set: navigate)) {
            categories
                .navigationDestination(for: Step.self) { step in
                    switch step {
                    case .comicMode: comicModes
                    case .search: search
                    case .confirm: confirm
                    }
                }
        }
        .onChange(of: model.saved) { _, saved in if saved != nil { dismiss() } }
        // A pick the model cleared (a failed hydrate, A11) takes the confirm
        // screen with it, back to the search — confirm is state in TS, not a push.
        .onChange(of: model.picked) { _, picked in
            if picked == nil, path.last == .confirm { path.removeLast() }
        }
        .alert(item: $model.failure) { failure in
            Alert(title: Text(failure.title), message: Text(failure.message), dismissButton: .default(Text("OK")) { model.acknowledgeFailure() })
        }
    }

    /// A pop (back button or swipe) steps the model back the way TS's beforeRemove did.
    private func navigate(_ newPath: [Step]) {
        let popped = path.suffix(from: min(newPath.count, path.count))
        for step in popped.reversed() {
            switch step {
            case .confirm: model.unpick()
            case .search: model.leaveSearch()
            case .comicMode: model.leaveSearch()
            }
        }
        path = newPath
    }

    // MARK: Categories

    private var categories: some View {
        List {
            Section {
                ForEach(IrisCore.Category.allCases, id: \.self) { category in
                    Button {
                        model.choose(category)
                        path = Self.pushing(category == .comic ? .comicMode : .search, onto: path)
                    } label: {
                        chevronRow(Label(category.label, systemImage: category.symbol.systemName))
                    }
                    .accessibilityIdentifier("add.category.\(category.rawValue)")
                }
            } footer: {
                Text("The category decides which catalogue to query and how progress is counted.")
                    .foregroundStyle(IrisTokens.Colors.label)
            }
        }
        .navigationTitle("What are you adding?")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
    }

    private var comicModes: some View {
        List {
            Section {
                Button { model.chooseComicMode(.single); path = Self.pushing(.search, onto: path) } label: { chevronRow(Text("Single issue")) }
                    .accessibilityIdentifier("add.mode.single")
                Button { model.chooseComicMode(.collection); path = Self.pushing(.search, onto: path) } label: { chevronRow(Text("Collection")) }
                    .accessibilityIdentifier("add.mode.collection")
            } footer: {
                Text("A single issue is tracked issue by issue, matched exactly by barcode or issue number. A collection — a trade paperback, hardcover, or omnibus — tracks as one item, the same way a book does.")
                    .foregroundStyle(IrisTokens.Colors.label)
            }
        }
        .navigationTitle("Comic")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func chevronRow(_ label: some View) -> some View {
        HStack {
            label.foregroundStyle(IrisTokens.Colors.label)
            Spacer()
            Image(systemName: "chevron.forward").font(IrisTokens.Typography.footnote.font.weight(.semibold))
                .foregroundStyle(IrisTokens.Colors.tertiaryLabel)
                .accessibilityHidden(true)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    // MARK: Search

    private var search: some View {
        let category = model.category ?? .book
        return List {
            if model.hydrateFailed {
                Text("Couldn’t load that match — it’ll be tracked as you go.")
                    .font(IrisTokens.Typography.subheadline.font)
                    .foregroundStyle(IrisTokens.Colors.label)
            }
            ForEach(model.results, id: \.id) { result in
                Button {
                    model.pick(result)
                    path = Self.pushing(.confirm, onto: path)
                } label: { SearchResultRow(result: result) }
                .buttonStyle(.plain)
                .accessibilityIdentifier("add.result.\(result.id)")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(model.comicMode == .collection ? "Comic collection" : category.label)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $model.query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Title")
        .onChange(of: model.query) { _, _ in model.queryChanged() }
        .toolbar {
            if model.barcodeKinds != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Scan barcode", systemImage: IrisSymbol.scan.systemName) { scanning = true }
                        .accessibilityIdentifier("add.scan")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            saveButtons(primary: manualPrimaryLabel(category), enabled: !jsTrim(model.query).isEmpty)
        }
        .fullScreenCover(isPresented: $scanning, onDismiss: {
            guard let code = scannedCode else { return }
            scannedCode = nil
            Task { await model.scanned(code) }
        }) {
            BarcodeScanner(kinds: model.barcodeKinds ?? [], onCode: { code in
                scannedCode = code
                scanning = false
            }, onCancel: { scanning = false })
        }
        .alert("5-digit issue code?", isPresented: Binding(get: { model.pendingUPC != nil }, set: { if !$0 { model.pendingUPC = nil } })) {
            TextField("12345", text: $ean5).keyboardType(.numberPad)
                // Digits only, five at most (I12; shared rule in addFlow.ts).
                .onChange(of: ean5) { _, typed in
                    let clean = normalizeEan5(typed)
                    if clean != typed { ean5 = clean }
                }
            Button("Search") {
                let code = ean5, upc = model.pendingUPC
                ean5 = ""
                Task { await model.submitEAN5(code, upc: upc) }
            }
            Button("Skip", role: .cancel) {
                let upc = model.pendingUPC
                ean5 = ""
                Task { await model.submitEAN5(nil, upc: upc) }
            }
        } message: {
            Text("The small 5-digit barcode next to the main one identifies the exact issue. Skip to see all matching issues.")
        }
    }

    // MARK: Confirm

    private var confirm: some View {
        let category = model.category ?? .book
        let summary = model.summary
        let picked = model.picked
        return List {
            Section {
                VStack(spacing: IrisTokens.Space.sm) {
                    IrisCover(url: summary?.metadata?.coverUrl ?? picked?.thumbnailUrl, title: picked?.title ?? "",
                              category: category, size: .card, decorative: false)
                        .padding(.bottom, IrisTokens.Space.sm)
                    Text(summary?.title ?? "Checking…")
                        .font(IrisTokens.Typography.title2.font)
                        .multilineTextAlignment(.center)
                    if summary != nil, let credit = creatorLine(category, creator: summary?.metadata?.creator ?? picked?.creator) {
                        Text(credit).font(IrisTokens.Typography.subheadline.font)
                    }
                    if let line = summary?.metaLine, !line.isEmpty {
                        Text(line.joined(separator: " · ")).font(IrisTokens.Typography.footnote.font)
                    }
                }
                .foregroundStyle(IrisTokens.Colors.label)
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }
            if let blurb = cleanDescription(summary?.blurb) {
                Section { ExpandableText(text: blurb) }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Confirm")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if summary != nil { saveButtons(primary: confirmPrimaryLabel(category), enabled: true) }
        }
    }

    private func saveButtons(primary: String, enabled: Bool) -> some View {
        VStack(spacing: IrisTokens.Space.sm) {
            IrisPrimaryButton(primary, fullWidth: true, inProgress: model.saving) { Task { await model.save(startNow: true) } }
                .disabled(!enabled)
                .accessibilityIdentifier("add.save.start")
            Button("Add to backlog") { Task { await model.save(startNow: false) } }
                .font(IrisTokens.Typography.headline.font)
                .foregroundStyle(IrisTokens.Colors.label)
                .frame(maxWidth: .infinity, minHeight: 44)
                .disabled(!enabled || model.saving)
                .accessibilityIdentifier("add.save.backlog")
        }
        .padding(.horizontal, IrisTokens.Space.lg)
        .padding(.bottom, IrisTokens.Space.sm)
        .background(.bar)
    }
}
