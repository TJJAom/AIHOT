import SwiftUI

/// 主題定義。色票欄位對應網頁版 app.css 的 CSS 變數（bg / surface / ink / ink-3 / ink-4 / line / accent …），
/// 讓 App 與網站用同一套語彙。預設主題「日耕原色」即網頁版淺色與深色的原值。
struct AppTheme: Identifiable, Hashable {
    enum Appearance: String { case system, light, dark }

    struct Palette: Hashable {
        var background: Color      // --bg
        var sunk: Color            // --bg-sunk（按下、次級底）
        var surface: Color         // --surface（卡片）
        var daybar: Color          // --daybar（日期列）
        var text: Color            // --ink
        var text2: Color           // --ink-2
        var text3: Color           // --ink-3（摘要）
        var text4: Color           // --ink-4（來源、次要）
        var line: Color            // --line
        var lineStrong: Color      // --line-strong
        var lineSoft: Color        // --line-soft
        var accent: Color          // --accent
        var accentSoft: Color      // --accent-soft
        var accentContrast: Color  // --accent-contrast
        var note: Color            // --note（推薦理由）
        var hot: Color             // --hot
        var hotSoft: Color
        var amber: Color           // --amber-ink（精選徽章字）
        var amberSoft: Color

        // 舊欄位別名，讓既有視圖不必全部改名。
        var surfaceAlt: Color { sunk }
        var secondaryText: Color { text4 }
        var divider: Color { line }
        var link: Color { accent }
    }

    let id: String
    let name: String
    let blurb: String
    let appearance: Appearance
    let light: Palette
    let dark: Palette
    var swatch: [Color] { [light.background, light.accent, dark.background] }

    func palette(for scheme: ColorScheme) -> Palette {
        switch appearance {
        case .light: light
        case .dark: dark
        case .system: scheme == .dark ? dark : light
        }
    }

