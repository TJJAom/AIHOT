import SwiftUI

// 日報頁：依網頁版 ReportPaper 的報紙結構——報頭（報名、報眼：期數、大號日期、本月出刊日曆）、
// 指標帶、頭版（頭條、今日看點、本期版面）、各版（01 行業動態 …）、快訊、前後期與版尾。
// 色彩、字級與元件都用站上的；只有結構是報紙的。

enum ReportKind: String, CaseIterable, Identifiable {
    case daily, weekly, monthly
    var id: String { rawValue }
    var name: String { switch self { case .daily: "日報"; case .weekly: "週報"; case .monthly: "月報" } }
    var edition: String { switch self { case .daily: "每天 08:00 出刊"; case .weekly: "每週一出刊"; case .monthly: "每月 1 日出刊" } }
    var motto: String { switch self { case .daily: "AI · 每日要聞"; case .weekly: "AI · 每週綜述"; case .monthly: "AI · 每月盤點" } }
}

// MARK: 入口頁（最新一期）

struct DailyHomeView: View {
    @Environment(\.palette) private var palette
    @State private var kind: ReportKind = .daily
    @State private var state: LoadState<ReportLatestPage> = .idle
    @State private var showCalendar = false
    @State private var showOutline = false

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error): ErrorStateView(error: error) { await load() }
            case let .loaded(page):
                ReportPaperView(kind: kind, report: page.report, index: page.index, showOutline: $showOutline) {
                    ReportRecentChips(kind: kind, index: page.index, current: page.report?.key)
                }
            }
        }
        .themedBackground()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                PillTabs(items: ReportKind.allCases.map { ($0, $0.name) }, selected: $kind, size: 32)
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                if let report = state.value?.report, !reportOutline(report).isEmpty {
                    Button { showOutline = true } label: { Image(systemName: "list.bullet") }
                        .accessibilityLabel("本期目錄")
                }
                Button { showCalendar = true } label: { Image(systemName: "calendar") }
                    .accessibilityLabel("日曆")
            }
        }
        .sheet(isPresented: $showCalendar) {
            ReportCalendarSheet(kind: kind, index: state.value?.index ?? [], current: state.value?.report?.key)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .pullToRefresh { await load() }
        .onChange(of: kind) { _, _ in state = .idle }
        .task(id: kind) { await load() }
    }

    private func load() async {
        if state.value == nil { state = .loading }
        do { state = .loaded(try await APIClient.shared.latestReport(kind: kind.rawValue)) }
        catch { if state.value == nil { state = .failed(error) } }
    }
}

/// 指定一期。
struct DailyReportView: View {
    let kind: ReportKind
    let key: String
    @State private var state: LoadState<(ReportDetail, [ReportNavigationEntry])> = .idle
    @State private var showOutline = false
    @State private var showCalendar = false

    init(key: String, kind: ReportKind = .daily) { self.key = key; self.kind = kind }

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error): ErrorStateView(error: error) { await load() }
            case let .loaded((report, index)):
                ReportPaperView(kind: kind, report: report, index: index, showOutline: $showOutline) {
                    ReportRecentChips(kind: kind, index: index, current: report.key)
                }
            }
        }
        .themedBackground()
        .navigationTitle("\(kind.name) · \(DateText.monthDay(key))")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if let r = state.value?.0, !reportOutline(r).isEmpty {
                    Button { showOutline = true } label: { Image(systemName: "list.bullet") }
                }
                Button { showCalendar = true } label: { Image(systemName: "calendar") }
                ShareButton(url: AppConfig.webURL(forReport: kind.rawValue, key: key))
            }
        }
        .sheet(isPresented: $showCalendar) {
            ReportCalendarSheet(kind: kind, index: state.value?.1 ?? [], current: key)
                .presentationDetents([.medium, .large]).presentationDragIndicator(.visible)
        }
        .task(id: key) { await load() }
    }

    private func load() async {
        guard state.value == nil else { return }
        state = .loading
        do {
            async let r = APIClient.shared.report(kind: kind.rawValue, key: key)
            async let i = APIClient.shared.reportIndex(kind: kind.rawValue)
            state = .loaded((try await r, (try? await i)?.items ?? []))
        } catch { state = .failed(error) }
    }
}

/// 頂端最近三期的藥丸：今天 / 11月3日 / 更早。
struct ReportRecentChips: View {
    @Environment(\.palette) private var palette
    let kind: ReportKind
    let index: [ReportNavigationEntry]
    let current: String?

