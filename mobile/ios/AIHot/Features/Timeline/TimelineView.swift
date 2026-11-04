import SwiftUI

@Observable
final class TimelineViewModel {
    var cards: [TimelineCard] = []
    var hot: [HotStripEntry] = []
    var nextCursor: String?
    var state: LoadState<Void> = .idle
    var isLoadingMore = false
    var category: String? = nil {
        didSet { if oldValue != category { Task { await self.reload() } } }
    }

    private let api = APIClient.shared

    @MainActor
    func reload() async {
        state = .loading
        do {
            let page = try await api.timeline(category: category)
            cards = page.cards
            hot = page.hot ?? []
            nextCursor = page.nextCursor
            state = .loaded(())
        } catch {
            if cards.isEmpty { state = .failed(error) } else { state = .loaded(()) }
        }
    }

    @MainActor
    func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await api.timeline(category: category, cursor: cursor)
            let known = Set(cards.map(\.key))
            cards.append(contentsOf: page.cards.filter { !known.contains($0.key) })
            nextCursor = page.nextCursor
        } catch {
            // 翻頁失敗不蓋掉已載入內容；下次捲到底再試。
        }
    }
}

struct TimelineView: View {
    @Environment(\.palette) private var palette
    @State private var model = TimelineViewModel()

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if !model.hot.isEmpty { HotStripView(entries: model.hot) }
                CategoryBar(selected: $model.category)

                if case let .failed(error) = model.state {
                    ErrorStateView(error: error) { await model.reload() }
                } else if model.cards.isEmpty, model.state.value == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    if model.cards.isEmpty {
                        EmptyStateView(icon: "tray", title: "目前沒有精選", detail: "換個分類，或到「全部」看所有動態。")
                    }
                    ForEach(model.cards) { card in
                        NavigationLink(value: Route.item(id: card.item.id)) {
                            FeedCardView(item: card.item, group: card.group, showReason: true)
                        }
                        .buttonStyle(.plain)
                        .onAppear {
                            if card.key == model.cards.last?.key { Task { await model.loadMore() } }
                        }
                    }
                    if model.isLoadingMore { ProgressView().frame(maxWidth: .infinity).padding() }
                    else if model.nextCursor == nil, !model.cards.isEmpty {
                        Text("已到最後").font(.caption).foregroundStyle(palette.secondaryText).frame(maxWidth: .infinity).padding()
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .themedBackground()
        .navigationTitle("精選")
        .refreshable { await model.reload() }
        .task { if model.cards.isEmpty { await model.reload() } }
    }
}

struct CategoryBar: View {
    @Environment(\.palette) private var palette
    @Binding var selected: String?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(nil, "全部")
                ForEach(Category.allCases) { chip($0.rawValue, $0.label) }
            }
            .padding(.vertical, 4)
        }
    }

    private func chip(_ key: String?, _ label: String) -> some View {
        let active = selected == key
        return Button {
            selected = key
        } label: {
            Text(label)
                .font(.subheadline.weight(active ? .semibold : .regular))
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(active ? palette.accent : palette.surfaceAlt, in: Capsule())
                .foregroundStyle(active ? Color.white : palette.text)
        }
        .buttonStyle(.plain)
    }
}

/// 熱點橫條：連到事件頁。
struct HotStripView: View {
    @Environment(\.palette) private var palette
    let entries: [HotStripEntry]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("熱點", systemImage: "flame.fill").font(.subheadline.weight(.semibold)).foregroundStyle(palette.accent)
                Spacer()
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(entries) { entry in
                        Group {
                            if let story = entry.storyPublicId {
                                NavigationLink(value: Route.story(publicId: story)) { hotCard(entry) }
                            } else if let item = entry.itemId {
                                NavigationLink(value: Route.item(id: item)) { hotCard(entry) }
                            } else {
                                hotCard(entry)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func hotCard(_ entry: HotStripEntry) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("#\(entry.rank)").font(.caption.bold()).foregroundStyle(palette.accent)
                Spacer()
                Text(trendSymbol(entry.trend)).font(.caption)
            }
            Text(entry.title).font(.subheadline.weight(.medium)).foregroundStyle(palette.text).lineLimit(3)
            Spacer(minLength: 0)
            Text("\(entry.participantCount) 個來源 · 熱度 \(String(format: "%.1f", entry.heat))")
                .font(.caption2).foregroundStyle(palette.secondaryText)
        }
        .padding(12)
        .frame(width: 200, height: 118, alignment: .topLeading)
        .background(palette.accentSoft, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func trendSymbol(_ trend: String) -> String {
        switch trend {
        case "up": "↑"
        case "down": "↓"
        case "new": "新"
        default: ""
        }
    }
}
