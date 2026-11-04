import SwiftUI

// MARK: 日期（網站以 +08:00 為準；台灣同時區）

enum DateText {
    static let zone = TimeZone(identifier: "Asia/Taipei")!
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private static let isoNoFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f
    }()
    private static func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter(); f.locale = Locale(identifier: "zh_Hant_TW"); f.timeZone = zone; f.dateFormat = format; return f
    }
    private static let dayKeyF = formatter("yyyy-MM-dd")
    private static let timeF = formatter("HH:mm")
    private static let fullF = formatter("yyyy年M月d日 HH:mm")
    private static let keyParser: DateFormatter = {
        let f = formatter("yyyy-MM-dd"); f.isLenient = false; return f
    }()

    static func parse(_ s: String?) -> Date? {
        guard let s else { return nil }
        return iso.date(from: s) ?? isoNoFraction.date(from: s)
    }

    /// ISO 時間 → 台灣日期鍵「2026-11-04」。
    static func dayKey(_ s: String) -> String {
        guard let d = parse(s) else { return String(s.prefix(10)) }
        return dayKeyF.string(from: d)
    }

    static var todayKey: String { dayKeyF.string(from: Date()) }

    /// 「04:37」
    static func time(_ s: String?) -> String {
        guard let d = parse(s) else { return "" }
        return timeF.string(from: d)
    }

    static func full(_ s: String?) -> String {
        guard let d = parse(s) else { return "" }
        return fullF.string(from: d)
    }

    /// 「11月4日」；跨年時帶年份「2025年12月31日」。
    static func monthDay(_ key: String, today: String = todayKey) -> String {
        let p = key.split(separator: "-")
        guard p.count == 3, let m = Int(p[1]), let d = Int(p[2]) else { return key }
        let sameYear = key.prefix(4) == today.prefix(4)
        return sameYear ? "\(m)月\(d)日" : "\(p[0])年\(m)月\(d)日"
    }

    /// 「星期三」
    static func weekday(_ key: String) -> String {
        guard let d = keyParser.date(from: key) else { return "" }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = zone
        return ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][cal.component(.weekday, from: d) - 1]
    }

    /// 「週三」
    static func weekdayShort(_ key: String) -> String {
        weekday(key).replacingOccurrences(of: "星期", with: "週")
    }

    /// 「2026 年 11 月 3 日 · 星期二」
    static func dateLine(_ key: String) -> String {
        let p = key.split(separator: "-")
        guard p.count == 3, let m = Int(p[1]), let d = Int(p[2]) else { return key }
        return "\(p[0]) 年 \(m) 月 \(d) 日 · \(weekday(key))"
    }

    static func dailyLabel(_ key: String) -> String { monthDay(key) }

    /// 「3 分鐘前」等；超過兩天給日期時間。
    static func relative(_ s: String?) -> String {
        guard let d = parse(s) else { return "" }
        let seconds = Date().timeIntervalSince(d)
        if seconds < 60 { return "剛剛" }
        if seconds < 3600 { return "\(Int(seconds / 60)) 分鐘前" }
        if seconds < 86400 { return "\(Int(seconds / 3600)) 小時前" }
        return formatter("M月d日 HH:mm").string(from: d)
    }
}

/// 依台灣日期分組（新→舊，保留原順序）。
struct DayGroup<T> {
    var day: String
    var entries: [T]
}

func byDay<T>(_ items: [T], at: (T) -> String) -> [DayGroup<T>] {
    var out: [DayGroup<T>] = []
    for it in items {
        let day = DateText.dayKey(at(it))
        if out.last?.day == day { out[out.count - 1].entries.append(it) } else { out.append(DayGroup(day: day, entries: [it])) }
    }
    return out
}

// MARK: 字體（對應網頁版的像素值）

enum AppFont {
    static func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight) }
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font { .system(size: size, weight: weight, design: .monospaced) }
}

// MARK: 小元件

/// 來源頭像：有圖用圖，否則以首字母做單色章。
struct SourceAvatar: View {
    @Environment(\.palette) private var palette
    let name: String
    var iconUrl: String? = nil
    var size: CGFloat = 16

    var body: some View {
        ZStack {
            Circle().fill(palette.accentSoft)
            if let url = APIClient.shared.resolveMedia(iconUrl) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: { monogram }
                .clipShape(Circle())
            } else { monogram }
        }
        .frame(width: size, height: size)
    }

    private var monogram: some View {
        Text(String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
            .font(.system(size: size * 0.55, weight: .bold))
            .foregroundStyle(palette.accent)
    }
}

/// 「AI 評分 | 78」藥丸，依分級上色（85+ 暖紅、70+ 強調色、其餘灰）。
struct ScoreLabel: View {
    @Environment(\.palette) private var palette
    let score: Int?
    var compact = false

