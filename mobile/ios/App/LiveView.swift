import ICNParkingCore
import SwiftUI

/// 실시간(디자인 5a/5c/5e/5g/5n): 총계 → 단기 층 건물(flex 1.3) → 장기·타워 배치(flex 1)
struct LiveView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        if let s = model.snapshot {
            let layout = Zones.layout(model.terminal)
            let total = s.group(.total(model.terminal))
            VStack(spacing: 0) {
                TotalHeader(terminal: model.terminal, group: total, unit: model.unit) { model.sheet = .total(model.terminal) }
                GeometryReader { geo in
                    let h = geo.size.height - 12
                    VStack(spacing: 12) {
                        ShortPanel(snapshot: s, layout: layout, unit: model.unit) { model.sheet = $0 }
                            .frame(height: h * 1.3 / 2.3)
                        LongPanel(snapshot: s, layout: layout, unit: model.unit) { model.sheet = $0 }
                            .frame(height: h / 2.3)
                    }
                }
            }
            .padding(.init(top: 6, leading: 16, bottom: 12, trailing: 16))
        }
    }
}

/// 숫자 또는 대신하는 말(운영 중단·확인 필요·만차, 0.78배 크기)
struct ValueText: View {
    @Environment(\.theme) private var theme
    let now: ZoneNow
    let unit: DisplayUnit
    let size: CGFloat
    let unitSize: CGFloat

    var body: some View {
        if let word = now.word {
            Text(word)
                .font(.system(size: (size * 0.78).rounded(), weight: .heavy))
                .foregroundStyle(now.isFull ? theme.p.fullInk.color : theme.p.muted.color)
                .lineLimit(1)
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(unit == .occupancy ? NumberText.percent(now.occupancy ?? 0) : NumberText.grouped(now.available ?? 0))
                    .font(.num(size, .heavy))
                    .tracking(-0.6)
                Text(unit == .occupancy ? Strings.Unit.percent : Strings.Unit.cars)
                    .font(.system(size: unitSize, weight: .semibold))
            }
            .lineLimit(1)
        }
    }
}

extension ZoneNow {
    var accessibility: String {
        let name = Zones.byId[id]?.name ?? id
        return word.map { Strings.Zone.a11yState(name: name, state: $0) } ?? Strings.Zone.a11yAvailable(name: name, cars: NumberText.grouped(available ?? 0))
    }
}

struct TotalHeader: View {
    @Environment(\.theme) private var theme
    let terminal: Terminal
    let group: GroupForecast
    let unit: DisplayUnit
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(alignment: .bottom, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(Strings.Live.totalTitle(terminal: terminal.rawValue))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(theme.p.muted.color)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(groupValue(group, unit))
                            .font(.num(44, .heavy))
                            .tracking(-1.5)
                        Text(unit == .occupancy ? Strings.Unit.percentUsed : Strings.Unit.carsLeft)
                            .font(.system(size: 16, weight: .bold))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let o = group.occupancy {
                    Text(OccupancyBand.of(o).label)
                        .font(.system(size: 13, weight: .bold))
                        .padding(.vertical, 6)
                        .padding(.horizontal, 12)
                        .background(Capsule().fill(theme.tint(o)))
                        .padding(.bottom, 3)
                }
            }
            .padding(.init(top: 4, leading: 2, bottom: 16, trailing: 2))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(Strings.Live.totalTitle(terminal: terminal.rawValue)), \(groupValue(group, unit))\(unit == .occupancy ? Strings.Unit.percentUsed : Strings.Unit.carsLeft)")
    }
}

func groupValue(_ g: GroupForecast, _ unit: DisplayUnit) -> String {
    guard let a = g.available, let o = g.occupancy else { return "—" }
    return unit == .occupancy ? NumberText.percent(o) : NumberText.grouped(a)
}

/// 그룹 패널 머리글: "단기주차장 213대 남음"
struct PanelHeader: View {
    @Environment(\.theme) private var theme
    let title: String
    let ink: Color
    let group: GroupForecast
    let unit: DisplayUnit
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) { label }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
    }

    private var label: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(title).font(.system(size: 13, weight: .bold)).foregroundStyle(ink)
            Text(groupValue(group, unit)).font(.num(16, .heavy)).tracking(-0.3)
            Text(unit == .occupancy ? Strings.Unit.percentUsed : Strings.Unit.carsLeft)
                .font(.system(size: 12, weight: .semibold)).foregroundStyle(theme.p.ink2.color)
        }
        .frame(maxWidth: .infinity)
        .padding(.init(top: 0, leading: 2, bottom: 4, trailing: 2))
        .contentShape(Rectangle())
    }
}

/// 기울인 슬래브(skewX −20°, 가운데 기준)
struct Slab: Shape {
    static let skew = tan(-20 * CGFloat.pi / 180)

    func path(in r: CGRect) -> Path {
        let k = Self.skew
        return RoundedRectangle(cornerRadius: 5).path(in: r).applying(CGAffineTransform(a: 1, b: 0, c: k, d: 1, tx: -k * r.midY, ty: 0))
    }
}

struct ShortPanel: View {
    @Environment(\.theme) private var theme
    let snapshot: ParkingSnapshot
    let layout: TerminalLayout
    let unit: DisplayUnit
    let onOpen: (SheetTarget) -> Void

