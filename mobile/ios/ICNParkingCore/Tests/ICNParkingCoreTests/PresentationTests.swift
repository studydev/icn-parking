import Foundation
import XCTest
@testable import ICNParkingCore

final class HistoryTests: XCTestCase {
    struct HistoryFixture: Decodable {
        struct Expected: Decodable {
            struct Point: Decodable { let date: String; let hour: Int }
            struct Day: Decodable { let date: String; let red: Bool }
            struct Value: Decodable { let available: Double; let occupancy: Double }
            struct Stats: Decodable { let averageOccupancy, maxOccupancy, averageAvailable, minAvailable: Double; let fullHours: Int }
            struct Daily: Decodable { let maxOccupancy, minAvailable: Double }
            struct Line: Decodable { let id: String; let values: [Value?]; let stats: Stats?; let daily: [Daily?] }
            let points: [Point]
            let dates: [Day]
            let lines: [Line]
        }
        let today: String
        let slot: Int
        let holidays: [String: String]
        let zoneIds: [String]
        let days: [String: DayDoc]
        let expected: [String: Expected]
    }

    func testHistoryMatchesReference() throws {
        let fx = try Fixtures.load(HistoryFixture.self, "fixtures/history.json")
        for (key, want) in fx.expected {
            let got = HistoryModel(days: fx.days, zoneIds: fx.zoneIds, now: SlotTime(date: fx.today, slot: fx.slot), nDays: Int(key)!, holidays: fx.holidays)
            XCTAssertEqual(got.points.map { "\($0.date) \($0.hour)" }, want.points.map { "\($0.date) \($0.hour)" }, key)
            XCTAssertEqual(got.dates, want.dates.map { HistoryModel.DayInfo(date: $0.date, red: $0.red) }, key)
            XCTAssertEqual(got.lines.map(\.id), want.lines.map(\.id), key)
            for (g, w) in zip(got.lines, want.lines) {
                let where_ = "\(key)일 \(w.id)"
                XCTAssertEqual(g.values.count, w.values.count, where_)
                for (k, (gv, wv)) in zip(g.values, w.values).enumerated() {
                    assertClose(gv?.available, wv?.available, "\(where_) [\(k)] available")
                    assertClose(gv?.occupancy, wv?.occupancy, "\(where_) [\(k)] occupancy")
                }
                assertClose(g.stats?.averageOccupancy, w.stats?.averageOccupancy, "\(where_) avg")
                assertClose(g.stats?.maxOccupancy, w.stats?.maxOccupancy, "\(where_) max")
                assertClose(g.stats?.averageAvailable, w.stats?.averageAvailable, "\(where_) avgA")
                assertClose(g.stats?.minAvailable, w.stats?.minAvailable, "\(where_) minA")
                XCTAssertEqual(g.stats?.fullHours, w.stats?.fullHours, where_)
                for (gd, wd) in zip(g.daily, w.daily) {
                    assertClose(gd?.maxOccupancy, wd?.maxOccupancy, "\(where_) daily")
                    assertClose(gd?.minAvailable, wd?.minAvailable, "\(where_) daily")
                }
            }
        }
    }
}

final class ShuttleTextTests: XCTestCase {
    struct TextFixture: Decodable {
        struct Stop: Decodable { let wait, w1, at1, w2, at2, mark, span: String }
        struct Route: Decodable { let tail: String; let stops: [String: [Stop]] }
        let times: [Int]
        let routes: [String: Route]
    }

    func testCardAndListTextMatchDesignRules() throws {
        let fx = try Fixtures.load(TextFixture.self, "fixtures/shuttle/text.json")
        let schedule = try ShuttleSchedule(Fixtures.load(ShuttleDoc.self, "shuttle.json"))
        for route in schedule.routes {
            let want = try XCTUnwrap(fx.routes[route.id])
            XCTAssertEqual(ShuttleText.tail(route.route), want.tail, route.id)
            for stop in route.stops {
                for (t, now) in fx.times.enumerated() {
                    let w = try XCTUnwrap(want.stops[stop.stop.id])[t], next = stop.next(2, nowSeconds: now)
                    let card = ShuttleText.card(route: route.route, stop: stop, next: next)
                    let where_ = "\(route.id)/\(stop.stop.id) \(now)"
                    XCTAssertEqual(ShuttleText.wait(next.first), w.wait, where_)
                    XCTAssertEqual([card.w1, card.at1, card.w2, card.at2, card.mark, card.span], [w.w1, w.at1, w.w2, w.at2, w.mark, w.span], where_)
                }
            }
        }
    }
}

