import { NextResponse } from 'next/server';
import crypto from 'crypto';
// @ts-ignore
import { findByteRange, removeTrailingNewLine, plainAddPlaceholder } from 'node-signpdf/dist/helpers';

export async function POST(req: Request) {
  try {
    const { pdfBase64 } = await req.json();

    if (!pdfBase64) {
      return NextResponse.json({ error: "Missing pdfBase64 in request body" }, { status: 400 });
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    // 1. Add signature placeholder using plainAddPlaceholder helper
    // We reserve 8192 bytes (which is standard/safe for USB token PKCS#7 signatures)
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer: pdfBuffer,
      reason: 'Invoice Digital Signature',
      location: 'System',
      contactInfo: 'admin@svsbilling.com',
      name: 'Digital Signature',
      signatureLength: 8192,
    });

    // 2. Prepare the PDF buffer by replacing the trailing newline and locating ByteRange
    let pdf = removeTrailingNewLine(pdfWithPlaceholder);
    const { byteRangePlaceholder } = findByteRange(pdf);

    if (!byteRangePlaceholder) {
      return NextResponse.json({ error: "Could not find empty ByteRange placeholder in prepared PDF" }, { status: 500 });
    }

    const byteRangePos = pdf.indexOf(byteRangePlaceholder);
    const byteRangeEnd = byteRangePos + byteRangePlaceholder.length;
    const contentsTagPos = pdf.indexOf('/Contents ', byteRangeEnd);
    const placeholderPos = pdf.indexOf('<', contentsTagPos);
    const placeholderEnd = pdf.indexOf('>', placeholderPos);

    if (placeholderPos === -1 || placeholderEnd === -1) {
      return NextResponse.json({ error: "Could not find /Contents placeholder brackets" }, { status: 500 });
    }

    const placeholderLengthWithBrackets = placeholderEnd + 1 - placeholderPos;
    const placeholderLength = placeholderLengthWithBrackets - 2;

    const byteRange = [0, 0, 0, 0];
    byteRange[1] = placeholderPos;
    byteRange[2] = byteRange[1] + placeholderLengthWithBrackets;
    byteRange[3] = pdf.length - byteRange[2];

    let actualByteRange = `/ByteRange [${byteRange.join(' ')}]`;
    actualByteRange += ' '.repeat(byteRangePlaceholder.length - actualByteRange.length);

    // Replace the /ByteRange placeholder with the actual ByteRange in the buffer
    pdf = Buffer.concat([
      pdf.slice(0, byteRangePos),
      Buffer.from(actualByteRange),
      pdf.slice(byteRangeEnd)
    ]);

    // 3. Compute the SHA-256 hash of the signable content (excluding the signature placeholder)
    const signableBuffer = Buffer.concat([
      pdf.slice(0, byteRange[1]),
      pdf.slice(byteRange[2], byteRange[2] + byteRange[3])
    ]);

    const sha256Hash = crypto.createHash('sha256').update(signableBuffer).digest('hex');

    return NextResponse.json({
      hash: sha256Hash,
      pdfWithPlaceholderBase64: pdf.toString('base64'),
      placeholderPos: byteRange[1],
      placeholderLength: placeholderLength
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error in /api/prepare-usb-sign:", error);
    return NextResponse.json({ error: error.message || "Failed to prepare PDF for signing" }, { status: 500 });
  }
}
