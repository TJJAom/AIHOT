import SwiftUI

/// 精選與全部共用的「一個篩選」：無、一手（channel=firstParty）或一個分類（網頁版 Filters.tsx）。
enum FeedFilter: Hashable {
    case all
    case firstParty
    case category(String)

    var channel: String { self == .firstParty ? "firstParty" : "all" }
    var category: String? { if case let .category(c) = self { c } else { nil } }

    static let items: [(key: FeedFilter, label: String)] =
        [(.all, "全部"), (.firstParty, "一手")] + Category.allCases.map { (.category($0.rawValue), $0.label) }
}

/// 橫向捲動的分類藥丸列（網頁版 CategoryTabs）。
struct CategoryTabs: View {
    @Environment(\.palette) private var palette
    @Binding var selected: FeedFilter

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            PillTabs(items: FeedFilter.items, selected: $selected, size: 36)
                .padding(.horizontal, 16)
        }
    }
}

@Observable
final class TimelineViewModel {
    var cards: [TimelineCard] = []
    var hot: [HotStripEntry] = []
    var dayCounts: [String: Int] = [:]
    var nextCursor: String?
    var collapsed: Set<String> = []
    var batches = 0
    var state: LoadState<Void> = .idle
    var isLoadingMore = false
    var loadError = false
    var filter: FeedFilter = .all

    static let autoBatches = 3
    private let api = APIClient.shared
    private var generation = 0

    @MainActor
    func reload() async {
        generation += 1
        let issued = generation
        state = .loading
        loadError = false
        do {
            let page = try await api.timeline(channel: filter.channel, category: filter.category)
            guard issued == generation else { return }
            cards = page.cards; hot = page.hot ?? []; dayCounts = page.dayCounts; nextCursor = page.nextCursor
            batches = 1; collapsed = []
            state = .loaded(())
        } catch {
            guard issued == generation else { return }
            if cards.isEmpty { state = .failed(error) } else { state = .loaded(()) }
        }
    }

    @MainActor
    func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true; loadError = false
        let issued = generation
        defer { isLoadingMore = false }
        do {
            let page = try await api.timeline(channel: filter.channel, category: filter.category, cursor: cursor)
            guard issued == generation else { return }
            let known = Set(cards.map(\.key))
            cards.append(contentsOf: page.cards.filter { !known.contains($0.key) })
            dayCounts.merge(page.dayCounts) { _, new in new }
            nextCursor = page.nextCursor
            batches += 1
        } catch {
            if issued == generation { loadError = true }
        }
    }

    func toggle(day: String) {
        if collapsed.contains(day) { collapsed.remove(day) } else { collapsed.insert(day) }
    }
}

struct TimelineView: View {
    @Environment(\.palette) private var palette
    @Environment(ReadStore.self) private var readStore
    @State private var model = TimelineViewModel()

    private var unreadOnly: Bool { readStore.unreadOnly }

    /// 只看未讀：卡片本身未讀，或同事件分組裡仍有未讀成員。
    private func unreadVisible(_ card: TimelineCard) -> Bool {
        !readStore.ids.contains(card.item.id) || (card.group?.memberIds?.contains { !readStore.ids.contains($0) } ?? false)
    }

    private var days: [DayGroup<TimelineCard>] {
        byDay(unreadOnly ? model.cards.filter(unreadVisible) : model.cards) { $0.anchorAt }
    }