    var preferredColorScheme: ColorScheme? {
        switch appearance {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}

/// 以少數主色推導整套色票：其餘主題只需給底色、卡片、文字、強調色。
private func derive(bg: UInt32, surface: UInt32, sunk: UInt32, ink: UInt32, ink4: UInt32, accent: UInt32,
                    dark: Bool, accentContrast: UInt32 = 0xFFFFFF, line: UInt32? = nil) -> AppTheme.Palette {
    let lineBase = line ?? (dark ? 0xFFFFFF : ink)
    let lineA: Double = line != nil ? 1 : (dark ? 0.09 : 0.14)
    return .init(
        background: Color(hex: bg), sunk: Color(hex: sunk), surface: Color(hex: surface), daybar: Color(hex: sunk),
        text: Color(hex: ink), text2: Color(hex: ink).opacity(0.9), text3: Color(hex: ink).opacity(dark ? 0.72 : 0.7), text4: Color(hex: ink4),
        line: Color(hex: lineBase, opacity: lineA), lineStrong: Color(hex: lineBase, opacity: lineA * 1.5), lineSoft: Color(hex: lineBase, opacity: lineA * 0.7),
        accent: Color(hex: accent), accentSoft: Color(hex: accent, opacity: dark ? 0.14 : 0.09), accentContrast: Color(hex: accentContrast),
        note: Color(hex: accent).opacity(0.85),
        hot: Color(hex: dark ? 0xD86A52 : 0xB3402A), hotSoft: Color(hex: dark ? 0xD86A52 : 0xB3402A, opacity: 0.1),
        amber: Color(hex: dark ? 0xD3B26A : 0x7C5A24), amberSoft: Color(hex: dark ? 0xD3B26A : 0xB8873A, opacity: 0.12))
}

extension AppTheme {
    /// 網頁版淺色（app.css :root）。
    static let webLight = AppTheme.Palette(
        background: Color(hex: 0xFAF9F6), sunk: Color(hex: 0xF3F3EF), surface: Color(hex: 0xFFFFFF), daybar: Color(hex: 0xF0F2EE),
        text: Color(hex: 0x202A30), text2: Color(hex: 0x303C42), text3: Color(hex: 0x59656B), text4: Color(hex: 0x657176),
        line: Color(hex: 0xDFE4E1), lineStrong: Color(hex: 0xD1D9D5), lineSoft: Color(hex: 0xE9EDE9),
        accent: Color(hex: 0x176B75), accentSoft: Color(hex: 0x176B75, opacity: 0.08), accentContrast: .white,
        note: Color(hex: 0x526F72), hot: Color(hex: 0xB3402A), hotSoft: Color(hex: 0xB3402A, opacity: 0.08),
        amber: Color(hex: 0x7C5A24), amberSoft: Color(hex: 0xB8873A, opacity: 0.1))

    /// 網頁版深色（app.css .dark）。
    static let webDark = AppTheme.Palette(
        background: Color(hex: 0x13191C), sunk: Color(hex: 0x182024), surface: Color(hex: 0x1A2226), daybar: Color(hex: 0x182024),
        text: Color(hex: 0xE7ECEB), text2: Color(hex: 0xD2DADA), text3: Color(hex: 0xA5B0B3), text4: Color(hex: 0x89979D),
        line: Color.white.opacity(0.08), lineStrong: Color.white.opacity(0.12), lineSoft: Color.white.opacity(0.06),
        accent: Color(hex: 0x12CCD8), accentSoft: Color(hex: 0x12CCD8, opacity: 0.12), accentContrast: .black,
        note: Color(hex: 0x8FB8A8), hot: Color(hex: 0xD86A52), hotSoft: Color(hex: 0xD86A52, opacity: 0.12),
        amber: Color(hex: 0xD3B26A), amberSoft: Color(hex: 0xD3B26A, opacity: 0.12))

    static let all: [AppTheme] = [
        AppTheme(id: "dayacre", name: "日耕原色", blurb: "與網站同一套顏色，跟隨系統深淺色。", appearance: .system, light: webLight, dark: webDark),
        AppTheme(id: "dayacre-light", name: "日耕淺色", blurb: "固定淺色。", appearance: .light, light: webLight, dark: webLight),
        AppTheme(id: "dayacre-dark", name: "日耕深色", blurb: "固定深色。", appearance: .dark, light: webDark, dark: webDark),
        AppTheme(id: "carbon", name: "碳纖螢綠", blurb: "深色碳纖底配螢光綠，呼應 App 圖示。", appearance: .dark,
                 light: derive(bg: 0x141414, surface: 0x1D1D1D, sunk: 0x262626, ink: 0xF2F2F2, ink4: 0x9A9A9A, accent: 0xC6FF00, dark: true, accentContrast: 0x101010),
                 dark: derive(bg: 0x141414, surface: 0x1D1D1D, sunk: 0x262626, ink: 0xF2F2F2, ink4: 0x9A9A9A, accent: 0xC6FF00, dark: true, accentContrast: 0x101010)),
        AppTheme(id: "paper", name: "宣紙米白", blurb: "溫暖紙感，長文閱讀不刺眼。", appearance: .light,
                 light: derive(bg: 0xF7F1E3, surface: 0xFFFBF2, sunk: 0xEFE6D2, ink: 0x2B2418, ink4: 0x7A6E5A, accent: 0x9A4F2A, dark: false),
                 dark: derive(bg: 0xF7F1E3, surface: 0xFFFBF2, sunk: 0xEFE6D2, ink: 0x2B2418, ink4: 0x7A6E5A, accent: 0x9A4F2A, dark: false)),
        AppTheme(id: "ink", name: "墨色純黑", blurb: "OLED 友善的純黑底。", appearance: .dark,
                 light: derive(bg: 0x000000, surface: 0x0F0F0F, sunk: 0x1A1A1A, ink: 0xF5F5F5, ink4: 0x9E9E9E, accent: 0x5AC8FA, dark: true, accentContrast: 0x000000),
                 dark: derive(bg: 0x000000, surface: 0x0F0F0F, sunk: 0x1A1A1A, ink: 0xF5F5F5, ink4: 0x9E9E9E, accent: 0x5AC8FA, dark: true, accentContrast: 0x000000)),
        AppTheme(id: "ocean", name: "海藍", blurb: "清爽的藍色系，深淺色皆可。", appearance: .system,
                 light: derive(bg: 0xF3F7FB, surface: 0xFFFFFF, sunk: 0xE6EEF6, ink: 0x14213D, ink4: 0x5B6B82, accent: 0x1E6FB8, dark: false),
                 dark: derive(bg: 0x0B1620, surface: 0x12202D, sunk: 0x1A2B3B, ink: 0xE6EEF6, ink4: 0x8FA3B8, accent: 0x5AA9F0, dark: true, accentContrast: 0x0B1620)),
        AppTheme(id: "forest", name: "森林", blurb: "沉穩的綠與木色。", appearance: .system,
                 light: derive(bg: 0xF2F6F0, surface: 0xFFFFFF, sunk: 0xE4ECE0, ink: 0x1E2A1F, ink4: 0x5F6F60, accent: 0x2E7D32, dark: false),
                 dark: derive(bg: 0x0F1A12, surface: 0x16251A, sunk: 0x1F3124, ink: 0xE8F0E8, ink4: 0x94A896, accent: 0x66BB6A, dark: true, accentContrast: 0x0F1A12)),
        AppTheme(id: "sunset", name: "晚霞橘", blurb: "暖橘強調色，活力感。", appearance: .system,
                 light: derive(bg: 0xFFF8F2, surface: 0xFFFFFF, sunk: 0xFCEBDD, ink: 0x2B1D14, ink4: 0x7D6454, accent: 0xD9530A, dark: false),
                 dark: derive(bg: 0x1A110B, surface: 0x251912, sunk: 0x33231A, ink: 0xF7ECE4, ink4: 0xB39A89, accent: 0xFF8A3D, dark: true, accentContrast: 0x1A110B)),
        AppTheme(id: "sakura", name: "櫻粉", blurb: "柔和粉色，低對比舒適。", appearance: .light,
                 light: derive(bg: 0xFFF5F8, surface: 0xFFFFFF, sunk: 0xFCE4EC, ink: 0x33222A, ink4: 0x806470, accent: 0xC2255C, dark: false),
                 dark: derive(bg: 0xFFF5F8, surface: 0xFFFFFF, sunk: 0xFCE4EC, ink: 0x33222A, ink4: 0x806470, accent: 0xC2255C, dark: false)),
        AppTheme(id: "lavender", name: "薰衣草", blurb: "紫色系，夜間閱讀柔和。", appearance: .system,
                 light: derive(bg: 0xF7F4FC, surface: 0xFFFFFF, sunk: 0xECE6F7, ink: 0x241B33, ink4: 0x6F6484, accent: 0x6741B5, dark: false),
                 dark: derive(bg: 0x130F1C, surface: 0x1C1628, sunk: 0x271F36, ink: 0xEFE9F7, ink4: 0xA498B8, accent: 0xB197F5, dark: true, accentContrast: 0x130F1C)),
        AppTheme(id: "sepia", name: "復古棕", blurb: "舊書般的棕色調。", appearance: .light,
                 light: derive(bg: 0xF4ECDC, surface: 0xFBF5E8, sunk: 0xEADFC8, ink: 0x3A2E1E, ink4: 0x7A6A52, accent: 0x7B4B1E, dark: false),
                 dark: derive(bg: 0xF4ECDC, surface: 0xFBF5E8, sunk: 0xEADFC8, ink: 0x3A2E1E, ink4: 0x7A6A52, accent: 0x7B4B1E, dark: false)),
        AppTheme(id: "nord", name: "北歐灰藍", blurb: "低飽和灰藍，深色工程師風。", appearance: .dark,
                 light: derive(bg: 0x2E3440, surface: 0x3B4252, sunk: 0x434C5E, ink: 0xECEFF4, ink4: 0xB7C0D1, accent: 0x88C0D0, dark: true, accentContrast: 0x2E3440),
                 dark: derive(bg: 0x2E3440, surface: 0x3B4252, sunk: 0x434C5E, ink: 0xECEFF4, ink4: 0xB7C0D1, accent: 0x88C0D0, dark: true, accentContrast: 0x2E3440)),
        AppTheme(id: "mint", name: "薄荷", blurb: "淡青綠底，清涼感。", appearance: .light,
                 light: derive(bg: 0xEFFBF6, surface: 0xFFFFFF, sunk: 0xDDF3EA, ink: 0x14302A, ink4: 0x5B7A70, accent: 0x0E8A69, dark: false),
                 dark: derive(bg: 0xEFFBF6, surface: 0xFFFFFF, sunk: 0xDDF3EA, ink: 0x14302A, ink4: 0x5B7A70, accent: 0x0E8A69, dark: false)),
        AppTheme(id: "amber", name: "琥珀深色", blurb: "深棕底配琥珀金，夜間暖色。", appearance: .dark,
                 light: derive(bg: 0x1B1611, surface: 0x262019, sunk: 0x332A20, ink: 0xF5EEE3, ink4: 0xB8A88F, accent: 0xF0B429, dark: true, accentContrast: 0x1B1611),
                 dark: derive(bg: 0x1B1611, surface: 0x262019, sunk: 0x332A20, ink: 0xF5EEE3, ink4: 0xB8A88F, accent: 0xF0B429, dark: true, accentContrast: 0x1B1611)),
        AppTheme(id: "highcontrast", name: "高對比", blurb: "黑白高對比，大字閱讀友善。", appearance: .system,
                 light: derive(bg: 0xFFFFFF, surface: 0xFFFFFF, sunk: 0xEEEEEE, ink: 0x000000, ink4: 0x333333, accent: 0x0000CC, dark: false, line: 0x000000),
                 dark: derive(bg: 0x000000, surface: 0x000000, sunk: 0x111111, ink: 0xFFFFFF, ink4: 0xDDDDDD, accent: 0xFFFF00, dark: true, accentContrast: 0x000000, line: 0xFFFFFF)),
    ]

    static let `default` = all[0]
    static func find(_ id: String) -> AppTheme { all.first { $0.id == id } ?? .default }
}

@Observable
final class ThemeStore {
    var themeID: String { didSet { UserDefaults.standard.set(themeID, forKey: Self.key) } }
    var fontScale: Double { didSet { UserDefaults.standard.set(fontScale, forKey: Self.fontKey) } }

    private static let key = "theme.id"
    private static let fontKey = "theme.fontScale"

    init() {
        themeID = UserDefaults.standard.string(forKey: Self.key) ?? AppTheme.default.id
        let saved = UserDefaults.standard.double(forKey: Self.fontKey)
        fontScale = saved == 0 ? 1.0 : saved
    }

    var theme: AppTheme { AppTheme.find(themeID) }
}

private struct ThemePaletteKey: EnvironmentKey {
    static let defaultValue: AppTheme.Palette = AppTheme.webLight
}

extension EnvironmentValues {
    var palette: AppTheme.Palette {
        get { self[ThemePaletteKey.self] }
        set { self[ThemePaletteKey.self] = newValue }
    }
}

struct ThemedRoot<Content: View>: View {
    @Environment(ThemeStore.self) private var store
    @Environment(\.colorScheme) private var scheme
    let content: () -> Content

    var body: some View {
        let theme = store.theme
        let palette = theme.palette(for: scheme)
        content()
            .environment(\.palette, palette)
            .tint(palette.accent)
            .preferredColorScheme(theme.preferredColorScheme)
            .background(palette.background.ignoresSafeArea())
    }
}
