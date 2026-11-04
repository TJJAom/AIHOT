import SwiftUI

struct TopicsView: View {
    @Environment(\.palette) private var palette
    @State private var state: LoadState<TopicsResponse> = .idle

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error): ErrorStateView(error: error) { await load() }
            case let .loaded(res):
                List {
                    ForEach(res.groups) { group in
                        let topics = res.topics.filter { $0.group == group.key }
                        if !topics.isEmpty {
                            Section {
                                ForEach(topics) { topic in
                                    NavigationLink(value: Route.topic(slug: topic.slug)) { TopicRow(topic: topic) }
                                        .listRowBackground(palette.surface)
                                }
                            } header: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(group.name).foregroundStyle(palette.text)
                                    Text(group.blurb).font(.caption).foregroundStyle(palette.secondaryText).textCase(nil)
                                }
                            }
                        }
                    }
                }
            }
        }
        .themedBackground()
        .navigationTitle("主題")
        .refreshable { await load() }
        .task { if state.value == nil { await load() } }
    }

    private func load() async {
        if state.value == nil { state = .loading }
        do { state = .loaded(try await APIClient.shared.topics()) }
        catch { if state.value == nil { state = .failed(error) } }
    }
}

struct TopicRow: View {
    @Environment(\.palette) private var palette
    let topic: TopicSummary

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(palette.accentSoft)
                if let src = topic.brand?.src, let url = APIClient.shared.resolveMedia(src) {
                    AsyncImage(url: url) { image in image.resizable().scaledToFit().padding(6) } placeholder: { monogram }
                } else { monogram }
            }
            .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 3) {
                Text(topic.name).font(.headline).foregroundStyle(palette.text)
                Text(topic.definition).font(.caption).foregroundStyle(palette.secondaryText).lineLimit(2)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(topic.total)").font(.subheadline.monospacedDigit()).foregroundStyle(palette.text)
                if topic.recent > 0 { Text("30 日 \(topic.recent)").font(.caption2).foregroundStyle(palette.accent) }
            }
        }
        .padding(.vertical, 4)
    }

    private var monogram: some View {
        Text(topic.brand?.monogram ?? String(topic.name.prefix(1))).font(.headline).foregroundStyle(palette.accent)
    }
}

struct TopicDetailView: View {
    @Environment(\.palette) private var palette
    let slug: String
    @State private var state: LoadState<TopicPage> = .idle
    @State private var items: [FeedItem] = []
    @State private var page = 1
    @State private var pageCount = 1
    @State private var loadingMore = false

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error): ErrorStateView(error: error) { await load() }
            case let .loaded(pageData):
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(pageData.topic.groupName).font(.caption).foregroundStyle(palette.accent)
                            Text(pageData.topic.definition).font(.subheadline).foregroundStyle(palette.secondaryText)
                            Text("精選 \(pageData.topic.total) 篇 · 全部 \(pageData.topic.poolTotal) 篇").font(.caption).foregroundStyle(palette.secondaryText)
                        }
                        .padding(.bottom, 4)
                        if items.isEmpty {
                            EmptyStateView(icon: "tray", title: "這個主題還沒有文章")
                        }
                        ForEach(items) { item in
                            NavigationLink(value: Route.item(id: item.id)) { FeedCardView(item: item) }
                                .buttonStyle(.plain)
                                .onAppear { if item.id == items.last?.id { Task { await loadMore() } } }
                        }
                        if loadingMore { ProgressView().frame(maxWidth: .infinity).padding() }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 24)
                }
                .navigationTitle(pageData.topic.name)
            }
        }
        .themedBackground()
        .navigationBarTitleDisplayMode(.large)
        .task(id: slug) { await load() }
    }

    private func load() async {
        state = .loading
        do {
            let res = try await APIClient.shared.topic(slug: slug, page: 1)
            items = res.items; page = res.page; pageCount = res.pageCount
            state = .loaded(res)
        } catch { state = .failed(error) }
    }

    private func loadMore() async {
        guard page < pageCount, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        if let res = try? await APIClient.shared.topic(slug: slug, page: page + 1) {
            let known = Set(items.map(\.id))
            items.append(contentsOf: res.items.filter { !known.contains($0.id) })
            page = res.page; pageCount = res.pageCount
        }
    }
}
