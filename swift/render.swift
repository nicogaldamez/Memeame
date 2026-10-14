import AVFoundation
import AppKit
import ImageIO
import Vision

// Uso: memeame-render render <entrada> <salida.png|.jpg> <cajas>
//        <cajas> es un JSON: [{"text", "x", "y", "width", "height", "align"}], con el rectángulo en
//        fracciones de la imagen (origen arriba a la izquierda) y align "top" | "center" | "bottom".
//      memeame-render thumbnail <video> <salida.jpg>
//      memeame-render clipboard <salida.png>   (imprime la ruta de la imagen del portapapeles)
//      memeame-render ocr <imagen>             (imprime el texto de la imagen, una línea por renglón)

func fail(_ message: String) -> Never {
  fputs(message + "\n", stderr)
  exit(1)
}

let args = CommandLine.arguments

if args.count == 4, args[1] == "thumbnail" {
  let generator = AVAssetImageGenerator(asset: AVURLAsset(url: URL(fileURLWithPath: args[2])))
  generator.appliesPreferredTrackTransform = true
  generator.maximumSize = CGSize(width: 600, height: 600)
  // El primer cuadro suele ser negro; si el video es más corto que eso, se usa el inicio.
  let times = [CMTime(seconds: 0.5, preferredTimescale: 600), .zero]
  guard let frame = times.lazy.compactMap({ try? generator.copyCGImage(at: $0, actualTime: nil) }).first,
    let data = NSBitmapImageRep(cgImage: frame).representation(using: .jpeg, properties: [.compressionFactor: 0.8])
  else { fail("No se pudo leer el video: \(args[2])") }
  do {
    try data.write(to: URL(fileURLWithPath: args[3]))
  } catch {
    fail("No se pudo escribir \(args[3]): \(error.localizedDescription)")
  }
  exit(0)
}

if args.count == 3, args[1] == "clipboard" {
  let pasteboard = NSPasteboard.general
  // Un archivo copiado desde Finder se usa tal cual, así los GIF y videos no pierden la animación.
  let files = pasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL]
  if let file = files?.first {
    print(file.path)
    exit(0)
  }
  let png =
    pasteboard.data(forType: .png)
    ?? pasteboard.data(forType: .tiff).flatMap { NSBitmapImageRep(data: $0)?.representation(using: .png, properties: [:]) }
  guard let png else { fail("No hay ninguna imagen en el portapapeles") }
  do {
    try png.write(to: URL(fileURLWithPath: args[2]))
  } catch {
    fail("No se pudo escribir \(args[2]): \(error.localizedDescription)")
  }
  print(args[2])
  exit(0)
}

if args.count == 3, args[1] == "ocr" {
  guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, nil),
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
  else { fail("No se pudo leer la imagen: \(args[2])") }
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["es-ES", "en-US"]
  request.usesLanguageCorrection = true
  do {
    try VNImageRequestHandler(cgImage: image).perform([request])
  } catch {
    fail("No se pudo leer el texto: \(error.localizedDescription)")
  }
  for observation in request.results ?? [] {
    if let candidate = observation.topCandidates(1).first, candidate.confidence > 0.4 {
      print(candidate.string)
    }
  }
  exit(0)
}

struct Box: Decodable {
  let text: String
  let x: CGFloat
  let y: CGFloat
  let width: CGFloat
  let height: CGFloat
  let align: String
}

guard args.count == 5, args[1] == "render" else { fail("uso: memeame-render render <entrada> <salida> <cajas>") }
guard let boxes = try? JSONDecoder().decode([Box].self, from: Data(args[4].utf8)) else {
  fail("Las cajas de texto no son un JSON válido")
}

let inputURL = URL(fileURLWithPath: args[2])
let outputURL = URL(fileURLWithPath: args[3])

let maxSide: CGFloat = 1600
let minSide: CGFloat = 800

let thumbnailOptions: [CFString: Any] = [
  kCGImageSourceCreateThumbnailFromImageAlways: true,
  kCGImageSourceCreateThumbnailWithTransform: true,
  kCGImageSourceThumbnailMaxPixelSize: maxSide,
]
guard let source = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary)
else { fail("No se pudo leer la imagen: \(inputURL.path)") }

// Las imágenes chicas se agrandan para que el texto no salga pixelado.
let longest = CGFloat(max(image.width, image.height))
let scale = max(1, minSide / longest)
let width = (CGFloat(image.width) * scale).rounded()
let height = (CGFloat(image.height) * scale).rounded()

guard
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(width), pixelsHigh: Int(height), bitsPerSample: 8,
    samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0),
  let context = NSGraphicsContext(bitmapImageRep: rep)
else { fail("No se pudo crear el lienzo") }

rep.size = NSSize(width: width, height: height)
NSGraphicsContext.current = context
context.imageInterpolation = .high
context.cgContext.setLineJoin(.round)
context.cgContext.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

func attributed(_ text: String, size: CGFloat, stroke: Bool) -> NSAttributedString {
  let font = NSFont(name: "Impact", size: size) ?? NSFont.systemFont(ofSize: size, weight: .black)
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  paragraph.lineBreakMode = .byWordWrapping
  var attributes: [NSAttributedString.Key: Any] = [
    .font: font, .paragraphStyle: paragraph, .foregroundColor: NSColor.white,
  ]
  if stroke {
    attributes[.strokeColor] = NSColor.black
    attributes[.strokeWidth] = 14
  }
  return NSAttributedString(string: text, attributes: attributes)
}

func drawCaption(_ box: Box) {
  guard !box.text.isEmpty else { return }

  let margin = width * 0.04
  let maxWidth = max(box.width * width - margin * 2, 1)
  let maxHeight = max(box.height * height - margin * 2, 1)
  let layout = CGSize(width: maxWidth, height: .greatestFiniteMagnitude)
  let words = box.text.split(whereSeparator: { $0.isWhitespace }).map(String.init)

  var size = min(width, height) * 0.14
  var bounds = CGRect.zero
  while true {
    bounds = attributed(box.text, size: size, stroke: false)
      .boundingRect(with: layout, options: [.usesLineFragmentOrigin, .usesFontLeading])
    let widestWord = words.map { attributed($0, size: size, stroke: false).size().width }.max() ?? 0
    if (bounds.height <= maxHeight && widestWord <= maxWidth) || size <= 12 { break }
    size *= 0.93
  }

  // Las cajas vienen con el origen arriba; AppKit dibuja con el origen abajo.
  let textHeight = ceil(bounds.height)
  let top = height - box.y * height - margin
  let y: CGFloat
  switch box.align {
  case "top": y = top - textHeight
  case "bottom": y = top - maxHeight
  default: y = top - (maxHeight + textHeight) / 2
  }
  let rect = CGRect(x: box.x * width + margin, y: y, width: maxWidth, height: textHeight)
  attributed(box.text, size: size, stroke: true).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading])
  attributed(box.text, size: size, stroke: false).draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading])
}

boxes.forEach(drawCaption)
context.flushGraphics()

let isJPEG = ["jpg", "jpeg"].contains(outputURL.pathExtension.lowercased())
let data =
  isJPEG
  ? rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9])
  : rep.representation(using: .png, properties: [:])
guard let data else { fail("No se pudo codificar la imagen") }

do {
  try data.write(to: outputURL)
} catch {
  fail("No se pudo escribir \(outputURL.path): \(error.localizedDescription)")
}
