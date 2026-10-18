import ICNParkingCore
import SwiftUI

/// 상세 시트(디자인 5i): .sheet + detents(88%). 그래프 = 지난 2시간 실측 + 6시간 예상(30분 점마다 숫자), 아래 = 시간대별 세로 표
struct SheetView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let target: SheetTarget

    var body: some View {
        if let s = model.snapshot {
            let m = SheetModel(s, target: target)
            VStack(spacing: 0) {
                HStack(alignment: .top, spacing: 4) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(m.kicker).font(.system(size: 12.5)).foregroundStyle(theme.p.muted.color)
                        Text(m.name).font(.system(size: 22, weight: .bold)).tracking(-0.3)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Button(Strings.Sheet.close) { dismiss() }
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(theme.p.tint.color)
                        .frame(height: 36)
                        .padding(.horizontal, 8)
                }
                .padding(.init(top: 18, leading: 20, bottom: 0, trailing: 12))
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        summary(m)
                        graph(m).padding(.top, 14)
                        Text(m.explain)
                            .font(.system(size: 13))
                            .lineSpacing(3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.init(top: 12, leading: 14, bottom: 12, trailing: 14))
                            .background(RoundedRectangle(cornerRadius: 10).fill(theme.p.chip.color))
                            .padding(.top, 12)
                        TimelineTable(timeline: m.timeline) { model.sheet = $0 }
                            .padding(.top, 18)
                        Text(m.footer(model.freshness?.text ?? ""))
                            .font(.system(size: 12))
                            .foregroundStyle(theme.p.faint.color)
                            .lineSpacing(2)
                            .padding(.top, 12)
                    }
                    .padding(.init(top: 6, leading: 20, bottom: 40, trailing: 20))
                }
            }
            .foregroundStyle(theme.p.ink.color)
        }
    }

    private func summary(_ m: SheetModel) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(Strings.Sheet.remaining).font(.system(size: 13)).foregroundStyle(theme.p.muted.color)
            if let a = m.available {
                Text(NumberText.grouped(a)).font(.num(30, .bold)).tracking(-0.6)
            } else {
                Text(SheetModel.word(for: target, in: model.snapshot)).font(.system(size: 22, weight: .bold)).foregroundStyle(theme.p.muted.color)
            }
            Text(Strings.Sheet.ofTotal(cars: NumberText.grouped(m.capacity))).font(.num(14, .regular)).foregroundStyle(theme.p.muted.color)
            Spacer(minLength: 4)
            if let o = m.occupancy {
                Text(Strings.Sheet.bandPercent(band: OccupancyBand.of(o).label, percent: NumberText.percent(o))).font(.system(size: 13, weight: .semibold))
            }
        }
    }

    private func graph(_ m: SheetModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SheetGraph(model: m)
                .frame(height: 176)
            legend(m)
        }
        .padding(.init(top: 12, leading: 12, bottom: 8, trailing: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(theme.p.line.color, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(graphLabel(m))
    }

    private func graphLabel(_ m: SheetModel) -> String {
        guard let now = m.available else { return m.explain }
        guard let later = m.forecast.last?.available else { return Strings.Forecast.a11yNow(cars: NumberText.grouped(now)) }
        return Strings.Sheet.a11yGraph(now: NumberText.grouped(now), later: NumberText.grouped(later))
    }

    private func legend(_ m: SheetModel) -> some View {
        HStack(spacing: 14) {
            legendItem(Strings.Sheet.legendActual, theme.p.ink.color, dotted: false)
            if !m.forecast.isEmpty { legendItem(Strings.Sheet.legendForecast, theme.p.tint.color, dotted: false) }
            if !m.base.isEmpty { legendItem(Strings.Sheet.legendLastWeek, theme.p.faint.color, dotted: true) }
        }
        .font(.system(size: 11.5))
        .foregroundStyle(theme.p.muted.color)
    }

    private func legendItem(_ text: String, _ color: Color, dotted: Bool) -> some View {
        HStack(spacing: 5) {
            Path { p in p.move(to: .init(x: 0, y: 1)); p.addLine(to: .init(x: 14, y: 1)) }
                .stroke(color, style: StrokeStyle(lineWidth: 2, dash: dotted ? [2, 2] : []))
                .frame(width: 14, height: 2)
            Text(text)
        }
    }
}

/// −2시간 … +6시간 그래프. 30분 점마다 남은 대수(위·아래 번갈아 두어 겹치지 않게)
struct SheetGraph: View {
    @Environment(\.theme) private var theme
    let model: SheetModel

    var body: some View {
        let m = model
        let values = (m.actual + m.forecast + m.base).map(\.available)
        let maxY = max(1, (values.max() ?? 1) * 1.12)
        Canvas { ctx, size in
            let top: CGFloat = 16, bottom: CGFloat = 36
            let plotH = size.height - top - bottom
            let x = { (o: Int) in CGFloat(o + 24) / 96 * (size.width - 24) + 12 }
            let y = { (v: Double) in top + plotH * (1 - CGFloat(v / maxY)) }
            func line(_ pts: [SeriesPoint]) -> Path {
                Path { p in for (i, pt) in pts.enumerated() { i == 0 ? p.move(to: .init(x: x(pt.offset), y: y(pt.available))) : p.addLine(to: .init(x: x(pt.offset), y: y(pt.available))) } }
            }
            ctx.stroke(Path { p in p.move(to: .init(x: 0, y: top + plotH)); p.addLine(to: .init(x: size.width, y: top + plotH)) }, with: .color(theme.p.line.color), lineWidth: 1)
            ctx.stroke(Path { p in p.move(to: .init(x: x(0), y: 2)); p.addLine(to: .init(x: x(0), y: top + plotH)) },
                       with: .color(theme.p.faint.color), style: StrokeStyle(lineWidth: 1, dash: [2, 3]))
            if !m.base.isEmpty {
                ctx.stroke(line(m.base), with: .color(theme.p.faint.color), style: StrokeStyle(lineWidth: 1.6, lineCap: .round, dash: [1, 4]))
            }
            ctx.stroke(line(m.actual), with: .color(theme.p.ink.color), style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
            if !m.forecast.isEmpty {
                ctx.stroke(line(m.forecast), with: .color(theme.p.tint.color), style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
            }
            // 점 + 숫자: 실측(ink) → 예상(tint), 지금 점은 한 번만
            let labeled = m.actual.filter { $0.offset != 0 }.map { ($0, theme.p.ink.color) }
                + (m.forecast.isEmpty ? m.actual.filter { $0.offset == 0 } : m.forecast).map { ($0, $0.offset == 0 ? theme.p.ink.color : theme.p.tint.color) }
            for (i, (pt, color)) in labeled.enumerated() {
                let c = CGPoint(x: x(pt.offset), y: y(pt.available))
                let r: CGFloat = pt.offset == 0 ? 4.5 : 2.6
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)), with: .color(pt.offset == 0 ? theme.p.sheet.color : color))
                if pt.offset == 0 { ctx.stroke(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)), with: .color(color), lineWidth: 2) }
                let above = i % 2 == 0
                let text = Text(NumberText.grouped(pt.available)).font(.num(pt.offset == 0 ? 11 : 9.5, pt.offset == 0 ? .heavy : .semibold)).foregroundColor(color)
                ctx.draw(text, at: CGPoint(x: c.x, y: above ? c.y - 7 : c.y + 7), anchor: above ? .bottom : .top)
            }
            // 시각 축: "지금" 먼저 놓고, 그와 겹치는 정시 칸은 건너뛴다
            var taken: [ClosedRange<CGFloat>] = []
            for a in m.axis.sorted(by: { $0.isNow && !$1.isNow }) {
                let text = ctx.resolve(Text(a.label).font(.num(10, a.isNow ? .semibold : .regular)).foregroundColor(a.isNow ? theme.p.ink.color : theme.p.faint.color))
                let w = text.measure(in: size).width
                let cx = min(max(x(a.offset), w / 2), size.width - w / 2)
                let span = (cx - w / 2 - 4)...(cx + w / 2 + 4)
                if taken.contains(where: { $0.overlaps(span) }) { continue }
                taken.append(span)
                ctx.draw(text, at: CGPoint(x: cx, y: size.height - 14), anchor: .center)
            }
        }
    }
}

