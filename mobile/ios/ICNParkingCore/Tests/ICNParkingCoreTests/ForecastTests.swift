import Foundation
import XCTest
@testable import ICNParkingCore

final class ForecastTests: XCTestCase {
    func testFixturesCoverGuideScenarios() throws {
        let names = try Fixtures.forecastNames()
        for required in ["normal", "delayed", "offline", "closed", "missing", "capacity-changed", "no-history"] {
            XCTAssertTrue(names.contains("\(required).json"), required)
        }
    }

    /// 30분 칸 = 앱 값, 1시간 칸 = 웹 forecastOf와 직접 동등
    func testZoneForecastsMatchFixtures() throws {
        for file in try Fixtures.forecastNames() {
            let fx = try Fixtures.load(ForecastFixture.self, "fixtures/forecast/\(file)")
            let engine = ForecastEngine(days: fx.days, latest: fx.latest.zones, now: SlotTime(date: fx.kst.date, slot: fx.kst.slot))
            for (schedule, expected) in [(CellSchedule.halfHourly, fx.expected.zones), (.webHourly, fx.expected.zonesHourly)] {
                for (zoneId, want) in expected {
                    check(engine.zone(zoneId, schedule: schedule), want, "\(fx.name) \(zoneId) \(schedule)")
                }
            }
        }
    }

    func testGroupTotalsMatchFixtures() throws {
        for file in try Fixtures.forecastNames() {
            let fx = try Fixtures.load(ForecastFixture.self, "fixtures/forecast/\(file)")
            let engine = ForecastEngine(days: fx.days, latest: fx.latest.zones, now: SlotTime(date: fx.kst.date, slot: fx.kst.slot))
            let present = Set(fx.latest.zones.map(\.id))
            let results = Dictionary(uniqueKeysWithValues: present.map { ($0, engine.zone($0)) })
            let terminal = Terminal(rawValue: fx.terminal)!
            let groupIds: [String: [ZoneGroup]] = ["short": [.short], "long": [.long], "reserved": [.reserved], "total": ZoneGroup.allCases.filter(\.inTotal)]
            for (gid, want) in fx.expected.groups {
                let ids = Zones.zones(terminal).filter { present.contains($0.id) && groupIds[gid]!.contains($0.category.group) }.map(\.id)
                let got = GroupForecast(zoneIds: ids, latest: fx.latest.zones, results: results)
                let where_ = "\(fx.name) \(gid)"
                XCTAssertEqual(got.included, want.included, where_)
                XCTAssertEqual(got.missing, want.missing, where_)
                XCTAssertEqual(got.capacity, want.capacity, where_)
                XCTAssertEqual(got.available, want.available, where_)
                assertClose(got.occupancy, want.occupancy, where_)
                XCTAssertEqual(got.hasForecast, want.hasForecast, where_)
                XCTAssertEqual(got.cells.count, want.cells.count, where_)
                for (g, w) in zip(got.cells, want.cells) {
                    assertClose(g.available, w.available, "\(where_) cell")
                    assertClose(g.occupancy, w.occupancy, "\(where_) cell")
                }
            }
        }
    }

    private func check(_ got: ForecastResult, _ want: ExpectedZone, _ where_: String) {
        switch got {
        case .available(let f):
            XCTAssertTrue(want.ok, "\(where_): 예측됨, 기대 \(want.reason ?? "")")
            guard want.ok else { return }
            checkCurrent(f.current, want, where_)
            XCTAssertEqual(f.weeksBack, want.weeksBack, where_)
            XCTAssertEqual(f.compareDate, want.compareDate, where_)
            assertClose(f.baseParking, want.baseParking, "\(where_) baseParking")
            assertClose(f.offset, want.offset, "\(where_) offset")
            let cells = want.cells ?? []
            XCTAssertEqual(f.cells.count, cells.count, where_)
            for (k, (g, w)) in zip(f.cells, cells).enumerated() {
                XCTAssertEqual(g.time, SlotTime(date: w.date, slot: w.slot), "\(where_) cells[\(k)] 시각")
                assertClose(g.parking, w.parking, "\(where_) cells[\(k)].parking")
                assertClose(g.baseParking, w.baseParking, "\(where_) cells[\(k)].baseParking")
                assertClose(g.available, w.available, "\(where_) cells[\(k)].available")
                assertClose(g.occupancy, w.occupancy, "\(where_) cells[\(k)].occupancy")
            }
        case .unavailable(let failure, let current):
            XCTAssertFalse(want.ok, "\(where_): \(failure) 실패, 기대는 예측")
            XCTAssertEqual(failure.fixtureReason, want.reason, where_)
            if case .capacityChanged(let from, let to) = failure {
                XCTAssertEqual(from, want.from, where_)
                XCTAssertEqual(to, want.to, where_)
            }
            if let current { checkCurrent(current, want, where_) } else { XCTAssertNil(want.anchor, "\(where_) 기준점") }
        }
    }

    private func checkCurrent(_ c: CurrentValue, _ want: ExpectedZone, _ where_: String) {
        XCTAssertEqual(c.anchor, want.anchor, "\(where_) 기준점")
        XCTAssertEqual(c.capacity, want.capacity, "\(where_) capacity")
        XCTAssertEqual(c.parking, want.nowParking, "\(where_) nowParking")
        XCTAssertEqual(c.available, want.nowAvailable, "\(where_) nowAvailable")
        assertClose(c.occupancy, want.nowOccupancy, "\(where_) nowOccupancy")
    }
}