    var body: some View {
        if let score {
            let (fg, bg, ring): (Color, Color, Color) = score >= 85 ? (palette.hot, palette.hotSoft, palette.hot.opacity(0.25))
                : score >= 70 ? (palette.accent, palette.accentSoft, palette.accent.opacity(0.2))
                : (palette.text4, .clear, palette.lineSoft)
            HStack(spacing: 5) {
                if !compact {
                    Text("AI 評分").font(AppFont.ui(11, .medium)).opacity(0.8)
                    Rectangle().fill(fg.opacity(0.25)).frame(width: 1, height: 10)
                }
                Text("\(score)").font(AppFont.mono(12.5, .bold))
            }
            .foregroundStyle(fg)
            .padding(.horizontal, 8).frame(height: 20)
            .background(bg, in: Capsule())
            .overlay(Capsule().strokeBorder(ring, lineWidth: 1))
        }
    }
}

enum BadgeTone { case selected, accent, neutral, hot }

struct Badge: View {
    @Environment(\.palette) private var palette
    let text: String
    var tone: BadgeTone = .neutral
    var dot = false

    var body: some View {
        let (fg, bg): (Color, Color) = switch tone {
        case .selected: (palette.amber, palette.amberSoft)
        case .accent: (palette.accent, palette.accentSoft)
        case .hot: (palette.hot, palette.hotSoft)
        case .neutral: (palette.text3, palette.sunk)
        }
        HStack(spacing: 4) {
            if dot { Circle().fill(fg).frame(width: 5, height: 5) }
            Text(text).font(AppFont.ui(11, .medium))
        }
        .foregroundStyle(fg)
        .padding(.horizontal, 8).frame(height: 18)
        .background(bg, in: Capsule())
        .overlay(tone == .neutral ? Capsule().strokeBorder(palette.lineSoft, lineWidth: 1) : nil)
    }
}

/// 「只看未讀」這類可疊加的篩選：帶勾選圈的藥丸。
struct ToggleChip: View {
    @Environment(\.palette) private var palette
    let title: String
    @Binding var on: Bool

