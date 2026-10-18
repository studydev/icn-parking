import ICNParkingCore
import SwiftUI

/// 셔틀(디자인 5r/5s): 노선 5칸 → 설명 → 카드 → 정차 순서. 15초마다 다시 계산, 선택 승강장 자동 스크롤
struct ShuttleView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        if let schedule = model.shuttle {
            let order = Zones.layout(model.terminal).shuttleRoutes
            let rid = model.settings.shuttleRoute(model.terminal)
            if let route = schedule.route(rid) {
                let sid = model.settings.shuttleStop(rid) ?? route.route.defaultStop
                let stop = route.stops.first { $0.stop.id == sid } ?? route.stops[0]
                content(schedule: schedule, order: order, route: route, stop: stop, nowSeconds: model.kstNow.secondsOfDay)
                    .task {
                        while !Task.isCancelled {
                            try? await Task.sleep(for: .seconds(15))
                            model.touchClock()
                        }
                    }
            }
        } else {
            Text(Strings.Loading.shuttle).font(.system(size: 13)).foregroundStyle(theme.p.muted.color).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func content(schedule: ShuttleSchedule, order: [String], route: PreparedRoute, stop: PreparedStop, nowSeconds: Int) -> some View {
        let color = (Tokens.shuttleRoutes[route.id]?.color ?? Tokens.palette(theme.mode).tint).color
        let soft = (Tokens.shuttleRoutes[route.id]?.soft(theme.mode) ?? Tokens.palette(theme.mode).chip).color
        let next = stop.next(2, nowSeconds: nowSeconds)
        let card = ShuttleText.card(route: route.route, stop: stop, next: next)
        return VStack(alignment: .leading, spacing: 0) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 5), spacing: 4) {
                ForEach(order, id: \.self) { id in
                    if let r = schedule.route(id) { routeButton(r, selected: id == route.id) }
                }
            }
            .padding(.init(top: 2, leading: 0, bottom: 8, trailing: 0))
            Text(Strings.Shuttle.routeInfo(desc: route.route.desc, headway: route.route.headway, hours: route.route.hours))
                .scaledFont(12)
                .foregroundStyle(theme.p.muted.color)
                .lineSpacing(2)
                .padding(.init(top: 0, leading: 2, bottom: 10, trailing: 2))
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(stop.stop.label).font(.system(size: 13, weight: .bold)).foregroundStyle(theme.p.ink2.color)
                    Text(stop.stop.note).font(.system(size: 11.5, weight: .medium)).foregroundStyle(theme.p.muted.color).truncationMode(.tail)
                }
                .lineLimit(1)
                HStack(alignment: .bottom, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(card.w1).font(.num(38, .heavy)).tracking(-1.2).lineLimit(1)
                        Text(card.at1).font(.num(12.5, .semibold)).foregroundStyle(theme.p.ink2.color)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text(card.w2).font(.num(20, .bold)).foregroundStyle(theme.p.ink2.color).lineLimit(1)
                        Text(card.at2).font(.num(12, .regular)).foregroundStyle(theme.p.muted.color)
                    }
                    .padding(.bottom, 1)
                }
                .padding(.top, 8)
                if !card.mark.isEmpty {
                    Text(card.mark).font(.system(size: 12, weight: .bold)).foregroundStyle(theme.p.warnInk.color).padding(.top, 8)
                }
                Text(card.span).font(.num(11.5, .regular)).foregroundStyle(theme.p.muted.color).padding(.top, 10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.init(top: 14, leading: 16, bottom: 12, trailing: 16))
            .background(RoundedRectangle(cornerRadius: 16).fill(soft))
            .accessibilityElement(children: .combine)
            HStack {
                Text(Strings.Shuttle.stopsHeader(count: "\(route.stops.count)")).fontWeight(.bold).foregroundStyle(theme.p.ink2.color)
                Spacer()
                Text(Strings.Shuttle.nextArrival)
            }
            .font(.system(size: 12))
            .foregroundStyle(theme.p.muted.color)
            .padding(.init(top: 14, leading: 6, bottom: 4, trailing: 12))
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(route.stops.enumerated()), id: \.element.stop.id) { i, s in
                            stopRow(route: route, stop: s, index: i, selected: s.stop.id == stop.stop.id, color: color, soft: soft, nowSeconds: nowSeconds)
                                .id(s.stop.id)
                        }
                        Text(ShuttleText.tail(route.route))
                            .font(.system(size: 11.5))
                            .foregroundStyle(theme.p.muted.color)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.init(top: 8, leading: 36, bottom: 4, trailing: 2))
                    }
                }
                .onAppear { proxy.scrollTo(stop.stop.id, anchor: .center) }
                .onChange(of: route.id) { proxy.scrollTo(stop.stop.id, anchor: .center) }
            }
            Text(Strings.Shuttle.asOf(asOf: schedule.asOf))
                .font(.system(size: 11))
                .foregroundStyle(theme.p.faint.color)
                .padding(.init(top: 8, leading: 2, bottom: 0, trailing: 2))
        }
        .padding(.init(top: 6, leading: 16, bottom: 12, trailing: 16))
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
    }

    private func routeButton(_ r: PreparedRoute, selected: Bool) -> some View {
        let color = Tokens.shuttleRoutes[r.id]?.color.color ?? theme.p.tint.color
        return Button {
            model.settings.setShuttleRoute(model.terminal, r.id)
        } label: {
            HStack(spacing: 5) {
                Circle().fill(selected ? .white : color).frame(width: 7, height: 7)
                Text(r.route.name).lineLimit(1).minimumScaleFactor(0.8)
            }
            .font(.system(size: 12.5, weight: .bold))
            .foregroundStyle(selected ? .white : theme.p.ink2.color)
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(RoundedRectangle(cornerRadius: 10).fill(selected ? color : theme.p.chip.color))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(r.route.name) · \(r.route.desc)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func stopRow(route: PreparedRoute, stop: PreparedStop, index: Int, selected: Bool, color: Color, soft: Color, nowSeconds: Int) -> some View {
        let n = route.stops.count
        let first = index == 0 && !route.route.loop
        let last = index == n - 1 && !route.route.loop && route.route.after == nil
        let next = stop.next(1, nowSeconds: nowSeconds).first
        let today = next.map { !$0.tomorrow } ?? false
        return Button {
            model.settings.setShuttleStop(route.id, stop.stop.id)
        } label: {
            HStack(spacing: 10) {
                GeometryReader { geo in
                    let h = geo.size.height
                    Path { p in
                        p.move(to: .init(x: 10, y: first ? h / 2 : 0))
                        p.addLine(to: .init(x: 10, y: last ? h / 2 : h))
                    }
                    .stroke(color, lineWidth: 2)
                    Circle()
                        .strokeBorder(color, lineWidth: 2.5)
                        .background(Circle().fill(selected ? color : theme.p.bg.color))
                        .frame(width: 12, height: 12)
                        .position(x: 10, y: h / 2)
                }
                .frame(width: 20)
                VStack(alignment: .leading, spacing: 1) {
                    Text(stop.stop.label).scaledFont(14, selected ? .heavy : .semibold).lineLimit(2)
                    if !stop.stop.note.isEmpty {
                        Text(stop.stop.note).scaledFont(11).foregroundStyle(theme.p.muted.color).lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(ShuttleText.wait(next))
                    .scaledFont(today ? 15 : 12, today ? (selected ? .heavy : .bold) : .semibold, tabular: true)
                    .foregroundStyle(today ? theme.p.ink.color : theme.p.muted.color)
            }
            .padding(.init(top: 0, leading: 6, bottom: 0, trailing: 12))
            .frame(minHeight: 46)
            .background(RoundedRectangle(cornerRadius: 12).fill(selected ? soft : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(next.map { d in
            Strings.Shuttle.a11yStop(route: route.route.name, stop: stop.stop.label, wait: ShuttleText.wait(d), time: ShuttleText.hm(d.departure.minuteOfDay))
        } ?? stop.stop.label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
