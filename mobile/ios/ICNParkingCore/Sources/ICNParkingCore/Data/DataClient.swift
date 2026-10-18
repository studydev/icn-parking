import Foundation

/// 어디서 온 값인지. 상단 줄 상태(Freshness)의 offline 판단에 쓴다.
public enum DataOrigin: Hashable, Sendable {
    case network
    /// 아직 신선한(60초 이내) 또는 확정된 저장본
    case cache
    /// 네트워크 실패로 마지막 저장본을 씀
    case offline
}

public struct Loaded<Value: Sendable>: Sendable {
    public let value: Value
    public let fetchedAt: Date
    public let origin: DataOrigin
}

public enum DataClientError: Error, Equatable {
    case http(Int)
    /// 네트워크도 저장본도 없음
    case unavailable
}

/// 웹과 같은 공개 파일만 읽는다(docs/DATA.md). 새 서버 API 없음.
/// - latest.json·calendar.json·오늘 날짜 파일: 60초 동안 저장본 재사용(서버 max-age=60과 같음)
/// - 지난 날짜 파일: 다음 날 00:15(KST) 이후에 받은 것은 확정본으로 보고 다시 받지 않음.
///   그 전에 받은 것은 자정 확정·마지막 슬롯 반영 전일 수 있어 60초 규칙을 따른다.
/// - 네트워크 실패: 나이와 상관없이 마지막 저장본(origin = .offline)
/// gzip은 URLSession이 Content-Encoding을 보고 푼다.
public actor DataClient {
    public static let freshSeconds: TimeInterval = 60
    /// 날짜가 바뀐 뒤 확정본으로 볼 때까지 기다리는 시간(수집기가 자정 뒤 첫 실행에서 전날 파일을 확정)
    public static let finalizeGrace: TimeInterval = 15 * 60

    public let baseURL: URL
    private let session: URLSession
    private let store: FileStore
    private let now: @Sendable () -> Date
    private var inFlight: [String: Task<Data?, Error>] = [:]
    private var finalDays: [String: Loaded<DayDoc>] = [:]

    /// baseURL은 "/"로 끝나는 data 디렉터리(웹 config.js dataBase와 같은 값)
    public init(baseURL: URL, store: FileStore, session: URLSession = .shared, now: @escaping @Sendable () -> Date = { Date() }) {
        self.baseURL = baseURL
        self.store = store
        self.session = session
        self.now = now
    }

    public func latest(force: Bool = false) async throws -> Loaded<LatestDoc> {
        try await load("latest.json", as: LatestDoc.self, reuse: { !force && self.isFresh($0) })
    }

    public func calendar(force: Bool = false) async throws -> Loaded<CalendarDoc> {
        try await load("calendar.json", as: CalendarDoc.self, reuse: { !force && self.isFresh($0) })
    }

    /// 날짜 파일. 미래 날짜이거나 서버에 없으면(404) nil
    public func day(_ date: String, force: Bool = false) async throws -> Loaded<DayDoc>? {
        let today = ParkingTime.kst(now()).date
        guard date <= today else { return nil }
        if let loaded = finalDays[date] { return loaded }
        let loaded: Loaded<DayDoc>
        do {
            loaded = try await load("days/\(date).json", as: DayDoc.self, notFoundIsAnswer: true, reuse: { entry in
                self.isFinal(date, fetchedAt: entry.fetchedAt) || (!force && self.isFresh(entry))
            })
        } catch DataClientError.http(404) {
            return nil
        }
        if isFinal(date, fetchedAt: loaded.fetchedAt) { finalDays[date] = Loaded(value: loaded.value, fetchedAt: loaded.fetchedAt, origin: .cache) }
        return loaded
    }

    /// 여러 날짜를 함께 받는다. 없거나 실패한 날짜는 빠진다(웹 loadDays와 같이 null 취급).
    public func days(_ dates: [String]) async -> [String: DayDoc] {
        await withTaskGroup(of: (String, DayDoc?).self) { group in
            for date in Set(dates) { group.addTask { (date, try? await self.day(date)?.value) } }
            var out: [String: DayDoc] = [:]
            for await (date, doc) in group { if let doc { out[date] = doc } }
            return out
        }
    }

    nonisolated func isFresh(_ entry: FileStore.Entry) -> Bool {
        let age = now().timeIntervalSince(entry.fetchedAt)
        return age >= 0 && age < Self.freshSeconds
    }

    nonisolated func isFinal(_ date: String, fetchedAt: Date) -> Bool {
        let nextDay = ParkingTime.instant(ofKSTSlot: "\(LocalDate.addDays(date, 1))T00:00")
        return fetchedAt >= nextDay.addingTimeInterval(Self.finalizeGrace)
    }

    /// notFoundIsAnswer: 404를 "파일 없음"이라는 답으로 보고 그대로 던진다(날짜 파일). 아니면 다른 실패처럼 저장본으로 대신한다.
    private func load<T: Decodable & Sendable>(_ path: String, as type: T.Type, notFoundIsAnswer: Bool = false, reuse: (FileStore.Entry) -> Bool) async throws -> Loaded<T> {
        let cached = store.read(path)
        if let cached, reuse(cached), let value = try? JSONDecoder().decode(T.self, from: cached.data) {
            return Loaded(value: value, fetchedAt: cached.fetchedAt, origin: .cache)
        }
        do {
            guard let data = try await fetch(path) else { throw DataClientError.http(404) }
            let value = try JSONDecoder().decode(T.self, from: data)
            let fetchedAt = now()
            try? store.write(path, data, fetchedAt: fetchedAt)
            return Loaded(value: value, fetchedAt: fetchedAt, origin: .network)
        } catch DataClientError.http(404) where notFoundIsAnswer {
            throw DataClientError.http(404)
        } catch {
            guard let cached, let value = try? JSONDecoder().decode(T.self, from: cached.data) else { throw DataClientError.unavailable }
            return Loaded(value: value, fetchedAt: cached.fetchedAt, origin: .offline)
        }
    }

    /// 같은 파일을 동시에 여러 번 요청하면 한 번만 받는다. 404 = nil
    private func fetch(_ path: String) async throws -> Data? {
        if let task = inFlight[path] { return try await task.value }
        let request = URLRequest(url: baseURL.appendingPathComponent(path), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        let session = self.session
        let task = Task<Data?, Error> {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 404 { return nil }
            guard (200..<300).contains(status) else { throw DataClientError.http(status) }
            return data
        }
        inFlight[path] = task
        defer { inFlight[path] = nil }
        return try await task.value
    }
}
