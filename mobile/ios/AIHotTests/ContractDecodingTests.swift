import XCTest
@testable import AIHot

/// 用 2026-11-04 從正式站抓下的真實回應（Fixtures/）驗證 Codable 契約。
/// 網站 API 未版本化；若這些測試失敗，優先檢查 packages/contracts/src/site.ts 的變動。
final class ContractDecodingTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        let bundle = Bundle(for: Self.self)
        guard let url = bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
                ?? bundle.url(forResource: name, withExtension: "json") else {
            throw XCTSkip("找不到夾具 \(name).json")
        }
        return try Data(contentsOf: url)
    }

    func testItemDetailWithBody() throws {
        let item = try JSONDecoder().decode(SiteItemDetail.self, from: fixture("item"))
        XCTAssertEqual(item.id, "bjr6oufmll5t8sajno2m8hp9f")
        XCTAssertTrue(item.hasReadableBody)
        XCTAssertEqual(item.body?.zhKind, "reading")
        XCTAssertEqual(item.outline.count, 4)
        let blocks = HTMLBlockParser.parse(item.body!.zh!, baseURL: URL(string: "https://aihot.dayacre.com")!)
        let headings = blocks.filter { if case .heading = $0 { true } else { false } }
        let paragraphs = blocks.filter { if case .paragraph = $0 { true } else { false } }
        XCTAssertEqual(headings.count, 4)
        XCTAssertGreaterThanOrEqual(paragraphs.count, 7)
    }

    func testItemDetailWithoutBody() throws {
        let item = try JSONDecoder().decode(SiteItemDetail.self, from: fixture("item-nobody"))
        XCTAssertNil(item.body)
        XCTAssertFalse(item.hasReadableBody)
        XCTAssertEqual(item.readingMode, "full")   // readingMode=full 不保證有 body
    }

    func testTimeline() throws {
        let page = try JSONDecoder().decode(TimelineResponse.self, from: fixture("timeline"))
        XCTAssertFalse(page.cards.isEmpty)
        XCTAssertNotNil(page.nextCursor)
    }

    func testPool() throws {
        let page = try JSONDecoder().decode(PoolResponse.self, from: fixture("pool"))
        XCTAssertEqual(page.page, 1)
        XCTAssertFalse(page.items.isEmpty)
    }

    func testTopics() throws {
        let res = try JSONDecoder().decode(TopicsResponse.self, from: fixture("topics"))
        XCTAssertFalse(res.groups.isEmpty)
        _ = try JSONDecoder().decode(TopicPage.self, from: fixture("topic-detail"))
    }

    func testDaily() throws {
        let latest = try JSONDecoder().decode(ReportLatestPage.self, from: fixture("daily-latest"))
        XCTAssertNotNil(latest.report)
        _ = try JSONDecoder().decode(ReportIndexResponse.self, from: fixture("daily-index"))
        _ = try JSONDecoder().decode(SearchSuggestions.self, from: fixture("suggestions"))
    }

    func testHTMLParserHandlesLists_Entities_Links() {
        let html = "<p>A &amp; <strong>B</strong> <a href=\"/x\">link</a></p><ul><li>one</li><li>two</li></ul><pre><code>let a = 1</code></pre>"
        let blocks = HTMLBlockParser.parse(html, baseURL: URL(string: "https://aihot.dayacre.com")!)
        XCTAssertEqual(blocks.count, 3)
        if case let .paragraph(runs) = blocks[0] {
            XCTAssertEqual(runs.map(\.text).joined(), "A & B link")
            XCTAssertEqual(runs.last?.link?.absoluteString, "https://aihot.dayacre.com/x")
            XCTAssertTrue(runs.contains { $0.bold && $0.text == "B" })
        } else { XCTFail("第一個區塊應為段落") }
        if case let .list(ordered, items) = blocks[1] {
            XCTAssertFalse(ordered); XCTAssertEqual(items.count, 2)
        } else { XCTFail("第二個區塊應為清單") }
        if case let .code(code) = blocks[2] { XCTAssertEqual(code, "let a = 1") } else { XCTFail("第三個區塊應為程式碼") }
    }

    func testDeepLinks() {
        XCTAssertEqual(DeepLink(url: URL(string: "aihot://items/abc")!), .item(id: "abc"))
        XCTAssertEqual(DeepLink(url: URL(string: "https://aihot.dayacre.com/daily/2026-11-03")!), .daily(key: "2026-11-03"))
        XCTAssertEqual(DeepLink(userInfo: ["itemId": "x"]), .item(id: "x"))
    }
}
