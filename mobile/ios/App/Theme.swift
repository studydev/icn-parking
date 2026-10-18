import ICNParkingCore
import SwiftUI

extension TokenColor {
    var color: Color { Color(.sRGB, red: red, green: green, blue: blue, opacity: alpha) }
}

/// README 토큰표(라이트/다크). 화면은 이 값만 쓴다.
struct Theme: Sendable {
    let mode: ThemeMode
    var p: ThemePalette { Tokens.palette(mode) }

    func tint(_ occupancy: Double) -> Color { OccupancyBand.of(occupancy).tint(mode).color }
    func edge(_ occupancy: Double) -> Color { OccupancyBand.of(occupancy).edge(mode).color }
    func deltaColor(_ d: Int) -> Color { d > 0 ? p.up.color : d < 0 ? p.down.color : p.muted.color }
}

private struct ThemeKey: EnvironmentKey {
    static let defaultValue = Theme(mode: .light)
}

extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

extension Font {
    /// 디자인 숫자는 tabular
    static func num(_ size: CGFloat, _ weight: Font.Weight) -> Font { .system(size: size, weight: weight).monospacedDigit() }
}

/// 글자 크기 설정을 따르는 글꼴(README Accessibility: 헤더·목록·설정만 확대, 표·배치도는 고정)
struct ScaledFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    let weight: Font.Weight
    let tabular: Bool

    init(size: CGFloat, weight: Font.Weight, tabular: Bool, relativeTo: Font.TextStyle) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: relativeTo)
        self.weight = weight
        self.tabular = tabular
    }

    func body(content: Content) -> some View {
        content.font(tabular ? .system(size: size, weight: weight).monospacedDigit() : .system(size: size, weight: weight))
    }
}

extension View {
    func scaledFont(_ size: CGFloat, _ weight: Font.Weight = .regular, tabular: Bool = false, relativeTo: Font.TextStyle = .body) -> some View {
        modifier(ScaledFont(size: size, weight: weight, tabular: tabular, relativeTo: relativeTo))
    }
}

/// 디자인 iOS 세그먼트: 회색 트랙(r9, pad2) 안 선택 칸 흰색 + 그림자, 13/700, 높이 30
struct Segmented<Value: Hashable>: View {
    @Environment(\.theme) private var theme
    let items: [(Value, String)]
    @Binding var selection: Value
    var wide = false

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.0) { value, label in
                Button { selection = value } label: {
                    Text(label)
                        .font(.system(size: wide ? 14 : 13, weight: .bold))
                        .foregroundStyle(theme.p.ink.color)
                        .lineLimit(1)
                        .padding(.horizontal, wide ? 0 : 10)
                        .frame(maxWidth: wide ? .infinity : nil, minHeight: wide ? 32 : 30)
                        .background {
                            if selection == value {
                                RoundedRectangle(cornerRadius: 7).fill(theme.p.thumb.color)
                                    .shadow(color: Tokens.segmentThumbShadow.color.color, radius: Tokens.segmentThumbShadow.blur / 2, y: Tokens.segmentThumbShadow.y)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == value ? .isSelected : [])
            }
        }
        .padding(2)
        .background(RoundedRectangle(cornerRadius: 9).fill(theme.p.track.color))
    }
}

/// 상단 줄 범례: 여유 ▭ 만차
struct LegendScale: View {
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: 4) {
            Text(Strings.Meta.legendLow)
            LinearGradient(colors: Tokens.legendStops.map { theme.tint($0) }, startPoint: .leading, endPoint: .trailing)
                .frame(width: 36, height: 6)
                .clipShape(RoundedRectangle(cornerRadius: 3))
            Text(Strings.Meta.legendHigh)
        }
        .font(.system(size: 11, weight: .semibold))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Strings.Meta.legendA11y)
    }
}

/// 부드러운 가로 구분선(지면선)
struct GroundLine: View {
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: 8) {
            Rectangle().fill(theme.p.outline.color).frame(height: 2)
            Text(Strings.Zone.ground).font(.system(size: 10.5, weight: .bold)).foregroundStyle(theme.p.muted.color)
            Rectangle().fill(theme.p.outline.color).frame(height: 2)
        }
        .padding(.horizontal, 4)
        .accessibilityHidden(true)
    }
}
