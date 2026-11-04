import SwiftUI

/// 日報首頁：最新一期（可能尚未出刊）＋ 往期入口。
struct DailyHomeView: View {
    @Environment(\.palette) private var palette
    @State private var state: LoadState<ReportLatestPage> = .idle

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error): ErrorStateView(error: error) { await load() }
            case let .loaded(page):
                if let report = page.report {
                    ReportContentView(report: report)
                } else {
                    ScrollView {
                        EmptyStateView(icon: "newspaper", title: "今天的日報還沒出刊",
                                       detail: "日報每天台灣時間 22:00 前後出刊；往期可從右上角進入。")
                    }
                }
            }
        }
        .themedBackground()
        .navigationTitle("日報")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: Route.dailyArchive) { Image(systemName: "calendar") }
            }
        }
        .refreshable { await load() }
        .task { if state.value == nil { await load() } }
    }

    private func load() async {
        if state.value == nil { state = .loading }
        do { state = .loaded(try await APIClient.shared.latestDaily()) }
        catch { if state.value == nil { state = .failed(error) } }
    }
}

struct DailyReportView: View {
    let key: String
    @State private var state: LoadState<ReportDetail> = .idle

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error): ErrorStateView(error: error) { await load() }
            case let .loaded(report): ReportContentView(report: report)
            }
        }
        .themedBackground()
        .navigationTitle(DateText.dailyLabel(key))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: key) { await load() }
    }

    private func load() async {
        state = .loading
        do { state = .loaded(try await APIClient.shared.daily(key: key)) }
        catch { state = .failed(error) }
    }
}

struct DailyArchiveView: View {
    @Environment(\.palette) private var palette
    @State private var state: LoadState<ReportIndexResponse> = .idle

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error): ErrorStateView(error: error) { await load() }
            case let .loaded(index):
                List(index.items) { entry in
                    NavigationLink(value: Route.daily(key: entry.key)) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(DateText.dailyLabel(entry.key)).font(.headline).foregroundStyle(palette.text)
                                Text("第 \(entry.issueNumber) 期").font(.caption).foregroundStyle(palette.secondaryText)
                                Spacer()
                                if let c = entry.count { Text("\(c) 則").font(.caption).foregroundStyle(palette.secondaryText) }
                            }
                            if let t = entry.title { Text(t).font(.subheadline).foregroundStyle(palette.secondaryText).lineLimit(2) }
                        }
                    }
                    .listRowBackground(palette.surface)
                }
            }
        }
        .themedBackground()
        .navigationTitle("往期日報")
        .task { await load() }
    }

    private func load() async {
        state = .loading
        do { state = .loaded(try await APIClient.shared.dailyIndex()) }
        catch { state = .failed(error) }
    }
}

/// 日報內文（最新與指定期共用）。
struct ReportContentView: View {
    @Environment(\.palette) private var palette
    let report: ReportDetail

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("第 \(report.issueNumber) 期 · \(DateText.dailyLabel(report.key)) · 約 \(report.readingMinutes) 分鐘")
                        .font(.caption).foregroundStyle(palette.secondaryText)
                    if let lead = report.lead {
                        if let leadId = report.leadItemId {
                            NavigationLink(value: Route.item(id: leadId)) {
                                Text(lead.title).font(.title2.bold()).foregroundStyle(palette.text).multilineTextAlignment(.leading)
                            }.buttonStyle(.plain)
                        } else {
                            Text(lead.title).font(.title2.bold()).foregroundStyle(palette.text)
                        }
                        Text(lead.leadParagraph).font(.system(size: 17)).lineSpacing(6).foregroundStyle(palette.text)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Text(report.title).font(.title2.bold()).foregroundStyle(palette.text)
                    }
                }

                if let cover = report.cover, let url = APIClient.shared.resolveMedia(cover.url) {
                    AsyncImage(url: url) { image in image.resizable().scaledToFit() } placeholder: { Color.clear.frame(height: 160) }
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    if let caption = cover.caption { Text(caption).font(.caption).foregroundStyle(palette.secondaryText) }
                }

                if let overview = report.overview, !overview.isEmpty {
                    Text(overview).font(.subheadline).lineSpacing(5).foregroundStyle(palette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !report.highlights.isEmpty {
                    sectionHeader("今日要聞")
                    ForEach(report.highlights) { CitationRow(citation: $0) }
                }

                ForEach(report.sections) { section in
                    sectionHeader(section.label)
                    if let s = section.summary, !s.isEmpty {
                        Text(s).font(.subheadline).foregroundStyle(palette.secondaryText)
                    }
                    ForEach(section.items) { CitationRow(citation: $0) }
                }

                if !report.flashes.isEmpty {
                    sectionHeader("快訊")
                    ForEach(report.flashes) { CitationRow(citation: $0, compact: true) }
                }

                HStack {
                    if let prev = report.prev {
                        NavigationLink(value: Route.daily(key: prev)) { Label(DateText.dailyLabel(prev), systemImage: "chevron.left") }
                    }
                    Spacer()
                    if let next = report.next {
                        NavigationLink(value: Route.daily(key: next)) {
                            HStack { Text(DateText.dailyLabel(next)); Image(systemName: "chevron.right") }
                        }
                    }
                }
                .font(.subheadline)
                .padding(.top, 8)
            }
            .padding(20)
        }
        .toolbar { ToolbarItem(placement: .topBarTrailing) { ShareButton(url: AppConfig.webURL(forDaily: report.key)) } }
    }

    private func sectionHeader(_ s: String) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2).fill(palette.accent).frame(width: 4, height: 18)
            Text(s).font(.headline).foregroundStyle(palette.text)
        }
        .padding(.top, 6)
    }
}

struct CitationRow: View {
    @Environment(\.palette) private var palette
    let citation: ReportCitation
    var compact = false

    var body: some View {
        Group {
            if let id = citation.itemId, citation.available {
                NavigationLink(value: Route.item(id: id)) { row }.buttonStyle(.plain)
            } else if let url = URL(string: citation.sourceUrl), citation.available {
                Button { openExternal(url) } label: { row }.buttonStyle(.plain)
            } else {
                row.opacity(0.6)
            }
        }
    }

    private var row: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(citation.title).font(compact ? .subheadline.weight(.medium) : .headline).foregroundStyle(palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if !compact, let s = citation.summary, !s.isEmpty {
                Text(s).font(.subheadline).foregroundStyle(palette.secondaryText).lineLimit(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 6) {
                Text(citation.sourceName)
                if citation.firstParty { Text("· 第一方") }
                if let n = citation.otherSources, n > 0 { Text("· 另有 \(n) 家") }
                if !citation.available { Text("· 已下架") }
                if let f = citation.followUp { Text("· 續 \(DateText.dailyLabel(f))") }
            }
            .font(.caption).foregroundStyle(palette.secondaryText)
            if let related = citation.related, !related.isEmpty {
                ForEach(related) { r in
                    Text("↳ \(r.title)").font(.caption).foregroundStyle(palette.secondaryText)
                }
            }
        }
        .padding(compact ? 10 : 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