    var body: some View {
        Button {
            withAnimation(.easeOut(duration: 0.15)) { on.toggle() }
        } label: {
            HStack(spacing: 6) {
                ZStack {
                    Circle().strokeBorder(on ? palette.accent : palette.lineStrong, lineWidth: 1)
                    if on {
                        Circle().fill(palette.accent)
                        Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).foregroundStyle(palette.accentContrast)
                    }
                }
                .frame(width: 16, height: 16)
                Text(title).font(AppFont.ui(13, .medium))
            }
            .foregroundStyle(on ? palette.accent : palette.text2)
            .padding(.leading, 8).padding(.trailing, 14).frame(height: 32)
            .background(on ? palette.accentSoft : palette.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(on ? palette.accent.opacity(0.35) : palette.lineStrong, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// 一組互斥的藥丸分頁（網頁版 PillTabs）：灰底槽，選中者白底。
struct PillTabs<Key: Hashable>: View {
    @Environment(\.palette) private var palette
    let items: [(key: Key, label: String)]
    @Binding var selected: Key
    var fill = false
    var size: CGFloat = 32

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                let on = item.key == selected
                Button {
                    withAnimation(.spring(duration: 0.3)) { selected = item.key }
                } label: {
                    Text(item.label)
                        .font(AppFont.ui(13.5, on ? .semibold : .medium))
                        .foregroundStyle(on ? palette.text : palette.text3)
                        .padding(.horizontal, 14)
                        .frame(maxWidth: fill ? .infinity : nil)
                        .frame(height: size - 6)
                        .background(on ? palette.surface : .clear, in: Capsule())
                        .shadow(color: on ? .black.opacity(0.06) : .clear, radius: 2, y: 1)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(palette.sunk, in: Capsule())
    }
}

/// 短橫線加小字的段落眉標（網頁版 Kicker）。
struct Kicker: View {
    @Environment(\.palette) private var palette
    let text: String
    var body: some View {
        HStack(spacing: 10) {
            Rectangle().fill(palette.accent).frame(width: 18, height: 2)
            Text(text).font(AppFont.ui(12, .semibold)).tracking(3).foregroundStyle(palette.accent)
        }
    }
}

/// 來源一行：「The Decoder · 04:37」
struct SourceLine: View {
    @Environment(\.palette) private var palette
    let source: String
    var at: String? = nil
    var relative = false

    var body: some View {
        HStack(spacing: 6) {
            Text(source).lineLimit(1)
            if let at, !at.isEmpty {
                Text("·")
                Text(relative ? DateText.relative(at) : DateText.time(at)).font(AppFont.mono(12, .regular))
            }
        }
        .font(AppFont.ui(12.5))
        .foregroundStyle(palette.text4)
    }
}

// MARK: 日期列與時間軸

/// 日期列：「11月4日 ⌄ 星期三 · 11 條 …… 只看未讀」，貼頂、底色 daybar。
struct DayHeader<Aside: View>: View {
    @Environment(\.palette) private var palette
    let day: String
    let count: Int?
    var collapsed: Bool = false
    var onToggle: (() -> Void)? = nil
    @ViewBuilder var aside: () -> Aside

    var body: some View {
        let today = DateText.todayKey
        HStack(spacing: 8) {
            Button {
                onToggle?()
            } label: {
                HStack(spacing: 8) {
                    Text(day == today ? "今天" : DateText.monthDay(day, today: today))
                        .font(AppFont.ui(17, .bold)).foregroundStyle(palette.text)
                    if onToggle != nil {
                        Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(palette.text4)
                            .rotationEffect(.degrees(collapsed ? -90 : 0))
                    }
                    HStack(spacing: 0) {
                        if day == today { Text(DateText.monthDay(day, today: today) + " ") }
                        Text(DateText.weekdayShort(day))
                        if let count { Text(" · \(count) 條") }
                    }
                    .font(AppFont.ui(12.5)).foregroundStyle(palette.text4)
                }
            }
            .buttonStyle(.plain)
            .disabled(onToggle == nil)
            Spacer(minLength: 0)
            aside()
        }
        .padding(.horizontal, 16)
        .frame(height: 44)
        .background(palette.daybar)
    }
}

/// 一格時間軸：左側時間、中間軸線與節點、右側內容。軸線貫穿整格，讓一天讀成一條線。
struct TimelineSlot<Content: View>: View {
    @Environment(\.palette) private var palette
    let at: String
    var isFirst = false
    var isLast = false
    @ViewBuilder var content: () -> Content

    private let dotY: CGFloat = 25

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Text(DateText.time(at))
                .font(AppFont.mono(12.5))
                .foregroundStyle(palette.text3)
                .frame(width: 46, alignment: .leading)
                .padding(.top, dotY - 8)
            ZStack(alignment: .top) {
                // 軸線：第一格從節點開始，最後一格到節點為止，中間貫穿整格（含下方間距）。
                GeometryReader { geo in
                    let top: CGFloat = isFirst ? dotY : 0
                    let bottom: CGFloat = isLast ? dotY : geo.size.height + 12
                    Rectangle()
                        .fill(palette.lineStrong)
                        .frame(width: 1, height: max(0, bottom - top))
                        .offset(y: top)
                        .frame(maxWidth: .infinity)
                }
                Circle()
                    .fill(palette.background)
                    .frame(width: 15, height: 15)
                    .overlay(Circle().fill(palette.accent).frame(width: 7, height: 7))
                    .padding(.top, dotY - 7.5)
            }
            .frame(width: 18)
            content()
                .padding(.leading, 8)
        }
        .padding(.bottom, 12)
    }
}

// MARK: 列表卡片（網頁版 FeedItem）

struct FeedCard: View {
    @Environment(\.palette) private var palette
    @Environment(ReadStore.self) private var readStore
    @Environment(FavoritesStore.self) private var favorites
    let item: FeedItem
    var group: GroupInfo? = nil
    /// 精選頁：顯示精選徽章與推薦理由；全部頁：顯示分類與標籤。
    var showReason = false
    var showTags = false
    var forceUnread = false

    var body: some View {
        let read = readStore.ids.contains(item.id) && !forceUnread
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(item.source.name).font(AppFont.ui(12.5)).foregroundStyle(palette.text4).lineLimit(1)
                if item.selected && showReason {
                    if let same = item.sameEvent, !same.id.isEmpty { Badge(text: "同事件") } else { Badge(text: "精選", tone: .selected, dot: true) }
                }
                Spacer(minLength: 6)
                ScoreLabel(score: item.score, compact: true)
                Button {
                    favorites.toggle(item: item)
                } label: {
                    Image(systemName: favorites.contains(item.id) ? "bookmark.fill" : "bookmark")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(favorites.contains(item.id) ? palette.accent : palette.text4)
                        .frame(width: 30, height: 30)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.trailing, -8).padding(.vertical, -6)
            }
            .frame(minHeight: 20)

            Text(item.title)
                .font(AppFont.ui(17, .semibold))
                .lineSpacing(4)
                .foregroundStyle(read ? palette.text4 : palette.text)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)

            if let summary = item.summary, !summary.isEmpty {
                Text(summary)
                    .font(AppFont.ui(14.5))
                    .lineSpacing(5)
                    .foregroundStyle(palette.text3)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
            }

            if showTags, (item.category != nil || !item.tags.isEmpty) {
                HStack(spacing: 10) {
                    if let c = Category.label(for: item.category) { Text(c) }
                    ForEach(item.tags.prefix(3), id: \.self) { Text("#\($0)") }
                }
                .font(AppFont.ui(12)).foregroundStyle(palette.text4)
                .lineLimit(1)
                .padding(.top, 8)
            }

            if let same = item.sameEvent {
                Text("同一件事，精選收錄的是《\(same.title)》")
                    .font(AppFont.ui(12.5)).foregroundStyle(palette.text4).lineLimit(1).padding(.top, 8)
            }

            if let group, group.additionalSourceCount > 0 || group.reportCount > 1 {
                Text("另外 \(max(group.additionalSourceCount, group.reportCount - 1)) 家也報道了")
                    .font(AppFont.ui(12.5, .medium)).foregroundStyle(palette.accent).padding(.top, 8)
            }

            if showReason, let reason = item.reason, !reason.isEmpty {
                Divider().overlay(palette.lineSoft).padding(.top, 10)
                Text("推薦理由：\(reason)")
                    .font(AppFont.ui(13))
                    .lineSpacing(4)
                    .foregroundStyle(palette.note)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
            }
        }
        .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 14)
        .background(palette.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(palette.line, lineWidth: 1))
        .shadow(color: .black.opacity(0.025), radius: 1, y: 1)
    }
}

