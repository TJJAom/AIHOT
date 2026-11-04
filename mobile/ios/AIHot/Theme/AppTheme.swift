import SwiftUI

/// 主題定義：每套主題各自提供淺色與深色兩組色票，並可指定強制外觀（例如純黑主題永遠深色）。
struct AppTheme: Identifiable, Hashable {
    enum Appearance: String { case system, light, dark }

    struct Palette: Hashable {
        var background: Color      // 頁面底色
        var surface: Color         // 卡片／群組底
        var surfaceAlt: Color      // 次級底（標籤、引文）
        var text: Color
        var secondaryText: Color
        var accent: Color
        var accentSoft: Color      // 淡色強調底
        var divider: Color
        var link: Color
    }

    let id: String
    let name: String
    let blurb: String
    let appearance: Appearance
    let light: Palette
    let dark: Palette
    /// 預覽／選單上代表此主題的三個顏色。
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
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}

private func pal(bg: UInt32, surface: UInt32, alt: UInt32, text: UInt32, secondary: UInt32,
                 accent: UInt32, accentSoft: UInt32, divider: UInt32, link: UInt32? = nil) -> AppTheme.Palette {
    .init(background: Color(hex: bg), surface: Color(hex: surface), surfaceAlt: Color(hex: alt),
          text: Color(hex: text), secondaryText: Color(hex: secondary), accent: Color(hex: accent),
          accentSoft: Color(hex: accentSoft), divider: Color(hex: divider), link: Color(hex: link ?? accent))
}

