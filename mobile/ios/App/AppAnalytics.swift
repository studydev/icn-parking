import FirebaseAnalytics
import FirebaseCore
import Foundation
import UIKit

@MainActor
enum AppAnalytics {
    static func configure() {
        guard FirebaseApp.app() == nil,
              Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil else { return }
        FirebaseApp.configure()
    }

    static func event(_ name: String, _ parameters: [String: String] = [:]) {
        guard FirebaseApp.app() != nil else { return }
        Analytics.logEvent(name, parameters: parameters)
    }

    static func screen(_ name: String) {
        event("screen_view", ["screen_name": name, "screen_class": "RootView"])
    }
}

@MainActor
final class AnalyticsAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        AppAnalytics.configure()
        return true
    }
}
