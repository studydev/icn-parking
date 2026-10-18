/// 셔틀 탭(5r/5s) 문구. mobile/shared/reference/shuttle-text.mjs(디자인 wTxt 규칙) 이식, 같은 픽스처로 검증
public enum ShuttleText {
    /// 운행일 분 → "HH:MM"(24시 이상은 다음 날 시각)
    public static func hm(_ minutes: Int) -> String {
        let h = (minutes / 60) % 24, m = minutes % 60
        return (h < 10 ? "0" : "") + "\(h):" + (m < 10 ? "0" : "") + "\(m)"
    }

    /// 목록 오른쪽 "다음 도착"
    public static func wait(_ d: UpcomingDeparture?) -> String {
        guard let d else { return Strings.Shuttle.none }
        if d.tomorrow { return Strings.Shuttle.tomorrowAt(time: hm(d.departure.minuteOfDay)) }
        if d.wait <= 0 { return Strings.Shuttle.arriving }
        if d.wait < 60 { return Strings.Shuttle.minutes(minutes: "\(d.wait)") }
        return Strings.Shuttle.hoursMinutes(hours: "\(d.wait / 60)", minutes: "\(d.wait % 60)")
    }

    public struct Card: Hashable, Sendable {
        public let w1: String
        public let at1: String
        public let w2: String
        public let at2: String
        /// 표시편 안내(없으면 빈 문자열)
        public let mark: String
        public let span: String
    }

    public static func card(route: ShuttleRoute, stop: PreparedStop, next: [UpcomingDeparture]) -> Card {
        let d1 = next.first, d2 = next.count > 1 ? next[1] : nil
        let w = wait(d1)
        let w1: String
        if let d1 { w1 = d1.tomorrow ? Strings.Shuttle.tomorrow : w == Strings.Shuttle.arriving ? w : Strings.Shuttle.after(wait: w) } else { w1 = Strings.Shuttle.none }
        let span = route.hours == "24시간" ? Strings.Shuttle.allDay
            : Strings.Shuttle.firstLast(first: hm(stop.departures.first?.minutes ?? 0), last: hm(stop.departures.last?.minutes ?? 0))
        return Card(
            w1: w1,
            at1: d1.map { Strings.Shuttle.arrivalAt(time: hm($0.departure.minuteOfDay)) } ?? "",
            w2: d2.map { $0.tomorrow ? Strings.Shuttle.tomorrowAt(time: hm($0.departure.minuteOfDay)) : Strings.Shuttle.after(wait: wait($0)) } ?? "",
            at2: d2.map { $0.tomorrow ? Strings.Shuttle.nextBus : Strings.Shuttle.nextBusAt(time: hm($0.departure.minuteOfDay)) } ?? "",
            mark: d1?.departure.marked == true && stop.stop.mark != nil ? Strings.Shuttle.markNotice(mark: stop.stop.mark!) : "",
            span: span)
    }

    /// 정차 순서 끝 줄
    public static func tail(_ route: ShuttleRoute) -> String {
        if route.loop { return Strings.Shuttle.loopTail(stop: route.stops.first?.label ?? "", duration: route.duration) }
        if let after = route.after { return Strings.Shuttle.afterTail(after: after) }
        return route.duration
    }
}
