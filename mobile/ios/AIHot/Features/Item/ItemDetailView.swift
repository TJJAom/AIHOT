import SwiftUI

struct ItemDetailView: View {
    @Environment(\.palette) private var palette
    @Environment(FavoritesStore.self) private var favorites
    @Environment(ReadStore.self) private var readStore
    let itemID: String

    @State private var state: LoadState<SiteItemDetail> = .idle
    @State private var blocks: [HTMLBlock] = []
    @State private var showOutline = false

    var body: some View {
        Group {
            switch state {
            case .idle, .loading:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error):
                ErrorStateView(error: error) { await load() }
            case let .loaded(item):
                content(item)
            }
        }
        .themedBackground()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let item = state.value {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        favorites.toggle(item: item.asFeedItem)
                    } label: {
                        Image(systemName: favorites.contains(item.id) ? "bookmark.fill" : "bookmark")
                    }
                    if !item.outline.isEmpty {
                        Button { showOutline = true } label: { Image(systemName: "list.bullet.indent") }
                    }
                    ShareButton(url: AppConfig.webURL(forItem: item.id))
                }
            }
        }
        .task(id: itemID) { await load() }
    }

    private func load() async {
        guard state.value == nil else { return }
        state = .loading
        do {
            let item = try await APIClient.shared.item(id: itemID)
            var parsed: [HTMLBlock] = []
            if let html = item.body?.zh, item.hasReadableBody {
                let base = AppConfig.apiBaseURL
                parsed = await Task.detached(priority: .userInitiated) { HTMLBlockParser.parse(html, baseURL: base) }.value
            }
            blocks = parsed
            state = .loaded(item)
            readStore.markRead(item.id)
        } catch {
            state = .failed(error)
        }
    }

    @ViewBuilder
    private func content(_ item: SiteItemDetail) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header(item)

                    if item.hasReadableBody {
                        ArticleBodyView(blocks: blocks)
                        if item.body?.complete == false {
                            noticeCard(icon: "hourglass", text: "這篇的繁體整理尚未完成，稍後會自動補齊。")
                        }
                    } else {
                        if let summary = item.summary, !summary.isEmpty {
                            Text(summary)
                                .font(.system(size: 17))
                                .lineSpacing(6)
                                .foregroundStyle(palette.text)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        noticeCard(icon: item.readingMode == "summary-only" ? "lock" : "clock",
                                   text: item.readingMode == "summary-only"
                                   ? "來源僅授權顯示摘要，完整內容請看原文。"
                                   : "繁體閱讀內文尚未備妥（來源正文待確認），目前先顯示導讀摘要。")
                    }

                    footer(item)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            }
            .sheet(isPresented: $showOutline) {
                OutlineSheet(outline: item.outline) { anchor in
                    showOutline = false
                    withAnimation { proxy.scrollTo(anchor, anchor: .top) }
                }
                .presentationDetents([.medium])
            }
        }
    }

    private func header(_ item: SiteItemDetail) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                if let cat = Category.label(for: item.category) { TagChip(text: cat, highlighted: true) }
                ForEach(item.tags.prefix(3), id: \.self) { TagChip(text: $0) }
            }
            Text(item.title)
                .font(.title2.bold())
                .foregroundStyle(palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if let original = item.originalTitle, original != item.title {
                Text(original)
                    .font(.subheadline)
                    .foregroundStyle(palette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(item.source.name)
                    if let author = item.author, !author.isEmpty { Text("· \(author)") }
                }
                Text(DateText.full(item.publishedAt ?? item.timelineAt))
            }
            .font(.caption)
            .foregroundStyle(palette.secondaryText)

            if let reason = item.reason, !reason.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "sparkle").foregroundStyle(palette.accent)
                    Text(reason).font(.subheadline).foregroundStyle(palette.text)
                }
                .padding(12)
                .background(palette.accentSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            if item.body?.zhKind == "reading" {
                Text("以下為 AI 依來源材料撰寫的繁體整理，非原文逐字翻譯。")
                    .font(.caption2)
                    .foregroundStyle(palette.secondaryText)
            }
            Divider().overlay(palette.divider)
        }
    }

    private func footer(_ item: SiteItemDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider().overlay(palette.divider)

            if let url = URL(string: item.links.original) {
                Button {
                    openExternal(url)
                } label: {
                    Label("閱讀原文（\(item.source.name)）", systemImage: "safari")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }

            if let group = item.group, group.reportCount > 1 {
                NavigationLink(value: Route.group(factId: group.factId, title: item.story?.title ?? item.title)) {
                    Label("同一事件的 \(group.reportCount) 篇報導", systemImage: "doc.on.doc")
                }
            }
            if let story = item.story {
                NavigationLink(value: Route.story(publicId: story.publicId)) {
                    Label("事件：\(story.title)", systemImage: "flame")
                }
            }
            if !item.topics.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(item.topics) { t in
                        NavigationLink(value: Route.topic(slug: t.slug)) { TagChip(text: t.name, highlighted: true) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.top, 8)
    }

    private func noticeCard(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).foregroundStyle(palette.accent)
            Text(text).font(.subheadline).foregroundStyle(palette.secondaryText)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.surfaceAlt, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

struct OutlineSheet: View {
    @Environment(\.palette) private var palette
    let outline: [OutlineEntry]
    let jump: (String) -> Void

    var body: some View {
        NavigationStack {
            List(outline) { entry in
                Button { jump(entry.id) } label: {
                    Text(entry.text)
                        .padding(.leading, CGFloat(max(0, entry.level - 2)) * 16)
                        .foregroundStyle(palette.text)
                }
            }
            .navigationTitle("目錄")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

/// 同一事件的其他報導（/api/site/groups/:factId/reports）。
struct GroupReportsView: View {
    @Environment(\.palette) private var palette
    let factId: String
    let title: String
    @State private var state: LoadState<GroupReportsResponse> = .idle

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error): ErrorStateView(error: error) { await load() }
            case let .loaded(res):
                List(res.reports) { r in
                    NavigationLink(value: Route.item(id: r.id)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(r.title).foregroundStyle(palette.text)
                            SourceLine(source: r.source.name, at: r.timelineAt)
                        }
                    }
                    .listRowBackground(palette.surface)
                }
            }
        }
        .themedBackground()
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard state.value == nil else { return }
        state = .loading
        do { state = .loaded(try await APIClient.shared.groupReports(factId: factId)) }
        catch { state = .failed(error) }
    }
}
