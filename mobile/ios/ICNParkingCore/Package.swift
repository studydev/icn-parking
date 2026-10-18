// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ICNParkingCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "ICNParkingCore", targets: ["ICNParkingCore"]),
    ],
    targets: [
        .target(name: "ICNParkingCore"),
        .testTarget(name: "ICNParkingCoreTests", dependencies: ["ICNParkingCore"]),
    ]
)
