# qr: read me first

## Purpose

Turns a web link into a QR code the owner can print, for the shared link of an offer. Written out in
full (no library), as the project allows no new dependencies.

| File | One job |
|---|---|
| `qr.ts` | The generator. Text -> UTF-8 bytes -> Reed-Solomon error correction (level M) per block, blocks interleaved -> placed around the fixed patterns -> best of 8 masks by the standard's penalty score -> format and version bits. Versions 1 to 10 (up to 213 bytes). `qrPath` and `qrSvg` draw it |
| `QrImage.tsx` | `QrImage` draws it on the page; `downloadQr` saves it as an SVG file (prints at any size) |
| `qr.test.ts` | Known answers from the standard, and an independent reader that takes a code apart again (format bits, mask, zigzag, error-correction check, text) |

## How it was checked

The reader in `qr.test.ts` is written separately from the generator, so a mistake in one does not hide
in the other. Beyond that, 47 generated codes (versions 1 and 3 to 10, plain and accented text, the longest
text) and a screenshot of the real page were read by OpenCV's QR decoder, outside the project: all read back
as the exact text with its more robust detector, at every size.

## Likely walkthrough questions

**Why write a QR generator instead of installing one?**
The team agreed on no new dependencies, and a QR code is a well-specified, testable piece of arithmetic. It
is about 300 lines, and every step is a named function that follows the standard.

**What if the link is longer than 213 bytes?**
`encodeQr` throws, and `QrImage` shows nothing rather than a wrong picture. An offer link is about 60 bytes.

**Why only level M?**
It repairs about 15% damage, which suits a printed poster, and keeps the code small. Higher levels would
need more block tables.
