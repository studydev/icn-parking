// 생성 파일 — 직접 고치지 마세요.
// 원본: mobile/shared/tokens.json · node mobile/shared/scripts/generate.mjs

/// 0xAARRGGBB
public struct TokenColor: Hashable, Sendable {
    public let argb: UInt32
    public init(_ argb: UInt32) { self.argb = argb }
    public var alpha: Double { Double((argb >> 24) & 0xFF) / 255 }
    public var red: Double { Double((argb >> 16) & 0xFF) / 255 }
    public var green: Double { Double((argb >> 8) & 0xFF) / 255 }
    public var blue: Double { Double(argb & 0xFF) / 255 }
}

public enum ThemeMode: String, CaseIterable, Sendable {
    case light, dark
}

public struct ThemePalette: Hashable, Sendable {
    public let bg: TokenColor
    public let surface: TokenColor
    public let sheet: TokenColor
    public let ink: TokenColor
    public let ink2: TokenColor
    public let muted: TokenColor
    public let faint: TokenColor
    public let line: TokenColor
    public let outline: TokenColor
    public let track: TokenColor
    public let chip: TokenColor
    public let tonal: TokenColor
    public let tint: TokenColor
    public let up: TokenColor
    public let down: TokenColor
    public let fullInk: TokenColor
    public let gS: TokenColor
    public let gSInk: TokenColor
    public let gL: TokenColor
    public let gLInk: TokenColor
    public let stall: TokenColor
    public let wk: TokenColor
    public let band: TokenColor
    public let warnBg: TokenColor
    public let warnInk: TokenColor
    public let warnLine: TokenColor
    public let scrim: TokenColor
    public let thumb: TokenColor
    public let bar: TokenColor
    public let widgetBg: TokenColor
}

/// 혼잡 단계. 경계는 웹 occupancy.js bands와 같고 점유율이 경계 이상이면 그 단계.
public enum OccupancyBand: String, CaseIterable, Sendable {
    case full, veryBusy, busy, normal, free

    public static func of(_ occupancy: Double) -> OccupancyBand {
        if occupancy >= 0.98 { return .full }
        if occupancy >= 0.95 { return .veryBusy }
        if occupancy >= 0.9 { return .busy }
        if occupancy >= 0.7 { return .normal }
        return .free
    }

    public var label: String {
        switch self {
        case .full: return "만차"
        case .veryBusy: return "매우 혼잡"
        case .busy: return "혼잡"
        case .normal: return "보통"
        case .free: return "여유"
        }
    }

    public var minimum: Double {
        switch self {
        case .full: return 0.98
        case .veryBusy: return 0.95
        case .busy: return 0.9
        case .normal: return 0.7
        case .free: return 0.0
        }
    }

    public var color: TokenColor {
        switch self {
        case .full: return TokenColor(0xFFE5303F)
        case .veryBusy: return TokenColor(0xFFF4622A)
        case .busy: return TokenColor(0xFFF5A524)
        case .normal: return TokenColor(0xFF2F80ED)
        case .free: return TokenColor(0xFF12B76A)
        }
    }

    /// 칸 배경
    public func tint(_ theme: ThemeMode) -> TokenColor {
        switch self {
        case .full: return theme == .dark ? TokenColor(0xFF8D252F) : TokenColor(0xFFF4A8AE)
        case .veryBusy: return theme == .dark ? TokenColor(0xFF964223) : TokenColor(0xFFFABDA6)
        case .busy: return theme == .dark ? TokenColor(0xFF97691F) : TokenColor(0xFFFBD9A3)
        case .normal: return theme == .dark ? TokenColor(0xFF245394) : TokenColor(0xFFA8CAF7)
        case .free: return theme == .dark ? TokenColor(0xFF137348) : TokenColor(0xFF9BE1C0)
        }
    }