    var body: some View {
        let days = days
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                CategoryTabs(selected: $model.filter)
                    .padding(.top, 4).padding(.bottom, 12)
                    .onChange(of: model.filter) { _, _ in Task { await model.reload() } }

                if !model.hot.isEmpty {
                    HotTopicsPanel(entries: model.hot).padding(.horizontal, 16).padding(.bottom, 16)
                }

                if case let .failed(error) = model.state {
                    ErrorStateView(error: error) { await model.reload() }
                } else if model.cards.isEmpty, model.state.value == nil {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 48)
                } else if days.isEmpty {
                    HStack { Spacer(); unreadToggle }.padding(.horizontal, 16).padding(.bottom, 12)
                    if unreadOnly {
                        EmptyStateView(icon: "checkmark.circle", title: model.nextCursor != nil ? "這批精選都讀過了" : "沒有未讀的精選內容",
                                       detail: model.nextCursor != nil ? "點下方按鈕，繼續找更早的未讀精選。" : "關掉「只看未讀」可以看到全部內容。")
                    } else {
                        EmptyStateView(icon: "tray", title: "這個篩選下還沒有精選內容", detail: "換個類別看看，或者去全部動態裡找找。")
                    }
                } else {
                    ForEach(Array(days.enumerated()), id: \.element.day) { dayIndex, group in
                        let collapsed = model.collapsed.contains(group.day)
                        let count = unreadOnly ? group.entries.count : (model.dayCounts[group.day] ?? group.entries.count)
                        Section {
                            if !collapsed {
                                ForEach(Array(group.entries.enumerated()), id: \.element.key) { i, card in
                                    TimelineSlot(at: card.anchorAt, isFirst: i == 0, isLast: i == group.entries.count - 1) {
                                        NavigationLink(value: Route.item(id: card.item.id)) {
                                            FeedCard(item: card.item, group: card.group, showReason: true, forceUnread: unreadOnly && unreadVisible(card))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                    .padding(.horizontal, 16)
                                    .onAppear {
                                        if card.key == model.cards.last?.key, model.batches < TimelineViewModel.autoBatches { Task { await model.loadMore() } }
                                    }
                                }
                                Color.clear.frame(height: 8)
                            }
                        } header: {
                            DayHeader(day: group.day, count: count, collapsed: collapsed, onToggle: { withAnimation(.easeInOut(duration: 0.2)) { model.toggle(day: group.day) } }) {
                                if dayIndex == 0 { unreadToggle }
                            }
                            .padding(.bottom, collapsed ? 0 : 12)
                        }
                    }
                }

                FeedEnd(loading: model.isLoadingMore, error: model.loadError, hasMore: model.nextCursor != nil,
                        manual: model.batches >= TimelineViewModel.autoBatches, empty: days.isEmpty) { await model.loadMore() }
            }
            .padding(.bottom, 24)
        }
        .themedBackground()
        .rootChrome("精選")
        .refreshable { await model.reload() }
        .task { if model.cards.isEmpty { await model.reload() } }
        .onChange(of: unreadOnly) { _, on in
            // 開啟篩選後整頁都讀過：自動再翻幾頁，直到有東西可看。
            if on, days.isEmpty, model.nextCursor != nil, model.batches < TimelineViewModel.autoBatches { Task { await model.loadMore() } }
        }
    }

    private var unreadToggle: some View {
        ToggleChip(title: "只看未讀", on: Binding(get: { readStore.unreadOnly }, set: { readStore.unreadOnly = $0 }))
    }
}

/// 列表底部：載入中、重試、「載入更多」（自動翻幾頁後改為手動）或「已經到底了」。
struct FeedEnd: View {
    @Environment(\.palette) private var palette
    let loading: Bool
    let error: Bool
    let hasMore: Bool
    let manual: Bool
    let empty: Bool
    let onMore: () async -> Void

    var body: some View {
        HStack {
            Spacer()
            if loading {
                HStack(spacing: 8) { ProgressView().controlSize(.small); Text("正在載入") }
                    .font(AppFont.ui(12.5)).foregroundStyle(palette.text4)
            } else if error {
                Button { Task { await onMore() } } label: {
                    Text("載入失敗，點此重試").font(AppFont.ui(13)).foregroundStyle(palette.hot)
                        .padding(.horizontal, 16).frame(height: 36)
                        .overlay(Capsule().strokeBorder(palette.hot.opacity(0.3), lineWidth: 1))
                }.buttonStyle(.plain)
            } else if hasMore {
                if manual {
                    Button { Task { await onMore() } } label: {
                        Text("載入更多").font(AppFont.ui(13, .medium)).foregroundStyle(palette.text2)
                            .padding(.horizontal, 20).frame(height: 36)
                            .background(palette.surface, in: Capsule())
                            .overlay(Capsule().strokeBorder(palette.lineStrong, lineWidth: 1))
                    }.buttonStyle(.plain)
                }
            } else if !empty {
                Text("已經到底了").font(AppFont.ui(12)).foregroundStyle(palette.text4)
            }
            Spacer()
        }
        .padding(.vertical, 24)
    }
}