extension AppTheme {
    /// 全部 14 套主題（含預設）。設定頁依此順序列出。
    static let all: [AppTheme] = [
        AppTheme(id: "dayacre", name: "日耕原色", blurb: "跟隨系統深淺色，與網站同一套色彩。", appearance: .system,
                 light: pal(bg: 0xFAFAF7, surface: 0xFFFFFF, alt: 0xF1F0EB, text: 0x1B1B1B, secondary: 0x6B6B66, accent: 0x2F6B4F, accentSoft: 0xE3F0E8, divider: 0xE5E4DE),
                 dark: pal(bg: 0x121311, surface: 0x1C1E1B, alt: 0x262924, text: 0xEDEDE8, secondary: 0x9A9C96, accent: 0x7FC59E, accentSoft: 0x203328, divider: 0x2E312C)),
        AppTheme(id: "carbon", name: "碳纖螢綠", blurb: "深色碳纖底配螢光綠，呼應 App 圖示。", appearance: .dark,
                 light: pal(bg: 0x141414, surface: 0x1E1E1E, alt: 0x2A2A2A, text: 0xF2F2F2, secondary: 0xA3A3A3, accent: 0xC6FF00, accentSoft: 0x2A3300, divider: 0x303030),
                 dark: pal(bg: 0x141414, surface: 0x1E1E1E, alt: 0x2A2A2A, text: 0xF2F2F2, secondary: 0xA3A3A3, accent: 0xC6FF00, accentSoft: 0x2A3300, divider: 0x303030)),
        AppTheme(id: "paper", name: "宣紙米白", blurb: "溫暖紙感，長文閱讀不刺眼。", appearance: .light,
                 light: pal(bg: 0xF7F1E3, surface: 0xFFFBF2, alt: 0xEFE6D2, text: 0x2B2418, secondary: 0x7A6E5A, accent: 0xA0522D, accentSoft: 0xF3DFD2, divider: 0xE3D8C2),
                 dark: pal(bg: 0xF7F1E3, surface: 0xFFFBF2, alt: 0xEFE6D2, text: 0x2B2418, secondary: 0x7A6E5A, accent: 0xA0522D, accentSoft: 0xF3DFD2, divider: 0xE3D8C2)),
        AppTheme(id: "ink", name: "墨色純黑", blurb: "OLED 友善的純黑底。", appearance: .dark,
                 light: pal(bg: 0x000000, surface: 0x0E0E0E, alt: 0x1A1A1A, text: 0xF5F5F5, secondary: 0x9E9E9E, accent: 0xFFFFFF, accentSoft: 0x242424, divider: 0x222222, link: 0x8AB4F8),
                 dark: pal(bg: 0x000000, surface: 0x0E0E0E, alt: 0x1A1A1A, text: 0xF5F5F5, secondary: 0x9E9E9E, accent: 0xFFFFFF, accentSoft: 0x242424, divider: 0x222222, link: 0x8AB4F8)),
        AppTheme(id: "ocean", name: "海藍", blurb: "清爽的藍色系，深淺色皆可。", appearance: .system,
                 light: pal(bg: 0xF3F7FB, surface: 0xFFFFFF, alt: 0xE6EEF6, text: 0x14213D, secondary: 0x5B6B82, accent: 0x1E6FB8, accentSoft: 0xDCEBFA, divider: 0xD9E2EC),
                 dark: pal(bg: 0x0B1620, surface: 0x12202D, alt: 0x1A2B3B, text: 0xE6EEF6, secondary: 0x8FA3B8, accent: 0x5AA9F0, accentSoft: 0x15304A, divider: 0x203446)),
        AppTheme(id: "forest", name: "森林", blurb: "沉穩的綠與木色。", appearance: .system,
                 light: pal(bg: 0xF2F6F0, surface: 0xFFFFFF, alt: 0xE4ECE0, text: 0x1E2A1F, secondary: 0x5F6F60, accent: 0x2E7D32, accentSoft: 0xDDEEDB, divider: 0xD6E0D3),
                 dark: pal(bg: 0x0F1A12, surface: 0x16251A, alt: 0x1F3124, text: 0xE8F0E8, secondary: 0x94A896, accent: 0x66BB6A, accentSoft: 0x1D3A22, divider: 0x25382A)),
        AppTheme(id: "sunset", name: "晚霞橘", blurb: "暖橘強調色，活力感。", appearance: .system,
                 light: pal(bg: 0xFFF8F2, surface: 0xFFFFFF, alt: 0xFCEBDD, text: 0x2B1D14, secondary: 0x7D6454, accent: 0xE8590C, accentSoft: 0xFDE3D2, divider: 0xF0DCCB),
                 dark: pal(bg: 0x1A110B, surface: 0x251912, alt: 0x33231A, text: 0xF7ECE4, secondary: 0xB39A89, accent: 0xFF8A3D, accentSoft: 0x3F2414, divider: 0x3B2A20)),
        AppTheme(id: "sakura", name: "櫻粉", blurb: "柔和粉色，低對比舒適。", appearance: .light,
                 light: pal(bg: 0xFFF5F8, surface: 0xFFFFFF, alt: 0xFCE4EC, text: 0x33222A, secondary: 0x806470, accent: 0xD6336C, accentSoft: 0xFBD9E5, divider: 0xF2D7E0),
                 dark: pal(bg: 0xFFF5F8, surface: 0xFFFFFF, alt: 0xFCE4EC, text: 0x33222A, secondary: 0x806470, accent: 0xD6336C, accentSoft: 0xFBD9E5, divider: 0xF2D7E0)),
        AppTheme(id: "lavender", name: "薰衣草", blurb: "紫色系，夜間閱讀柔和。", appearance: .system,
                 light: pal(bg: 0xF7F4FC, surface: 0xFFFFFF, alt: 0xECE6F7, text: 0x241B33, secondary: 0x6F6484, accent: 0x6F42C1, accentSoft: 0xE6DCF8, divider: 0xE0D8ED),
                 dark: pal(bg: 0x130F1C, surface: 0x1C1628, alt: 0x271F36, text: 0xEFE9F7, secondary: 0xA498B8, accent: 0xB197F5, accentSoft: 0x2E2246, divider: 0x30273F)),
        AppTheme(id: "sepia", name: "復古棕", blurb: "舊書般的棕色調。", appearance: .light,
                 light: pal(bg: 0xF4ECDC, surface: 0xFBF5E8, alt: 0xEADFC8, text: 0x3A2E1E, secondary: 0x7A6A52, accent: 0x7B4B1E, accentSoft: 0xEBD9C2, divider: 0xDDCFB4),
                 dark: pal(bg: 0xF4ECDC, surface: 0xFBF5E8, alt: 0xEADFC8, text: 0x3A2E1E, secondary: 0x7A6A52, accent: 0x7B4B1E, accentSoft: 0xEBD9C2, divider: 0xDDCFB4)),
        AppTheme(id: "nord", name: "北歐灰藍", blurb: "低飽和灰藍，深色工程師風。", appearance: .dark,
                 light: pal(bg: 0x2E3440, surface: 0x3B4252, alt: 0x434C5E, text: 0xECEFF4, secondary: 0xB7C0D1, accent: 0x88C0D0, accentSoft: 0x3F5664, divider: 0x4C566A),
                 dark: pal(bg: 0x2E3440, surface: 0x3B4252, alt: 0x434C5E, text: 0xECEFF4, secondary: 0xB7C0D1, accent: 0x88C0D0, accentSoft: 0x3F5664, divider: 0x4C566A)),
        AppTheme(id: "mint", name: "薄荷", blurb: "淡青綠底，清涼感。", appearance: .light,
                 light: pal(bg: 0xEFFBF6, surface: 0xFFFFFF, alt: 0xDDF3EA, text: 0x14302A, secondary: 0x5B7A70, accent: 0x0F9D78, accentSoft: 0xD2F1E6, divider: 0xCFE6DC),
                 dark: pal(bg: 0xEFFBF6, surface: 0xFFFFFF, alt: 0xDDF3EA, text: 0x14302A, secondary: 0x5B7A70, accent: 0x0F9D78, accentSoft: 0xD2F1E6, divider: 0xCFE6DC)),
        AppTheme(id: "amber", name: "琥珀深色", blurb: "深棕底配琥珀金，夜間暖色。", appearance: .dark,
                 light: pal(bg: 0x1B1611, surface: 0x262019, alt: 0x332A20, text: 0xF5EEE3, secondary: 0xB8A88F, accent: 0xF0B429, accentSoft: 0x3D3012, divider: 0x3A3127),
                 dark: pal(bg: 0x1B1611, surface: 0x262019, alt: 0x332A20, text: 0xF5EEE3, secondary: 0xB8A88F, accent: 0xF0B429, accentSoft: 0x3D3012, divider: 0x3A3127)),
        AppTheme(id: "highcontrast", name: "高對比", blurb: "黑白高對比，大字閱讀友善。", appearance: .system,
                 light: pal(bg: 0xFFFFFF, surface: 0xFFFFFF, alt: 0xEEEEEE, text: 0x000000, secondary: 0x333333, accent: 0x0000CC, accentSoft: 0xDDDDFF, divider: 0x000000),
                 dark: pal(bg: 0x000000, surface: 0x000000, alt: 0x111111, text: 0xFFFFFF, secondary: 0xDDDDDD, accent: 0xFFFF00, accentSoft: 0x333300, divider: 0xFFFFFF)),
    ]