    /// 슬래브·타워 두께
    public func edge(_ theme: ThemeMode) -> TokenColor {
        switch self {
        case .full: return theme == .dark ? TokenColor(0xFFB32531) : TokenColor(0xFFC52936)
        case .veryBusy: return theme == .dark ? TokenColor(0xFFBE4C21) : TokenColor(0xFFD25424)
        case .busy: return theme == .dark ? TokenColor(0xFFBF811C) : TokenColor(0xFFD38E1F)
        case .normal: return theme == .dark ? TokenColor(0xFF2564B9) : TokenColor(0xFF286ECC)
        case .free: return theme == .dark ? TokenColor(0xFF0E8F53) : TokenColor(0xFF0F9D5B)
        }
    }
}

public struct ShuttleRouteColor: Hashable, Sendable {
    public let color: TokenColor
    let softLight: TokenColor
    let softDark: TokenColor
    /// 카드·선택 행 배경
    public func soft(_ theme: ThemeMode) -> TokenColor { theme == .dark ? softDark : softLight }
}

/// 히스토리 구역별 선 색(라이트·다크)
public struct SeriesColor: Hashable, Sendable {
    let light: TokenColor
    let dark: TokenColor
    public func color(_ theme: ThemeMode) -> TokenColor { theme == .dark ? dark : light }
}

public struct Shadow: Hashable, Sendable {
    public let x: Double
    public let y: Double
    public let blur: Double
    public let color: TokenColor
}

public enum Tokens {
    public static let fullThreshold = 0.98

    public static let light = ThemePalette(
        bg: TokenColor(0xFFFFFFFF),
        surface: TokenColor(0xFFF2F4F7),
        sheet: TokenColor(0xFFFFFFFF),
        ink: TokenColor(0xFF111316),
        ink2: TokenColor(0xFF2C3137),
        muted: TokenColor(0xFF5D646C),
        faint: TokenColor(0xFF8A9199),
        line: TokenColor(0xFFEAEDF0),
        outline: TokenColor(0xFFCDD2D8),
        track: TokenColor(0xFFEEF0F3),
        chip: TokenColor(0xFFF2F4F6),
        tonal: TokenColor(0xFFDDE8FF),
        tint: TokenColor(0xFF2F6FED),
        up: TokenColor(0xFFD92D3A),
        down: TokenColor(0xFF1F5FD6),
        fullInk: TokenColor(0xFFA1121F),
        gS: TokenColor(0xFFE3E9F0),
        gSInk: TokenColor(0xFF2F4256),
        gL: TokenColor(0xFFF8F0E4),
        gLInk: TokenColor(0xFF8A5410),
        stall: TokenColor(0xCCFFFFFF),
        wk: TokenColor(0xFFFDECEB),
        band: TokenColor(0xFFF5F7F9),
        warnBg: TokenColor(0xFFFFF3DC),
        warnInk: TokenColor(0xFF8A4B00),
        warnLine: TokenColor(0xFFF7C768),
        scrim: TokenColor(0x5C101214),
        thumb: TokenColor(0xFFFFFFFF),
        bar: TokenColor(0xFFFFFFFF),
        widgetBg: TokenColor(0xFFEEF3FF)
    )

