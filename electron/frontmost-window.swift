// The Ask panel's window helper (D24, D31). No arguments: prints JSON for the frontmost app's frontmost on-screen
// layer-0 window plus the owner of every on-screen layer-0 window. `--activate <pid>`: re-activates that app if it runs.
import AppKit
import CoreGraphics
import Foundation

let args = CommandLine.arguments
if args.count == 3, args[1] == "--activate" {
  guard let pid = Int32(args[2]), let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated else { exit(1) }
  exit(app.activate(options: []) ? 0 : 1)
}

let info = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
let normal = info.filter { ($0[kCGWindowLayer as String] as? Int) == 0 }
let windows: [[String: Any]] = normal.compactMap { entry in
  guard let number = entry[kCGWindowNumber as String] as? Int else { return nil }
  return ["windowNumber": number, "appName": (entry[kCGWindowOwnerName as String] as? String) ?? NSNull()]
}
var out: [String: Any] = ["windows": windows]
if let app = NSWorkspace.shared.frontmostApplication {
  let pid = app.processIdentifier
  // The list is front-to-back, so the first match is the app's frontmost window.
  let front = normal.first { ($0[kCGWindowOwnerPID as String] as? Int32) == pid }
  out["pid"] = Int(pid)
  out["bundleId"] = app.bundleIdentifier ?? NSNull()
  out["appName"] = app.localizedName ?? NSNull()
  out["windowNumber"] = (front?[kCGWindowNumber as String] as? Int) ?? NSNull()
  out["title"] = (front?[kCGWindowName as String] as? String) ?? NSNull()
}
let data = try JSONSerialization.data(withJSONObject: out)
FileHandle.standardOutput.write(data)
