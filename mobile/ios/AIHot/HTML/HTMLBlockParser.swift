import Foundation

/// 後端 sanitize 後的 HTML（p / h2–h5 / ul / ol / li / blockquote / pre / code / table / figure / img / a / strong / em / hr …）
/// 解析成原生區塊，交由 ArticleBodyView 以 SwiftUI 繪製。
/// 不依賴 WebKit；解析失敗時退回純文字段落，絕不讓文章頁空白。
enum HTMLBlock: Hashable, Identifiable {
    case heading(level: Int, inline: [InlineRun], anchor: String?)
    case paragraph([InlineRun])
    case quote([InlineRun])
    case list(ordered: Bool, items: [[InlineRun]])
    case code(String)
    case image(url: URL, alt: String?)
    case table(rows: [[String]])
    case rule

    var id: Int { hashValue }
}

struct InlineRun: Hashable {
    var text: String
    var bold = false
    var italic = false
    var code = false
    var link: URL?
}

struct HTMLBlockParser {
    private enum Token {
        case open(name: String, attrs: [String: String])
        case close(name: String)
        case text(String)
    }

    static func parse(_ html: String, baseURL: URL) -> [HTMLBlock] {
        let tokens = tokenize(html)
        var blocks: [HTMLBlock] = []

        var inlineBuffer: [InlineRun] = []
        var styleStack: [String] = []          // strong / em / code / a
        var linkStack: [URL?] = []
        var currentBlock: String? = nil        // p / h2 / li / pre / figcaption
        var quoteDepth = 0
        var headingLevel = 2
        var headingAnchor: String? = nil
        var listStack: [(ordered: Bool, items: [[InlineRun]])] = []
        var preBuffer = ""
        var inPre = false
        var tableRows: [[String]] = []
        var currentRow: [String]? = nil
        var cellBuffer = ""
        var inTable = false

        func styledRun(_ text: String) -> InlineRun {
            InlineRun(text: text,
                      bold: styleStack.contains("strong") || styleStack.contains("b"),
                      italic: styleStack.contains("em") || styleStack.contains("i"),
                      code: styleStack.contains("code"),
                      link: linkStack.last ?? nil)
        }

        func flushInline() {
            let runs = trimRuns(inlineBuffer)
            inlineBuffer.removeAll()
            guard !runs.isEmpty else { return }
            switch currentBlock {
            case "h2", "h3", "h4", "h5":
                blocks.append(.heading(level: headingLevel, inline: runs, anchor: headingAnchor))
            case "li":
                if !listStack.isEmpty { listStack[listStack.count - 1].items.append(runs) }
                else { blocks.append(.paragraph(runs)) }
            default:
                blocks.append(quoteDepth > 0 ? .quote(runs) : .paragraph(runs))
            }
        }

        for token in tokens {
            switch token {
            case let .text(raw):
                if inTable { cellBuffer += raw; continue }
                if inPre { preBuffer += raw; continue }
                let text = decodeEntities(raw.replacingOccurrences(of: "\n", with: " "))
                guard !text.isEmpty else { continue }
                inlineBuffer.append(styledRun(text))

            case let .open(name, attrs):
                switch name {
                case "p", "figcaption", "dt", "dd":
                    flushInline()
                    if currentBlock != "li" { currentBlock = "p" }
                case "h2", "h3", "h4", "h5":
                    flushInline(); currentBlock = name
                    headingLevel = Int(name.dropFirst()) ?? 2
                    headingAnchor = attrs["id"]
                case "blockquote":
                    flushInline(); quoteDepth += 1; currentBlock = nil
                case "ul", "ol":
                    flushInline()
                    listStack.append((ordered: name == "ol", items: []))
                case "li":
                    flushInline(); currentBlock = "li"
                case "pre":
                    flushInline(); inPre = true; preBuffer = ""
                case "code":
                    if !inPre { styleStack.append("code") }
                case "strong", "b", "em", "i":
                    styleStack.append(name)
                case "a":
                    styleStack.append("a")
                    linkStack.append(attrs["href"].flatMap { URL(string: $0, relativeTo: baseURL)?.absoluteURL })
                case "br":
                    inlineBuffer.append(styledRun("\n"))
                case "hr":
                    flushInline(); blocks.append(.rule)
                case "img":
                    flushInline()
                    if let src = attrs["src"], let url = URL(string: src, relativeTo: baseURL)?.absoluteURL {
                        blocks.append(.image(url: url, alt: attrs["alt"].map(decodeEntities)))
                    }
                case "table":
                    flushInline(); inTable = true; tableRows = []
                case "tr":
                    currentRow = []
                case "td", "th":
                    cellBuffer = ""
                default:
                    break
                }

            case let .close(name):
                switch name {
                case "p", "figcaption", "dt", "dd":
                    flushInline()
                    if currentBlock != "li" { currentBlock = nil }
                case "blockquote":
                    flushInline(); quoteDepth = max(0, quoteDepth - 1); currentBlock = nil
                case "h2", "h3", "h4", "h5", "li":
                    flushInline(); currentBlock = nil; headingAnchor = nil
                case "ul", "ol":
                    flushInline()
                    if let list = listStack.popLast(), !list.items.isEmpty {
                        if listStack.isEmpty { blocks.append(.list(ordered: list.ordered, items: list.items)) }
                        else {
                            // 巢狀清單：攤平進上一層
                            listStack[listStack.count - 1].items.append(contentsOf: list.items)
                        }
                    }
                case "pre":
                    inPre = false
                    let code = decodeEntities(preBuffer).trimmingCharacters(in: .newlines)
                    if !code.isEmpty { blocks.append(.code(code)) }
                case "code":
                    if !inPre, let i = styleStack.lastIndex(of: "code") { styleStack.remove(at: i) }
                case "strong", "b", "em", "i":
                    if let i = styleStack.lastIndex(of: name) { styleStack.remove(at: i) }
                case "a":
                    if let i = styleStack.lastIndex(of: "a") { styleStack.remove(at: i) }
                    _ = linkStack.popLast()
                case "td", "th":
                    currentRow?.append(decodeEntities(cellBuffer).trimmingCharacters(in: .whitespacesAndNewlines))
                    cellBuffer = ""
                case "tr":
                    if let row = currentRow, !row.isEmpty { tableRows.append(row) }
                    currentRow = nil
                case "table":
                    inTable = false
                    if !tableRows.isEmpty { blocks.append(.table(rows: tableRows)) }
                default:
                    break
                }
            }
        }
        flushInline()

        if blocks.isEmpty {
            let plain = decodeEntities(stripTags(html)).trimmingCharacters(in: .whitespacesAndNewlines)
            if !plain.isEmpty { blocks.append(.paragraph([InlineRun(text: plain)])) }
        }
        return blocks
    }

