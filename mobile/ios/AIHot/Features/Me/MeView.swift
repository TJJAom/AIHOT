import SwiftUI

struct MeView: View {
    @Environment(\.palette) private var palette
    @Environment(FavoritesStore.self) private var favorites
    @Environment(ThemeStore.self) private var themeStore
    @Environment(PushManager.self) private var push

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
