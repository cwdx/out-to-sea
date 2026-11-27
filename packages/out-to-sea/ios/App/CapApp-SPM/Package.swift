// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(name: "capacitor", path: "../../../../../node_modules/@capacitor/ios"),
        .package(name: "CapacitorApp", path: "../../../../../node_modules/@capacitor/app"),
        .package(name: "CapacitorLocalNotifications", path: "../../../../../node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorPreferences", path: "../../../../../node_modules/@capacitor/preferences")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences")
            ]
        )
    ]
)