    var body: some View {
        let recent = index.prefix(3)
        if !recent.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(recent)) { e in
                        let on = e.key == current
                        NavigationLink(value: Route.report(kind: kind.rawValue, key: e.key)) {
                            Text(chipLabel(e.key))
                                .font(AppFont.ui(13, on ? .semibold : .regular))
                                .foregroundStyle(on ? palette.background : palette.text2)
                                .padding(.horizontal, 16).frame(height: 36)
                                .background(on ? palette.text : palette.surface, in: Capsule())
                                .overlay(Capsule().strokeBorder(on ? palette.text : palette.lineStrong, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .disabled(on)
                    }
                    if index.count > 3 {
                        NavigationLink(value: Route.dailyArchive) {
                            Text("更早").font(AppFont.ui(13)).foregroundStyle(palette.text2)
                                .padding(.horizontal, 16).frame(height: 36)
                                .background(palette.surface, in: Capsule())
                                .overlay(Capsule().strokeBorder(palette.lineStrong, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func chipLabel(_ key: String) -> String {
        switch kind {
        case .daily: key == DateText.todayKey ? "今天" : DateText.monthDay(key)
        case .monthly: "\(Int(key.suffix(2)) ?? 0) 月"
        case .weekly: "第 \(Int(key.suffix(2)) ?? 0) 週"
        }
    }
}

// MARK: 報紙本體

struct ReportPaperView<Top: View>: View {
    @Environment(\.palette) private var palette
    let kind: ReportKind
    let report: ReportDetail?
    let index: [ReportNavigationEntry]
    @Binding var showOutline: Bool
    @ViewBuilder let top: () -> Top

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    top().padding(.top, 6).padding(.bottom, 4)
                    if let report {
                        ReportPaper(report: report, kind: kind, index: index)
                            .padding(.horizontal, 16)
                    } else {
                        EmptyStateView(icon: "newspaper", title: "還沒有釋出\(kind.name)",
                                       detail: kind == .daily ? "日報每天台灣時間 08:00 前後出刊；往期可從右上角的日曆進入。" : "第一期釋出後會出現在這裡。")
                            .padding(.top, 60)
                    }
                }
                .padding(.bottom, 32)
            }
            .sheet(isPresented: $showOutline) {
                if let report {
                    ReportOutlineSheet(entries: reportOutline(report)) { id in
                        showOutline = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { withAnimation { proxy.scrollTo(id, anchor: .top) } }
                    }
                    .presentationDetents([.medium])
                }
            }
        }
    }
}

struct OutlineItem: Identifiable {
    var id: String
    var mark: String
    var text: String
    var note: String?
}

/// 本期目錄：頭版、各版（編號）、快訊。
func reportOutline(_ report: ReportDetail) -> [OutlineItem] {
    let pages = pagesOf(report)
    if pages.isEmpty && report.flashes.isEmpty { return [] }
    var out = [OutlineItem(id: "report-start", mark: "", text: "頭版", note: nil)]
    out += pages.enumerated().map { i, p in OutlineItem(id: p.id, mark: pad(i + 1), text: p.label, note: "\(p.items.count) 件") }
    if !report.flashes.isEmpty { out.append(OutlineItem(id: "s-flash", mark: pad(pages.count + 1), text: "快訊", note: "\(report.flashes.count) 條")) }
    return out
}

struct ReportOutlineSheet: View {
    @Environment(\.palette) private var palette
    let entries: [OutlineItem]
    let jump: (String) -> Void

    var body: some View {
        NavigationStack {
            List(entries) { e in
                Button { jump(e.id) } label: {
                    HStack(spacing: 12) {
                        Text(e.mark).font(AppFont.mono(13, .bold)).foregroundStyle(palette.accent).frame(width: 28, alignment: .leading)
                        Text(e.text).font(AppFont.ui(15, .medium)).foregroundStyle(palette.text)
                        Spacer()
                        if let n = e.note { Text(n).font(AppFont.ui(12)).foregroundStyle(palette.text4) }
                    }
                }
                .listRowBackground(palette.surface)
            }
            .scrollContentBackground(.hidden).background(palette.background)
            .navigationTitle("本期目錄").navigationBarTitleDisplayMode(.inline)
        }
    }
}

private func pad(_ n: Int) -> String { String(format: "%02d", n) }
private func keyOf(_ c: ReportCitation) -> String { c.itemId ?? c.title }
private func anchorOf(_ c: ReportCitation) -> String? { c.itemId.map { "r-\($0)" } }
private let withdrawnNote = "該內容已按來源方要求下架或調整展示方式。"

struct ReportPage: Identifiable {
    var id: String
    var label: String
    var summary: String?
    var items: [ReportCitation]
}

func leadStoryOf(_ report: ReportDetail) -> ReportCitation? {
    guard let id = report.leadItemId else { return nil }
    return report.sections.flatMap(\.items).first { $0.itemId == id && $0.available }
}

/// 各版：同一條只出現一次；頭條不在版內重複。
func pagesOf(_ report: ReportDetail) -> [ReportPage] {
    var seen = Set<String>()
    if let lead = leadStoryOf(report) { seen.insert(keyOf(lead)) }
    return report.sections.enumerated().compactMap { i, s in
        let items = s.items.filter { c in
            let k = keyOf(c)
            if seen.contains(k) { return false }
            seen.insert(k); return true
        }
        return items.isEmpty ? nil : ReportPage(id: "s-\(i + 1)", label: s.label, summary: s.summary, items: items)
    }
}

private struct Metric { var value: Int; var unit: String }
private func metricItems(_ m: [String: Double]) -> [Metric] {
    let order: [(String, String)] = [("totalEvents", "件大事"), ("totalStories", "件大事"), ("sourcesCount", "個來源"), ("firstPartyEvents", "件一手釋出"),
                                     ("modelsReleased", "個新模型"), ("selectedCount", "條精選"), ("reportsCovered", "期日報")]
    return order.compactMap { k, unit in
        guard let v = m[k] else { return nil }
        if k == "modelsReleased", v <= 0 { return nil }
        return Metric(value: Int(v), unit: unit)
    }
}

struct ReportPaper: View {
    @Environment(\.palette) private var palette
    let report: ReportDetail
    let kind: ReportKind
    let index: [ReportNavigationEntry]

    var body: some View {
        let lead = leadStoryOf(report)
        let pages = pagesOf(report)
        let count = pages.reduce(0) { $0 + $1.items.count } + (lead != nil ? 1 : 0)
        let quiet = count == 0 && report.flashes.isEmpty

        VStack(alignment: .leading, spacing: 0) {
            Masthead(report: report, kind: kind, index: index, quiet: quiet).id("report-start")

            if quiet {
                if let l = report.lead { QuietFront(lead: l) }
            } else {
                if kind != .daily, lead != nil, let overview = report.overview, !overview.isEmpty { Overview(text: overview) }
                FrontPage(report: report, kind: kind, pages: pages, leadStory: lead, count: count)
            }

            ForEach(Array(pages.enumerated()), id: \.element.id) { i, p in
                SectionPage(id: p.id, no: i + 1, label: p.label) {
                    if let s = p.summary, !s.isEmpty {
                        (Text("本版導讀  ").font(AppFont.ui(15, .semibold)).foregroundColor(palette.accent) + Text(s).font(AppFont.ui(15.5)).foregroundColor(palette.text2))
                            .lineSpacing(7)
                            .padding(.vertical, 18)
                            .overlay(alignment: .bottom) { Rectangle().fill(palette.line).frame(height: 1) }
                    }
                    ForEach(p.items) { c in
                        Story(c: c, dated: kind != .daily).id(anchorOf(c) ?? "")
                            .overlay(alignment: .bottom) { Rectangle().fill(palette.line).frame(height: 1) }
                    }
                }
            }

            if !report.flashes.isEmpty {
                SectionPage(id: "s-flash", no: pages.count + 1, label: "快訊") {
                    ForEach(Array(report.flashes.enumerated()), id: \.offset) { _, f in
                        FlashRow(c: f)
                            .overlay(alignment: .bottom) { Rectangle().fill(palette.line).frame(height: 1) }
                    }
                }
            }

            Neighbours(report: report, kind: kind, index: index)

            VStack(spacing: 10) {
                Text("（本期完）").font(AppFont.ui(13, .semibold)).tracking(8).foregroundStyle(palette.text4)
                HStack(spacing: 0) {
                    Text("日耕 AI 熱點 \(kind.name)根據公開報道自動整理，每條都附原文 · ")
                    NavigationLink(value: Route.dailyArchive) { Text("日報合訂本").fontWeight(.medium).foregroundStyle(palette.text3) }
                }
                .font(AppFont.ui(12)).foregroundStyle(palette.text4)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
        }
    }
}

// MARK: 報頭

private struct Masthead: View {
    @Environment(\.palette) private var palette
    @Environment(\.horizontalSizeClass) private var sizeClass
    let report: ReportDetail
    let kind: ReportKind
    let index: [ReportNavigationEntry]
    let quiet: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(dateLine).monospacedDigit()
                Spacer()
                Text(kind.edition)
            }
            .font(AppFont.ui(12)).foregroundStyle(palette.text4)
            .padding(.top, 12)

            HStack(alignment: .center, spacing: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    Nameplate(kind: kind).frame(height: 46)
                    Text("日耕 AI 熱點").font(AppFont.ui(11.5)).tracking(5).foregroundStyle(palette.text4)
                }
                Spacer(minLength: 0)
                // 報眼：期數、大號日期（網點）與本月出刊日曆。
                HStack(spacing: 0) {
                    VStack(spacing: 6) {
                        Text("第 \(report.issueNumber) 期").font(AppFont.ui(11)).tracking(2).foregroundStyle(palette.text4)
                        HalftoneText(text: mark.figure, size: 46)
                        Text(mark.top).font(AppFont.ui(11.5)).foregroundStyle(palette.text2)
                        Text(mark.bottom).font(AppFont.ui(11.5)).foregroundStyle(palette.text4)
                    }
                    .frame(width: 104).padding(.vertical, 12)
                    // 手機寬度只放日期（右上角的日曆鈕有整月）；iPad 與橫向才把本月出刊點陣放進報眼。
                    if kind == .daily, sizeClass == .regular {
                        IssueDots(key: report.key, issueNumber: report.issueNumber, index: index)
                            .frame(width: 128)
                            .padding(.horizontal, 10).padding(.vertical, 10)
                            .overlay(alignment: .leading) { Rectangle().fill(palette.line).frame(width: 1) }
                    }
                }
                .background(palette.sunk, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(palette.lineSoft, lineWidth: 1))
                .layoutPriority(1)
            }
            .padding(.vertical, 24)

            if quiet {
                Rectangle().fill(palette.lineStrong).frame(height: 1)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 24) {
                        ForEach(Array(metricItems(report.metrics).enumerated()), id: \.offset) { _, m in
                            HStack(alignment: .firstTextBaseline, spacing: 5) {
                                Text("\(m.value)").font(.system(size: 22, weight: .bold)).monospacedDigit().foregroundStyle(palette.text)
                                Text(m.unit).font(AppFont.ui(12)).foregroundStyle(palette.text4)
                            }
                        }
                    }
                    HStack { Spacer(); Text("約 \(report.readingMinutes) 分鐘讀完").font(AppFont.ui(12)).foregroundStyle(palette.text4) }
                }
                .padding(.vertical, 12)
                .overlay(alignment: .top) { Rectangle().fill(palette.lineStrong).frame(height: 1) }
                .overlay(alignment: .bottom) { Rectangle().fill(palette.lineStrong).frame(height: 1) }
            }
        }
    }

    private var mark: (figure: String, top: String, bottom: String) {
        let k = report.key
        switch kind {
        case .daily: return (String(k.suffix(2)), "\(k.prefix(4)) 年 \(Int(k.dropFirst(5).prefix(2)) ?? 0) 月", DateText.weekday(k))
        case .weekly: return (String(k.suffix(2)), "\(k.prefix(4)) 年第 \(Int(k.suffix(2)) ?? 0) 週", "")
        case .monthly: return (String(k.suffix(2)), "\(k.prefix(4)) 年", "\(Int(k.suffix(2)) ?? 0) 月")
        }
    }

    private var dateLine: String {
        switch kind {
        case .daily: DateText.dateLine(report.key)
        case .weekly: "\(report.key.prefix(4)) 年第 \(Int(report.key.suffix(2)) ?? 0) 週"
        case .monthly: "\(report.key.prefix(4)) 年 \(Int(report.key.suffix(2)) ?? 0) 月"
        }
    }
}

