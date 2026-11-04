import SwiftUI

/// 把 HTMLBlock 畫成原生 SwiftUI；字級跟隨 Dynamic Type 並乘上使用者的字級倍率。
struct ArticleBodyView: View {
    @Environment(\.palette) private var palette
    @Environment(ThemeStore.self) private var themeStore
    let blocks: [HTMLBlock]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(blocks) { block in
                render(block)
            }
        }
    }

    private var scale: CGFloat { CGFloat(themeStore.fontScale) }

    @ViewBuilder
    private func render(_ block: HTMLBlock) -> some View {
        switch block {
        case let .heading(level, inline, anchor):
            Text(attributed(inline, base: headingFont(level)))
                .foregroundStyle(palette.text)
                .padding(.top, level == 2 ? 10 : 4)
                .id(anchor)
                .fixedSize(horizontal: false, vertical: true)
        case let .paragraph(inline):
            Text(attributed(inline, base: .system(size: 17 * scale)))
                .foregroundStyle(palette.text)
                .lineSpacing(6 * scale)
                .fixedSize(horizontal: false, vertical: true)
        case let .quote(inline):
            HStack(alignment: .top, spacing: 10) {
                RoundedRectangle(cornerRadius: 2).fill(palette.accent).frame(width: 3)
                Text(attributed(inline, base: .system(size: 16 * scale)))
                    .foregroundStyle(palette.secondaryText)
                    .lineSpacing(5 * scale)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(12)
            .background(palette.surfaceAlt, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        case let .list(ordered, items):
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, runs in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(ordered ? "\(index + 1)." : "•")
                            .font(.system(size: 17 * scale))
                            .foregroundStyle(palette.accent)
                            .frame(minWidth: 18, alignment: .trailing)
                        Text(attributed(runs, base: .system(size: 17 * scale)))
                            .foregroundStyle(palette.text)
                            .lineSpacing(5 * scale)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        case let .code(code):
            ScrollView(.horizontal, showsIndicators: false) {
                Text(code)
                    .font(.system(size: 14 * scale, design: .monospaced))
                    .foregroundStyle(palette.text)
                    .padding(12)
            }
            .background(palette.surfaceAlt, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        case let .image(url, alt):
            VStack(alignment: .leading, spacing: 6) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case let .success(image): image.resizable().scaledToFit()
                    case .failure: EmptyView()
                    default: ProgressView().frame(maxWidth: .infinity).frame(height: 120)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                if let alt, !alt.isEmpty {
                    Text(alt).font(.caption).foregroundStyle(palette.secondaryText)
                }
            }
        case let .table(rows):
            ScrollView(.horizontal, showsIndicators: true) {
                Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { rowIndex, row in
                        GridRow {
                            ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                                Text(cell)
                                    .font(.system(size: 15 * scale, weight: rowIndex == 0 ? .semibold : .regular))
                                    .foregroundStyle(palette.text)
                            }
                        }
                        if rowIndex == 0 { Divider() }
                    }
                }
                .padding(12)
            }
            .background(palette.surfaceAlt, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        case .rule:
            Divider().overlay(palette.divider)
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 2: .system(size: 22 * scale, weight: .bold)
        case 3: .system(size: 19 * scale, weight: .semibold)
        default: .system(size: 17 * scale, weight: .semibold)
        }
    }

    private func attributed(_ runs: [InlineRun], base: Font) -> AttributedString {
        var out = AttributedString()
        for run in runs {
            var piece = AttributedString(run.text)
            var font = base
            if run.bold { font = font.weight(.semibold) }
            if run.italic { font = font.italic() }
            if run.code { font = .system(size: 15 * scale, design: .monospaced) }
            piece.font = font
            if let link = run.link {
                piece.link = link
                piece.foregroundColor = palette.link
                piece.underlineStyle = .single
            }
            out.append(piece)
        }
        return out
    }
}
