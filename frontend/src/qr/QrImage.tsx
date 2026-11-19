// A QR code on the page, and a way to download it for printing. Drawn as SVG from the generator in
// qr.ts (no library), so it stays sharp at any size on a poster, a menu or a receipt.
import { useMemo } from "react";
import { encodeQr, qrPath, qrSvg } from "./qr";

/** The QR code of `text`, or nothing when the text is too long for one. */
export function QrImage({ text, label, size = 168 }: { text: string; label: string; size?: number }) {
  const drawn = useMemo(() => {
    try {
      return qrPath(encodeQr(text));
    } catch {
      return null;
    }
  }, [text]);
  if (!drawn) return null;
  return (
    <svg className="qr-image" viewBox={`0 0 ${drawn.side} ${drawn.side}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={drawn.side} height={drawn.side} fill="#fff" />
      <path d={drawn.d} fill="#000" />
    </svg>
  );
}

/** Saves the QR code as an SVG file (it prints at any size). Returns false if it could not be made. */
export function downloadQr(text: string, label: string, filename: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([qrSvg(text, label)], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
