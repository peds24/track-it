import Foundation

/// Tasks a main-actor model owns, cancellable from a plain `deinit`.
/// (`isolated deinit` on an @Observable @MainActor class crashed with a
/// malloc error when the model was released from a synchronous context —
/// found in I9's tests — so models cancel through this instead.)
final class TaskBag: @unchecked Sendable {
    private let lock = NSLock()
    private var tasks: [String: Task<Void, Never>] = [:]

    /// Stores `task` under `name`, cancelling whatever was there.
    func set(_ name: String, _ task: Task<Void, Never>?) {
        let old = lock.withLock { () -> Task<Void, Never>? in
            let previous = tasks[name]
            tasks[name] = task
            return previous
        }
        old?.cancel()
    }

    func cancel(_ name: String) { set(name, nil) }

    func has(_ name: String) -> Bool { lock.withLock { tasks[name] != nil } }

    func cancelAll() {
        let all = lock.withLock { () -> [Task<Void, Never>] in
            defer { tasks = [:] }
            return Array(tasks.values)
        }
        all.forEach { $0.cancel() }
    }

    deinit { cancelAll() }
}
