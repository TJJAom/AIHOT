import SwiftUI

struct MeView: View {
    @Environment(\.palette) private var palette
    @Environment(FavoritesStore.self) private var favorites
    @Environment(ThemeStore.self) private var themeStore
    @Environment(PushManager.self) private var push
    @State private var appIcon = AppIconChoice.current

    var body: some View {
        List {
            Section("收藏") {
                if favorites.entries.isEmpty {
                    Text("在文章頁按書籤即可收藏；目前只存在這台裝置。")
                        .font(.subheadline).foregroundStyle(palette.secondaryText)
                        .listRowBackground(palette.surface)
                } else {
                    ForEach(favorites.entries) { entry in
                        NavigationLink(value: Route.item(id: entry.id)) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(entry.title).foregroundStyle(palette.text)
                                Text(entry.sourceName).font(.caption).foregroundStyle(palette.secondaryText)
                            }
                        }
                        .listRowBackground(palette.surface)
                    }
                    .onDelete { offsets in
                        let ids = offsets.map { favorites.entries[$0].id }
                        ids.forEach { favorites.remove(id: $0) }
                    }
                }
            }

            Section("外觀") {
                NavigationLink(value: Route.themes) {
                    HStack {
                        Label("主題", systemImage: "paintpalette")
                        Spacer()
                        HStack(spacing: 3) {
                            ForEach(Array(themeStore.theme.swatch.enumerated()), id: \.offset) { _, c in
                                Circle().fill(c).frame(width: 12, height: 12).overlay(Circle().strokeBorder(palette.divider, lineWidth: 0.5))
                            }
                        }
                        Text(themeStore.theme.name).foregroundStyle(palette.secondaryText)
                    }
                }
                .listRowBackground(palette.surface)
                NavigationLink(value: Route.appIcon) {
                    HStack {
                        Label("App 圖示", systemImage: "app.badge")
                        Spacer()
                        Image(appIcon.previewName).resizable().frame(width: 24, height: 24)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        Text(appIcon.title).foregroundStyle(palette.secondaryText)
                    }
                }
                .listRowBackground(palette.surface)
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Label("內文字級", systemImage: "textformat.size")
                        Spacer()
                        Text("\(Int(themeStore.fontScale * 100))%").foregroundStyle(palette.secondaryText).monospacedDigit()
                    }
                    Slider(value: Binding(get: { themeStore.fontScale }, set: { themeStore.fontScale = $0 }), in: 0.85...1.5, step: 0.05)
                }
                .listRowBackground(palette.surface)
            }

            Section("通知") {
                NavigationLink(value: Route.notifications) {
                    HStack {
                        Label("新文章通知", systemImage: "bell")
                        Spacer()
                        Text(pushStatusText).foregroundStyle(palette.secondaryText)
                    }
                }
                .listRowBackground(palette.surface)
            }

            Section("關於") {
                Link(destination: AppConfig.apiBaseURL) { Label("日耕 AI 熱點 網站", systemImage: "globe") }
                Link(destination: AppConfig.apiBaseURL.appendingPathComponent("privacy")) { Label("隱私權說明", systemImage: "hand.raised") }
                Link(destination: AppConfig.apiBaseURL.appendingPathComponent("terms")) { Label("使用規則", systemImage: "doc.text") }
                HStack {
                    Text("版本")
                    Spacer()
                    Text(AppConfig.userAgent.replacingOccurrences(of: "AIHot-iOS/", with: "")).foregroundStyle(palette.secondaryText)
                }
            }
            .listRowBackground(palette.surface)
        }
        .themedBackground()
        .navigationTitle("我的")
        .onAppear { appIcon = AppIconChoice.current }
    }

    private var pushStatusText: String {
        if !push.enabled { return "已關閉" }
        switch push.status {
        case .registered: return "已開啟"
        case .authorized: return "登錄中"
        case .denied: return "系統未允許"
        case .notConfigured: return "尚未設定"
        case .failed: return "失敗"
        case .unknown: return "未設定"
        }
    }
}

