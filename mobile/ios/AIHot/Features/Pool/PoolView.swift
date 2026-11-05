import SwiftUI

@Observable
final class PoolViewModel {
    var items: [FeedItem] = []
    var page = 1
    var pageCount = 1
    var total = 0
    var todayCount = 0
    var freshness = ""
    var state: LoadState<Void> = .idle
    var isLoadingMore = false
    var loadError = false
    var query = ""
    var tab = "time"         // time | relevance（relevance 需有搜尋詞）
    var filter: FeedFilter = .all
    var suggestions: SearchSuggestions?

    private let api = APIClient.shared
    private var generation = 0

    private var q: String? {
        let t = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    @MainActor
    func reload() async {
        generation += 1
        let issued = generation
        if items.isEmpty { state = .loading }; loadError = false
        do {
            let res = try await api.pool(q: q, tab: q == nil ? "time" : tab, page: 1, channel: filter.channel, category: filter.category)
            guard issued == generation else { return }
            items = res.items; page = res.page; pageCount = res.pageCount; total = res.total; todayCount = res.todayCount; freshness = res.freshness
            state = .loaded(())
        } catch {
            guard issued == generation else { return }
            if items.isEmpty { state = .failed(error) } else { state = .loaded(()) }
        }
    }

    @MainActor
    func loadMore() async {
        guard page < pageCount, !isLoadingMore else { return }
        isLoadingMore = true; loadError = false
        let issued = generation
        defer { isLoadingMore = false }
        do {
            let res = try await api.pool(q: q, tab: q == nil ? "time" : tab, page: page + 1, channel: filter.channel, category: filter.category)
            guard issued == generation else { return }
            let known = Set(items.map(\.id))
            items.append(contentsOf: res.items.filter { !known.contains($0.id) })
            page = res.page; pageCount = res.pageCount
        } catch {
            if issued == generation { loadError = true }
        }
    }

    @MainActor
    func loadSuggestions() async {
        guard suggestions == nil else { return }
        suggestions = try? await api.searchSuggestions()
    }
}

struct PoolView: View {
    @Environment(\.palette) private var palette
    @Environment(ReadStore.self) private var readStore
    @State private var model = PoolViewModel()
    @State private var searchTask: Task<Void, Never>?

    private var searching: Bool { !model.query.trimmingCharacters(in: .whitespaces).isEmpty }

    private var days: [DayGroup<FeedItem>] {
        let list = readStore.unreadOnly ? model.items.filter { !readStore.ids.contains($0.id) } : model.items
        return byDay(list) { $0.timelineAt }
    }

    var body: some View {
        let days = days
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                SearchField(text: $model.query)
                    .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 10)
                CategoryTabs(selected: $model.filter)
                    .padding(.top, 4).padding(.bottom, 12)
                    .onChange(of: model.filter) { _, _ in Task { await model.reload() } }

                if searching {
                    HStack(alignment: .center) {
                        PillTabs(items: [("time", "按時間"), ("relevance", "按相關度")], selected: $model.tab, size: 30)
                            .onChange(of: model.tab) { _, _ in Task { await model.reload() } }
                        Spacer()
                        if model.state.value != nil {
                            Text("找到 \(model.total >= 2000 ? "2000+" : "\(model.total)") 條")
                                .font(AppFont.ui(12)).foregroundStyle(palette.text4)
                        }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 12)
                }

                if case let .failed(error) = model.state {
                    ErrorStateView(error: error) { await model.reload() }
                } else if model.items.isEmpty, model.state.value == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 48)
                } else if days.isEmpty {
                    HStack { Spacer(); unreadToggle }.padding(.horizontal, 16).padding(.bottom, 12)
                    if readStore.unreadOnly, !model.items.isEmpty {
                        EmptyStateView(icon: "checkmark.circle", title: "這一頁都讀過了", detail: "關掉「只看未讀」，或往下載入更多。")
                    } else {
                        EmptyStateView(icon: "magnifyingglass", title: searching ? "找不到「\(model.query)」" : "目前沒有動態",
                                       detail: searching ? "試試其他關鍵字，或從下面的主題進入。" : nil)
                        if searching, let s = model.suggestions { SuggestionsView(suggestions: s).padding(.horizontal, 16) }
                    }
                } else {
                    ForEach(Array(days.enumerated()), id: \.element.day) { dayIndex, group in
                        Section {
                            ForEach(Array(group.entries.enumerated()), id: \.element.id) { i, item in
                                TimelineSlot(at: item.timelineAt, isFirst: i == 0, isLast: i == group.entries.count - 1) {
                                    NavigationLink(value: Route.item(id: item.id)) {
                                        FeedCard(item: item, showTags: true)
                                    }
                                    .buttonStyle(.plain)
                                }
                                .padding(.horizontal, 16)
                                .onAppear { if item.id == model.items.last?.id { Task { await model.loadMore() } } }
                            }
                            Color.clear.frame(height: 8)
                        } header: {
                            DayHeader(day: group.day, count: group.day == DateText.todayKey && !searching ? model.todayCount : nil) {
                                if dayIndex == 0 { unreadToggle }
                            }
                            .padding(.bottom, 12)
                        }
                    }
                }

                FeedEnd(loading: model.isLoadingMore, error: model.loadError, hasMore: model.page < model.pageCount,
                        manual: false, empty: days.isEmpty) { await model.loadMore() }
            }
            .padding(.bottom, 24)
        }
        .pullToRefresh { await model.reload() }
        .themedBackground()
        .rootChrome("全部動態")
        .onChange(of: model.query) { _, _ in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(for: .milliseconds(350))
                guard !Task.isCancelled else { return }
                await model.reload()
            }
        }
        .task {
            if model.items.isEmpty { await model.reload() }
            await model.loadSuggestions()
        }
    }

    private var unreadToggle: some View {
        ToggleChip(title: "只看未讀", on: Binding(get: { readStore.unreadOnly }, set: { readStore.unreadOnly = $0 }))
    }
}

struct SuggestionsView: View {
    @Environment(\.palette) private var palette
    let suggestions: SearchSuggestions

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Kicker(text: "熱門主題")
            FlowLayout(spacing: 8) {
                ForEach(suggestions.topics.prefix(16)) { t in
                    NavigationLink(value: Route.topic(slug: t.slug)) { Badge(text: t.name, tone: .accent) }.buttonStyle(.plain)
                }
            }
        }
        .padding(.top, 8)
    }
}