// MARK: 狀態與其他

struct ErrorStateView: View {
    @Environment(\.palette) private var palette
    let error: Error
    let retry: () async -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark").font(.largeTitle).foregroundStyle(palette.text4)
            Text(error.localizedDescription).multilineTextAlignment(.center).foregroundStyle(palette.text3)
            Button("重試") { Task { await retry() } }.buttonStyle(.borderedProminent)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

struct EmptyStateView: View {
    @Environment(\.palette) private var palette
    let icon: String
    let title: String
    var detail: String? = nil

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon).font(.largeTitle).foregroundStyle(palette.text4)
            Text(title).font(.headline).foregroundStyle(palette.text)
            if let detail { Text(detail).font(.subheadline).foregroundStyle(palette.text3).multilineTextAlignment(.center) }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

enum LoadState<T> {
    case idle, loading, loaded(T), failed(Error)
    var value: T? { if case let .loaded(v) = self { v } else { nil } }
    var isLoading: Bool { if case .loading = self { true } else { false } }
}

struct ThemedBackground: ViewModifier {
    @Environment(\.palette) private var palette
    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(palette.background.ignoresSafeArea())
            .toolbarBackground(palette.background, for: .navigationBar)
    }
}

extension View {
    func themedBackground() -> some View { modifier(ThemedBackground()) }

    func openExternal(_ url: URL) {
        guard ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return }
        UIApplication.shared.open(url)
    }
}

struct ShareButton: View {
    let url: URL
    var body: some View { ShareLink(item: url) { Image(systemName: "square.and.arrow.up") } }
}

/// 自動換行佈局（標籤雲、快訊）。
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


// MARK: 分頁頂欄

/// 分頁根頁面的單行頂欄（網頁手機版 PhoneBar）。系統導覽列在這些頁面隱藏：
/// iOS 26 起根頁面的導覽列即使設成 inline，仍會在分類列上方保留大標題區，造成不必要的留白。
struct RootHeader<Trailing: View>: View {
    @Environment(\.palette) private var palette
    let title: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 10) {
            Text(title).font(AppFont.ui(20, .bold)).foregroundStyle(palette.text)
            Spacer(minLength: 0)
            trailing()
        }
        .padding(.horizontal, 16)
        .frame(height: 44)
        .frame(maxWidth: .infinity)
        .background(palette.background)
    }
}

extension RootHeader where Trailing == EmptyView {
    init(title: String) { self.init(title: title) { EmptyView() } }
}

/// 分頁根頁面：隱藏系統導覽列、頂部放單行頂欄。推進去的子頁面仍有系統返回列。
struct RootChrome: ViewModifier {
    let title: String
    func body(content: Content) -> some View {
        content
            .navigationTitle(title)
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) { RootHeader(title: title) }
    }
}

extension View {
    func rootChrome(_ title: String) -> some View { modifier(RootChrome(title: title)) }
}

/// 搜尋框藥丸（全部動態）。
struct SearchField: View {
    @Environment(\.palette) private var palette
    @Binding var text: String
    var prompt = "搜尋標題、摘要…"
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 14, weight: .medium)).foregroundStyle(palette.text4)
            TextField(prompt, text: $text)
                .font(AppFont.ui(15))
                .foregroundStyle(palette.text)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .focused($focused)
            if !text.isEmpty {
                Button { text = ""; focused = false } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(palette.text4)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).frame(height: 38)
        .background(palette.sunk, in: Capsule())
        .overlay(Capsule().strokeBorder(palette.lineSoft, lineWidth: 1))
    }
}
