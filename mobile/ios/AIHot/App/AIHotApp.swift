import SwiftUI
import UserNotifications

@main
struct AIHotApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    @State private var themeStore = ThemeStore()
    @State private var favorites = FavoritesStore()
    @State private var readStore = ReadStore()

    var body: some Scene {
        WindowGroup {
            ThemedRoot {
                RootTabView()
            }
            .environment(themeStore)
            .environment(favorites)
            .environment(readStore)
            .environment(appDelegate.push)
            .environment(appDelegate.router)
            .onOpenURL { url in
                if let link = DeepLink(url: url) { appDelegate.router.pending = link }
            }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    let push = PushManager()
    let router = DeepLinkRouter()

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Task { await push.refreshAuthorizationStatus() }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        push.didRegister(tokenData: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        push.didFailToRegister(error)
    }

    /// App 在前景時也顯示橫幅。
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    /// 使用者點通知 → 開對應文章。
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        if let link = DeepLink(userInfo: response.notification.request.content.userInfo) {
            await MainActor.run { router.pending = link }
        }
    }
}