final class BoardTests: XCTestCase {
    private func snapshot(_ name: String) throws -> ParkingSnapshot {
        let fx = try Fixtures.load(ForecastFixture.self, "fixtures/forecast/\(name).json")
        return ParkingSnapshot(latest: fx.latest, days: fx.days, now: SlotTime(date: fx.kst.date, slot: fx.kst.slot))
    }

    func testForecastTableOrderAndReasons() throws {
        let table = ForecastTable(try snapshot("closed"), terminal: .t1)
        XCTAssertEqual(table.times.map(\.label), ["15:00", "15:30", "16:00", "16:30", "17:00", "17:30"])
        let rows = table.items.compactMap { item -> ForecastRow? in if case .row(let r) = item { return r } else { return nil } }
        XCTAssertEqual(rows.map(\.id), ["total", "t1-short-gf", "t1-short-b1", "t1-short-b2", "t1-short-b3", "t1-tower-p1", "t1-tower-p2", "t1-long-p1", "t1-long-p2", "t1-long-p3", "t1-resv-p5"])
        let byId = Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0) })
        XCTAssertEqual(byId["t1-short-b2"]?.reason, .closed)
        XCTAssertEqual(byId["t1-short-b3"]?.reason, .closed)
        XCTAssertNil(byId["t1-short-b1"]?.reason)
        XCTAssertEqual(byId["t1-short-b1"]?.cells.count, 6)
        // fixture에 없는 구역(장기 등)은 현재값 없음
        XCTAssertEqual(byId["t1-long-p1"]?.reason, .missing)
        XCTAssertEqual(table.items.compactMap { if case .label(let l) = $0 { return l } else { return nil } }, [Strings.Forecast.sectionShort, Strings.Forecast.sectionLong])
    }

    func testSheetExplainsComparisonAndCapacityChange() throws {
        let s = try snapshot("capacity-changed")
        let ok = SheetModel(s, target: .zone("t1-short-b1"))
        XCTAssertEqual(ok.kicker, "T1 · 단기주차장")
        XCTAssertEqual(ok.cells.count, 6)
        XCTAssertEqual(ok.forecast.count, 7)
        XCTAssertEqual(ok.base.count, 13)
        XCTAssertTrue(ok.explain.hasPrefix("지난주 토요일(10/10) 같은 시각 흐름에 지금 차이("), ok.explain)
        XCTAssertEqual(ok.footer("14:30 기준 · 2분 전"), "14:30 기준 · 2분 전 · 30분 간격 · 비교 주 2026-10-10(토)")
        let stopped = SheetModel(s, target: .zone("t1-short-b2"))
        XCTAssertEqual(stopped.explain, "운영 면수가 바뀐 직후(1,050 → 980대)라 예상을 잠시 멈췄어요.")
        XCTAssertTrue(stopped.cells.isEmpty)
        let group = SheetModel(s, target: .group(.t1, .short))
        XCTAssertEqual(group.name, "단기주차장 전체")
        XCTAssertEqual(group.cells.count, 6)
        XCTAssertTrue(group.footer("x").hasSuffix(Strings.Sheet.footerGroupSuffix))
    }

    func testNumberText() {
        XCTAssertEqual(NumberText.grouped(1050), "1,050")
        XCTAssertEqual(NumberText.grouped(12_345_678), "12,345,678")
        XCTAssertEqual(NumberText.grouped(999), "999")
        XCTAssertEqual(NumberText.round(2.5), 3)
        XCTAssertEqual(NumberText.round(-2.5), -2)
        XCTAssertEqual(NumberText.delta(-9), "▼9")
        XCTAssertEqual(NumberText.delta(1200), "▲1,200")
        XCTAssertEqual(NumberText.delta(0), "±0")
        XCTAssertEqual(NumberText.monthDay("2026-10-09"), "10/9")
    }
}

final class SettingsStoreTests: XCTestCase {
    func testDefaultsAndPersistence() throws {
        let suite = "icn-test-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = SettingsStore(defaults: defaults)
        var s = store.load()
        XCTAssertEqual(s.unit, .available)
        XCTAssertEqual(s.defaultTerminal, .t1)
        XCTAssertFalse(s.showDelta)
        XCTAssertEqual(s.shuttleRoute(.t1), "01")
        XCTAssertEqual(s.shuttleRoute(.t2), "02")
        XCTAssertNil(s.shuttleStop("01"))

        s.unit = .occupancy
        s.defaultTerminal = .t2
        s.showDelta = true
        s.setShuttleRoute(.t2, "03")
        s.setShuttleStop("03", "D00343")
        s.setShuttleRoute(.t1, "99")
        store.save(s)
        let reopened = SettingsStore(defaults: defaults).load()
        XCTAssertEqual(reopened.unit, .occupancy)
        XCTAssertEqual(reopened.defaultTerminal, .t2)
        XCTAssertTrue(reopened.showDelta)
        XCTAssertEqual(reopened.shuttleRoute(.t2), "03")
        XCTAssertEqual(reopened.shuttleRoute(.t1), "01", "그 터미널 노선이 아니면 첫 노선")
        XCTAssertEqual(reopened.shuttleStop("03"), "D00343")
    }
}