    public static let dark = ThemePalette(
        bg: TokenColor(0xFF0B0C0E),
        surface: TokenColor(0xFF17191C),
        sheet: TokenColor(0xFF1A1C20),
        ink: TokenColor(0xFFF2F4F6),
        ink2: TokenColor(0xFFD6DADE),
        muted: TokenColor(0xFFA7AEB5),
        faint: TokenColor(0xFF80878F),
        line: TokenColor(0xFF25292D),
        outline: TokenColor(0xFF454B52),
        track: TokenColor(0xFF24272B),
        chip: TokenColor(0xFF1D2023),
        tonal: TokenColor(0xFF26375A),
        tint: TokenColor(0xFF7AA7FF),
        up: TokenColor(0xFFFF6B6B),
        down: TokenColor(0xFF34D17F),
        fullInk: TokenColor(0xFFFFE1E1),
        gS: TokenColor(0xFF19212B),
        gSInk: TokenColor(0xFFA8BDD4),
        gL: TokenColor(0xFF251F16),
        gLInk: TokenColor(0xFFF0BF7A),
        stall: TokenColor(0x52000000),
        wk: TokenColor(0xFF221819),
        band: TokenColor(0xFF121417),
        warnBg: TokenColor(0xFF33250C),
        warnInk: TokenColor(0xFFFFC76B),
        warnLine: TokenColor(0xFF6B4B12),
        scrim: TokenColor(0x8C000000),
        thumb: TokenColor(0xFF5B6067),
        bar: TokenColor(0xFF0B0C0E),
        widgetBg: TokenColor(0xFF1B2130)
    )

    public static func palette(_ theme: ThemeMode) -> ThemePalette { theme == .dark ? dark : light }

    /// 상단 줄 범례 그라데이션: 각 점유율의 tint를 차례로
    public static let legendStops: [Double] = [0.6, 0.7, 0.8, 0.86, 0.9, 0.925, 0.95, 0.975, 1.0]

    public static let shuttleRoutes: [String: ShuttleRouteColor] = [
        "01": ShuttleRouteColor(color: TokenColor(0xFF2F6FED), softLight: TokenColor(0xFFE6EEFD), softDark: TokenColor(0xFF1C3159)),
        "02": ShuttleRouteColor(color: TokenColor(0xFF12A150), softLight: TokenColor(0xFFE3F4EA), softDark: TokenColor(0xFF13402A)),
        "03": ShuttleRouteColor(color: TokenColor(0xFFE8870B), softLight: TokenColor(0xFFFCF1E2), softDark: TokenColor(0xFF543815)),
        "04": ShuttleRouteColor(color: TokenColor(0xFF7C4DFF), softLight: TokenColor(0xFFEFEAFF), softDark: TokenColor(0xFF33275E)),
        "05": ShuttleRouteColor(color: TokenColor(0xFF5F6670), softLight: TokenColor(0xFFECEDEE), softDark: TokenColor(0xFF2B2E33))
    ]

    /// 히스토리 구역별 선 색(순서 = 그룹 구역 순서)
    public static let series: [SeriesColor] = [
        SeriesColor(light: TokenColor(0xFF2F6FED), dark: TokenColor(0xFF7AA7FF)),
        SeriesColor(light: TokenColor(0xFF12A150), dark: TokenColor(0xFF34D17F)),
        SeriesColor(light: TokenColor(0xFFE8870B), dark: TokenColor(0xFFFFA94D)),
        SeriesColor(light: TokenColor(0xFF7C4DFF), dark: TokenColor(0xFFB197FC)),
        SeriesColor(light: TokenColor(0xFFD6336C), dark: TokenColor(0xFFF783AC)),
        SeriesColor(light: TokenColor(0xFF0B9FA8), dark: TokenColor(0xFF3BC9DB))
    ]

    public enum Spacing {
        public static let s4: Double = 4
        public static let s6: Double = 6
        public static let s8: Double = 8
        public static let s10: Double = 10
        public static let s12: Double = 12
        public static let s16: Double = 16
        public static let s20: Double = 20
    }

    public enum Radius {
        public static let slab: Double = 5
        public static let r6: Double = 6
        public static let r8: Double = 8
        public static let r10: Double = 10
        public static let r12: Double = 12
        public static let r14: Double = 14
        public static let r16: Double = 16
        public static let r20: Double = 20
        public static let pill: Double = 999
    }

    public static let segmentThumbShadow = Shadow(x: 0, y: 1, blur: 4, color: TokenColor(0x29000000))
    public static let sheetShadow = Shadow(x: 0, y: -8, blur: 30, color: TokenColor(0x2E000000))
}
