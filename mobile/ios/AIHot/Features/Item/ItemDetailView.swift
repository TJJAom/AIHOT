import SwiftUI

struct ItemDetailView: View {
    @Environment(\.palette) private var palette
    @Environment(FavoritesStore.self) private var favorites
    @Environment(ReadStore.self) private var readStore
    @Environment(ThemeStore.self) private var themeStore
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
                VStack(alignment: .leading, spacing: 0) {
                    header(item)

                    if item.hasReadableBody {
                        // 「文章內容 · AI 重點整理」分隔與說明（網頁版 item.tsx）
                        VStack(alignment: .leading, spacing: 8) {
                            Text("文章內容 · \(item.body?.zhKind == "reading" ? "AI 重點整理" : item.body?.zhKind == "translation" ? "繁體翻譯" : "原文")")
                                .font(AppFont.ui(12.5, .medium)).foregroundStyle(palette.text4)
                            if item.body?.zhKind == "reading" {
                                Text("依來源材料整理重點、背景與細節，並非原文全文或逐字翻譯；完整報導請閱讀原文。")
                                    .font(AppFont.ui(12.5)).foregroundStyle(palette.text4)
                            }
                        }
                        .padding(.top, 20).padding(.bottom, 28)
                        .overlay(alignment: .top) { Rectangle().fill(palette.line).frame(height: 1) }
                        .padding(.top, 24)

                        ArticleBodyView(blocks: blocks)
                        if item.body?.complete == false {
                            noticeCard(icon: "hourglass", text: "這篇的繁體整理尚未完成，稍後會自動補齊。").padding(.top, 20)
                        }
                    } else {
                        noticeCard(icon: item.readingMode == "summary-only" ? "lock" : "clock",
                                   text: item.readingMode == "summary-only"
                                   ? "來源僅授權顯示摘要，完整內容請看原文。"
                                   : "繁體閱讀內文尚未備妥（來源正文待確認），目前先顯示導讀摘要。")
                            .padding(.top, 24)
                    }

                    footer(item)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8).padding(.bottom, 40)
            }
            .sheet(isPresented: $showOutline) {
                OutlineSheet(outline: item.outline) { anchor in
                    showOutline = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { withAnimation { proxy.scrollTo(anchor, anchor: .top) } }
                }
                .presentationDetents([.medium])
            }
        }
    }

    /// 來源行、標題、原題、AI 導讀。
    private func header(_ item: SiteItemDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Text(item.source.name).font(AppFont.ui(12.5, .semibold)).foregroundStyle(palette.text)
                if let author = item.author, !author.isEmpty { Text("· \(author)") }
                Text("·")
                Text(DateText.full(item.publishedAt ?? item.timelineAt)).font(AppFont.mono(12, .regular))
            }
            .font(AppFont.ui(12.5)).foregroundStyle(palette.text4).lineLimit(1)

            Text(item.title)
                .font(.system(size: 26, weight: .bold)).lineSpacing(6).tracking(-0.3)
                .foregroundStyle(palette.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
            if let original = item.originalTitle, original != item.title {
                Text(original)
                    .font(AppFont.ui(14.5)).lineSpacing(4)
                    .foregroundStyle(palette.text4)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            }

            if let summary = item.summary, !summary.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("AI 導讀").font(AppFont.ui(12.5, .semibold)).foregroundStyle(palette.accent)
                    Text(summary)
                        .font(.system(size: 18 * CGFloat(themeStore.fontScale))).lineSpacing(10)
                        .foregroundStyle(palette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 28)
            }

            if let reason = item.reason, !reason.isEmpty {
                Text("推薦理由：\(reason)")
                    .font(AppFont.ui(13.5)).lineSpacing(5).foregroundStyle(palette.note)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 16)
            }
        }
    }

    private func footer(_ item: SiteItemDetail) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if let url = URL(string: item.links.original) {
                Button {
                    openExternal(url)
                } label: {
                    HStack(spacing: 6) { Text("開啟原文"); Image(systemName: "arrow.up.right.square").font(.system(size: 13)) }
                        .font(AppFont.ui(14.5, .medium))
                        .foregroundStyle(palette.text)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .background(palette.surface, in: Capsule())
                        .overlay(Capsule().strokeBorder(palette.lineStrong, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
            }

            VStack(alignment: .leading, spacing: 12) {
                if let score = item.score {
                    metaRow("AI 評分") { ScoreLabel(score: score) }
                }
                if !item.topics.isEmpty {
                    metaRow("主題") {
                        FlowLayout(spacing: 6) {
                            ForEach(item.topics) { t in
                                NavigationLink(value: Route.topic(slug: t.slug)) { Badge(text: t.name) }.buttonStyle(.plain)
                            }
                        }
                    }
                }
                if !item.tags.isEmpty {
                    metaRow("標籤") {
                        FlowLayout(spacing: 6) { ForEach(item.tags, id: \.self) { Badge(text: "#\($0)") } }
                    }
                }
            }
            .padding(.top, 8)

            if let group = item.group, group.reportCount > 1 {
                NavigationLink(value: Route.group(factId: group.factId, title: item.story?.title ?? item.title)) {
                    linkRow("同一事件的 \(group.reportCount) 篇報導", icon: "doc.on.doc")
                }.buttonStyle(.plain)
            }
            if let story = item.story {
                NavigationLink(value: Route.story(publicId: story.publicId)) {
                    linkRow("事件：\(story.title)", icon: "flame")
                }.buttonStyle(.plain)
            }
        }
        .padding(.top, 36)
        .overlay(alignment: .top) { Rectangle().fill(palette.line).frame(height: 1) }
    }

    private func metaRow<V: View>(_ label: String, @ViewBuilder _ value: () -> V) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(AppFont.ui(12.5, .semibold)).foregroundStyle(palette.text)
            value()
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Rectangle().fill(palette.line).frame(height: 1) }
    }

    private func linkRow(_ text: String, icon: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(palette.accent)
            Text(text).font(AppFont.ui(14.5, .medium)).foregroundStyle(palette.text).lineLimit(2)
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(palette.text4)
        }
        .padding(14)
        .background(palette.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(palette.line, lineWidth: 1))
        .contentShape(Rectangle())
    }

    private func noticeCard(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).foregroundStyle(palette.accent)
            Text(text).font(AppFont.ui(13.5)).lineSpacing(4).foregroundStyle(palette.text3)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.sunk, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
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
                            SourceLine(source: r.source.name, at: r.timelineAt, relative: true)
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
