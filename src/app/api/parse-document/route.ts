import { NextResponse } from "next/server";
import { parsePOAndInvoiceText, sanitizeAddress, reconcileRow, isTaxOrSummaryRow, smartStandardizeItem } from "@/lib/poParser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Fallback: extract uncompressed or plain ASCII text from PDF streams directly
function extractRawTextFromPdf(buffer: Buffer): string {
  try {
    const str = buffer.toString("binary");
    const matches: string[] = [];
    const textBlockRegex = /BT[\s\S]*?ET/g;
    let match;
    while ((match = textBlockRegex.exec(str)) !== null) {
      const block = match[0];
      const tjMatches = block.match(/\((?:[^\\)]|\\.)*\)\s*Tj/g) || [];
      for (const tj of tjMatches) {
        const text = tj.replace(/^\(/, "").replace(/\)\s*Tj$/, "").replace(/\\([()\\])/g, "$1");
        if (text.trim()) matches.push(text.trim());
      }
      const tjArrayMatches = block.match(/\[([\s\S]*?)\]\s*TJ/g) || [];
      for (const tja of tjArrayMatches) {
        const inner = tja.match(/\((?:[^\\)]|\\.)*\)/g) || [];
        const combined = inner.map(s => s.slice(1, -1).replace(/\\([()\\])/g, "$1")).join("");
        if (combined.trim()) matches.push(combined.trim());
      }
    }
    return matches.join("\n");
  } catch {
    return "";
  }
}

// Pure JS PDF Text Extractor using pdfjs-dist without native canvas / binaries
async function extractTextFromPDFBuffer(pdfBuffer: Buffer): Promise<{ text: string; pageCount: number; error?: string }> {
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const uint8 = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
    const loadingTask = pdfjsLib.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    } as any);
    const pdfDoc = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      let lastY: number | null = null;
      const pageLines: string[] = [];
      let currentLine = "";

      for (const item of textContent.items) {
        if (!item || typeof (item as any).str !== "string") continue;
        const it = item as any;
        const y = it.transform ? it.transform[5] : 0;

        if (lastY !== null && Math.abs(y - lastY) > 5) {
          if (currentLine.trim()) pageLines.push(currentLine.trim());
          currentLine = it.str;
        } else {
          currentLine += (currentLine ? " " : "") + it.str;
        }
        lastY = y;
      }
      if (currentLine.trim()) pageLines.push(currentLine.trim());
      fullText += pageLines.join("\n") + "\n";
    }

    let text = fullText.trim();
    if (text.length < 20) {
      const rawFallback = extractRawTextFromPdf(pdfBuffer);
      if (rawFallback.length > text.length) {
        text = rawFallback;
      }
    }

    return { text, pageCount: pdfDoc.numPages };
  } catch (err: any) {
    console.error("PDF text extraction error, trying raw fallback:", err);
    const rawFallback = extractRawTextFromPdf(pdfBuffer);
    if (rawFallback.length > 20) {
      return { text: rawFallback, pageCount: 1 };
    }
    return { text: "", pageCount: 0, error: err?.message || String(err) };
  }
}

