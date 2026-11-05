import SwiftUI

/// 完整熱點榜（/api/site/hot）：過去 48 小時大家在討論什麼。
struct HotRankingView: View {
    @Environment(\.palette) private var palette
    @State private var state: LoadState<HotResponse> = .idle

    private func rankColor(_ i: Int) -> Color {
        switch i {
        case 0: Color(hex: 0xB3402A)
        case 1: Color(hex: 0xA3642F)
        case 2: Color(hex: 0x96702E)
        default: Color(hex: 0x6B7684)
        }
    }

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error): ErrorStateView(error: error) { await load() }
            case let .loaded(res):
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("過去 \(res.windowHours) 小時，大家在討論什麼").font(AppFont.ui(13)).foregroundStyle(palette.text4)
                            Spacer()
                            if let at = res.computedAt { Text("更新於 \(DateText.time(at))").font(AppFont.ui(12)).monospacedDigit().foregroundStyle(palette.text4) }
                        }
                        .padding(.horizontal, 16).padding(.top, 4)
                        ForEach(Array(res.entries.enumerated()), id: \.element.id) { i, e in
                            NavigationLink(value: Route.story(publicId: e.story.publicId)) {
                                HotRankingRow(index: i, entry: e)
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 16)
                        }
                    }
                    .padding(.bottom, 24)
                }
            }
        }
        .themedBackground()
        .navigationTitle("熱點榜")
        .pullToRefresh { await load(force: true) }
        .task { await load() }
    }

    private func load(force: Bool = false) async {
        guard force || state.value == nil else { return }
        if state.value == nil { state = .loading }
        do { state = .loaded(try await APIClient.shared.hot()) }
        catch { if state.value == nil { state = .failed(error) } }
    }
}

/// 熱點榜一列（拆成獨立視圖，避免編譯器型別推斷過久）。
private struct HotRankingRow: View {
    @Environment(\.palette) private var palette
    let index: Int
    let entry: HotEntry

    private var rankColor: Color {
        switch index {
        case 0: Color(hex: 0xB3402A)
        case 1: Color(hex: 0xA3642F)
        case 2: Color(hex: 0x96702E)
        default: Color(hex: 0x6B7684)
        }
    }

    private var excerpt: String? {
        let s = entry.summary ?? entry.latest
        guard let s, !s.isEmpty else { return nil }
        return s
    }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Text("\(entry.rank)")
                .font(.system(size: 24, weight: .black)).monospacedDigit()
                .foregroundStyle(rankColor)
                .frame(width: 28, alignment: .leading)
            VStack(alignment: .leading, spacing: 8) {
                Text(entry.story.title)
                    .font(AppFont.ui(16, .semibold)).lineSpacing(3)
                    .foregroundStyle(palette.text)
                    .fixedSize(horizontal: false, vertical: true)
                if let excerpt {
                    Text(excerpt)
                        .font(AppFont.ui(13.5)).lineSpacing(4)
                        .foregroundStyle(palette.text3).lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                meta
            }
        }
        .padding(16)
        .background(palette.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(palette.line, lineWidth: 1))
    }

    private var meta: some View {
        HStack(spacing: 10) {
            Faces(participants: entry.participants ?? [], total: entry.participantCount)
            Text("\(entry.sourceCount) 個來源").font(AppFont.ui(12)).foregroundStyle(palette.text4)
            Spacer()
            HStack(spacing: 3) {
                Text("\(Int(entry.heat.rounded()))").font(AppFont.ui(13.5, .semibold)).monospacedDigit().foregroundStyle(palette.text2)
                Text("熱度").font(AppFont.ui(12)).foregroundStyle(palette.text4)
            }
            ForEach(entry.badges, id: \.self) { b in
                Badge(text: badgeLabel(b), tone: b == "surge" ? .hot : .accent)
            }
        }
    }

    private func badgeLabel(_ b: String) -> String {
        switch b {
        case "surge": "飆升"
        case "new": "新"
        default: "上升"
        }
    }
}
