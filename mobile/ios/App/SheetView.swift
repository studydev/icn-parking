import Charts
import ICNParkingCore
import SwiftUI

/// 상세 시트(디자인 5i): .sheet + detents(88%)
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
                        if !m.cells.isEmpty { cells(m).padding(.top, 12) }
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
        let maxY = max(1, ([m.actual, m.forecast, m.base].flatMap { $0 }.map(\.available).max() ?? 1) * 1.08)
        let nowY = m.forecast.first?.available ?? m.actual.last?.available
        return VStack(alignment: .leading, spacing: 8) {
            Chart {
                RuleMark(y: .value("0", 0)).foregroundStyle(theme.p.line.color).lineStyle(StrokeStyle(lineWidth: 1))
                RuleMark(x: .value("now", 0)).foregroundStyle(theme.p.faint.color).lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
                ForEach(m.base, id: \.offset) { p in
                    LineMark(x: .value("t", p.offset), y: .value("v", p.available), series: .value("s", "base"))
                        .foregroundStyle(theme.p.faint.color)
                        .lineStyle(StrokeStyle(lineWidth: 1.6, lineCap: .round, dash: [1, 4]))
                }
                ForEach(m.actual, id: \.offset) { p in
                    LineMark(x: .value("t", p.offset), y: .value("v", p.available), series: .value("s", "actual"))
                        .foregroundStyle(theme.p.ink.color)
                        .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                }
                ForEach(m.forecast, id: \.offset) { p in
                    LineMark(x: .value("t", p.offset), y: .value("v", p.available), series: .value("s", "forecast"))
                        .foregroundStyle(theme.p.tint.color)
                        .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                }
                if let nowY {
                    PointMark(x: .value("t", 0), y: .value("v", nowY))
                        .symbol { Circle().strokeBorder(theme.p.ink.color, lineWidth: 2).background(Circle().fill(theme.p.sheet.color)).frame(width: 9, height: 9) }
                }
            }
            .chartXScale(domain: -36...36)
            .chartYScale(domain: 0...maxY)
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .chartLegend(.hidden)
            .frame(height: 128)
            HStack {
                Text(m.startLabel).foregroundStyle(theme.p.faint.color)
                Spacer()
                Text(Strings.Sheet.nowMarker(time: m.nowLabel)).fontWeight(.semibold)
                Spacer()
                Text(m.endLabel).foregroundStyle(theme.p.faint.color)
            }
            .font(.num(10, .regular))
            legend(m)
        }
        .padding(.init(top: 12, leading: 12, bottom: 6, trailing: 12))
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

    private func cells(_ m: SheetModel) -> some View {
        let now = m.nowPair
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 6) {
            ForEach(m.cells, id: \.time) { cell in
                let d = now.map { NumberText.round(cell.value.available) - NumberText.round($0.available) } ?? 0
                VStack(alignment: .leading, spacing: 2) {
                    Text(cell.time.label).font(.num(11.5, .regular)).foregroundStyle(theme.p.ink2.color)
                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        Text(NumberText.grouped(cell.value.available)).font(.num(20, .bold))
                        Text(Strings.Unit.cars).font(.system(size: 13, weight: .semibold))
                    }
                    Text(NumberText.delta(d)).font(.num(12, .bold)).foregroundStyle(theme.deltaColor(d))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.init(top: 10, leading: 10, bottom: 9, trailing: 10))
                .background(RoundedRectangle(cornerRadius: 10).fill(theme.tint(cell.value.occupancy)))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Strings.Forecast.a11yCell(time: cell.time.label, cars: NumberText.grouped(cell.value.available), change: NumberText.change(d)))
            }
        }
    }
}

extension SheetModel {
    /// 숫자를 보여 줄 수 없을 때 말(구역: 운영 중단·확인 필요)
    static func word(for target: SheetTarget, in snapshot: ParkingSnapshot?) -> String {
        if case .zone(let id) = target, let w = snapshot?.zoneNow(id).word { return w }
        return Strings.Zone.missing
    }
}
