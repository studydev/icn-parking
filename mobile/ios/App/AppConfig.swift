import Foundation
import ICNParkingCore

/// 빌드 설정에서 온 값(Config/App.xcconfig → Info.plist)
enum AppConfig {
    /// 웹 config.js dataBase와 같은 data 디렉터리 URL. 설정이 없거나 https가 아니면 nil
    static func dataBaseURL(_ info: [String: Any]? = Bundle.main.infoDictionary) -> URL? {
        DataConfig.dataBaseURL(info?["ICNDataBaseURL"] as? String)
    }

    static var version: String {
        let info = Bundle.main.infoDictionary
        return "\(info?["CFBundleShortVersionString"] as? String ?? "?") (\(info?["CFBundleVersion"] as? String ?? "?"))"
    }
}
