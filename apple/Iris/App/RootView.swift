import IrisCore
import SwiftUI

/// The three shelves (I7), each its own navigation stack.
struct RootView: View {
    @State private var shelves: Shelves? = nil
    @State private var openError: String?

    var body: some View {
        Group {
            if let shelves {
                ShelfTabs(shelves: shelves)
            } else if let openError {
                IrisEmptyState("Couldn't open your library", symbol: .emptyShelf, message: openError)
            } else {
                Color.clear
            }
        }
        .task {
            guard shelves == nil, openError == nil else { return }
            switch AppLibrary.make() {
            case let .success(library): shelves = Shelves(library: library)
            case let .failure(error): openError = ShelfModel.message(error)
            }
        }
    }
}

/// One model per tab, kept for the app's lifetime so each list stays live.
@MainActor
final class Shelves {
    let currently: ShelfModel, backlog: ShelfModel, done: ShelfModel
    private let library: Library
    init(library: Library) {
        self.library = library
        currently = ShelfModel(shelf: .currently, library: library, registry: AppLibrary.registry)
        backlog = ShelfModel(shelf: .backlog, library: library, registry: AppLibrary.registry)
        done = ShelfModel(shelf: .done, library: library, registry: AppLibrary.registry)
    }

    func detail(_ ref: TrackRef) -> DetailModel { DetailModel(ref: ref, library: library, registry: AppLibrary.registry) }
}

private struct ShelfTabs: View {
    let shelves: Shelves
    #if DEBUG
    @State private var showsGallery = GalleryLaunchOptions.current.opensGallery
    #endif

    var body: some View {
        TabView {
            Tab("Currently", systemImage: "play.circle") {
                NavigationStack {
                    ShelfView(model: shelves.currently, makeDetail: shelves.detail)
                    #if DEBUG
                        .toolbar {
                            ToolbarItem(placement: .topBarTrailing) {
                                Button("Gallery", systemImage: IrisSymbol.gallery.systemName) { showsGallery = true }
                                    .accessibilityIdentifier("gallery.open")
                            }
                        }
                        .navigationDestination(isPresented: $showsGallery) { GalleryView() }
                    #endif
                }
            }
            Tab("Backlog", systemImage: "tray") {
                NavigationStack { ShelfView(model: shelves.backlog, makeDetail: shelves.detail) }
            }
            Tab("Done", systemImage: "checkmark.circle") {
                NavigationStack { ShelfView(model: shelves.done, makeDetail: shelves.detail) }
            }
        }
    }
}