/// 報名：站上的 SVG 報頭拆成強調色與墨色兩層模板圖，跟著主題上色。
struct Nameplate: View {
    @Environment(\.palette) private var palette
    let kind: ReportKind

    var body: some View {
        if kind == .daily {
            ZStack {
                Image("NameplateDailyAccent").resizable().renderingMode(.template).scaledToFit().foregroundStyle(palette.accent)
                Image("NameplateDailyInk").resizable().renderingMode(.template).scaledToFit().foregroundStyle(palette.text)
            }
        } else {
            HStack(spacing: 0) {
                Text("AI").foregroundStyle(palette.accent)
                Text(kind.name).foregroundStyle(palette.text)
            }
            .font(.system(size: 40, weight: .black))
        }
    }
}

/// 網點字：大號黑體數字以點陣填色（網頁版 Halftone）。
struct HalftoneText: View {
    @Environment(\.palette) private var palette
    let text: String
    let size: CGFloat

    var body: some View {
        let font = Font.system(size: size, weight: .black)
        Text(text).font(font).monospacedDigit().foregroundStyle(.clear)
            .overlay {
                Canvas { ctx, sz in
                    let step: CGFloat = max(3, size / 11)
                    var y: CGFloat = step / 2
                    var row = 0
                    while y < sz.height {
                        var x: CGFloat = (row % 2 == 0 ? step / 2 : step)
                        while x < sz.width {
                            let r = step * 0.42
                            ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(palette.text))
                            x += step
                        }
                        y += step * 0.86; row += 1
                    }
                }
                .mask(Text(text).font(font).monospacedDigit())
            }
            .accessibilityLabel(text)
    }
}

