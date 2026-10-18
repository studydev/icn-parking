import ICNParkingCore
import SwiftUI

// 위젯 화면. 위젯 확장과 앱(디버그 미리보기)이 함께 쓴다.

/// 소: 이름 · 숫자 34/700 · 점유율 막대(5pt, 상태색) · "1시간 뒤 ▲N대" · "2분 전 기준"(디자인 5m)
struct SmallWidgetView: View {
    @Environment(\.colorScheme) private var colorScheme
    let model: SmallWidgetModel?

    var body: some View {
        let theme = Theme(mode: colorScheme == .dark ? .dark : .light)
        VStack(alignment: .leading, spacing: 0) {
            if let m = model {
                Text(m.title).font(.system(size: 13, weight: .bold)).lineLimit(1)
                Spacer(minLength: 0)
                if let a = m.available, m.word == nil || m.word == Strings.Zone.full {
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text(NumberText.grouped(a)).font(.num(34, .bold)).tracking(-1)
                        Text(Strings.Unit.cars).font(.system(size: 14, weight: .semibold))
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                } else {
                    Text(m.word ?? Strings.Zone.missing).font(.system(size: 24, weight: .bold)).foregroundStyle(theme.p.muted.color)
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(theme.p.track.color)
                        Capsule().fill(OccupancyBand.of(m.occupancy ?? 0).color.color)
                            .frame(width: geo.size.width * CGFloat(m.occupancy ?? 0))
                    }
                }
                .frame(height: 5)
                .padding(.init(top: 4, leading: 0, bottom: 8, trailing: 0))
                if let d = m.deltaHour {
                    (Text(Strings.Widget.inOneHourPrefix + " ") + Text(NumberText.delta(d) + Strings.Unit.cars).foregroundColor(theme.deltaColor(d)))
                        .font(.num(12.5, .semibold))
                        .lineLimit(1)
                }
                Text(m.ago).font(.system(size: 11)).foregroundStyle(theme.p.faint.color).padding(.top, 2)
            } else {
                Unavailable(title: Strings.Widget.smallName)
            }
        }
        .foregroundStyle(theme.p.ink.color)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// 중: 주차장 한 곳의 3시간 그래프. 지금 + 30분 점 6개, 점마다 남은 대수
struct GraphWidgetView: View {
    @Environment(\.colorScheme) private var colorScheme
    let model: GraphWidgetModel?

    var body: some View {
        let theme = Theme(mode: colorScheme == .dark ? .dark : .light)
        VStack(alignment: .leading, spacing: 6) {
            if let m = model {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(m.title).font(.system(size: 13, weight: .bold)).lineLimit(1)
                    Text(Strings.Widget.graphSubtitle).font(.system(size: 11)).foregroundStyle(theme.p.muted.color).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(m.ago).font(.system(size: 11)).foregroundStyle(theme.p.faint.color).lineLimit(1)
                }
                WidgetGraph(points: m.points, theme: theme)
            } else {
                Unavailable(title: Strings.Widget.mediumName)
            }
        }
        .foregroundStyle(theme.p.ink.color)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.map { m in ([m.title] + m.points.map { "\($0.label) \($0.available.map { NumberText.grouped($0) + Strings.Unit.cars } ?? "—")" }).joined(separator: ", ") } ?? Strings.Error.unavailable)
    }
}

/// 위젯 그래프: 선 + 점 + 점 위 숫자 + 아래 시각. 변화가 보이도록 최소~최대 범위로 그린다
struct WidgetGraph: View {
    let points: [GraphWidgetModel.Point]
    let theme: Theme