/// 시간대별 세로 표: 왼쪽 = 시간 흐름(셔틀 정차 순서처럼 레일), 오른쪽 = 선택한 곳이 앞에 오는 주차장 열
struct TimelineTable: View {
    @Environment(\.theme) private var theme
    let timeline: SheetTimeline
    let onSelect: (SheetTarget) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(Strings.Sheet.timelineTitle).font(.system(size: 13, weight: .bold))
            Text(Strings.Sheet.timelineNote).font(.system(size: 11)).foregroundStyle(theme.p.muted.color).padding(.top, 2)
            HStack(spacing: 4) {
                Color.clear.frame(width: 70)
                ForEach(timeline.columns, id: \.target) { col in
                    Button { if !col.selected { onSelect(col.target) } } label: {
                        Text(col.name)
                            .font(.system(size: 12, weight: col.selected ? .heavy : .semibold))
                            .foregroundStyle(col.selected ? theme.p.ink.color : theme.p.muted.color)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.init(top: 10, leading: 0, bottom: 4, trailing: 0))
            ForEach(Array(timeline.rows.enumerated()), id: \.offset) { i, row in
                HStack(spacing: 4) {
                    rail(index: i, row: row)
                    ForEach(Array(timeline.columns.enumerated()), id: \.offset) { c, col in
                        cell(row.values[c], selected: col.selected)
                            .onTapGesture { if !col.selected { onSelect(col.target) } }
                    }
                }
                .frame(height: 34)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(rowLabel(row))
            }
        }
    }

