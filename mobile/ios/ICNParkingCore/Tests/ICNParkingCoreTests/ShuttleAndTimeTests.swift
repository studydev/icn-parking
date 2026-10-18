import Foundation
import XCTest
@testable import ICNParkingCore

final class ShuttleTests: XCTestCase {
    struct NextFixture: Decodable {
        struct Invalid: Decodable { let why: String; let route: ShuttleRoute }
        let asOf: String
        let n: Int
        let times: [Int]
        /// route → stop → 시각별 [[m, wait, tomorrow, mark, index]]
        let next: [String: [String: [[[Int]]]]]
        let invalidRoutes: [Invalid]
    }

    func testNextDeparturesMatchWebShNext() throws {
        let fx = try Fixtures.load(NextFixture.self, "fixtures/shuttle/next.json")
        let schedule = try ShuttleSchedule(Fixtures.load(ShuttleDoc.self, "shuttle.json"))
        XCTAssertEqual(schedule.asOf, fx.asOf)
        var checked = 0
        for route in schedule.routes {
            for stop in route.stops {
                let expected = try XCTUnwrap(fx.next[route.id]?[stop.stop.id], "\(route.id)/\(stop.stop.id)")
                for (t, now) in fx.times.enumerated() {
                    let got = stop.next(fx.n, nowSeconds: now).map { [$0.departure.minutes, $0.wait, $0.tomorrow ? 1 : 0, $0.departure.marked ? 1 : 0, $0.departure.index] }
                    XCTAssertEqual(got, expected[t], "\(route.id)/\(stop.stop.id) now=\(now)")
                    checked += 1
                }
            }
        }
        XCTAssertGreaterThan(checked, 500)
    }

    func testInvalidTravelIsRejectedLikeShPrep() throws {
        let fx = try Fixtures.load(NextFixture.self, "fixtures/shuttle/next.json")
        XCTAssertFalse(fx.invalidRoutes.isEmpty)
        for bad in fx.invalidRoutes {
            XCTAssertThrowsError(try ShuttleSchedule(ShuttleDoc(v: 1, asOf: fx.asOf, routes: [bad.route])), bad.why)
        }
    }
}

final class TimeTests: XCTestCase {
    struct TimeFixture: Decodable {
        struct Kst: Decodable { let instant: String; let date: String; let slot: Int; let secondsOfDay: Int }
        struct Shift: Decodable { let date: String; let n: Int; let expected: String }
        struct Range: Decodable { let date: String; let i: Int; let expected: SlotTime }
        let kst: [Kst]
        let addDays: [Shift]
        let slotRange: [Range]
    }

    struct FreshnessFixture: Decodable {
        struct Case: Decodable {
            struct Latest: Decodable { let slot: String; let stale: Bool }
            struct Expected: Decodable { let kind: String; let minutes: Int?; let time: String }
            let name: String
            let latest: Latest
            let now: String
            let offline: Bool
            let expected: Expected
        }
        let cases: [Case]
    }

    func testKstAndDateArithmetic() throws {
        let fx = try Fixtures.load(TimeFixture.self, "fixtures/time.json")
        for k in fx.kst {
            let got = ParkingTime.kst(try XCTUnwrap(ISO8601DateFormatter().date(from: k.instant)))
            XCTAssertEqual([got.date, "\(got.slot)", "\(got.secondsOfDay)"], [k.date, "\(k.slot)", "\(k.secondsOfDay)"], k.instant)
        }
        for s in fx.addDays { XCTAssertEqual(LocalDate.addDays(s.date, s.n), s.expected, "\(s.date) \(s.n)") }
        for r in fx.slotRange { XCTAssertEqual(ParkingTime.slotRange(r.date, r.i), r.expected, "\(r.date) \(r.i)") }
        XCTAssertEqual(LocalDate.weekday("2026-10-17"), 6)
    }

    func testFreshnessMatchesFixtures() throws {
        let fx = try Fixtures.load(FreshnessFixture.self, "fixtures/freshness.json")
        for c in fx.cases {
            let now = try XCTUnwrap(ISO8601DateFormatter().date(from: c.now))
            let got = Freshness.of(slot: c.latest.slot, stale: c.latest.stale, now: now, offline: c.offline)
            let want: Freshness
            switch c.expected.kind {
            case "offline": want = .offline(time: c.expected.time)
            case "delayed": want = .delayed(time: c.expected.time, minutes: c.expected.minutes!)
            default: want = .normal(time: c.expected.time, minutes: c.expected.minutes!)
            }
            XCTAssertEqual(got, want, c.name)
        }
    }
}