/// 報眼裡的本月出刊日曆：有刊的日子是墨點，本期是較大的強調色點加圈，其餘淡點；點有刊的日子就開那一期。
struct IssueDots: View {
    @Environment(\.palette) private var palette
    let key: String
    let issueNumber: Int
    let index: [ReportNavigationEntry]
    @State private var appeared = false

    private struct Cell: Identifiable { var id: Int; var key: String?; var state: String }

    private var grid: (title: String, note: String, cells: [Cell]) {
        let year = Int(key.prefix(4)) ?? 2026, month = Int(key.dropFirst(5).prefix(2)) ?? 1
        var cal = Calendar(identifier: .gregorian); cal.timeZone = DateText.zone
        let first = cal.date(from: DateComponents(year: year, month: month, day: 1))!
        let days = cal.range(of: .day, in: .month, for: first)!.count
        let lead = (cal.component(.weekday, from: first) + 5) % 7   // 週一為首
        let exists = Set(index.map(\.key))
        var cells: [Cell] = (0..<lead).map { Cell(id: -$0 - 1, key: nil, state: "pad") }
        for d in 1...days {
            let k = String(format: "%04d-%02d-%02d", year, month, d)
            cells.append(Cell(id: d, key: k, state: k == key ? "current" : exists.contains(k) ? "issue" : "none"))
        }
        let n = cells.filter { $0.state == "issue" || $0.state == "current" }.count
        return ("\(cn(month))月", "本月 \(n) 期", cells)
    }

