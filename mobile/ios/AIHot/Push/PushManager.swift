import Foundation
import Observation
import UIKit
import UserNotifications

/// 推播：向 iOS 取得授權與 device token，再把 token 登錄到 Cloudflare Worker。
/// Worker 端（mobile/push-worker）輪詢網站精選，發現新文章就經 APNs 推送。
@Observable
final class PushManager {
    enum Status: Equatable {
        case unknown, denied, authorized, notConfigured, registered, failed(String)
    }

    var status: Status = .unknown
    private(set) var deviceToken: String?

    /// 使用者偏好：只推精選 / 推全部動態；留空類別＝全部類別。
    var mode: String {
        didSet { UserDefaults.standard.set(mode, forKey: "push.mode"); Task { await self.syncRegistration() } }
    }
    var categories: Set<String> {
        didSet { UserDefaults.standard.set(Array(categories), forKey: "push.categories"); Task { await self.syncRegistration() } }
    }
    var enabled: Bool {
        didSet { UserDefaults.standard.set(enabled, forKey: "push.enabled"); Task { await self.syncRegistration() } }
    }

    init() {
        mode = UserDefaults.standard.string(forKey: "push.mode") ?? "selected"
        categories = Set(UserDefaults.standard.array(forKey: "push.categories") as? [String] ?? [])
        enabled = UserDefaults.standard.object(forKey: "push.enabled") as? Bool ?? true
        deviceToken = UserDefaults.standard.string(forKey: "push.token")
        if AppConfig.pushRegistrationURL == nil { status = .notConfigured }
    }

    /// 首次開啟或在設定頁按下「開啟通知」時呼叫。
    @MainActor
    func requestAuthorization() async {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            status = granted ? .authorized : .denied
            if granted { UIApplication.shared.registerForRemoteNotifications() }
        } catch {
            status = .failed(error.localizedDescription)
        }
    }

    @MainActor
    func refreshAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            if status == .notConfigured { UIApplication.shared.registerForRemoteNotifications(); return }
            if case .registered = status { return }
            status = .authorized
            UIApplication.shared.registerForRemoteNotifications()
        case .denied: status = .denied
        default: break
        }
    }

    func didRegister(tokenData: Data) {
        let token = tokenData.map { String(format: "%02x", $0) }.joined()
        deviceToken = token
        UserDefaults.standard.set(token, forKey: "push.token")
        Task { await syncRegistration() }
    }

    func didFailToRegister(_ error: Error) {
        status = .failed(error.localizedDescription)
    }

    /// 把 token 與偏好送到 Worker。Worker 未部署（URL 空）時不送。
    func syncRegistration() async {
        guard let url = AppConfig.pushRegistrationURL, let token = deviceToken else {
            if AppConfig.pushRegistrationURL == nil { await MainActor.run { status = .notConfigured } }
            return
        }
        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif
        struct Registration: Encodable {
            var token: String
            var environment: String
            var enabled: Bool
            var mode: String
            var categories: [String]
            var locale: String
            var appVersion: String
        }
        let body = Registration(token: token, environment: environment, enabled: enabled, mode: mode,
                                categories: Array(categories).sorted(), locale: "zh-Hant-TW", appVersion: AppConfig.userAgent)
        var request = URLRequest(url: url.appendingPathComponent("devices"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(body)
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            await MainActor.run { status = (200..<300).contains(code) ? .registered : .failed("登錄失敗（HTTP \(code)）") }
        } catch {
            await MainActor.run { status = .failed(error.localizedDescription) }
        }
    }
}

/// 推播與 URL scheme 的深連結目標。
enum DeepLink: Equatable {
    case item(id: String)
    case story(publicId: String)
    case daily(key: String)

    init?(userInfo: [AnyHashable: Any]) {
        if let id = userInfo["itemId"] as? String { self = .item(id: id); return }
        if let s = userInfo["storyId"] as? String { self = .story(publicId: s); return }
        if let d = userInfo["dailyKey"] as? String { self = .daily(key: d); return }
        return nil
    }

    /// aihot://items/<id>、aihot://story/<publicId>、aihot://daily/<yyyy-mm-dd>；也接受網站 https 連結。
    init?(url: URL) {
        let parts = url.pathComponents.filter { $0 != "/" }
        let head: String?
        let value: String?
        if url.scheme == "aihot" {
            head = url.host; value = parts.first
        } else {
            head = parts.first; value = parts.dropFirst().first
        }
        switch (head, value) {
        case let ("items"?, v?): self = .item(id: v)
        case let ("story"?, v?): self = .story(publicId: v)
        case let ("daily"?, v?): self = .daily(key: v)
        default: return nil
        }
    }
}

@Observable
final class DeepLinkRouter {
    var pending: DeepLink?
}