    static let `default` = all[0]

    static func find(_ id: String) -> AppTheme { all.first { $0.id == id } ?? .default }
}

/// 全 App 共用的主題狀態；由 @AppStorage 持久化。
@Observable
final class ThemeStore {
    var themeID: String {
        didSet { UserDefaults.standard.set(themeID, forKey: Self.key) }
    }
    var fontScale: Double {
        didSet { UserDefaults.standard.set(fontScale, forKey: Self.fontKey) }
    }

    private static let key = "theme.id"
    private static let fontKey = "theme.fontScale"

    init() {
        themeID = UserDefaults.standard.string(forKey: Self.key) ?? AppTheme.default.id
        let saved = UserDefaults.standard.double(forKey: Self.fontKey)
        fontScale = saved == 0 ? 1.0 : saved
    }

    var theme: AppTheme { AppTheme.find(themeID) }
}

// MARK: Environment

private struct ThemePaletteKey: EnvironmentKey {
    static let defaultValue: AppTheme.Palette = AppTheme.default.light
}

extension EnvironmentValues {
    var palette: AppTheme.Palette {
        get { self[ThemePaletteKey.self] }
        set { self[ThemePaletteKey.self] = newValue }
    }
}

/// 套在根視圖：計算當前色票、注入環境、設定底色與強制外觀。
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
