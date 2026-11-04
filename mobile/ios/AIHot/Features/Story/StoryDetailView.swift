import SwiftUI

/// 事件頁：同一事件的綜述、進展與時間線（/api/site/stories/:publicId）。
struct StoryDetailView: View {
    @Environment(\.palette) private var palette
    let publicId: String
    @State private var state: LoadState<StoryDetail> = .idle

    var body: some View {
        Group {
            switch state {
            case .idle, .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error): ErrorStateView(error: error) { await load() }
            case let .loaded(story): content(story)
            }
        }
        .themedBackground()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { ShareButton(url: AppConfig.webURL(forStory: publicId)) } }
        .task(id: publicId) { await load() }
    }

    private func load() async {
        state = .loading
        do { state = .loaded(try await APIClient.shared.story(publicId: publicId)) }
        catch { state = .failed(error) }
    }

    private func content(_ story: StoryDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(story.title).font(.title2.bold()).foregroundStyle(palette.text).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    TagChip(text: statusLabel(story.status), highlighted: true)
                    Text("\(story.reportCount) 篇報導 · \(story.sourceCount) 個來源").font(.caption).foregroundStyle(palette.secondaryText)
                }
                if let text = story.digest ?? story.summary, !text.isEmpty {
                    Text(text).font(.system(size: 17)).lineSpacing(6).foregroundStyle(palette.text).fixedSize(horizontal: false, vertical: true)
                }
                if let latest = story.latest, !latest.isEmpty {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "bolt.fill").foregroundStyle(palette.accent)
                        Text("最新：\(latest)").font(.subheadline).foregroundStyle(palette.text)
                    }
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(palette.accentSoft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                if !story.developments.isEmpty {
                    sectionTitle("進展")
                    ForEach(story.developments) { fact in
                        NavigationLink(value: Route.item(id: fact.representative.id)) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(fact.title).font(.headline).foregroundStyle(palette.text)
                                SourceLine(source: fact.representative.source.name, at: fact.firstReportAt)
                            }
                            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                            .background(palette.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
                if !story.timeline.isEmpty {
                    sectionTitle("時間線")
                    ForEach(story.timeline) { report in
                        NavigationLink(value: Route.item(id: report.id)) {
                            HStack(alignment: .top, spacing: 10) {
                                Circle().fill(report.selected ? palette.accent : palette.divider).frame(width: 8, height: 8).padding(.top, 6)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(report.title).font(.subheadline).foregroundStyle(palette.text)
                                    SourceLine(source: report.source.name, at: report.publishedAt)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                if !story.topics.isEmpty {
                    FlowLayout(spacing: 8) {
                        ForEach(story.topics) { t in
                            NavigationLink(value: Route.topic(slug: t.slug)) { TagChip(text: t.name, highlighted: true) }.buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(20)
        }
    }

    private func sectionTitle(_ s: String) -> some View {
        Text(s).font(.headline).foregroundStyle(palette.text).padding(.top, 6)
    }

    private func statusLabel(_ s: String) -> String {
        switch s {
        case "active": "進行中"
        case "watching": "觀察中"
        case "settled": "已平息"
        default: s
        }
    }
}