    var body: some View {
        let compact = layout.floors.count >= 5
        let terminal = Zones.byId[layout.floors[0]]!.terminal
        VStack(spacing: 6) {
            PanelHeader(title: Strings.Live.groupShort, ink: theme.p.gSInk.color, group: snapshot.group(.group(terminal, .short)), unit: unit) { onOpen(.group(terminal, .short)) }
            ForEach(layout.floors, id: \.self) { id in
                FloorRow(now: snapshot.zoneNow(id), compact: compact, unit: unit) { onOpen(.zone(id)) }
                if id == layout.groundAfter { GroundLine() }
            }
        }
        .padding(.init(top: 8, leading: 10, bottom: 10, trailing: 10))
        .background(RoundedRectangle(cornerRadius: 20).fill(theme.p.gS.color))
    }
}

struct FloorRow: View {
    @Environment(\.theme) private var theme
    let now: ZoneNow
    let compact: Bool
    let unit: DisplayUnit
    let onOpen: () -> Void

    var body: some View {
        let thick: CGFloat = compact ? 5 : 6
        let top = now.dead ? theme.p.chip.color : theme.tint(now.occupancy ?? 0)
        let edge = now.dead ? theme.p.outline.color : theme.edge(now.occupancy ?? 0)
        Button(action: onOpen) {
            ZStack {
                Slab().fill(edge).offset(x: Slab.skew * thick, y: thick).padding(.bottom, thick).padding(.horizontal, 14)
                Slab().fill(top).padding(.bottom, thick).padding(.horizontal, 14)
                HStack(spacing: 12) {
                    Spacer(minLength: 0)
                    Text(Zones.byId[now.id]?.shortName ?? now.id)
                        .font(.system(size: compact ? 11.5 : 12.5, weight: .bold))
                        .foregroundStyle(theme.p.ink2.color)
                        .padding(.horizontal, 6)
                        .frame(minWidth: 40, minHeight: compact ? 20 : 24)
                        .background(Capsule().fill(theme.p.bg.color))
                        .frame(width: 56, alignment: .trailing)
                    ValueText(now: now, unit: unit, size: compact ? 19 : 24, unitSize: compact ? 12 : 14)
                        .frame(width: 112, alignment: .leading)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, thick)
            }
            .frame(maxHeight: .infinity)
            .frame(minHeight: compact ? 34 : 0)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(now.accessibility)
    }
}

struct LongPanel: View {
    @Environment(\.theme) private var theme
    let snapshot: ParkingSnapshot
    let layout: TerminalLayout
    let unit: DisplayUnit
    let onOpen: (SheetTarget) -> Void

    var body: some View {
        let terminal = Zones.byId[layout.reserved]!.terminal
        VStack(spacing: 6) {
            PanelHeader(title: Strings.Live.groupLong, ink: theme.p.gLInk.color, group: snapshot.group(.group(terminal, .long)), unit: unit) { onOpen(.group(terminal, .long)) }
            VStack(spacing: 8) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: 8) {
                        ForEach(row, id: \.id) { tile in
                            LongTile(now: snapshot.zoneNow(tile.id), unit: unit) { onOpen(.zone(tile.id)) }
                        }
                    }
                    .frame(maxHeight: .infinity)
                }
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 20).fill(theme.p.gL.color))
    }

    /// 2열 그리드 줄(span 2 = 한 줄 전체)
    private var rows: [[ZoneTile]] {
        var out: [[ZoneTile]] = [], current: [ZoneTile] = []
        for t in layout.tiles {
            current.append(t)
            if current.reduce(0, { $0 + $1.span }) >= 2 { out.append(current); current = [] }
        }
        if !current.isEmpty { out.append(current) }
        return out
    }
}

/// 장기 칸: 노면 = 주차칸 선, 타워 = 두께 있는 블록, 예약 = 바탕 + 외곽선
struct LongTile: View {
    @Environment(\.theme) private var theme
    let now: ZoneNow
    let unit: DisplayUnit
    let onOpen: () -> Void

    var body: some View {
        let category = Zones.byId[now.id]?.category ?? .long
        Button(action: onOpen) {
            HStack(spacing: 8) {
                Text(Zones.byId[now.id]?.shortName ?? now.id)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(theme.p.ink2.color)
                    .lineLimit(1)
                ValueText(now: now, unit: unit, size: 20, unitSize: 13)
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .foregroundStyle(now.dead && category != .reserved ? theme.p.muted.color : theme.p.ink.color)
            .background { background(category) }
            .padding(.bottom, category == .tower && !now.dead ? 5 : 0)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(now.accessibility)
    }

    @ViewBuilder
    private func background(_ category: ZoneCategory) -> some View {
        let o = now.occupancy ?? 0
        if category == .reserved {
            RoundedRectangle(cornerRadius: 8).fill(theme.p.bg.color)
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(theme.p.outline.color, lineWidth: 1.5))
        } else if now.dead {
            RoundedRectangle(cornerRadius: 8).fill(theme.p.chip.color)
        } else if category == .tower {
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(theme.edge(o)).offset(y: 5)
                RoundedRectangle(cornerRadius: 8).fill(theme.tint(o))
            }
        } else {
            RoundedRectangle(cornerRadius: 6).fill(theme.tint(o))
                .overlay(StallLines(color: theme.p.stall.color).clipShape(RoundedRectangle(cornerRadius: 6)))
        }
    }
}

/// 노면 주차장 위·아래 9px 띠의 주차칸 선(1.5px, 15px 간격)
struct StallLines: View {
    let color: Color

    var body: some View {
        Canvas { ctx, size in
            var x: CGFloat = 0
            while x < size.width {
                ctx.fill(Path(CGRect(x: x, y: 0, width: 1.5, height: 9)), with: .color(color))
                ctx.fill(Path(CGRect(x: x, y: size.height - 9, width: 1.5, height: 9)), with: .color(color))
                x += 15
            }
        }
        .allowsHitTesting(false)
    }
}
