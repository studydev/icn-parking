import ICNParkingCore
import SwiftUI

/// 예측(디자인 5d/5f/5h/5k/5o): 열 50 | 1.15fr | 1fr×6, 간격 3, 행 높이 최대 52
struct ForecastView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        if let s = model.snapshot {
            let table = ForecastTable(s, terminal: model.terminal)
            GeometryReader { geo in
                let cols = Columns(width: geo.size.width)
                let rowCount = table.items.filter { if case .row = $0 { return true } else { return false } }.count
                let labelCount = table.items.count - rowCount
                let rowHeight = min(52, max(30, (geo.size.height - 26 - CGFloat(labelCount) * 32 - 2) / CGFloat(rowCount)))
                VStack(spacing: 0) {
                    header(table, cols)
                    ForEach(table.items) { item in
                        switch item {
                        case .label(let text):
                            Text(text)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(theme.p.ink2.color)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.init(top: 12, leading: 2, bottom: 4, trailing: 2))
                        case .row(let row):
                            ForecastRowView(row: row, times: table.times, cols: cols, unit: model.unit, showDelta: model.settings.showDelta)
                                .frame(height: rowHeight)
                                .padding(.bottom, row.isTotal ? 2 : 0)
                                .contentShape(Rectangle())
                                .onTapGesture { model.sheet = row.target }
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
            .padding(.init(top: 6, leading: 16, bottom: 12, trailing: 16))
        }
    }

    private func header(_ table: ForecastTable, _ cols: Columns) -> some View {
        HStack(spacing: Columns.gap) {
            Color.clear.frame(width: cols.name)
            Text(Strings.Forecast.now).font(.system(size: 12, weight: .heavy)).foregroundStyle(theme.p.ink.color).frame(width: cols.now)
            ForEach(table.times, id: \.self) { t in
                Text(t.label).frame(width: cols.cell)
            }
        }
        .font(.num(12, .semibold))
        .foregroundStyle(theme.p.muted.color)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .frame(height: 26)
    }
}

/// 열 너비: 50 | 1.15fr | 1fr × 6, 간격 3
struct Columns {
    static let gap: CGFloat = 3
    let name: CGFloat = 50
    let now: CGFloat
    let cell: CGFloat

    init(width: CGFloat) {
        let unit = max(0, width - 50 - Self.gap * 7) / 7.15
        now = unit * 1.15
        cell = unit
    }
}

struct ForecastRowView: View {
    @Environment(\.theme) private var theme
    let row: ForecastRow
    let times: [SlotTime]
    let cols: Columns
    let unit: DisplayUnit
    let showDelta: Bool

    var body: some View {
        let occ = unit == .occupancy
        HStack(spacing: Columns.gap) {
            Text(row.name)
                .font(.system(size: row.isTotal ? 13.5 : 12.5, weight: row.isTotal ? .heavy : .semibold))
                .foregroundStyle(theme.p.ink2.color)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.leading, 4)
                .frame(width: cols.name, alignment: .leading)
            nowCell(occ: occ)
            if let reason = row.reason {
                Text(reason.text)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(theme.p.muted.color)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(RoundedRectangle(cornerRadius: 6).fill(theme.p.chip.color))
                    .accessibilityLabel(reason.text)
            } else if let now = row.now {
                ForEach(Array(zip(times, row.cells).enumerated()), id: \.offset) { _, pair in
                    let (time, cell) = pair
                    let d = cell.delta(from: now, unit)
                    VStack(spacing: 1) {
                        Text(cell.text(unit)).font(.num(occ ? 12.5 : 13.5, .bold)).tracking(-0.4)
                        if showDelta { Text(NumberText.delta(d)).font(.num(9.5, .bold)).foregroundStyle(theme.deltaColor(d)) }
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(width: cols.cell)
                    .frame(maxHeight: .infinity)
                    .background(RoundedRectangle(cornerRadius: 6).fill(theme.tint(cell.occupancy)))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Strings.Forecast.a11yCell(time: time.label, cars: NumberText.grouped(cell.available),
                                                                  change: NumberText.change(NumberText.round(cell.available) - NumberText.round(now.available))))
                }
            }
        }
        .padding(.vertical, 1.5)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(row.name)
    }

    @ViewBuilder
    private func nowCell(occ: Bool) -> some View {
        let dead = row.now == nil
        Text(row.now?.text(unit) ?? "—")
            .font(.num(occ ? 13.5 : 14.5, .heavy))
            .tracking(-0.5)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .foregroundStyle(dead ? theme.p.muted.color : theme.p.ink.color)
            .frame(width: cols.now)
            .frame(maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 6).fill(dead ? theme.p.chip.color : theme.tint(row.now!.occupancy)))
            .accessibilityLabel(row.now.map { Strings.Forecast.a11yNow(cars: NumberText.grouped($0.available)) } ?? (row.reason?.text ?? ""))
    }
}