/// 首頁頂端的熱點榜：紅點、彩色名次、標題、臉譜與熱度（網頁版 HotTopics）。
struct HotTopicsPanel: View {
    @Environment(\.palette) private var palette
    let entries: [HotStripEntry]
    @State private var pulse = false

    private func rankColor(_ i: Int) -> Color {
        switch i {
        case 0: Color(hex: 0xB3402A)
        case 1: Color(hex: 0xA3642F)
        case 2: Color(hex: 0x96702E)
        default: Color(hex: 0x6B7684)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                HStack(spacing: 8) {
                    ZStack {
                        Circle().fill(palette.hot.opacity(0.35)).frame(width: 8, height: 8).scaleEffect(pulse ? 2.2 : 1).opacity(pulse ? 0 : 0.6)
                        Circle().fill(palette.hot).frame(width: 8, height: 8)
                    }
                    Text("當前熱點").font(AppFont.ui(14, .semibold)).foregroundStyle(palette.text)
                }
                Spacer()
                NavigationLink(value: Route.hot) {
                    HStack(spacing: 3) { Text("完整榜單"); Image(systemName: "arrow.right").font(.system(size: 11, weight: .semibold)) }
                        .font(AppFont.ui(12.5)).foregroundStyle(palette.text3)
                }
            }
            .padding(.bottom, 6)
            ForEach(Array(entries.prefix(4).enumerated()), id: \.element.id) { i, e in
                Group {
                    if let s = e.storyPublicId { NavigationLink(value: Route.story(publicId: s)) { row(i, e) } }
                    else if let id = e.itemId { NavigationLink(value: Route.item(id: id)) { row(i, e) } }
                    else { row(i, e) }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 8)
        .background {
            ZStack {
                palette.surface
                RadialGradient(colors: [palette.hotSoft, .clear], center: .topTrailing, startRadius: 0, endRadius: 320)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(palette.line, lineWidth: 1))
        .onAppear { withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) { pulse = true } }
    }

    private func row(_ i: Int, _ e: HotStripEntry) -> some View {
        HStack(spacing: 12) {
            Text("\(e.rank)")
                .font(.system(size: 15, weight: .black)).monospacedDigit()
                .foregroundStyle(rankColor(i))
                .frame(width: 20)
            Text(e.title).font(AppFont.ui(14.5, .semibold)).foregroundStyle(palette.text).lineLimit(1)
            Spacer(minLength: 8)
            Faces(participants: e.participants, total: e.participantCount)
            HStack(spacing: 3) {
                Text("\(Int(e.heat.rounded()))").font(AppFont.ui(13.5, .semibold)).monospacedDigit().foregroundStyle(palette.text2)
                Text("熱度").font(AppFont.ui(12.5)).foregroundStyle(palette.text4)
            }
            .frame(width: 56, alignment: .trailing)
            trend(e.trend).frame(width: 14)
        }
        .frame(minHeight: 36)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func trend(_ t: String) -> some View {
        switch t {
        case "up": Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .bold)).foregroundStyle(palette.hot)
        case "down": Image(systemName: "arrow.down.right").font(.system(size: 11, weight: .bold)).foregroundStyle(palette.text4)
        case "new": Text("新").font(AppFont.ui(10.5, .semibold)).foregroundStyle(palette.accent).padding(.horizontal, 5).background(palette.accentSoft, in: Capsule())
        case "flat": Image(systemName: "minus").font(.system(size: 11, weight: .bold)).foregroundStyle(palette.text4)
        default: EmptyView()
        }
    }
}

/// 疊放的來源臉譜。
struct Faces: View {
    @Environment(\.palette) private var palette
    let participants: [HotParticipant]
    let total: Int

    var body: some View {
        HStack(spacing: -6) {
            ForEach(Array(participants.prefix(3).enumerated()), id: \.offset) { _, p in
                SourceAvatar(name: p.name, iconUrl: p.iconUrl, size: 20)
                    .overlay(Circle().strokeBorder(palette.surface, lineWidth: 1.5))
            }
            if total > 3 {
                Text("+\(total - 3)").font(AppFont.ui(10, .semibold)).foregroundStyle(palette.text4)
                    .frame(width: 20, height: 20).background(palette.sunk, in: Circle())
                    .overlay(Circle().strokeBorder(palette.surface, lineWidth: 1.5))
            }
        }
    }
}
