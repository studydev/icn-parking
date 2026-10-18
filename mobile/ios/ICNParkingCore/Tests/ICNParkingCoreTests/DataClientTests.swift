import Foundation
import XCTest
@testable import ICNParkingCore

/// 경로별 응답을 돌려주고 요청 수를 센다. offline = true면 모든 요청이 연결 실패
final class StubServer: @unchecked Sendable {
    static let shared = StubServer()
    private let lock = NSLock()
    private var bodies: [String: Data] = [:]
    private var counts: [String: Int] = [:]
    private var _offline = false

    func reset() { lock.withLock { bodies = [:]; counts = [:]; _offline = false } }
    func set(_ path: String, _ body: Data?) { lock.withLock { bodies[path] = body } }
    func count(_ path: String) -> Int { lock.withLock { counts[path] ?? 0 } }
    var offline: Bool {
        get { lock.withLock { _offline } }
        set { lock.withLock { _offline = newValue } }
    }

    func respond(_ path: String) -> (Int, Data)? {
        lock.withLock {
            counts[path, default: 0] += 1
            if _offline { return nil }
            return bodies[path].map { (200, $0) } ?? (404, Data())
        }
    }
}

final class StubProtocol: URLProtocol {
    static let base = "https://stub.test/data/"
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url!.absoluteString.replacingOccurrences(of: Self.base, with: "")
        guard let (status, body) = StubServer.shared.respond(path) else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
}

final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Date
    init(_ kst: String) { value = ParkingTime.instant(ofKSTSlot: kst) }
    var now: Date { lock.withLock { value } }
    func advance(_ seconds: TimeInterval) { lock.withLock { value = value.addingTimeInterval(seconds) } }
}

final class DataClientTests: XCTestCase {
    private var root: URL!
    private var clock: TestClock!
    private let server = StubServer.shared

    override func setUp() {
        server.reset()
        root = FileManager.default.temporaryDirectory.appendingPathComponent("icn-\(UUID().uuidString)")
        clock = TestClock("2026-10-17T14:30")
    }

    override func tearDown() { try? FileManager.default.removeItem(at: root) }