    var body: some View {
        let g = grid
        VStack(spacing: 6) {
            HStack {
                Text(g.title).font(AppFont.ui(11, .semibold)).tracking(2).foregroundStyle(palette.text2)
                Spacer()
                Text(g.note).font(AppFont.ui(11)).monospacedDigit().foregroundStyle(palette.text4)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 4) {
                ForEach(["一", "二", "三", "四", "五", "六", "日"], id: \.self) { Text($0).font(AppFont.ui(9.5)).foregroundStyle(palette.text4) }
                ForEach(g.cells) { c in
                    ZStack {
                        if c.state == "current" {
                            Circle().strokeBorder(palette.accent.opacity(0.4), lineWidth: 1).frame(width: 13, height: 13)
                            Circle().fill(palette.accent).frame(width: 7, height: 7)
                        } else if c.state == "issue" {
                            Circle().fill(palette.text).frame(width: 5, height: 5)
                        } else if c.state == "none" {
                            Circle().fill(palette.lineStrong).frame(width: 2.5, height: 2.5)
                        }
                    }
                    .frame(height: 14)
                    .scaleEffect(appeared ? 1 : 0.2)
                    .animation(.spring(duration: 0.5, bounce: 0.35).delay(Double(c.id) * 0.012), value: appeared)
                    .contentShape(Rectangle())
                    .overlay {
                        if c.state == "issue", let k = c.key {
                            NavigationLink(value: Route.report(kind: "daily", key: k)) { Color.clear }.buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .onAppear { appeared = true }
    }

    private func cn(_ n: Int) -> String {
        let d = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
        if n <= 10 { return d[n] }
        return "十" + d[n - 10]
    }
}

// MARK: 頭版與各版

private struct SourceRow: View {
    @Environment(\.palette) private var palette
    let c: ReportCitation
    var size: CGFloat = 16
    var body: some View {
        HStack(spacing: 6) {
            SourceAvatar(name: c.sourceName, iconUrl: c.sourceIconUrl, size: size)
            Text(c.sourceName).lineLimit(1)
            if c.firstParty { Badge(text: "一手", tone: .accent) }
        }
        .font(AppFont.ui(12.5)).foregroundStyle(palette.text3)
    }
}

private struct Coverage: View {
    @Environment(\.palette) private var palette
    let c: ReportCitation
    var body: some View {
        HStack(spacing: 8) {
            if let n = c.otherSources, n > 0 {
                if let s = c.storyId {
                    NavigationLink(value: Route.story(publicId: s)) { Text("另外 \(n) 家也報道了") }.buttonStyle(.plain)
                } else { Text("另外 \(n) 家也報道了") }
            }
            if c.followUp != nil { Badge(text: "跟進") }
        }
        .font(AppFont.ui(12.5)).foregroundStyle(palette.text4)
    }
}

private struct OriginalLink: View {
    @Environment(\.palette) private var palette
    let c: ReportCitation
    var body: some View {
        if let url = URL(string: c.sourceUrl) {
            Button { openExternal(url) } label: {
                HStack(spacing: 2) { Text("原文"); Image(systemName: "arrow.up.right").font(.system(size: 10, weight: .semibold)) }
                    .font(AppFont.ui(12.5, .medium)).foregroundStyle(palette.text3)
                    .frame(minHeight: 28)
            }
            .buttonStyle(.plain)
        }
    }
}

private struct Related: View {
    @Environment(\.palette) private var palette
    let items: [ReportCitation]
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(items.prefix(4)) { r in
                HStack(alignment: .top, spacing: 10) {
                    Circle().fill(palette.text4).frame(width: 4, height: 4).padding(.top, 8)
                    Group {
                        if r.available, let id = r.itemId {
                            NavigationLink(value: Route.item(id: id)) {
                                (Text(r.title).foregroundColor(palette.text2) + Text("  \(r.sourceName)").font(AppFont.ui(12)).foregroundColor(palette.text4))
                            }.buttonStyle(.plain)
                        } else {
                            Text(r.title).strikethrough().foregroundStyle(palette.text4)
                        }
                    }
                    .font(AppFont.ui(13.5)).lineSpacing(4).multilineTextAlignment(.leading)
                }
            }
        }
    }
}

private struct FrontPage: View {
    @Environment(\.palette) private var palette
    let report: ReportDetail
    let kind: ReportKind
    let pages: [ReportPage]
    let leadStory: ReportCitation?
    let count: Int

    var body: some View {
        let daily = kind == .daily
        let title = report.lead?.title ?? leadStory?.title ?? headline
        let dek = daily || leadStory == nil ? (report.lead?.leadParagraph ?? leadStory?.summary ?? report.overview) : leadStory?.summary
        let highlights = report.highlights.filter { h in leadStory.map { keyOf(h) != keyOf($0) } ?? true }.prefix(3)
        let period = daily ? "今日" : kind == .weekly ? "本週" : "本月"
        let indexRows: [(id: String, label: String, n: String)] = pages.map { ($0.id, $0.label, "\($0.items.count) 件") }
            + (report.flashes.isEmpty ? [] : [("s-flash", "快訊", "\(report.flashes.count) 條")])

        VStack(alignment: .leading, spacing: 0) {
            // 頭條
            VStack(alignment: .leading, spacing: 0) {
                Kicker(text: daily || leadStory != nil ? "頭條" : "本期導讀")
                Group {
                    if let id = leadStory?.itemId {
                        NavigationLink(value: Route.item(id: id)) { leadTitle(title) }.buttonStyle(.plain)
                    } else { leadTitle(title) }
                }
                .padding(.top, 16)
                if let cover = report.cover, let url = APIClient.shared.resolveMedia(cover.url) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: { palette.sunk }
                    .aspectRatio(coverRatio(cover), contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.top, 20)
                    if let cap = cover.caption { Text("圖 · \(cap)").font(AppFont.ui(12.5)).foregroundStyle(palette.text4).lineLimit(2).padding(.top, 10) }
                }
                if let dek, !dek.isEmpty {
                    Text(dek).font(AppFont.ui(16.5)).lineSpacing(9).foregroundStyle(palette.text2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 22)
                }
                if let lead = leadStory {
                    HStack(spacing: 16) {
                        SourceRow(c: lead, size: 18)
                        Coverage(c: lead)
                        OriginalLink(c: lead)
                    }
                    .padding(.top, 18)
                    if let related = lead.related, !related.isEmpty {
                        Related(items: related).padding(.top, 16)
                            .overlay(alignment: .top) { Rectangle().fill(palette.line).frame(height: 1) }
                            .padding(.top, 2)
                    }
                }
            }
            .padding(.vertical, 28)
            .id(leadStory.flatMap(anchorOf) ?? "lead")

            // 今日看點
            if !highlights.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker(text: "\(period)看點").padding(.bottom, 4)
                    ForEach(Array(highlights.enumerated()), id: \.element.id) { i, h in
                        Group {
                            if h.available, let id = h.itemId {
                                NavigationLink(value: Route.item(id: id)) { highlightRow(i, h) }.buttonStyle(.plain)
                            } else {
                                highlightRow(i, h).opacity(0.6)
                            }
                        }
                        .overlay(alignment: .bottom) { Rectangle().fill(palette.line).frame(height: 1) }
                    }
                }
                .padding(.top, 28)
                .overlay(alignment: .top) { Rectangle().fill(palette.line).frame(height: 1) }
            }

            // 本期版面
            if !indexRows.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Kicker(text: "本期版面").padding(.bottom, 10)
                    ForEach(Array(indexRows.enumerated()), id: \.element.id) { i, p in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(pad(i + 1)).font(AppFont.mono(14, .bold)).foregroundStyle(palette.text).frame(width: 28, alignment: .leading)
                            Text(p.label).font(AppFont.ui(13.5)).foregroundStyle(palette.text2).lineLimit(1)
                            Spacer()
                            Text(p.n).font(AppFont.ui(12)).monospacedDigit().foregroundStyle(palette.text4)
                        }
                        .padding(.vertical, 6)
                    }
                }
                .padding(.top, 32)
            }
        }
    }

    private var headline: String {
        switch kind {
        case .daily: "這一天的 \(count) 件 AI 大事"
        case .weekly: "本週的 \(count) 件 AI 大事"
        case .monthly: "\(Int(report.key.suffix(2)) ?? 0) 月的 \(count) 件 AI 大事"
        }
    }

    private func leadTitle(_ t: String) -> some View {
        Text(t).font(.system(size: 30, weight: .black)).lineSpacing(6).tracking(-0.5)
            .foregroundStyle(palette.text).multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func coverRatio(_ c: ReportCover) -> CGFloat {
        guard let w = c.width, let h = c.height, h > 0 else { return 16 / 9 }
        let r = CGFloat(w) / CGFloat(h)
        return r >= 1.25 ? min(2, max(1.6, r)) : max(0.8, r)
    }

    private func highlightRow(_ i: Int, _ h: ReportCitation) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text("\(i + 1)").font(.system(size: 26, weight: .black)).monospacedDigit().tracking(-1)
                .foregroundStyle(h.available ? palette.accent : palette.text4).frame(width: 24, alignment: .leading)
            VStack(alignment: .leading, spacing: 6) {
                Text(h.title).font(AppFont.ui(15, .bold)).lineSpacing(4).foregroundStyle(palette.text)
                    .strikethrough(!h.available)
                    .fixedSize(horizontal: false, vertical: true)
                Text(h.available ? h.sourceName : withdrawnNote).font(AppFont.ui(12)).foregroundStyle(palette.text4).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 16)
        .contentShape(Rectangle())
    }
}