struct ThemePickerView: View {
    @Environment(\.palette) private var palette
    @Environment(ThemeStore.self) private var themeStore

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(AppTheme.all) { theme in
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) { themeStore.themeID = theme.id }
                    } label: {
                        ThemePreviewCard(theme: theme, selected: theme.id == themeStore.themeID)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
        .themedBackground()
        .navigationTitle("主題（\(AppTheme.all.count) 種）")
    }
}

/// 以該主題自己的色票畫一張迷你頁面預覽，不受目前主題影響。
struct ThemePreviewCard: View {
    @Environment(\.palette) private var current
    let theme: AppTheme
    let selected: Bool

    var body: some View {
        let p = theme.appearance == .dark ? theme.dark : theme.light
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 10, style: .continuous).fill(p.background)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 4) {
                        Capsule().fill(p.accent).frame(width: 28, height: 8)
                        Capsule().fill(p.surfaceAlt).frame(width: 20, height: 8)
                    }
                    RoundedRectangle(cornerRadius: 6).fill(p.surface).frame(height: 34)
                        .overlay(alignment: .leading) {
                            VStack(alignment: .leading, spacing: 4) {
                                Capsule().fill(p.text).frame(width: 70, height: 6)
                                Capsule().fill(p.secondaryText).frame(width: 50, height: 4)
                            }.padding(8)
                        }
                    RoundedRectangle(cornerRadius: 6).fill(p.surface).frame(height: 22)
                }
                .padding(10)
            }
            .frame(height: 110)
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(selected ? current.accent : current.divider, lineWidth: selected ? 2 : 0.5))
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(theme.name).font(.subheadline.weight(.semibold)).foregroundStyle(current.text)
                    Text(theme.blurb).font(.caption2).foregroundStyle(current.secondaryText).lineLimit(2)
                }
                Spacer()
                if selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(current.accent) }
            }
        }
        .padding(10)
        .background(current.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// 一款 App 圖示。D03 靜日是預設（主圖示），其他是備用圖示 AppIcon-Dnn。
struct AppIconChoice: Identifiable, Hashable {
    let id: String
    let title: String
    static let defaultID = "D03"
    /// setAlternateIconName 用的名字；預設圖示是 nil。
    var alternateName: String? { id == Self.defaultID ? nil : "AppIcon-\(id)" }
    var previewName: String { "IconPreview-\(id)" }

    static var current: AppIconChoice {
        let name = UIApplication.shared.alternateIconName
        return all.first { $0.alternateName == name } ?? all[2]
    }

    static let all: [AppIconChoice] = [
        ("D01", "日光畝田"), ("D02", "晨光一頁"), ("D03", "靜日"), ("D04", "耘光"), ("D05", "耕讀"),
        ("D06", "光的收成"), ("D07", "曉頁"), ("D08", "田序"), ("D09", "閱弧"), ("D10", "日輯"),
        ("D11", "知畦"), ("D12", "日緣"), ("D13", "耕卷"), ("D14", "初曦訊"), ("D15", "日初字腔"),
        ("D16", "書頁合字"), ("D17", "耕讀襯線"), ("D18", "摺頁日常"), ("D19", "洞見合字"), ("D20", "畝格字標"),
        ("D21", "日印"), ("D22", "日構"), ("D23", "晨光篇序"), ("D24", "田野濾光"), ("D25", "地平索引"),
        ("D26", "耕域透鏡"), ("D27", "晨選之皿"), ("D28", "日光編田"), ("D29", "洞見天際"), ("D30", "每日萃光")
    ].map { AppIconChoice(id: $0.0, title: $0.1) }
}

/// 我的 → App 圖示：點一下換主畫面上的圖示。
struct AppIconPickerView: View {
    @Environment(\.palette) private var palette
    @State private var current = UIApplication.shared.alternateIconName
    @State private var error: String?

    private let columns = [GridItem(.adaptive(minimum: 88), spacing: 12)]

    var body: some View {
        ScrollView {
            if let error { Text(error).font(.caption).foregroundStyle(.red).padding(.horizontal, 16) }
            LazyVGrid(columns: columns, spacing: 18) {
                ForEach(AppIconChoice.all) { icon in
                    let selected = current == icon.alternateName
                    Button { Task { await choose(icon) } } label: {
                        VStack(spacing: 6) {
                            Image(icon.previewName).resizable().scaledToFit().frame(width: 68, height: 68)
                                .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous)
                                    .strokeBorder(selected ? palette.accent : palette.divider, lineWidth: selected ? 3 : 0.5))
                            Text(icon.title).font(.caption).foregroundStyle(palette.text).lineLimit(1).minimumScaleFactor(0.7)
                            Text(icon.id == AppIconChoice.defaultID ? "預設" : icon.id).font(.caption2).foregroundStyle(palette.secondaryText)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("圖示 \(icon.title)\(selected ? "，使用中" : "")")
                }
            }
            .padding(16)
        }
        .themedBackground()
        .navigationTitle("App 圖示（\(AppIconChoice.all.count) 款）")
    }

    @MainActor
    private func choose(_ icon: AppIconChoice) async {
        guard UIApplication.shared.supportsAlternateIcons, current != icon.alternateName else { return }
        do {
            try await UIApplication.shared.setAlternateIconName(icon.alternateName)
            current = icon.alternateName
            error = nil
        } catch {
            self.error = "換圖示失敗：\(error.localizedDescription)"
        }
    }
}

struct NotificationSettingsView: View {
    @Environment(\.palette) private var palette
    @Environment(PushManager.self) private var push

    var body: some View {
        @Bindable var push = push
        List {
            Section {
                Toggle("新文章通知", isOn: $push.enabled)
                statusRow
            } footer: {
                Text("由 Cloudflare 每 5 分鐘檢查網站是否有新文章，有新內容才會推播；不會推送廣告。")
            }
            .listRowBackground(palette.surface)

            if push.enabled {
                Section("通知範圍") {
                    Picker("範圍", selection: $push.mode) {
                        Text("只推精選").tag("selected")
                        Text("全部動態").tag("all")
                    }
                    .pickerStyle(.segmented)
                    ForEach(Category.allCases) { cat in
                        Toggle(cat.label, isOn: Binding(
                            get: { push.categories.isEmpty || push.categories.contains(cat.rawValue) },
                            set: { on in
                                var set = push.categories.isEmpty ? Set(Category.allCases.map(\.rawValue)) : push.categories
                                if on { set.insert(cat.rawValue) } else { set.remove(cat.rawValue) }
                                push.categories = set.count == Category.allCases.count ? [] : set
                            }))
                    }
                }
                .listRowBackground(palette.surface)
            }
        }
        .themedBackground()
        .navigationTitle("通知")
        .task { await push.refreshAuthorizationStatus() }
    }

    @ViewBuilder
    private var statusRow: some View {
        switch push.status {
        case .denied:
            Button("到「設定」允許通知") {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }
        case .unknown:
            Button("允許通知") { Task { await push.requestAuthorization() } }
        case .notConfigured:
            Text("推播伺服器尚未設定（AIHotPushRegistrationURL 為空）。").font(.caption).foregroundStyle(palette.secondaryText)
        case .authorized:
            Text("已授權，正在登錄裝置…").font(.caption).foregroundStyle(palette.secondaryText)
        case .registered:
            Label("裝置已登錄", systemImage: "checkmark.circle").font(.caption).foregroundStyle(palette.accent)
        case let .failed(msg):
            VStack(alignment: .leading, spacing: 4) {
                Text("登錄失敗：\(msg)").font(.caption).foregroundStyle(.red)
                Button("重試") { Task { await push.syncRegistration() } }
            }
        }
    }
}