    var body: some View {
        Canvas { ctx, size in
            let values = points.compactMap(\.available).map(Double.init)
            guard let lo0 = values.min(), let hi0 = values.max() else { return }
            let span = max(hi0 - lo0, max(hi0 * 0.05, 4))
            let lo = lo0 - span * 0.25, hi = hi0 + span * 0.35
            let top: CGFloat = 16, bottom: CGFloat = 16
            let n = max(points.count - 1, 1)
            let x = { (i: Int) in 14 + CGFloat(i) / CGFloat(n) * (size.width - 28) }
            let y = { (v: Double) in top + (size.height - top - bottom) * (1 - CGFloat((v - lo) / (hi - lo))) }
            var path = Path(), started = false
            for (i, p) in points.enumerated() {
                guard let a = p.available else { started = false; continue }
                let pt = CGPoint(x: x(i), y: y(Double(a)))
                if started { path.addLine(to: pt) } else { path.move(to: pt); started = true }
            }
            ctx.stroke(path, with: .color(theme.p.tint.color), style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
            for (i, p) in points.enumerated() {
                let now = i == 0
                let color = now ? theme.p.ink.color : theme.p.tint.color
                if let a = p.available {
                    let c = CGPoint(x: x(i), y: y(Double(a)))
                    let r: CGFloat = now ? 4 : 3
                    ctx.fill(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)), with: .color(p.occupancy.map { OccupancyBand.of($0).color.color } ?? color))
                    // 숫자가 위젯 가장자리에서 잘리지 않게 안쪽으로 민다
                    let text = ctx.resolve(Text(NumberText.grouped(a)).font(.num(now ? 12 : 10.5, .bold)).foregroundColor(color))
                    let w = text.measure(in: size).width
                    ctx.draw(text, at: CGPoint(x: min(max(c.x, w / 2), size.width - w / 2), y: c.y - 6), anchor: .bottom)
                }
                ctx.draw(Text(p.label).font(.num(9.5, now ? .bold : .regular)).foregroundColor(now ? theme.p.ink.color : theme.p.muted.color),
                         at: CGPoint(x: x(i), y: size.height - 6), anchor: .center)
            }
        }
    }
}

/// 대: 묶음 전체 + 주차장별 행 × (지금 + 1·2·3시간 뒤, 배경 tint)
struct TableWidgetView: View {
    @Environment(\.colorScheme) private var colorScheme
    let model: TableWidgetModel?

    var body: some View {
        let theme = Theme(mode: colorScheme == .dark ? .dark : .light)
        VStack(alignment: .leading, spacing: 6) {
            if let m = model {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(m.title).font(.system(size: 14, weight: .bold)).lineLimit(1)
                    Text(Strings.Widget.tableSubtitle).font(.system(size: 11)).foregroundStyle(theme.p.muted.color).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(m.ago).font(.system(size: 11)).foregroundStyle(theme.p.faint.color).lineLimit(1)
                }
                HStack(spacing: 5) {
                    Color.clear.frame(maxWidth: .infinity, maxHeight: 1)
                    Text(Strings.Forecast.now).frame(width: 58)
                    ForEach(m.times, id: \.self) { Text($0).frame(maxWidth: .infinity) }
                }
                .font(.num(10.5, .semibold))
                .foregroundStyle(theme.p.muted.color)
                ForEach(Array(m.rows.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: 5) {
                        Text(row.name)
                            .font(.system(size: 13, weight: row.isTotal ? .heavy : .semibold))
                            .foregroundStyle(theme.p.ink2.color)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Group {
                            if let a = row.available { Text(NumberText.grouped(a)).font(.num(16, .heavy)) }
                            else { Text(row.word ?? "—").font(.system(size: 11, weight: .semibold)).foregroundStyle(theme.p.muted.color) }
                        }
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(width: 58)
                        if row.cells.isEmpty {
                            Text("—").font(.system(size: 12, weight: .semibold)).foregroundStyle(theme.p.muted.color)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(RoundedRectangle(cornerRadius: 7).fill(theme.p.chip.color))
                        } else {
                            ForEach(Array(row.cells.enumerated()), id: \.offset) { _, c in
                                VStack(spacing: 0) {
                                    Text(NumberText.grouped(c.available)).font(.num(13, .bold))
                                    Text(NumberText.delta(c.delta)).font(.num(9, .bold)).foregroundStyle(theme.deltaColor(c.delta))
                                }
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(RoundedRectangle(cornerRadius: 7).fill(theme.tint(c.occupancy)))
                            }
                        }
                    }
                    .frame(maxHeight: 44)
                }
                Spacer(minLength: 0)
            } else {
                Unavailable(title: Strings.Widget.largeName)
            }
        }
        .foregroundStyle(theme.p.ink.color)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct Unavailable: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String

    var body: some View {
        VStack(alignment: .leading) {
            Text(title).font(.system(size: 13, weight: .bold))
            Spacer(minLength: 0)
            Text(Strings.Error.unavailable).font(.system(size: 12)).foregroundStyle(Theme(mode: colorScheme == .dark ? .dark : .light).p.muted.color)
        }
    }
}
