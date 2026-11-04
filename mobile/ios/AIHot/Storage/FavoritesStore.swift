import Foundation
import Observation

/// 收藏：目前只存裝置本機（Application Support/favorites.json）。帳號同步尚未核定。
@Observable
final class FavoritesStore {
    struct Entry: Codable, Identifiable, Hashable {
        var id: String
        var title: String
        var sourceName: String
        var summary: String?
        var savedAt: Date
    }

    private(set) var entries: [Entry] = []
    private let fileURL: URL

    init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("favorites.json")
        load()
    }

    func contains(_ id: String) -> Bool { entries.contains { $0.id == id } }

    func toggle(item: FeedItem) {
        if let i = entries.firstIndex(where: { $0.id == item.id }) {
            entries.remove(at: i)
        } else {
            entries.insert(Entry(id: item.id, title: item.title, sourceName: item.source.name, summary: item.summary, savedAt: Date()), at: 0)
        }
        save()
    }

    func remove(id: String) {
        entries.removeAll { $0.id == id }
        save()
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode([Entry].self, from: data) else { return }
        entries = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(entries) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}

/// 已讀記錄（本機，最多 2,000 筆）。
@Observable
final class ReadStore {
    private(set) var ids: Set<String> = []
    private var ordered: [String] = []
    private let key = "read.ids"

    init() {
        if let saved = UserDefaults.standard.array(forKey: key) as? [String] { ordered = saved; ids = Set(saved) }
    }

    func markRead(_ id: String) {
        guard !ids.contains(id) else { return }
        ids.insert(id)
        ordered.append(id)
        if ordered.count > 2000 {
            let dropped = ordered.prefix(ordered.count - 2000)
            dropped.forEach { ids.remove($0) }
            ordered = Array(ordered.suffix(2000))
        }
        UserDefaults.standard.set(ordered, forKey: key)
    }
}
