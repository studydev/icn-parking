// README용 위젯 모음 이미지를 만든다. macOS 기본 프레임워크(CoreGraphics·ImageIO)만 쓴다.
//   compose-widgets crop <입력.png> <출력.png> <x> <y> <폭> <높이>
//   compose-widgets android <둘째 페이지.png> <셋째 페이지.png> <출력.png>
//
// android: 에뮬레이터 홈 화면 두 페이지(1080×2400)에서 위젯을 잘라(모서리는 둥글게) 한 장에 모은다.
//   둘째 페이지 = 소(2×2) + 중(4×2), 셋째 페이지 = 대(4×4). 좌표는 uiautomator가 알려 준
//   LauncherAppWidgetHostView 영역이며, 위젯 모서리 반지름은 26dp(420dpi → 68px)지만 런처가 조금 더 크게 잘라 78px로 맞춘다.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func load(_ path: String) -> CGImage {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        FileHandle.standardError.write(Data("이미지를 읽을 수 없습니다: \(path)\n".utf8)); exit(1)
    }
    return img
}

func save(_ img: CGImage, _ path: String) {
    guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(1) }
    CGImageDestinationAddImage(dest, img, nil)
    guard CGImageDestinationFinalize(dest) else { FileHandle.standardError.write(Data("저장 실패: \(path)\n".utf8)); exit(1) }
}

func crop(_ img: CGImage, _ r: CGRect) -> CGImage {
    guard let c = img.cropping(to: r) else { FileHandle.standardError.write(Data("잘라낼 수 없는 영역: \(r)\n".utf8)); exit(1) }
    return c
}

let args = CommandLine.arguments
guard args.count >= 2 else { exit(2) }

switch args[1] {
case "crop":
    guard args.count == 8, let x = Double(args[4]), let y = Double(args[5]), let w = Double(args[6]), let h = Double(args[7]) else { exit(2) }
    save(crop(load(args[2]), CGRect(x: x, y: y, width: w, height: h)), args[3])

case "android":
    guard args.count == 5 else { exit(2) }
    let p2 = load(args[2]), p3 = load(args[3])
    // (이미지, 잘라낼 영역)
    let small = crop(p2, CGRect(x: 67, y: 94, width: 452, height: 614))
    let graph = crop(p2, CGRect(x: 67, y: 750, width: 946, height: 614))
    let table = crop(p3, CGRect(x: 67, y: 94, width: 946, height: 1270))

    let s: CGFloat = 0.7, gap: CGFloat = 34, margin: CGFloat = 60, radius: CGFloat = 78 * s
    let tw = CGFloat(table.width) * s, th = CGFloat(table.height) * s
    let sw = CGFloat(small.width) * s, sh = CGFloat(small.height) * s
    let gw = CGFloat(graph.width) * s, gh = CGFloat(graph.height) * s
    let rowW = sw + gap + gw
    let width: CGFloat = 1080
    let height = margin + th + gap + max(sh, gh) + margin

    let space = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(data: nil, width: Int(width), height: Int(height), bitsPerComponent: 8, bytesPerRow: 0, space: space,
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { exit(1) }
    ctx.interpolationQuality = .high
    // 배경: 위(밝은 하늘색) → 아래(약간 진한 청회색)
    let colors = [CGColor(red: 0.91, green: 0.94, blue: 0.98, alpha: 1), CGColor(red: 0.78, green: 0.84, blue: 0.93, alpha: 1)] as CFArray
    let gradient = CGGradient(colorsSpace: space, colors: colors, locations: [0, 1])!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: height), end: CGPoint(x: 0, y: 0), options: [])

    // CoreGraphics는 좌하단이 원점이라 위에서부터의 y를 뒤집어 쓴다
    func place(_ img: CGImage, x: CGFloat, topY: CGFloat, w: CGFloat, h: CGFloat) {
        let rect = CGRect(x: x, y: height - topY - h, width: w, height: h)
        let path = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -6), blur: 22, color: CGColor(red: 0.1, green: 0.15, blue: 0.3, alpha: 0.28))
        ctx.addPath(path); ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fillPath()
        ctx.restoreGState()
        ctx.saveGState()
        ctx.addPath(path); ctx.clip()
        ctx.draw(img, in: rect)
        ctx.restoreGState()
    }
    place(table, x: (width - tw) / 2, topY: margin, w: tw, h: th)
    let rowX = (width - rowW) / 2, rowY = margin + th + gap
    place(small, x: rowX, topY: rowY, w: sw, h: sh)
    place(graph, x: rowX + sw + gap, topY: rowY, w: gw, h: gh)
    guard let out = ctx.makeImage() else { exit(1) }
    save(out, args[4])

default:
    exit(2)
}