    private func rail(index: Int, row: TimelineRow) -> some View {
        HStack(spacing: 8) {
            ZStack {
                Path { p in
                    p.move(to: .init(x: 10, y: index == 0 ? 17 : 0))
                    p.addLine(to: .init(x: 10, y: index == timeline.rows.count - 1 ? 17 : 34))
                }
                .stroke(theme.p.tint.color, lineWidth: 2)
                Circle()
                    .strokeBorder(theme.p.tint.color, lineWidth: 2.5)
                    .background(Circle().fill(row.isNow ? theme.p.tint.color : theme.p.sheet.color))
                    .frame(width: 11, height: 11)
                    .position(x: 10, y: 17)
            }
            .frame(width: 20, height: 34)
            Text(row.isNow ? Strings.Forecast.now : row.time.label)
                .font(.num(12.5, row.isNow ? .heavy : .semibold))
                .foregroundStyle(row.isNow ? theme.p.ink.color : theme.p.ink2.color)
                .frame(width: 42, alignment: .leading)
        }
        .frame(width: 70, alignment: .leading)
    }

    @ViewBuilder
    private func cell(_ v: ValuePair?, selected: Bool) -> some View {
        if let v {
            Text(NumberText.grouped(v.available))
                .font(.num(selected ? 14 : 12.5, selected ? .heavy : .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(RoundedRectangle(cornerRadius: 6).fill(theme.tint(v.occupancy)))
                .overlay { if selected { RoundedRectangle(cornerRadius: 6).strokeBorder(theme.p.ink.color.opacity(0.55), lineWidth: 1.5) } }
                .padding(.vertical, 2)
        } else {
            Text("—")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(theme.p.muted.color)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(RoundedRectangle(cornerRadius: 6).fill(theme.p.chip.color))
                .padding(.vertical, 2)
        }
    }

    private func rowLabel(_ row: TimelineRow) -> String {
        let time = row.isNow ? Strings.Forecast.now : row.time.label
        let parts = zip(timeline.columns, row.values).map { col, v in "\(col.name) \(v.map { NumberText.grouped($0.available) + Strings.Unit.cars } ?? "—")" }
        return ([time] + parts).joined(separator: ", ")
    }
}

extension SheetModel {
    /// 숫자를 보여 줄 수 없을 때 말(구역: 운영 중단·확인 필요)
    static func word(for target: SheetTarget, in snapshot: ParkingSnapshot?) -> String {
        if case .zone(let id) = target, let w = snapshot?.zoneNow(id).word { return w }
        return Strings.Zone.missing
    }
}
