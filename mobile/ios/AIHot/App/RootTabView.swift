import SwiftUI

/// 所有 NavigationStack 共用的路由。
enum Route: Hashable {
    case item(id: String)
    case story(publicId: String)
    case daily(key: String)
    case dailyArchive
    case topic(slug: String)
    case group(factId: String, title: String)
    case themes
    case appIcon
    case notifications
}

struct AppDestinations: ViewModifier {
    func body(content: Content) -> some View {
        content.navigationDestination(for: Route.self) { route in
            switch route {
            case let .item(id): ItemDetailView(itemID: id)
            case let .story(publicId): StoryDetailView(publicId: publicId)
            case let .daily(key): DailyReportView(key: key)
            case .dailyArchive: DailyArchiveView()
            case let .topic(slug): TopicDetailView(slug: slug)
            case let .group(factId, title): GroupReportsView(factId: factId, title: title)
            case .themes: ThemePickerView()
            case .appIcon: AppIconPickerView()
            case .notifications: NotificationSettingsView()
            }
        }
    }
}

extension View {
    func appDestinations() -> some View { modifier(AppDestinations()) }
}

enum Tab: String, CaseIterable {
    case featured, all, daily, topics, me
}

struct RootTabView: View {
    @Environment(\.palette) private var palette
    @Environment(DeepLinkRouter.self) private var router
    @Environment(PushManager.self) private var push

    @State private var tab: Tab = .featured
    @State private var featuredPath = NavigationPath()
    @State private var allPath = NavigationPath()
    @State private var dailyPath = NavigationPath()
    @State private var topicsPath = NavigationPath()
    @State private var mePath = NavigationPath()
    @State private var askedForPush = UserDefaults.standard.bool(forKey: "push.asked")

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack(path: $featuredPath) { TimelineView().appDestinations() }
                .tabItem { Label("精選", systemImage: "sparkles") }.tag(Tab.featured)
            NavigationStack(path: $allPath) { PoolView().appDestinations() }
                .tabItem { Label("全部", systemImage: "list.bullet.rectangle") }.tag(Tab.all)
            NavigationStack(path: $dailyPath) { DailyHomeView().appDestinations() }
                .tabItem { Label("日報", systemImage: "newspaper") }.tag(Tab.daily)
            NavigationStack(path: $topicsPath) { TopicsView().appDestinations() }
                .tabItem { Label("主題", systemImage: "square.grid.2x2") }.tag(Tab.topics)
            NavigationStack(path: $mePath) { MeView().appDestinations() }
                .tabItem { Label("我的", systemImage: "person.crop.circle") }.tag(Tab.me)
        }
        .toolbarBackground(palette.surface, for: .tabBar)
        .onChange(of: router.pending) { _, link in
            guard let link else { return }
            open(link)
            router.pending = nil
        }
        .onAppear {
            if let link = router.pending { open(link); router.pending = nil }
        }
        .task {
            // 第一次開啟就詢問通知；之後交給設定頁。
            if !askedForPush {
                UserDefaults.standard.set(true, forKey: "push.asked")
                askedForPush = true
                try? await Task.sleep(for: .seconds(1.5))
                await push.requestAuthorization()
            }
        }
    }

    private func open(_ link: DeepLink) {
        switch link {
        case let .item(id):
            tab = .featured; featuredPath.append(Route.item(id: id))
        case let .story(publicId):
            tab = .featured; featuredPath.append(Route.story(publicId: publicId))
        case let .daily(key):
            tab = .daily; dailyPath.append(Route.daily(key: key))
        }
    }
}
