import SwiftUI

@Observable
final class PoolViewModel {
    var items: [FeedItem] = []
    var page = 1
    var pageCount = 1
    var total = 0
    var todayCount = 0
    var state: LoadState<Void> = .idle
    var isLoadingMore = false
    var query = ""
    var tab = "time"         // time | relevance（relevance 需有搜尋詞）
    var category: String? = nil
    var suggestions: SearchSuggestions?

    private let api = APIClient.shared

    private var generation = 0

    @MainActor
    func reload() async {
        generation += 1
        let issued = generation
        state = .loading
        do {
            let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
            let effectiveTab = q.isEmpty ? "time" : tab
            let res = try await api.pool(q: q.isEmpty ? nil : q, tab: effectiveTab, page: 1, category: category)
            guard issued == generation else { return }
            items = res.items; page = res.page; pageCount = res.pageCount; total = res.total; todayCount = res.todayCount
            state = .loaded(())
        } catch {
            guard issued == generation else { return }
            if items.isEmpty { state = .failed(error) } else { state = .loaded(()) }
        }
    }

    @MainActor
    func loadMore() async {
        guard page < pageCount, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
            let res = try await api.pool(q: q.isEmpty ? nil : q, tab: q.isEmpty ? "time" : tab, page: page + 1, category: category)
            let known = Set(items.map(\.id))
            items.append(contentsOf: res.items.filter { !known.contains($0.id) })
            page = res.page; pageCount = res.pageCount
        } catch {}
    }

    @MainActor
    func loadSuggestions() async {
        guard suggestions == nil else { return }
        suggestions = try? await api.searchSuggestions()
    }
}

struct PoolView: View {
    @Environment(\.palette) private var palette
    @State private var model = PoolViewModel()
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                CategoryBar(selected: Binding(get: { model.category }, set: { model.category = $0; Task { await model.reload() } }))

                if !model.query.isEmpty {
                    Picker("排序", selection: $model.tab) {
                        Text("最新").tag("time")
                        Text("相關度").tag("relevance")
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: model.tab) { _, _ in Task { await model.reload() } }
                } else if model.state.value != nil {
                    Text("共 \(model.total) 則 · 今日 \(model.todayCount) 則")
                        .font(.caption).foregroundStyle(palette.secondaryText)
                }

                if case let .failed(error) = model.state {
                    ErrorStateView(error: error) { await model.reload() }
                } else if model.items.isEmpty, model.state.value == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if model.items.isEmpty {
                    EmptyStateView(icon: "magnifyingglass", title: model.query.isEmpty ? "目前沒有動態" : "找不到「\(model.query)」",
                                   detail: model.query.isEmpty ? nil : "試試其他關鍵字，或從下面的主題進入。")
                    if let s = model.suggestions { SuggestionsView(suggestions: s) }
                } else {
                    ForEach(model.items) { item in
                        NavigationLink(value: Route.item(id: item.id)) {
                            FeedCardView(item: item)
                        }
                        .buttonStyle(.plain)
                        .onAppear { if item.id == model.items.last?.id { Task { await model.loadMore() } } }
                    }
                    if model.isLoadingMore { ProgressView().frame(maxWidth: .infinity).padding() }
                    else if model.page >= model.pageCount {
                        Text("已到最後").font(.caption).foregroundStyle(palette.secondaryText).frame(maxWidth: .infinity).padding()
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .themedBackground()
        .navigationTitle("全部動態")
        .searchable(text: $model.query, placement: .navigationBarDrawer(displayMode: .always), prompt: "搜尋標題與內容")
        .onChange(of: model.query) { _, _ in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(for: .milliseconds(350))
                guard !Task.isCancelled else { return }
                await model.reload()
            }
        }
        .refreshable { await model.reload() }
        .task {
            if model.items.isEmpty { await model.reload() }
            await model.loadSuggestions()
        }
    }
}

struct SuggestionsView: View {
    @Environment(\.palette) private var palette
    let suggestions: SearchSuggestions

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("熱門主題").font(.subheadline.weight(.semibold)).foregroundStyle(palette.text)
            FlowLayout(spacing: 8) {
                ForEach(suggestions.topics.prefix(16)) { t in
                    NavigationLink(value: Route.topic(slug: t.slug)) { TagChip(text: t.name, highlighted: true) }
                        .buttonStyle(.plain)
                }
            }
        }
        .padding(.top, 8)
    }
}

/// 簡單的自動換行佈局（標籤雲）。
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            sub.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
