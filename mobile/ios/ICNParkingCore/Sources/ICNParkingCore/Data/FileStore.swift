import Foundation

/// 받은 원본 JSON을 그대로 저장하는 디스크 캐시. 파일 수정 시각 = 받은 시각.
/// 위젯과 함께 쓰려면 App Group 컨테이너 안 디렉터리를 넘긴다(6단계).
public struct FileStore: Sendable {
    /// 저장 형식이나 확정 규칙이 바뀌면 올린다. 다른 버전 디렉터리는 열 때 지운다.
    public static let schemaVersion = 1

    public let directory: URL

    /// root 아래 "v{schemaVersion}" 디렉터리를 쓰고 이전 버전은 지운다.
    public init(root: URL) throws {
        let fm = FileManager.default
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        let current = "v\(Self.schemaVersion)"
        for name in (try? fm.contentsOfDirectory(atPath: root.path)) ?? [] where name.hasPrefix("v") && name != current {
            try? fm.removeItem(at: root.appendingPathComponent(name))
        }
        directory = root.appendingPathComponent(current, isDirectory: true)
        try fm.createDirectory(at: directory.appendingPathComponent("days"), withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var root = root
        try? root.setResourceValues(values)
    }

    /// Application Support/ICNParkingData (OS가 임의로 지우지 않는 위치)
    public static func applicationSupport() throws -> FileStore {
        let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        return try FileStore(root: base.appendingPathComponent("ICNParkingData", isDirectory: true))
    }

    public struct Entry: Sendable {
        public let data: Data
        public let fetchedAt: Date
    }

    public func read(_ path: String) -> Entry? {
        let url = directory.appendingPathComponent(path)
        guard let data = try? Data(contentsOf: url),
              let date = try? FileManager.default.attributesOfItem(atPath: url.path)[.modificationDate] as? Date else { return nil }
        return Entry(data: data, fetchedAt: date)
    }

    public func write(_ path: String, _ data: Data, fetchedAt: Date) throws {
        let url = directory.appendingPathComponent(path)
        try data.write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.modificationDate: fetchedAt], ofItemAtPath: url.path)
    }
}
