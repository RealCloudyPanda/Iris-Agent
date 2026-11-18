// Usage: swift mkimg.swift "<code>" out.png   — renders a fake build error and a ticket code for Spike B.
import AppKit
let code = CommandLine.arguments[1], out = CommandLine.arguments[2]
let size = NSSize(width: 900, height: 360)
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 900, pixelsHigh: 360, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSColor(calibratedRed: 0.12, green: 0.12, blue: 0.14, alpha: 1).setFill(); NSRect(origin: .zero, size: size).fill()
let mono = NSFont.monospacedSystemFont(ofSize: 22, weight: .regular)
("$ npm run build\nError: ENOENT: no such file or directory, open 'config/app.json'\n    at Object.openSync (node:fs:573:3)" as NSString).draw(at: NSPoint(x: 30, y: 210), withAttributes: [.font: mono, .foregroundColor: NSColor.systemRed])
("Ticket: " + code as NSString).draw(at: NSPoint(x: 30, y: 60), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 40), .foregroundColor: NSColor.white])
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