private struct QuietFront: View {
    @Environment(\.palette) private var palette
    let lead: ReportLead
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text(lead.title).font(.system(size: 30, weight: .black)).lineSpacing(6).foregroundStyle(palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if !lead.leadParagraph.isEmpty {
                Text(lead.leadParagraph).font(AppFont.ui(16.5)).lineSpacing(9).foregroundStyle(palette.text2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.top, 40)
    }
}

private struct Overview: View {
    @Environment(\.palette) private var palette
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Kicker(text: "本期導讀")
            Text(text).font(AppFont.ui(16.5)).lineSpacing(9).foregroundStyle(palette.text2).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 28)
        .overlay(alignment: .bottom) { Rectangle().fill(palette.line).frame(height: 1) }
    }
}

/// 一版：強調色編號加版名，底下一道較重的線。
struct SectionPage<Content: View>: View {
    @Environment(\.palette) private var palette
    let id: String
    let no: Int
    let label: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(pad(no)).font(.system(size: 26, weight: .black)).monospacedDigit().tracking(-1).foregroundStyle(palette.accent)
                Text(label).font(.system(size: 24, weight: .black)).tracking(-0.3).foregroundStyle(palette.text)
            }
            .padding(.bottom, 12)
            .overlay(alignment: .bottom) { Rectangle().fill(palette.lineStrong).frame(height: 1) }
            content()
        }
        .padding(.top, 44)
        .id(id)
    }
}

