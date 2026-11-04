import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case http(status: Int, retryAfter: TimeInterval?)
    case notFound
    case decoding(Error)
    case transport(Error)
    case offline

    var errorDescription: String? {
        switch self {
        case .invalidURL: "網址不正確"
        case .notFound: "找不到這筆內容，可能已下架"
        case let .http(status, retryAfter):
            if status == 503, let retryAfter { "伺服器暫時忙碌，請於 \(Int(retryAfter)) 秒後再試" }
            else if status == 429 { "請求過於頻繁，請稍後再試" }
            else { "伺服器回應錯誤（HTTP \(status)）" }
        case .decoding: "資料格式與 App 預期不符，請稍後更新 App"
        case .transport: "連線失敗，請檢查網路"
        case .offline: "目前離線"
        }
    }
}

/// 第一方網站 API 的唯一出入口。所有解碼、ETag 快取與錯誤轉換集中於此。
actor APIClient {
    static let shared = APIClient()

    let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder

    /// ETag → (etag, data)。304 時回放本地資料。只放記憶體，App 重啟即清空，避免被撤回內容久留。
    private var etagCache: [URL: (etag: String, data: Data)] = [:]

    init(baseURL: URL = AppConfig.apiBaseURL) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 20
        config.httpAdditionalHeaders = ["Accept": "application/json", "User-Agent": AppConfig.userAgent]
        session = URLSession(configuration: config)
        decoder = JSONDecoder()
    }

    // MARK: 端點

    func timeline(channel: String = "all", category: String? = nil, tag: String? = nil,
                  cursor: String? = nil, limit: Int = 20) async throws -> TimelineResponse {
        var q: [URLQueryItem] = [.init(name: "channel", value: channel), .init(name: "limit", value: String(min(limit, 40)))]
        if let category { q.append(.init(name: "category", value: category)) }
        if let tag { q.append(.init(name: "tag", value: tag)) }
        if let cursor { q.append(.init(name: "cursor", value: cursor)) }
        return try await get("/api/site/timeline", query: q)
    }

    func pool(q: String? = nil, tab: String = "time", page: Int = 1, channel: String = "all",
              category: String? = nil, tag: String? = nil) async throws -> PoolResponse {
        var items: [URLQueryItem] = [.init(name: "tab", value: tab), .init(name: "page", value: String(max(1, min(page, 50)))), .init(name: "channel", value: channel)]
        if let q, !q.isEmpty { items.append(.init(name: "q", value: String(q.prefix(200)))) }
        if let category { items.append(.init(name: "category", value: category)) }
        if let tag { items.append(.init(name: "tag", value: tag)) }
        return try await get("/api/site/pool", query: items)
    }

    func item(id: String) async throws -> SiteItemDetail {
        try await get("/api/site/items/\(id)")
    }

    func groupReports(factId: String) async throws -> GroupReportsResponse {
        try await get("/api/site/groups/\(factId)/reports")
    }

    func topics() async throws -> TopicsResponse {
        try await get("/api/site/topics")
    }

    func topic(slug: String, page: Int = 1) async throws -> TopicPage {
        try await get("/api/site/topics/\(slug)", query: [.init(name: "page", value: String(page))])
    }

    func searchSuggestions() async throws -> SearchSuggestions {
        try await get("/api/site/search/suggestions")
    }

    func hot() async throws -> HotResponse {
        try await get("/api/site/hot")
    }

    func story(publicId: String) async throws -> StoryDetail {
        try await get("/api/site/stories/\(publicId)")
    }

    func latestDaily() async throws -> ReportLatestPage {
        try await get("/api/site/reports/daily/latest-page")
    }

    func dailyIndex() async throws -> ReportIndexResponse {
        try await get("/api/site/reports/daily")
    }

    func daily(key: String) async throws -> ReportDetail {
        try await get("/api/site/reports/daily/\(key)")
    }

    // MARK: 共用 GET

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        if let cached = etagCache[url] {
            request.setValue(cached.etag, forHTTPHeaderField: "If-None-Match")
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .notConnectedToInternet {
            throw APIError.offline
        } catch {
            throw APIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.transport(URLError(.badServerResponse)) }

        switch http.statusCode {
        case 200:
            if let etag = http.value(forHTTPHeaderField: "ETag") { etagCache[url] = (etag, data) }
            return try decode(data)
        case 304:
            guard let cached = etagCache[url] else { throw APIError.http(status: 304, retryAfter: nil) }
            return try decode(cached.data)
        case 308, 301, 302:
            // 事件合併時回 308，跟隨 Location（URLSession 預設已跟隨，這裡作保險）。
            if let location = http.value(forHTTPHeaderField: "Location"), let next = URL(string: location, relativeTo: baseURL) {
                return try await getAbsolute(next)
            }
            throw APIError.http(status: http.statusCode, retryAfter: nil)
        case 404:
            throw APIError.notFound
        default:
            let retry = http.value(forHTTPHeaderField: "Retry-After").flatMap(TimeInterval.init)
            throw APIError.http(status: http.statusCode, retryAfter: retry)
        }
    }

    private func getAbsolute<T: Decodable>(_ url: URL) async throws -> T {
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.http(status: (response as? HTTPURLResponse)?.statusCode ?? 0, retryAfter: nil)
        }
        return try decode(data)
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.decoding(error) }
    }

    /// 相對媒體網址（例如 /api/img-proxy?u=…）以網站基底解析。
    nonisolated func resolveMedia(_ raw: String?) -> URL? {
        guard let raw, !raw.isEmpty else { return nil }
        return URL(string: raw, relativeTo: AppConfig.apiBaseURL)?.absoluteURL
    }
}

enum AppConfig {
    static var apiBaseURL: URL {
        let raw = Bundle.main.object(forInfoDictionaryKey: "AIHotAPIBaseURL") as? String
        return URL(string: raw ?? "https://aihot.dayacre.com")!
    }

    /// Cloudflare Worker 的裝置登錄端點（空字串＝尚未部署，App 不會送出 token）。
    static var pushRegistrationURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "AIHotPushRegistrationURL") as? String,
              !raw.isEmpty else { return nil }
        return URL(string: raw)
    }

    static var userAgent: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return "AIHot-iOS/\(v) (\(b))"
    }

    static func webURL(forItem id: String) -> URL { apiBaseURL.appendingPathComponent("items/\(id)") }
    static func webURL(forStory publicId: String) -> URL { apiBaseURL.appendingPathComponent("story/\(publicId)") }
    static func webURL(forDaily key: String) -> URL { apiBaseURL.appendingPathComponent("daily/\(key)") }
}