    // MARK: 字串層

    private static func tokenize(_ html: String) -> [Token] {
        var tokens: [Token] = []
        var i = html.startIndex
        var textStart = i
        while i < html.endIndex {
            if html[i] == "<", let end = html[i...].firstIndex(of: ">") {
                if textStart < i { tokens.append(.text(String(html[textStart..<i]))) }
                let inner = html[html.index(after: i)..<end]
                if inner.hasPrefix("!--") {
                    // 註解：跳到 -->
                    if let close = html.range(of: "-->", range: i..<html.endIndex) {
                        i = close.upperBound; textStart = i; continue
                    }
                } else if inner.hasPrefix("/") {
                    tokens.append(.close(name: String(inner.dropFirst()).trimmingCharacters(in: .whitespaces).lowercased()))
                } else {
                    let (name, attrs) = parseTag(String(inner))
                    tokens.append(.open(name: name, attrs: attrs))
                }
                i = html.index(after: end); textStart = i
            } else {
                i = html.index(after: i)
            }
        }
        if textStart < html.endIndex { tokens.append(.text(String(html[textStart...]))) }
        return tokens
    }

    private static func parseTag(_ s: String) -> (String, [String: String]) {
        var body = s.trimmingCharacters(in: .whitespaces)
        if body.hasSuffix("/") { body.removeLast() }
        let scanner = Scanner(string: body)
        scanner.charactersToBeSkipped = .whitespacesAndNewlines
        guard let name = scanner.scanCharacters(from: .alphanumerics)?.lowercased() else { return (body.lowercased(), [:]) }
        var attrs: [String: String] = [:]
        while !scanner.isAtEnd {
            guard let key = scanner.scanCharacters(from: CharacterSet.alphanumerics.union(.init(charactersIn: "-_:")))?.lowercased() else {
                _ = scanner.scanCharacter(); continue
            }
            if scanner.scanString("=") != nil {
                if scanner.scanString("\"") != nil {
                    attrs[key] = scanner.scanUpToString("\"") ?? ""; _ = scanner.scanString("\"")
                } else if scanner.scanString("'") != nil {
                    attrs[key] = scanner.scanUpToString("'") ?? ""; _ = scanner.scanString("'")
                } else {
                    attrs[key] = scanner.scanUpToCharacters(from: .whitespaces) ?? ""
                }
            } else {
                attrs[key] = ""
            }
        }
        return (name, attrs)
    }

    private static func stripTags(_ html: String) -> String {
        html.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
    }

    private static func trimRuns(_ runs: [InlineRun]) -> [InlineRun] {
        var out = runs
        // 把連續空白壓成單一空格、去掉頭尾空白；中文內文不需要英文式空格合併，但 HTML 換行會帶進空白。
        out = out.map { run in
            var r = run
            r.text = r.text.replacingOccurrences(of: "[ \\t\\r]+", with: " ", options: .regularExpression)
            return r
        }
        while let first = out.first, first.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { out.removeFirst() }
        while let last = out.last, last.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { out.removeLast() }
        if !out.isEmpty {
            out[0].text = String(out[0].text.drop(while: { $0.isWhitespace }))
            let lastIdx = out.count - 1
            while out[lastIdx].text.last?.isWhitespace == true { out[lastIdx].text.removeLast() }
        }
        return out.filter { !$0.text.isEmpty }
    }

    static func decodeEntities(_ s: String) -> String {
        guard s.contains("&") else { return s }
        var out = s
        let map: [String: String] = ["&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&apos;": "'", "&nbsp;": "\u{00A0}", "&hellip;": "…", "&mdash;": "—", "&ndash;": "–", "&ldquo;": "“", "&rdquo;": "”", "&lsquo;": "‘", "&rsquo;": "’"]
        for (k, v) in map { out = out.replacingOccurrences(of: k, with: v) }
        // 數值實體 &#123; / &#x1F600;
        if let regex = try? NSRegularExpression(pattern: "&#(x?)([0-9a-fA-F]+);") {
            let ns = out as NSString
            var result = ""
            var last = 0
            for m in regex.matches(in: out, range: NSRange(location: 0, length: ns.length)) {
                result += ns.substring(with: NSRange(location: last, length: m.range.location - last))
                let isHex = ns.substring(with: m.range(at: 1)) == "x"
                let digits = ns.substring(with: m.range(at: 2))
                if let code = UInt32(digits, radix: isHex ? 16 : 10), let scalar = Unicode.Scalar(code) {
                    result.append(Character(scalar))
                }
                last = m.range.location + m.range.length
            }
            result += ns.substring(from: last)
            out = result
        }
        out = out.replacingOccurrences(of: "&amp;", with: "&")
        return out
    }
}