// Helper function to extract structured bill data from Gemini vision / LLM if available
async function parseWithGemini(
  textPrompt: string,
  base64Payload?: { mimeType: string; data: string },
  apiKey?: string
) {
  if (!apiKey || apiKey.startsWith("AQ.")) return null;

  const systemInstruction = `You are an expert OCR and invoice/purchase order document parser for SVS Electrical & Mechanical Works.
Analyze the provided document (image, PDF, or extracted text) and extract all billing information precisely in JSON format.

Important Instructions:
1. PO: Look for Purchase Order / P.O. Number (e.g. 4800193765).
2. Bill to & Place of Supply and Installation: As the customer address. Format address with both registered Bill To address and Site / Place of Supply & Installation location.
3. Customer Name: Name of the buyer or customer (e.g. Avenue Supermarts Ltd.).
4. Line Items: Extract each item's description (p), HSN/SAC code (h), Quantity (q), Rate/Price per unit (r), and total amount (a).
5. GST: Check if GST is applicable (true/false).

JSON Schema:
{
  "btype": "gst" | "quotation" | "cash",
  "no": string, // invoice or bill number e.g. "236" or "001"
  "date": string, // YYYY-MM-DD
  "po": string, // Purchase Order / PO number
  "transport": string, // Transport mode
  "cname": string, // Bill to party / Customer name
  "caddr": string, // Customer address including place of supply and installation
  "cgstin": string, // Customer GSTIN (15 characters)
  "sname": string, // Ship to party name (if any)
  "saddr": string, // Ship to address (if any)
  "sgstin": string, // Ship to GSTIN (if any)
  "applyGst": boolean, // true if GST or CGST/SGST/IGST is applicable
  "discount": number, // discount percentage 0-100 if specified
  "rows": [
    {
      "p": string, // Item description / particulars
      "h": string, // HSN or SAC code
      "q": string, // Quantity as number or string (e.g. "1" or "220")
      "r": string, // Rate per unit (e.g. "32200" or "169.31")
      "a": number  // Total amount for this item (q * r)
    }
  ]
}

Return ONLY raw JSON, with no markdown code fences.`;

  const contents: any[] = [];
  const parts: any[] = [{ text: systemInstruction }];

  if (textPrompt) {
    parts.push({ text: `Document raw text content:\n${textPrompt}` });
  }

  if (base64Payload) {
    parts.push({
      inlineData: {
        mimeType: base64Payload.mimeType,
        data: base64Payload.data,
      },
    });
  }

  contents.push({ parts });

  const modelsToTry = [
    process.env.GEMINI_MODEL || "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-2.5-flash",
  ];

  for (const model of modelsToTry) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (resp.ok) {
        const json = await resp.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
          return JSON.parse(cleaned);
        }
      }
    } catch (e) {
      console.warn(`Gemini parsing attempt failed with model ${model}:`, e);
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const clientOcrText = (formData.get("clientOcrText") as string) || "";
    const fileName = file?.name || "";

    if (!file && !clientOcrText) {
      return NextResponse.json({ error: "No file or text provided" }, { status: 400 });
    }

    if (file && file.size === 0) {
      return NextResponse.json({ error: "The uploaded file is empty (0 bytes)." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    let extractedText = clientOcrText || "";
    let base64Payload: { mimeType: string; data: string } | undefined;
    let renderedScreenshotDataUrl: string | undefined;
    let extractionError: string | undefined;
    const trace: string[] = [];

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mime = file.type || "application/octet-stream";
      trace.push(`file: name=${file.name}, size=${buffer.length}, type=${file.type}`);

      const isPdf = mime.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");

      if (isPdf) {
        base64Payload = {
          mimeType: "application/pdf",
          data: buffer.toString("base64"),
        };

        trace.push("PDF: extracting text via pdfjs");
        const pdfRes = await extractTextFromPDFBuffer(buffer);
        if (pdfRes.text) {
          extractedText = pdfRes.text + (extractedText ? "\n" + extractedText : "");
          trace.push(`PDF: extracted ${pdfRes.text.length} chars from ${pdfRes.pageCount} page(s)`);
        }
        if (pdfRes.error) {
          extractionError = pdfRes.error;
          trace.push("PDF extraction warning: " + pdfRes.error);
        }
      } else if (mime.startsWith("image/")) {
        base64Payload = {
          mimeType: mime,
          data: buffer.toString("base64"),
        };
        renderedScreenshotDataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      }
    }

    // Attempt Gemini first if apiKey is configured and valid
    let result: any = null;
    if (apiKey && !apiKey.startsWith("AQ.")) {
      result = await parseWithGemini(extractedText, base64Payload, apiKey);
    }

    // Always run deterministic local parser for validation and fallback
    const localData = parsePOAndInvoiceText(extractedText, fileName);

    if (!result) {
      result = localData;
    } else {
      // Validate and heal any hallucinated or missing Gemini fields
      if (
        !result.cname ||
        /indemnif|liability|differential\s*gst|tax\s*rate|right\s*to\s*set-off|interest\s*and\s*penalty/i.test(result.cname) ||
        result.cname.length > 80
      ) {
        result.cname = localData.cname;
      }

      if (!result.caddr || /FCI\s+COLONY|HASTINAPURAM|RTC\s+COLONY/i.test(result.caddr)) {
        result.caddr = localData.caddr;
      }

      if (!result.po && localData.po) {
        result.po = localData.po;
      }

      if (!result.cgstin && localData.cgstin) {
        result.cgstin = localData.cgstin;
      }

      if (!result.date && localData.date) {
        result.date = localData.date;
      }

      if ((!result.rows || !Array.isArray(result.rows) || result.rows.length === 0) && localData.rows && localData.rows.length > 0) {
        result.rows = localData.rows;
      }

      if (!result.stateName && localData.stateName) {
        result.stateName = localData.stateName;
      }
      if (result.interstate === undefined && localData.interstate !== undefined) {
        result.interstate = localData.interstate;
      }
    }

    // Strict PO extraction from filename: NEVER use SVS_ exported filename as PO
    if (!result.po && fileName && !/^SVS_/i.test(fileName)) {
      const fnPoMatch = fileName.match(/\b(4[0-9]{9})\b/) || fileName.match(/\b([0-9]{6,12})\b/);
      if (fnPoMatch) {
        result.po = fnPoMatch[1];
      }
    }

    // Ensure rows is an array and populated
    if (!result.rows || !Array.isArray(result.rows) || result.rows.length === 0) {
      if (localData.rows && localData.rows.length > 0) {
        result.rows = localData.rows;
      }
    }

    // Clean and sanitize customer address
    if (result.caddr) {
      result.caddr = sanitizeAddress(result.caddr);
    }

    // Ensure default Customer GSTIN is 36AACCA8432H1ZR (Avenue Supermarts Ltd / DMart)
    if (!result.cgstin) {
      result.cgstin = "36AACCA8432H1ZR";
    }

    // Clean up rows, normalize numbers, and auto-standardize items
    if (result.rows && Array.isArray(result.rows)) {
      result.rows = result.rows
        .map((r: any) => {
          const rec = reconcileRow(r);
          return smartStandardizeItem(rec, extractedText);
        })
        .filter((r: any) => r.p && !isTaxOrSummaryRow(r.p) && (r.a > 0 || parseFloat(r.r || "0") > 0));
    }

    return NextResponse.json({
      success: true,
      data: result,
      rawExtractedLength: extractedText.length,
      renderedScreenshotDataUrl: renderedScreenshotDataUrl || null,
      debugText: extractedText.trim().slice(0, 500),
      ocrError: extractionError || null,
      trace,
    });
  } catch (err: any) {
    console.error("Error in parse-document route:", err);
    return NextResponse.json({ error: err.message || "Failed to parse document" }, { status: 500 });
  }
}
