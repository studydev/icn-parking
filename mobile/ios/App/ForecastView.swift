import ICNParkingCore
import SwiftUI

/// 예측(디자인 5d/5f/5h): 이름 | 지금은 고정, 30분 × 12칸(6시간)은 가로로 넘긴다. 행 높이 최대 52
struct ForecastView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    static let nameWidth: CGFloat = 50
    static let nowWidth: CGFloat = 62
    static let cellWidth: CGFloat = 48
    static let gap: CGFloat = 3
    static let headerHeight: CGFloat = 26
    static let labelHeight: CGFloat = 32

    var body: some View {
        if let s = model.snapshot {
            let table = ForecastTable(s, terminal: model.terminal)
            GeometryReader { geo in
                let rowCount = table.items.filter { if case .row = $0 { return true } else { return false } }.count
                let labelCount = table.items.count - rowCount
                let rowHeight = min(52, max(30, (geo.size.height - Self.headerHeight - CGFloat(labelCount) * Self.labelHeight - 2) / CGFloat(rowCount)))
                HStack(alignment: .top, spacing: Self.gap) {
                    fixedColumns(table, rowHeight: rowHeight)
                    ScrollView(.horizontal, showsIndicators: false) {
                        scrollingCells(table, rowHeight: rowHeight)
                    }
                }
            }
            .padding(.init(top: 6, leading: 16, bottom: 12, trailing: 16))
        }
    }

    /// 이름 · 지금(고정)
    private func fixedColumns(_ table: ForecastTable, rowHeight: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: Self.gap) {
                Color.clear.frame(width: Self.nameWidth)
                Text(Strings.Forecast.now).font(.system(size: 12, weight: .heavy)).frame(width: Self.nowWidth)
            }
            .frame(height: Self.headerHeight)
            ForEach(table.items) { item in
                switch item {
                case .label(let text):
                    Text(text)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(theme.p.ink2.color)
                        .lineLimit(1)
                        .fixedSize()
                        .padding(.init(top: 0, leading: 2, bottom: 4, trailing: 0))
                        .frame(width: Self.nameWidth + Self.gap + Self.nowWidth, height: Self.labelHeight, alignment: .bottomLeading)
                case .row(let row):
                    HStack(spacing: Self.gap) {
                        Text(row.name)
                            .font(.system(size: row.isTotal ? 13.5 : 12.5, weight: row.isTotal ? .heavy : .semibold))
                            .foregroundStyle(theme.p.ink2.color)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .padding(.leading, 4)
                            .frame(width: Self.nameWidth, alignment: .leading)
                        nowCell(row)
                    }
                    .padding(.vertical, 1.5)
                    .frame(height: rowHeight)
                    .padding(.bottom, row.isTotal ? 2 : 0)
                    .contentShape(Rectangle())
                    .onTapGesture { model.sheet = row.target }
                }
            }
        }
    }

    /// 30분 × 12칸(가로 스크롤)
    private func scrollingCells(_ table: ForecastTable, rowHeight: CGFloat) -> some View {
        let occ = model.unit == .occupancy
        let width = CGFloat(table.times.count) * (Self.cellWidth + Self.gap) - Self.gap
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: Self.gap) {
                ForEach(table.times, id: \.self) { t in Text(t.label).frame(width: Self.cellWidth) }
            }
            .font(.num(12, .semibold))
            .foregroundStyle(theme.p.muted.color)
            .frame(height: Self.headerHeight)
            ForEach(table.items) { item in
                switch item {
                case .label:
                    Color.clear.frame(width: width, height: Self.labelHeight)
                case .row(let row):
                    HStack(spacing: Self.gap) {
                        if let reason = row.reason {
                            // 사유는 처음 보이는 칸에 맞춰 왼쪽 정렬
                            Text(reason.text)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(theme.p.muted.color)
                                .padding(.leading, 12)
                                .frame(width: width, alignment: .leading)
                                .frame(maxHeight: .infinity)
                                .background(RoundedRectangle(cornerRadius: 6).fill(theme.p.chip.color))
                        } else if let now = row.now {
                            ForEach(Array(zip(table.times, row.cells).enumerated()), id: \.offset) { _, pair in
                                let (time, cell) = pair
                                let d = cell.delta(from: now, model.unit)
                                VStack(spacing: 1) {
                                    Text(cell.text(model.unit)).font(.num(occ ? 12.5 : 13.5, .bold)).tracking(-0.4)
                                    if model.settings.showDelta { Text(NumberText.delta(d)).font(.num(9.5, .bold)).foregroundStyle(theme.deltaColor(d)) }
                                }
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                                .frame(width: Self.cellWidth)
                                .frame(maxHeight: .infinity)
                                .background(RoundedRectangle(cornerRadius: 6).fill(theme.tint(cell.occupancy)))
                                .accessibilityElement(children: .ignore)
                                .accessibilityLabel(Strings.Forecast.a11yCell(time: time.label, cars: NumberText.grouped(cell.available),
                                                                              change: NumberText.change(NumberText.round(cell.available) - NumberText.round(now.available))))
                            }
                        }
                    }
                    .padding(.vertical, 1.5)
                    .frame(height: rowHeight)
                    .padding(.bottom, row.isTotal ? 2 : 0)
                    .contentShape(Rectangle())
                    .onTapGesture { model.sheet = row.target }
                }
            }
        }
    }

    @ViewBuilder
    private func nowCell(_ row: ForecastRow) -> some View {
        let dead = row.now == nil
        Text(row.now?.text(model.unit) ?? "—")
            .font(.num(model.unit == .occupancy ? 13.5 : 14.5, .heavy))
            .tracking(-0.5)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .foregroundStyle(dead ? theme.p.muted.color : theme.p.ink.color)
            .frame(width: Self.nowWidth)
            .frame(maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 6).fill(dead ? theme.p.chip.color : theme.tint(row.now!.occupancy)))
            .accessibilityLabel(row.now.map { Strings.Forecast.a11yNow(cars: NumberText.grouped($0.available)) } ?? (row.reason?.text ?? ""))
    }
}
