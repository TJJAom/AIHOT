import Foundation

// 對應 packages/contracts/src/site.ts（第一方網站 API，未版本化）。
// 欄位盡量用 Optional 承接，避免網站日後新增／調整欄位時解碼失敗。

struct SourceRef: Codable, Hashable {
    var name: String
}

struct StoryRef: Codable, Hashable, Identifiable {
    var publicId: String
    var title: String
    var id: String { publicId }
}

struct MediaView: Codable, Hashable {
    var kind: String
    var url: String
    var fullUrl: String?
    var width: Int?
    var height: Int?
    var alt: String?
    var poster: String?
}

struct FeedXPost: Codable, Hashable {
    var authorName: String
    var handle: String
    var avatarUrl: String?
    var media: [MediaView]?
}

/// 列表卡片（timeline / pool / topic）共用的文章摘要。
struct FeedItem: Codable, Hashable, Identifiable {
    var id: String
    var title: String
    var summary: String?
    var reason: String?
    var source: SourceRef
    var publishedAt: String?
    var timelineAt: String
    var category: String?
    var tags: [String]
    var score: Int?
    var selected: Bool
    var channel: String
    var x: FeedXPost?
    var sameEvent: SameEventRef?

    struct SameEventRef: Codable, Hashable {
        var id: String
        var title: String
    }
}

struct GroupInfo: Codable, Hashable {
    var factId: String
    var additionalSourceCount: Int
    var reportCount: Int
    var memberIds: [String]?
}

struct TimelineCard: Codable, Hashable, Identifiable {
    var key: String
    var anchorAt: String
    var item: FeedItem
    var group: GroupInfo?
    var id: String { key }
}

struct HotParticipant: Codable, Hashable {
    var name: String
    var kind: String
    var iconUrl: String?
}

struct HotStripEntry: Codable, Hashable, Identifiable {
    var rank: Int
    var title: String
    var heat: Double
    var trend: String
    var storyPublicId: String?
    var itemId: String?
    var participants: [HotParticipant]
    var participantCount: Int
    var id: String { "\(rank)-\(storyPublicId ?? itemId ?? title)" }
}

struct TimelineFilters: Codable, Hashable {
    var channel: String
    var category: String?
    var tag: String?
}

struct TimelineResponse: Codable {
    var filters: TimelineFilters
    var cards: [TimelineCard]
    var nextCursor: String?
    var hot: [HotStripEntry]?
    var dayCounts: [String: Int]
}

struct PoolResponse: Codable {
    var items: [FeedItem]
    var page: Int
    var pageCount: Int
    var total: Int
    var todayCount: Int
    var freshness: String
}

struct OutlineEntry: Codable, Hashable, Identifiable {
    var id: String
    var text: String
    var level: Int
}

struct ItemBody: Codable, Hashable {
    var zh: String?
    var original: String?
    var zhKind: String?
    var complete: Bool
}

struct TopicLink: Codable, Hashable, Identifiable {
    var slug: String
    var name: String
    var id: String { slug }
}

struct ItemLinks: Codable, Hashable {
    var original: String
}

/// `/api/site/items/{id}`，直接回傳本結構（沒有 `{item:…}` 包裝）。
struct SiteItemDetail: Codable, Identifiable {
    var id: String
    var title: String
    var originalTitle: String?
    var summary: String?
    var reason: String?
    var source: SourceRef
    var links: ItemLinks
    var publishedAt: String?
    var discoveredAt: String
    var timelineAt: String
    var category: String?
    var tags: [String]
    var score: Int?
    var selected: Bool
    var channel: String
    var story: StoryRef?
    var readingMode: String
    var author: String?
    var body: ItemBody?
    var outline: [OutlineEntry]
    var relatedStories: [StoryRef]
    var topics: [TopicLink]
    var markdownAvailable: Bool
    var group: GroupInfo?
    var hasTranslation: Bool
    var bodyLanguage: String

    /// 是否有可顯示的繁體內文（readingMode=full 不保證 body 存在）。
    var hasReadableBody: Bool {
        guard let zh = body?.zh?.trimmingCharacters(in: .whitespacesAndNewlines) else { return false }
        return !zh.isEmpty
    }

    /// 精簡成列表卡片用的摘要（收藏頁、日報引用用）。
    var asFeedItem: FeedItem {
        FeedItem(id: id, title: title, summary: summary, reason: reason, source: source,
                 publishedAt: publishedAt, timelineAt: timelineAt, category: category, tags: tags,
                 score: score, selected: selected, channel: channel, x: nil, sameEvent: nil)
    }
}

struct GroupReport: Codable, Hashable, Identifiable {
    var id: String
    var title: String
    var source: SourceRef
    var timelineAt: String
    var originalUrl: String
}

struct GroupReportsResponse: Codable {
    var factId: String
    var reports: [GroupReport]
}

// MARK: 主題

struct TopicGroup: Codable, Hashable, Identifiable {
    var key: String
    var name: String
    var blurb: String
    var id: String { key }
}

struct Brand: Codable, Hashable {
    var src: String?
    var monogram: String
    var raster: Bool
}