/// 一條：來源、標題、至多四行摘要、原文。
private struct Story: View {
    @Environment(\.palette) private var palette
    let c: ReportCitation
    let dated: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                SourceRow(c: c)
                if c.available { Coverage(c: c) }
                Spacer()
                if dated, let at = c.publishedAt { Text(String(DateText.dayKey(at).dropFirst(5)).replacingOccurrences(of: "-", with: ".")).font(AppFont.ui(12)).monospacedDigit().foregroundStyle(palette.text4) }
            }
            if c.available {
                Group {
                    if let id = c.itemId {
                        NavigationLink(value: Route.item(id: id)) { storyTitle }.buttonStyle(.plain)
                    } else { storyTitle }
                }
                .padding(.top, 12)
                if let s = c.summary, !s.isEmpty {
                    Text(s).font(AppFont.ui(15)).lineSpacing(8).foregroundStyle(palette.text2).lineLimit(4)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 8)
                }
                if let related = c.related, !related.isEmpty { Related(items: related).padding(.top, 12) }
                OriginalLink(c: c).padding(.top, 10)
            } else {
                (Text(c.title).strikethrough() + Text(" · \(withdrawnNote)"))
                    .font(AppFont.ui(14)).foregroundStyle(palette.text4).padding(.top, 12)
            }
        }
        .padding(.vertical, 24)
    }

    private var storyTitle: some View {
        Text(c.title).font(.system(size: 19, weight: .bold)).lineSpacing(5).tracking(-0.2)
            .foregroundStyle(palette.text).multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct FlashRow: View {
    @Environment(\.palette) private var palette
    let c: ReportCitation
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle().fill(c.available ? palette.accent : palette.text4).frame(width: 6, height: 6).padding(.top, 9)
            Group {
                if c.available, let id = c.itemId {
                    NavigationLink(value: Route.item(id: id)) { flashText }.buttonStyle(.plain)
                } else { flashText }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 12)
    }

    private var flashText: some View {
        (Text(c.title).foregroundColor(c.available ? palette.text : palette.text4)
         + Text("  \(c.available ? c.sourceName : withdrawnNote)").font(AppFont.ui(12)).foregroundColor(palette.text4))
            .font(AppFont.ui(14.5)).lineSpacing(5).multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// 前後兩期：左右各半，中間一道線。
private struct Neighbours: View {
    @Environment(\.palette) private var palette
    let report: ReportDetail
    let kind: ReportKind
    let index: [ReportNavigationEntry]

    private func titleOf(_ key: String) -> String { index.first { $0.key == key }?.title ?? "日耕 AI 熱點 \(kind.name) · \(key)" }
    private func label(_ key: String, prev: Bool) -> String {
        switch kind {
        case .daily: "\(prev ? "前一日" : "後一日") · \(DateText.monthDay(key))"
        case .weekly: "\(prev ? "上一期" : "下一期") · 第 \(Int(key.suffix(2)) ?? 0) 週"
        case .monthly: "\(prev ? "上一期" : "下一期") · \(Int(key.suffix(2)) ?? 0) 月"
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Group {
                if let prev = report.prev {
                    NavigationLink(value: Route.report(kind: kind.rawValue, key: prev)) {
                        cell(prev, prevSide: true)
                    }.buttonStyle(.plain)
                } else { Color.clear }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Rectangle().fill(palette.line).frame(width: 1)
            Group {
                if let next = report.next {
                    NavigationLink(value: Route.report(kind: kind.rawValue, key: next)) {
                        cell(next, prevSide: false)
                    }.buttonStyle(.plain)
                } else { Color.clear }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 48)
        .overlay(alignment: .top) { Rectangle().fill(palette.lineStrong).frame(height: 1).padding(.top, 48) }
        .overlay(alignment: .bottom) { Rectangle().fill(palette.lineStrong).frame(height: 1) }
    }

    private func cell(_ key: String, prevSide: Bool) -> some View {
        VStack(alignment: prevSide ? .leading : .trailing, spacing: 10) {
            HStack(spacing: 4) {
                if prevSide { Image(systemName: "arrow.left").font(.system(size: 11, weight: .semibold)) }
                Text(label(key, prev: prevSide))
                if !prevSide { Image(systemName: "arrow.right").font(.system(size: 11, weight: .semibold)) }
            }
            .font(AppFont.ui(12)).foregroundStyle(palette.text4)
            Text(titleOf(key)).font(AppFont.ui(16, .bold)).lineSpacing(4).foregroundStyle(palette.text).lineLimit(2)
                .multilineTextAlignment(prevSide ? .leading : .trailing)
        }
        .frame(maxWidth: .infinity, alignment: prevSide ? .leading : .trailing)
        .padding(.vertical, 24).padding(prevSide ? .trailing : .leading, 16)
        .contentShape(Rectangle())
    }
}

// MARK: 日曆（右上角）

/// 整月日曆：有刊的日子可點，本期以強調色標記；左右切換月份，月份索引按需載入。
struct ReportCalendarSheet: View {
    @Environment(\.palette) private var palette
    @Environment(\.dismiss) private var dismiss
    let kind: ReportKind
    let index: [ReportNavigationEntry]
    let current: String?

    @State private var month: String        // YYYY-MM
    @State private var months: [String: [ReportNavigationEntry]] = [:]
    @State private var selected: Route?

    init(kind: ReportKind, index: [ReportNavigationEntry], current: String?) {
        self.kind = kind; self.index = index; self.current = current
        _month = State(initialValue: String((current ?? DateText.todayKey).prefix(7)))
    }

    private var entries: [String: ReportNavigationEntry] {
        var out: [String: ReportNavigationEntry] = [:]
        for e in index { out[e.key] = e }
        for e in months[month] ?? [] { out[e.key] = e }
        return out
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if kind == .daily {
                    monthHeader
                    calendarGrid
                    Divider().overlay(palette.line)
                    issueList
                } else {
                    List(index) { e in
                        NavigationLink(value: Route.report(kind: kind.rawValue, key: e.key)) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(e.key).font(AppFont.mono(13)).foregroundStyle(palette.text)
                                if let t = e.title { Text(t).font(AppFont.ui(13)).foregroundStyle(palette.text3).lineLimit(2) }
                            }
                        }
                        .listRowBackground(palette.surface)
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .background(palette.background)
            .navigationTitle("\(kind.name)日曆").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("完成") { dismiss() } } }
            .appDestinations()
        }
        .task(id: month) { await loadMonth(month) }
    }

    private var monthHeader: some View {
        HStack {
            Button { shift(-1) } label: { Image(systemName: "chevron.left").frame(width: 36, height: 36) }
            Spacer()
            Text("\(month.prefix(4)) 年 \(Int(month.suffix(2)) ?? 0) 月").font(AppFont.ui(16, .semibold)).foregroundStyle(palette.text)
            Spacer()
            Button { shift(1) } label: { Image(systemName: "chevron.right").frame(width: 36, height: 36) }
                .disabled(month >= String(DateText.todayKey.prefix(7)))
        }
        .padding(.horizontal, 12).padding(.top, 8)
    }

    private var calendarGrid: some View {
        let year = Int(month.prefix(4)) ?? 2026, m = Int(month.suffix(2)) ?? 1
        var cal = Calendar(identifier: .gregorian); cal.timeZone = DateText.zone
        let first = cal.date(from: DateComponents(year: year, month: m, day: 1))!
        let days = cal.range(of: .day, in: .month, for: first)!.count
        let lead = (cal.component(.weekday, from: first) + 5) % 7
        let today = DateText.todayKey
        let e = entries
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 6) {
            ForEach(["一", "二", "三", "四", "五", "六", "日"], id: \.self) { Text($0).font(AppFont.ui(11)).foregroundStyle(palette.text4) }
            ForEach(0..<lead, id: \.self) { _ in Color.clear.frame(height: 40) }
            ForEach(1...days, id: \.self) { d in
                let k = String(format: "%04d-%02d-%02d", year, m, d)
                let has = e[k] != nil
                let isCurrent = k == current
                Group {
                    if has {
                        NavigationLink(value: Route.report(kind: "daily", key: k)) { dayCell(d, has: true, current: isCurrent, today: k == today) }.buttonStyle(.plain)
                    } else {
                        dayCell(d, has: false, current: false, today: k == today)
                    }
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    private func dayCell(_ d: Int, has: Bool, current: Bool, today: Bool) -> some View {
        VStack(spacing: 3) {
            Text("\(d)").font(AppFont.ui(15, has ? .semibold : .regular)).monospacedDigit()
                .foregroundStyle(current ? palette.accentContrast : has ? palette.text : palette.text4.opacity(0.6))
            Circle().fill(current ? palette.accentContrast.opacity(0.9) : has ? palette.accent : .clear).frame(width: 4, height: 4)
        }
        .frame(maxWidth: .infinity).frame(height: 40)
        .background(current ? palette.accent : has ? palette.accentSoft : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(today && !current ? palette.accent.opacity(0.5) : .clear, lineWidth: 1))
    }

    private var issueList: some View {
        let list = entries.values.filter { $0.key.hasPrefix(month) }.sorted { $0.key > $1.key }
        return List {
            if list.isEmpty {
                Text("這個月還沒有\(kind.name)").font(AppFont.ui(13)).foregroundStyle(palette.text4).listRowBackground(palette.surface)
            }
            ForEach(list) { e in
                NavigationLink(value: Route.report(kind: "daily", key: e.key)) {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(spacing: 2) {
                            Text(String(e.key.suffix(2))).font(.system(size: 19, weight: .black)).monospacedDigit().foregroundStyle(e.key == current ? palette.accent : palette.text)
                            Text(DateText.weekdayShort(e.key)).font(AppFont.ui(10)).foregroundStyle(palette.text4)
                        }
                        .frame(width: 34)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(e.title ?? "\(kind.name) \(e.key)").font(AppFont.ui(13.5, e.key == current ? .semibold : .regular)).foregroundStyle(palette.text).lineLimit(2)
                            HStack(spacing: 6) {
                                Text("第 \(e.issueNumber) 期")
                                if let c = e.count { Text("· \(c) 件") }
                            }
                            .font(AppFont.ui(11.5)).foregroundStyle(palette.text4)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .listRowBackground(e.key == current ? palette.accentSoft : palette.surface)
            }
        }
        .scrollContentBackground(.hidden)
    }

    private func shift(_ delta: Int) {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = DateText.zone
        let y = Int(month.prefix(4)) ?? 2026, m = Int(month.suffix(2)) ?? 1
        if let d = cal.date(from: DateComponents(year: y, month: m, day: 1)), let n = cal.date(byAdding: .month, value: delta, to: d) {
            month = String(format: "%04d-%02d", cal.component(.year, from: n), cal.component(.month, from: n))
        }
    }

    private func loadMonth(_ m: String) async {
        guard kind == .daily, months[m] == nil else { return }
        if let res = try? await APIClient.shared.dailyMonth(m) { months[m] = res.items }
    }
}

/// 日報合訂本：所有期別（往期）。
struct DailyArchiveView: View {
    @Environment(\.palette) private var palette
    @State private var state: LoadState<ReportIndexResponse> = .idle

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error): ErrorStateView(error: error) { await load() }
            case let .loaded(index):
                let groups = Dictionary(grouping: index.items) { String($0.key.prefix(7)) }.sorted { $0.key > $1.key }
                List {
                    ForEach(groups, id: \.key) { month, items in
                        Section {
                            ForEach(items.sorted { $0.key > $1.key }) { e in
                                NavigationLink(value: Route.report(kind: "daily", key: e.key)) {
                                    HStack(alignment: .top, spacing: 12) {
                                        VStack(spacing: 2) {
                                            Text(String(e.key.suffix(2))).font(.system(size: 19, weight: .black)).monospacedDigit().foregroundStyle(palette.text)
                                            Text(DateText.weekdayShort(e.key)).font(AppFont.ui(10)).foregroundStyle(palette.text4)
                                        }
                                        .frame(width: 34)
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(e.title ?? "日報 \(e.key)").font(AppFont.ui(13.5)).foregroundStyle(palette.text).lineLimit(2)
                                            HStack(spacing: 6) {
                                                Text("第 \(e.issueNumber) 期")
                                                if let c = e.count { Text("· \(c) 件") }
                                            }
                                            .font(AppFont.ui(11.5)).foregroundStyle(palette.text4)
                                        }
                                    }
                                    .padding(.vertical, 2)
                                }
                                .listRowBackground(palette.surface)
                            }
                        } header: {
                            Text("\(month.prefix(4)) 年 \(Int(month.suffix(2)) ?? 0) 月").font(AppFont.ui(13, .semibold)).foregroundStyle(palette.text)
                        }
                    }
                }
            }
        }
        .themedBackground()
        .navigationTitle("日報合訂本")
        .task { await load() }
    }

    private func load() async {
        guard state.value == nil else { return }
        state = .loading
        do { state = .loaded(try await APIClient.shared.reportIndex(kind: "daily")) }
        catch { state = .failed(error) }
    }
}
