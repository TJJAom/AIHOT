import SwiftUI

// MARK: 日期

enum DateText {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoNoFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static let display: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_Hant_TW")
        f.timeZone = TimeZone(identifier: "Asia/Taipei")
        f.dateFormat = "M月d日 HH:mm"
        return f
    }()
    private static let displayFull: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_Hant_TW")
        f.timeZone = TimeZone(identifier: "Asia/Taipei")
        f.dateFormat = "yyyy年M月d日 HH:mm"
        return f
    }()

    static func parse(_ s: String?) -> Date? {
        guard let s else { return nil }
        return iso.date(from: s) ?? isoNoFraction.date(from: s)
    }

    /// 「3 分鐘前」「2 小時前」，超過一天改顯示日期。
    static func relative(_ s: String?) -> String {
        guard let d = parse(s) else { return "" }
        let seconds = Date().timeIntervalSince(d)
        if seconds < 60 { return "剛剛" }
        if seconds < 3600 { return "\(Int(seconds / 60)) 分鐘前" }
        if seconds < 86400 { return "\(Int(seconds / 3600)) 小時前" }
        if seconds < 86400 * 2 { let time = display.string(from: d).split(separator: " ").last.map { String($0) } ?? ""
        return "昨天 " + time }
        return display.string(from: d)
    }

    static func full(_ s: String?) -> String {
        guard let d = parse(s) else { return "" }
        return displayFull.string(from: d)
    }

    /// 日報 key「2026-11-03」→「11月3日」
    static func dailyLabel(_ key: String) -> String {
        let parts = key.split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), let d = Int(parts[2]) else { return key }
        return "\(m)月\(d)日"
    }
}

// MARK: 小元件

struct TagChip: View {
    @Environment(\.palette) private var palette
    let text: String
    var highlighted = false

    var body: some View {
        Text(text)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(highlighted ? palette.accentSoft : palette.surfaceAlt, in: Capsule())
            .foregroundStyle(highlighted ? palette.accent : palette.secondaryText)
    }
}

struct SourceLine: View {
    @Environment(\.palette) private var palette
    let source: String
    let at: String?

    var body: some View {
        HStack(spacing: 6) {
            Text(source)
            if let at, !at.isEmpty {
                Text("·")
                Text(DateText.relative(at))
            }
        }
        .font(.caption)
        .foregroundStyle(palette.secondaryText)
        .lineLimit(1)
    }
}

/// 列表卡片：精選、全部、主題、搜尋共用。
struct FeedCardView: View {
    @Environment(\.palette) private var palette
    @Environment(ReadStore.self) private var readStore
    let item: FeedItem
    var group: GroupInfo? = nil
    var showReason = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if let cat = Category.label(for: item.category) { TagChip(text: cat, highlighted: item.selected) }
                ForEach(item.tags.prefix(2), id: \.self) { TagChip(text: $0) }
                Spacer(minLength: 0)
                if let score = item.score {
                    Text("\(score)")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(palette.secondaryText)
                }
            }
            Text(item.title)
                .font(.headline)
                .foregroundStyle(readStore.ids.contains(item.id) ? palette.secondaryText : palette.text)
                .fixedSize(horizontal: false, vertical: true)
            if let summary = item.summary, !summary.isEmpty {
                Text(summary)
                    .font(.subheadline)
                    .foregroundStyle(palette.secondaryText)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if showReason, let reason = item.reason, !reason.isEmpty {
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: "sparkle").font(.caption).foregroundStyle(palette.accent)
                    Text(reason).font(.caption).foregroundStyle(palette.secondaryText)
                }
            }
            HStack {
                SourceLine(source: item.source.name, at: item.publishedAt ?? item.timelineAt)
                Spacer()
                if let group, group.additionalSourceCount > 0 {
                    Text("另有 \(group.additionalSourceCount) 家報導")
                        .font(.caption)
                        .foregroundStyle(palette.accent)
                }
            }
        }
        .padding(14)
        .background(palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(palette.divider, lineWidth: 0.5))
    }
}

// MARK: 狀態

struct ErrorStateView: View {
    @Environment(\.palette) private var palette
    let error: Error
    let retry: () async -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark").font(.largeTitle).foregroundStyle(palette.secondaryText)
            Text(error.localizedDescription).multilineTextAlignment(.center).foregroundStyle(palette.secondaryText)
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
            Image(systemName: icon).font(.largeTitle).foregroundStyle(palette.secondaryText)
            Text(title).font(.headline).foregroundStyle(palette.text)
            if let detail { Text(detail).font(.subheadline).foregroundStyle(palette.secondaryText).multilineTextAlignment(.center) }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

/// 分頁載入狀態機，列表頁共用。
enum LoadState<T> {
    case idle
    case loading
    case loaded(T)
    case failed(Error)

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

    /// 安全開啟外部連結（SFSafariViewController 由系統瀏覽器取代，避免引入 WebKit 相依）。
    func openExternal(_ url: URL) {
        guard ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return }
        UIApplication.shared.open(url)
    }
}

struct ShareButton: View {
    let url: URL
    var body: some View {
        ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
    }
}