    private func client() throws -> DataClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        let clock = self.clock!
        return DataClient(baseURL: URL(string: StubProtocol.base)!, store: try FileStore(root: root), session: URLSession(configuration: config), now: { clock.now })
    }

    private func latestJSON(slot: String, p: Int) -> Data {
        Data(#"{"v":1,"slot":"\#(slot)","stale":false,"zones":[{"id":"t1-short-b1","p":\#(p),"c":520}],"extra":"무시"}"#.utf8)
    }

    private func dayJSON(_ date: String, p: Int) -> Data {
        Data(#"{"v":1,"date":"\#(date)","zones":{"t1-short-b1":{"p":[\#(p),null],"c":[520,520],"e":[1]}}}"#.utf8)
    }

    func testLatestIsReusedFor60SecondsThenRefetched() async throws {
        server.set("latest.json", latestJSON(slot: "2026-10-17T14:30", p: 300))
        let c = try client()
        let first = try await c.latest()
        XCTAssertEqual(first.origin, .network)
        XCTAssertEqual(first.value.zones.first?.p, 300)

        clock.advance(59)
        server.set("latest.json", latestJSON(slot: "2026-10-17T14:35", p: 310))
        let second = try await c.latest()
        XCTAssertEqual(second.origin, .cache)
        XCTAssertEqual(second.value.slot, "2026-10-17T14:30")
        XCTAssertEqual(server.count("latest.json"), 1)

        clock.advance(2)
        let third = try await c.latest()
        XCTAssertEqual(third.origin, .network)
        XCTAssertEqual(third.value.slot, "2026-10-17T14:35")

        let forced = try await c.latest(force: true)
        XCTAssertEqual(forced.origin, .network)
        XCTAssertEqual(server.count("latest.json"), 3)
    }

    func testOfflineFallsBackToLastSavedResponseOfAnyAge() async throws {
        server.set("latest.json", latestJSON(slot: "2026-10-17T14:28", p: 300))
        _ = try await client().latest()
        clock.advance(3600)
        server.offline = true
        // 앱을 다시 켠 것처럼 새 인스턴스: 디스크 저장본만 남아 있다
        let saved = try await client().latest()
        XCTAssertEqual(saved.origin, .offline)
        XCTAssertEqual(saved.value.slot, "2026-10-17T14:28")
        XCTAssertEqual(saved.fetchedAt, clock.now.addingTimeInterval(-3600))
        XCTAssertEqual(Freshness.of(slot: saved.value.slot, stale: saved.value.stale ?? false, now: clock.now, offline: saved.origin == .offline), .offline(time: "14:28"))
    }

    func testOfflineWithoutSavedResponseThrows() async throws {
        server.offline = true
        let c = try client()
        do {
            _ = try await c.latest()
            XCTFail("저장본이 없으면 실패해야 해요")
        } catch {
            XCTAssertEqual(error as? DataClientError, .unavailable)
        }
    }

    func testLatest404UsesSavedResponse() async throws {
        server.set("latest.json", latestJSON(slot: "2026-10-17T14:30", p: 300))
        let c = try client()
        _ = try await c.latest()
        clock.advance(120)
        server.set("latest.json", nil)
        let r = try await c.latest()
        XCTAssertEqual(r.origin, .offline)
    }

    func testFinalizedPastDayIsNeverFetchedAgain() async throws {
        server.set("days/2026-10-10.json", dayJSON("2026-10-10", p: 100))
        let c = try client()
        let first = try await c.day("2026-10-10")
        XCTAssertEqual(first?.origin, .network)
        XCTAssertEqual(first?.value.zones["t1-short-b1"]?.e, [1])

        clock.advance(30 * 86400)
        server.set("days/2026-10-10.json", dayJSON("2026-10-10", p: 999))
        let again = try await c.day("2026-10-10", force: true)
        XCTAssertEqual(again?.origin, .cache)
        XCTAssertEqual(again?.value.zones["t1-short-b1"]?.p.first, 100)
        // 디스크에서도(새 인스턴스) 다시 받지 않는다
        let reopened = try await client().day("2026-10-10")
        XCTAssertEqual(reopened?.value.zones["t1-short-b1"]?.p.first, 100)
        XCTAssertEqual(server.count("days/2026-10-10.json"), 1)
    }

    func testYesterdayFetchedRightAfterMidnightIsNotTreatedAsFinal() async throws {
        clock = TestClock("2026-10-18T00:05")
        server.set("days/2026-10-17.json", dayJSON("2026-10-17", p: 100))
        let c = try client()
        _ = try await c.day("2026-10-17")
        XCTAssertFalse(c.isFinal("2026-10-17", fetchedAt: clock.now))

        // 00:15 전 저장본은 60초 뒤 다시 받는다(자정 확정본으로 교체)
        clock.advance(61)
        server.set("days/2026-10-17.json", dayJSON("2026-10-17", p: 101))
        let refreshed = try await c.day("2026-10-17")
        XCTAssertEqual(refreshed?.origin, .network)

        // 00:15 이후에 받은 것은 확정본
        clock.advance(15 * 60)
        let finalCopy = try await c.day("2026-10-17", force: true)
        XCTAssertEqual(finalCopy?.origin, .network)
        clock.advance(86400)
        let reused = try await c.day("2026-10-17", force: true)
        XCTAssertEqual(reused?.origin, .cache)
        XCTAssertEqual(server.count("days/2026-10-17.json"), 3)
    }

    func testTodayFollows60SecondRule() async throws {
        server.set("days/2026-10-17.json", dayJSON("2026-10-17", p: 100))
        let c = try client()
        _ = try await c.day("2026-10-17")
        clock.advance(30)
        let cached = try await c.day("2026-10-17")
        XCTAssertEqual(cached?.origin, .cache)
        clock.advance(31)
        let fresh = try await c.day("2026-10-17")
        XCTAssertEqual(fresh?.origin, .network)
    }

    func testFutureDayAndMissingFileReturnNilWithoutCaching() async throws {
        let c = try client()
        let future = try await c.day("2026-10-18")
        XCTAssertNil(future)
        XCTAssertEqual(server.count("days/2026-10-18.json"), 0)
        let missing = try await c.day("2026-09-01")
        XCTAssertNil(missing)
        server.set("days/2026-09-01.json", dayJSON("2026-09-01", p: 5))
        let later = try await c.day("2026-09-01")
        XCTAssertNotNil(later)
    }

    func testDaysLoadsConcurrentlyAndSkipsMissing() async throws {
        server.set("days/2026-10-16.json", dayJSON("2026-10-16", p: 1))
        server.set("days/2026-10-17.json", dayJSON("2026-10-17", p: 2))
        let c = try client()
        let docs = await c.days(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-17", "2026-10-18"])
        XCTAssertEqual(Set(docs.keys), ["2026-10-16", "2026-10-17"])
        XCTAssertEqual(server.count("days/2026-10-17.json"), 1)
    }

    func testConcurrentRequestsForSameFileShareOneDownload() async throws {
        server.set("latest.json", latestJSON(slot: "2026-10-17T14:30", p: 300))
        let c = try client()
        async let a = c.latest()
        async let b = c.latest()
        let (x, y) = try await (a, b)
        XCTAssertEqual(x.value, y.value)
        XCTAssertEqual(server.count("latest.json"), 1)
    }

    func testOldSchemaDirectoryIsRemoved() throws {
        let old = root.appendingPathComponent("v0/days")
        try FileManager.default.createDirectory(at: old, withIntermediateDirectories: true)
        let store = try FileStore(root: root)
        XCTAssertFalse(FileManager.default.fileExists(atPath: old.path))
        XCTAssertTrue(store.directory.path.hasSuffix("v\(FileStore.schemaVersion)"))
    }

    func testCalendarDecodesDaysAndHolidays() async throws {
        server.set("calendar.json", Data(#"{"start":"2026-10-01","days":{"2026-10-16":{"n":288,"T1":{"max":0.9}},"2026-10-17":{"n":175}},"holidays":{"2026-10-09":"한글날"}}"#.utf8))
        let cal = try await client().calendar().value
        XCTAssertEqual(cal.start, "2026-10-01")
        XCTAssertEqual(cal.days, ["2026-10-16", "2026-10-17"])
        XCTAssertEqual(cal.holidays["2026-10-09"], "한글날")
    }
}