final class DeepLinkAndWidgetTests: XCTestCase {
    func testDeepLinksRoundTrip() throws {
        let links: [DeepLink] = [.zone("t1-short-b1"), .group(.t2, .long), .total(.t1), .forecast(.t2), .shuttle(route: "01", stop: "D00017"), .shuttle(route: "03", stop: nil)]
        for link in links { XCTAssertEqual(DeepLink(url: link.url), link, link.url.absoluteString) }
        XCTAssertEqual(DeepLink(url: URL(string: "icnparking://zone/t1-short-b1")!), .zone("t1-short-b1"))
        XCTAssertEqual(DeepLink(url: URL(string: "icnparking://shuttle/01/D00017")!), .shuttle(route: "01", stop: "D00017"))
        XCTAssertNil(DeepLink(url: URL(string: "icnparking://zone/nope")!))
        XCTAssertNil(DeepLink(url: URL(string: "https://zone/t1-short-b1")!))
        XCTAssertNil(DeepLink(url: URL(string: "icnparking://group/T3/short")!))
        XCTAssertEqual(DeepLink.zone("t2-long").terminal, .t2)
    }

    func testWidgetChoicesAndIds() {
        let choices = SheetTarget.widgetChoices
        XCTAssertEqual(choices.count, 2 + 6 + 19)
        XCTAssertEqual(choices.first?.title, "T1 전체")
        for c in choices { XCTAssertEqual(SheetTarget(id: c.id), c, c.id) }
        XCTAssertEqual(SheetTarget.group(.t1, .short).title, "T1 단기주차장")
        XCTAssertEqual(SheetTarget.zone("t1-short-b1").title, "T1 단기 지하1층")
    }

    func testWidgetModelsFollowForecast() throws {
        let fx = try Fixtures.load(ForecastFixture.self, "fixtures/forecast/normal.json")
        let s = ParkingSnapshot(latest: fx.latest, days: fx.days, now: SlotTime(date: fx.kst.date, slot: fx.kst.slot))
        let small = WidgetModels.small(s, target: .zone("t1-short-b1"), agoMinutes: 2)
        let want = try XCTUnwrap(fx.expected.zones["t1-short-b1"])
        XCTAssertEqual(small.title, "T1 단기 지하1층")
        XCTAssertEqual(small.available, want.nowAvailable)
        XCTAssertEqual(small.deltaHour, NumberText.round(want.cells![1].available!) - want.nowAvailable!)
        XCTAssertEqual(small.ago, "2분 전 기준")
        XCTAssertEqual(small.link, .zone("t1-short-b1"))
        let group = WidgetModels.small(s, target: .group(.t1, .short), agoMinutes: 0)
        XCTAssertEqual(group.available, fx.expected.groups["short"]?.available)
        XCTAssertEqual(group.ago, "방금 기준")
        let medium = WidgetModels.medium(s, terminal: .t1, agoMinutes: 2)
        XCTAssertEqual(medium.title, "T1 주차 · 1·2·3시간 뒤")
        XCTAssertEqual(medium.rows.map(\.name), ["단기주차장", "장기·주차타워"])
        XCTAssertEqual(medium.rows[0].cells.map(\.time), ["15:30", "16:30", "17:30"])
        XCTAssertEqual(medium.rows[0].available, fx.expected.groups["short"]?.available)
        XCTAssertEqual(medium.rows[0].cells[0].available, NumberText.round(fx.expected.groups["short"]!.cells[1].available))
        XCTAssertEqual(medium.link, .forecast(.t1))
    }

    func testDataConfig() {
        XCTAssertNil(DataConfig.dataBaseURL(nil))
        XCTAssertNil(DataConfig.dataBaseURL("$(ICN_DATA_BASE_URL)"))
        XCTAssertNil(DataConfig.dataBaseURL("http://example.com/data/"))
        XCTAssertEqual(DataConfig.dataBaseURL(" https://example.com/$web/data ")?.absoluteString, "https://example.com/$web/data/")
    }
}
