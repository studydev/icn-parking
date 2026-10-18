import ICNParkingCore
import SwiftUI

/// 히스토리(디자인 5p/5q): 기간·그룹 → 구역 칩 → 그래프 → 요약 → 일별 표
struct HistoryView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        @Bindable var model = model
        if let s = model.snapshot {
            let ids = Self.zoneIds(model.terminal, model.historyGroup)
            let h = HistoryModel(days: s.days, zoneIds: ids, now: s.now, nDays: model.historyDays, holidays: s.holidays)
            let focus = h.lines.first { $0.id == model.historyFocus } ?? h.lines[0]
            let colors = Self.colors(ids, theme)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Segmented(items: [7, 14, 30].map { ($0, Strings.History.days(count: "\($0)")) }, selection: $model.historyDays)
                        Spacer(minLength: 8)
                        Segmented(items: [(ZoneGroup.short, Strings.History.groupShort), (.long, Strings.History.groupLong), (.reserved, Strings.History.groupReserved)],
                                  selection: $model.historyGroup)
                    }
                    .padding(.init(top: 2, leading: 0, bottom: 10, trailing: 0))
                    if h.lines.count > 1 {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(h.lines) { line in chip(line, selected: line.id == focus.id, color: colors[line.id] ?? theme.p.ink.color) }
                            }
                        }
                        .padding(.bottom, 8)
                    }
                    HistoryChart(model: h, focusId: focus.id, unit: model.unit, nDays: model.historyDays, label: summaryText(focus, unit: model.unit), colors: colors)
                    summary(focus, unit: model.unit)
                    heatTable(h, focusId: focus.id, unit: model.unit, colors: colors)
                }
                .padding(.init(top: 6, leading: 16, bottom: 12, trailing: 16))
            }
            .task(id: model.historyDays) { await model.loadHistory() }
        }
    }

    static func zoneIds(_ t: Terminal, _ g: ZoneGroup) -> [String] { Zones.layout(t).ids(g) }

    /// 구역별 선 색(토큰 series, 그룹 구역 순서). 그룹 전체 = ink
    static func colors(_ ids: [String], _ theme: Theme) -> [String: Color] {
        var out = [HistoryModel.allId: theme.p.ink.color]
        for (i, id) in ids.enumerated() { out[id] = Tokens.series[i % Tokens.series.count].color(theme.mode).color }
        return out
    }

    static func name(_ id: String) -> String { id == HistoryModel.allId ? Strings.History.all : Zones.byId[id]?.shortName ?? id }

    private func chip(_ line: HistoryModel.Line, selected: Bool, color: Color) -> some View {
        Button { model.historyFocus = line.id } label: {
            HStack(spacing: 5) {
                Circle().fill(color).frame(width: 8, height: 8)
                    .overlay(Circle().strokeBorder(theme.p.bg.color.opacity(selected ? 0.9 : 0), lineWidth: 1))
                Text(Self.name(line.id))
            }
                .font(.system(size: 12.5, weight: .bold))
                .foregroundStyle(selected ? theme.p.bg.color : theme.p.ink2.color)
                .padding(.horizontal, 12)
                .frame(height: 30)
                .background(Capsule().fill(selected ? theme.p.ink.color : theme.p.chip.color))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func summaryText(_ line: HistoryModel.Line, unit: DisplayUnit) -> String {
        let name = Self.name(line.id)
        guard let st = line.stats else { return model.loadingHistory ? Strings.Meta.loading : Strings.History.noData }
        return unit == .occupancy
            ? Strings.History.summaryOccupancy(name: name, average: NumberText.percent(st.averageOccupancy), max: NumberText.percent(st.maxOccupancy), fullHours: "\(st.fullHours)")
            : Strings.History.summaryAvailable(name: name, average: NumberText.grouped(st.averageAvailable), min: NumberText.grouped(st.minAvailable), fullHours: "\(st.fullHours)")
    }

    private func summary(_ line: HistoryModel.Line, unit: DisplayUnit) -> some View {
        Text(summaryText(line, unit: unit))
            .font(.num(12.5, .semibold))
            .foregroundStyle(theme.p.ink2.color)
            .padding(.init(top: 6, leading: 2, bottom: 0, trailing: 2))
    }

    private func heatTable(_ h: HistoryModel, focusId: String, unit: DisplayUnit, colors: [String: Color]) -> some View {
        let n = h.dates.count, gap: CGFloat = n > 14 ? 1 : 2
        return VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(unit == .occupancy ? Strings.History.dailyMaxOccupancy : Strings.History.dailyMinAvailable).font(.system(size: 13, weight: .bold))
                Spacer(minLength: 8)
                Text(Strings.History.dailyRange(from: NumberText.monthDay(h.dates.first!.date), to: NumberText.monthDay(h.dates.last!.date)))
                    .font(.system(size: 11)).foregroundStyle(theme.p.muted.color)
            }
            .padding(.init(top: 18, leading: 2, bottom: 6, trailing: 2))
            HStack(spacing: gap) {
                Color.clear.frame(width: 46)
                ForEach(Array(h.dates.enumerated()), id: \.offset) { i, d in
                    Text(n <= 14 || (n - 1 - i) % 5 == 0 ? String(Int(d.date.suffix(2))!) : "")
                        .font(.num(n > 7 ? 9.5 : 10.5, .semibold))
                        .foregroundStyle(d.red ? theme.p.up.color : theme.p.muted.color)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 16)
            ForEach(h.lines) { line in
                Button { model.historyFocus = line.id } label: {
                    HStack(spacing: gap) {
                        Text(Self.name(line.id))
                            .font(.system(size: 12, weight: line.id == focusId ? .heavy : .semibold))
                            .foregroundStyle((colors[line.id] ?? theme.p.ink.color).opacity(line.id == focusId ? 1 : 0.75))
                            .lineLimit(1)
                            .frame(width: 46, alignment: .leading)
                        ForEach(Array(line.daily.enumerated()), id: \.offset) { i, d in
                            Text(n == 7 ? d.map { unit == .occupancy ? NumberText.percent($0.maxOccupancy) : NumberText.plain($0.minAvailable) } ?? "" : "")
                                .font(.num(10.5, .bold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(RoundedRectangle(cornerRadius: n > 14 ? 2 : 4).fill(d.map { theme.tint($0.maxOccupancy) } ?? theme.p.chip.color))
                                .accessibilityLabel(d.map { v in
                                    let date = NumberText.monthDay(h.dates[i].date)
                                    return unit == .occupancy ? Strings.History.a11yCellOccupancy(date: date, percent: NumberText.percent(v.maxOccupancy))
                                        : Strings.History.a11yCellAvailable(date: date, cars: NumberText.grouped(v.minAvailable))
                                } ?? Strings.History.noData)
                        }
                    }
                    .frame(height: 24)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, 3)
            }
        }
    }
}

/// 디자인 좌표(334×184, 플롯 x 30~330 · y 8~176)를 폭에 맞춰 그린다
struct HistoryChart: View {
    @Environment(\.theme) private var theme
    let model: HistoryModel
    let focusId: String
    let unit: DisplayUnit
    let nDays: Int
    /// 그래프 대신 읽어 줄 요약
    let label: String
    /// 선 색(HistoryView.colors)
    let colors: [String: Color]

    private static let x0: CGFloat = 30, x1: CGFloat = 330, y0: CGFloat = 8, y1: CGFloat = 176

    var body: some View {
        let n = model.points.count - 1
        let occ = unit == .occupancy
        let ymax: Double = occ ? 100 : Self.nice(model.lines.flatMap { $0.values.compactMap { $0?.available } }.max() ?? 1)
        let segments = daySegments()
        VStack(spacing: 0) {
            GeometryReader { geo in
                let sx = geo.size.width / 334, sy = geo.size.height / 184
                let X = { (k: Int) in (Self.x0 + (Self.x1 - Self.x0) * CGFloat(k) / CGFloat(n)) * sx }
                let Y = { (v: Double) in (Self.y1 - (Self.y1 - Self.y0) * CGFloat(v / ymax)) * sy }
                ZStack(alignment: .topLeading) {
                    Canvas { ctx, _ in
                        for (i, seg) in segments.enumerated() where seg.red || i % 2 == 1 {
                            let r = CGRect(x: X(seg.a), y: Self.y0 * sy, width: X(seg.b) - X(seg.a), height: (Self.y1 - Self.y0) * sy)
                            ctx.fill(Path(r), with: .color(seg.red ? theme.p.wk.color : theme.p.band.color))
                        }
                        for f in [0, 0.5, 1.0] {
                            ctx.stroke(line(Self.x0 * sx, Y(ymax * f), Self.x1 * sx, Y(ymax * f)), with: .color(theme.p.line.color), lineWidth: 1)
                        }
                        if occ {
                            ctx.stroke(line(Self.x0 * sx, Y(98), Self.x1 * sx, Y(98)), with: .color(theme.p.up.color), style: StrokeStyle(lineWidth: 1.2, dash: [4, 3]))
                        }
                        // 강조 선은 굵게, 나머지는 같은 색으로 가늘고 옅게(전체 강조일 때는 구역 선을 또렷하게)
                        let allFocused = focusId == HistoryModel.allId
                        for l in model.lines where l.id != focusId {
                            let color = colors[l.id] ?? theme.p.faint.color
                            ctx.stroke(path(l, X, Y, occ), with: .color(color.opacity(allFocused ? 0.85 : 0.4)), style: StrokeStyle(lineWidth: 1.3, lineJoin: .round))
                        }
                        if let f = model.lines.first(where: { $0.id == focusId }) {
                            ctx.stroke(path(f, X, Y, occ), with: .color(colors[f.id] ?? theme.p.ink.color), style: StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
                        }
                        ctx.stroke(line(Self.x1 * sx, Self.y0 * sy, Self.x1 * sx, Self.y1 * sy), with: .color(theme.p.ink.color), lineWidth: 1.2)
                    }
                    ForEach([0, 0.5, 1.0], id: \.self) { f in
                        Text(occ ? "\(Int(100 * f))%" : NumberText.grouped(ymax * f))
                            .font(.num(10, .regular))
                            .foregroundStyle(theme.p.faint.color)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .frame(width: 27 * sx, alignment: .trailing)
                            .position(x: 13.5 * sx, y: Y(ymax * f))
                    }
                    Text(Strings.History.now)
                        .font(.system(size: 10.5, weight: .bold))
                        .foregroundStyle(theme.p.bg.color)
                        .padding(.init(top: 2, leading: 6, bottom: 2, trailing: 6))
                        .background(RoundedRectangle(cornerRadius: 4).fill(theme.p.ink.color))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.init(top: 10, leading: 0, bottom: 0, trailing: 6))
                }
            }
            .aspectRatio(334 / 184, contentMode: .fit)
            GeometryReader { geo in
                let sx = geo.size.width / 334
                let every = nDays >= 30 ? 5 : 1
                ForEach(Array(segments.enumerated()), id: \.offset) { i, seg in
                    // 첫 구간(앞날 일부)과 반나절보다 짧은 구간(오늘 이른 시각)은 라벨이 겹치므로 생략
                    if i > 0 && (segments.count - 1 - i) % every == 0 && seg.b - seg.a >= 12 {
                        Text(nDays == 7 ? NumberText.monthDay(seg.date) : String(Int(seg.date.suffix(2))!))
                            .font(.num(10.5, .semibold))
                            .foregroundStyle(seg.red ? theme.p.up.color : theme.p.muted.color)
                            .fixedSize()
                            .position(x: (Self.x0 + (Self.x1 - Self.x0) * CGFloat(seg.a + seg.b) / 2 / CGFloat(n)) * sx, y: 9)
                    }
                }
            }
            .frame(height: 18)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    struct Segment { let date: String; let a: Int; let b: Int; let red: Bool }

    /// 날짜별 x 구간(주말·공휴일 = red)
    private func daySegments() -> [Segment] {
        let red = Dictionary(uniqueKeysWithValues: model.dates.map { ($0.date, $0.red) })
        var out: [Segment] = []
        var start = 0
        for k in 1...model.points.count {
            if k == model.points.count || model.points[k].date != model.points[start].date {
                let d = model.points[start].date
                let w = LocalDate.weekday(d)
                out.append(Segment(date: d, a: start, b: min(k, model.points.count - 1), red: red[d] ?? (w == 0 || w == 6)))
                start = k
            }
        }
        return out
    }

    private func line(_ ax: CGFloat, _ ay: CGFloat, _ bx: CGFloat, _ by: CGFloat) -> Path {
        Path { p in p.move(to: .init(x: ax, y: ay)); p.addLine(to: .init(x: bx, y: by)) }
    }

    /// 30일은 2시간 간격 점. 값이 없으면 선을 끊는다
    private func path(_ l: HistoryModel.Line, _ X: (Int) -> CGFloat, _ Y: (Double) -> CGFloat, _ occ: Bool) -> Path {
        let n = l.values.count - 1, step = nDays >= 30 ? 2 : 1
        var p = Path(), drawing = false
        for (k, v) in l.values.enumerated() where k % step == 0 || k == n {
            guard let v else { drawing = false; continue }
            let pt = CGPoint(x: X(k), y: Y(occ ? v.occupancy * 100 : v.available))
            if drawing { p.addLine(to: pt) } else { p.move(to: pt); drawing = true }
        }
        return p
    }

    static func nice(_ v: Double) -> Double {
        let p = pow(10, floor(log10(max(v, 1))))
        return ceil(v / p) * p
    }
}
