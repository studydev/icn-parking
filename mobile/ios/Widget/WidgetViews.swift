import ICNParkingCore
import SwiftUI

// 위젯 화면(디자인 5m). 위젯 확장과 앱(디버그 미리보기)이 함께 쓴다.

/// 소: 이름 · 숫자 34/700 · 점유율 막대(5pt, 상태색) · "1시간 뒤 ▲N대" · "2분 전 기준"
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
                Text(Strings.Widget.smallName).font(.system(size: 13, weight: .bold))
                Spacer(minLength: 0)
                Text(Strings.Error.unavailable).font(.system(size: 12)).foregroundStyle(theme.p.muted.color)
            }
        }
        .foregroundStyle(theme.p.ink.color)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// 중: 터미널 단기·장기 2행 × (지금 + 1·2·3시간 뒤 3칸, 배경 tint)
struct MediumWidgetView: View {
    @Environment(\.colorScheme) private var colorScheme
    let model: MediumWidgetModel?

    var body: some View {
        let theme = Theme(mode: colorScheme == .dark ? .dark : .light)
        VStack(alignment: .leading, spacing: 8) {
            if let m = model {
                HStack(alignment: .firstTextBaseline) {
                    Text(m.title).font(.system(size: 13, weight: .bold)).lineLimit(1)
                    Spacer(minLength: 4)
                    Text(m.ago).font(.system(size: 11)).foregroundStyle(theme.p.faint.color)
                }
                ForEach(m.rows, id: \.name) { row in
                    HStack(spacing: 5) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(row.name).font(.system(size: 12)).foregroundStyle(theme.p.muted.color).lineLimit(1)
                            HStack(alignment: .firstTextBaseline, spacing: 0) {
                                Text(row.available.map { NumberText.grouped($0) } ?? "—").font(.num(20, .bold)).tracking(-0.4)
                                Text(Strings.Unit.cars).font(.system(size: 12, weight: .semibold))
                            }
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        }
                        .frame(width: 92, alignment: .leading)
                        ForEach(row.cells, id: \.time) { c in
                            VStack(spacing: 1) {
                                Text(c.time).font(.num(9.5, .regular)).foregroundStyle(theme.p.ink2.color)
                                Text(NumberText.grouped(c.available)).font(.num(14, .bold))
                                Text(NumberText.delta(c.delta)).font(.num(9.5, .bold)).foregroundStyle(theme.deltaColor(c.delta))
                            }
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .padding(.vertical, 4)
                            .background(RoundedRectangle(cornerRadius: 7).fill(theme.tint(c.occupancy)))
                        }
                    }
                    .frame(maxHeight: .infinity)
                }
            } else {
                Text(Strings.Widget.mediumName).font(.system(size: 13, weight: .bold))
                Spacer(minLength: 0)
                Text(Strings.Error.unavailable).font(.system(size: 12)).foregroundStyle(theme.p.muted.color)
            }
        }
        .foregroundStyle(theme.p.ink.color)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