struct TopicLatest: Codable, Hashable {
    var title: String
    var at: String
}

struct TopicSummary: Codable, Hashable, Identifiable {
    var slug: String
    var name: String
    var group: String
    var definition: String
    var brand: Brand?
    var total: Int
    var recent: Int
    var indexable: Bool
    var latest: TopicLatest?
    var id: String { slug }
}

struct TopicsResponse: Codable {
    var groups: [TopicGroup]
    var topics: [TopicSummary]
}

struct TopicPageTopic: Codable {
    var slug: String
    var name: String
    var group: String
    var definition: String
    var brand: Brand?
    var total: Int
    var recent: Int
    var groupName: String
    var poolTotal: Int
}

struct TopicPage: Codable {
    var topic: TopicPageTopic
    var items: [FeedItem]
    var page: Int
    var pageCount: Int
    var pageSize: Int
}

struct SearchSuggestions: Codable {
    struct Topic: Codable, Hashable, Identifiable {
        var slug: String
        var name: String
        var group: String
        var id: String { slug }
    }
    struct Hot: Codable, Hashable, Identifiable {
        var rank: Int
        var title: String
        var to: String
        var id: Int { rank }
    }
    var topics: [Topic]
    var hot: [Hot]
}

// MARK: 熱點與事件

struct HotEntry: Codable, Identifiable {
    var rank: Int
    var story: StoryRef
    var heat: Double
    var trend: String
    var trendPct: Double?
    var badges: [String]
    var participantCount: Int
    var sourceCount: Int
    var sourceNames: [String]
    var participants: [HotParticipant]?
    var summary: String?
    var latest: String?
    var id: String { story.publicId }
}

struct HotResponse: Codable {
    var computedAt: String?
    var windowHours: Int
    var entries: [HotEntry]
}

struct StoryReportView: Codable, Hashable, Identifiable {
    struct Source: Codable, Hashable {
        var name: String
        var firstParty: Bool
    }
    var id: String
    var title: String
    var summary: String?
    var source: Source
    var publishedAt: String
    var selected: Bool
}

struct StoryFactView: Codable, Hashable, Identifiable {
    var factId: String
    var title: String
    var firstReportAt: String
    var reportCount: Int
    var representative: StoryReportView
    var id: String { factId }
}

struct StoryDetail: Codable {
    var publicId: String
    var title: String
    var status: String
    var reportCount: Int
    var sourceCount: Int
    var firstReportAt: String?
    var latestAt: String?
    var digest: String?
    var summary: String?
    var latest: String?
    var developments: [StoryFactView]
    var officialReports: [StoryReportView]
    var timeline: [StoryReportView]
    var topics: [TopicLink]
}

// MARK: 日報

struct ReportCitation: Codable, Hashable, Identifiable {
    var itemId: String?
    var title: String
    var summary: String?
    var sourceName: String
    var sourceUrl: String
    var sourceIconUrl: String?
    var firstParty: Bool
    var publishedAt: String?
    var available: Bool
    var otherSources: Int?
    var storyId: String?
    var related: [ReportCitation]?
    var followUp: String?
    var id: String { itemId ?? sourceUrl }
}

struct ReportSection: Codable, Hashable, Identifiable {
    var label: String
    var summary: String?
    var items: [ReportCitation]
    var id: String { label }
}

struct ReportLead: Codable, Hashable {
    var title: String
    var leadParagraph: String
}

struct ReportCover: Codable, Hashable {
    var url: String
    var width: Int?
    var height: Int?
    var caption: String?
}

struct ReportDetail: Codable {
    var kind: String
    var key: String
    var issueNumber: Int
    var title: String
    var generatedAt: String
    var lead: ReportLead?
    var leadItemId: String?
    var overview: String?
    var highlights: [ReportCitation]
    var sections: [ReportSection]
    var flashes: [ReportCitation]
    var cover: ReportCover?
    var metrics: [String: Double]
    var readingMinutes: Int
    var prev: String?
    var next: String?
}

struct ReportNavigationEntry: Codable, Hashable, Identifiable {
    var key: String
    var issueNumber: Int
    var title: String?
    var count: Int?
    var id: String { key }
}

struct ReportLatestPage: Codable {
    var index: [ReportNavigationEntry]
    var report: ReportDetail?
}

struct ReportIndexResponse: Codable {
    var kind: String
    var items: [ReportNavigationEntry]
}

struct ReportNavigationResponse: Codable {
    var items: [ReportNavigationEntry]
}

// MARK: 分類

enum Category: String, CaseIterable, Identifiable {
    case aiModels = "ai-models"
    case aiProducts = "ai-products"
    case industry
    case paper
    case tip
    case opinion

    var id: String { rawValue }

    var label: String {
        switch self {
        case .aiModels: "模型"
        case .aiProducts: "產品"
        case .industry: "行業"
        case .paper: "論文"
        case .tip: "教程"
        case .opinion: "觀點"
        }
    }

    static func label(for key: String?) -> String? {
        guard let key else { return nil }
        return Category(rawValue: key)?.label ?? key
    }
}
