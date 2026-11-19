import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import path from "path";
import fs from "fs";

import { parsePOAndInvoiceText, sanitizeAddress, reconcileRow, isTaxOrSummaryRow, smartStandardizeItem } from "@/lib/poParser";

// Helper for offline server-side OCR with local traineddata
async function performServerOCR(imageBuffer: Buffer): Promise<{ text: string; error?: string }> {
  let worker: any = null;
  try {
    const tessDataPath = path.resolve("./tessdata");
    const workerScriptPath = path.resolve("./node_modules/tesseract.js/src/worker-script/node/index.js");
    const hasTessData = fs.existsSync(path.join(tessDataPath, "eng.traineddata"));

    const workerOptions: any = {
      workerPath: workerScriptPath,
      gzip: false,
    };
    if (hasTessData) {
      workerOptions.langPath = tessDataPath;
      workerOptions.cachePath = tessDataPath;
    }

    worker = await createWorker("eng", 1, workerOptions);
    const ret = await worker.recognize(imageBuffer);
    return { text: ret && ret.data && ret.data.text ? ret.data.text : "" };
  } catch (err: any) {
    console.error("Server OCR error:", err);
    return { text: "", error: err?.message || String(err) };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {
        // ignore termination error
      }
    }
  }
}

// Helper function to extract structured bill data from Gemini vision / LLM if available
async function parseWithGemini(
  textPrompt: string,
  base64Image?: { mimeType: string; data: string },
  apiKey?: string
) {
  if (!apiKey || apiKey.startsWith("AQ.")) return null;

  const systemInstruction = `You are an expert OCR and invoice/purchase order document parser for SVS Electrical & Mechanical Works.
Analyze the provided document (image or extracted PDF text) and extract all billing information precisely in JSON format.

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

  if (base64Image) {
    parts.push({
      inlineData: {
        mimeType: base64Image.mimeType,
        data: base64Image.data,
      },
    });
  }

  contents.push({ parts });

  const modelsToTry = [
    process.env.GEMINI_MODEL || "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-2.5-flash"
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
    let base64ImagePayload: { mimeType: string; data: string } | undefined;
    let renderedScreenshotDataUrl: string | undefined;
    let serverOcrError: string | undefined;
    const trace: string[] = [];

    // Self-healing: ensure pdf.worker.mjs exists in Next.js Turbopack chunks directory
    try {
      const chunksDir = path.resolve(".next/dev/server/chunks");
      const targetWorker = path.join(chunksDir, "pdf.worker.mjs");
      if (fs.existsSync(chunksDir) && !fs.existsSync(targetWorker)) {
        const srcWorker = path.resolve("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
        if (fs.existsSync(srcWorker)) {
          fs.copyFileSync(srcWorker, targetWorker);
        }
      }
    } catch (wErr) {
      // ignore
    }

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mime = file.type || "application/octet-stream";
      trace.push(`file: name=${file.name}, size=${buffer.length}, type=${file.type}`);

      if (mime.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) {
        try {
          trace.push("PDFParse: initializing");
          const parser = new PDFParse({ data: buffer });
          trace.push("PDFParse: calling getText()");
          const parsedRes = await parser.getText();
          const pdfText = parsedRes && parsedRes.text ? parsedRes.text : "";
          trace.push(`PDFParse: got text length ${pdfText.length}`);

          // Check if extracted PDF text has actual contents or is empty/pagination-only
          const meaningfulText = pdfText.replace(/--\s*\d+\s*of\s*\d+\s*--/g, "").trim();

          // Generate page screenshot
          let screenshotBuffer: Buffer | null = null;
          try {
            trace.push("PDFParse: calling getScreenshot()");
            const ss = await parser.getScreenshot({ scale: 2 });
            if (ss && ss.pages && ss.pages[0] && ss.pages[0].data) {
              screenshotBuffer = Buffer.from(ss.pages[0].data);
              renderedScreenshotDataUrl = ss.pages[0].dataUrl;
              trace.push(`PDFParse: screenshot generated, size=${screenshotBuffer.length}`);
              base64ImagePayload = {
                mimeType: "image/png",
                data: screenshotBuffer.toString("base64"),
              };

              // If meaningful text was empty (e.g. scanned or html2canvas PDF), run server OCR on screenshot(s)
              if (meaningfulText.length < 30 && ss && ss.pages && ss.pages.length > 0) {
                trace.push(`OCR: running performServerOCR on ${ss.pages.length} screenshot page(s)`);
                const pagesToScan = Math.min(ss.pages.length, 5);
                for (let pIdx = 0; pIdx < pagesToScan; pIdx++) {
                  if (ss.pages[pIdx]?.data) {
                    const pBuffer = Buffer.from(ss.pages[pIdx].data);
                    const ocrRes = await performServerOCR(pBuffer);
                    if (ocrRes.text) {
                      extractedText = extractedText + `\n--- Page ${pIdx + 1} ---\n` + ocrRes.text;
                    }
                  }
                }
              }
            }
          } catch (ssErr: any) {
            serverOcrError = "screenshot error: " + (ssErr?.message || String(ssErr));
            trace.push("screenshot error: " + serverOcrError);
            console.warn("PDF screenshot extraction warning:", ssErr);
          }

          if (meaningfulText.length >= 30) {
            extractedText = pdfText + "\n" + extractedText;
          }

          await parser.destroy();
        } catch (pdfErr: any) {
          serverOcrError = "pdf-parse error: " + (pdfErr?.message || String(pdfErr));
          trace.push("pdfErr: " + serverOcrError);
          console.error("PDF-parse extraction error:", pdfErr);
        }
      } else if (mime.startsWith("image/")) {
        base64ImagePayload = {
          mimeType: mime,
          data: buffer.toString("base64"),
        };
        renderedScreenshotDataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

        // Run server OCR on the uploaded image directly
        const ocrRes = await performServerOCR(buffer);
        if (ocrRes.text) {
          extractedText = ocrRes.text + "\n" + extractedText;
        }
      }
    }

    // Attempt Gemini first if apiKey is configured and valid
    let result: any = null;
    if (apiKey && !apiKey.startsWith("AQ.")) {
      result = await parseWithGemini(extractedText, base64ImagePayload, apiKey);
    }

    // Always run the deterministic local parser for validation and fallback
    const localData = parsePOAndInvoiceText(extractedText, fileName);

    if (!result) {
      result = localData;
    } else {
      // Validate and heal any hallucinated or missing Gemini fields
      // 1. If cname is missing, too long, or captured an indemnity/legal clause, use localData.cname
      if (
        !result.cname ||
        /indemnif|liability|differential\s*gst|tax\s*rate|right\s*to\s*set-off|interest\s*and\s*penalty/i.test(result.cname) ||
        result.cname.length > 80
      ) {
        result.cname = localData.cname;
      }

      // 2. If caddr accidentally picked up SVS vendor address (FCI Colony, Hastinapuram), replace with localData.caddr
      if (!result.caddr || /FCI\s+COLONY|HASTINAPURAM|RTC\s+COLONY/i.test(result.caddr)) {
        result.caddr = localData.caddr;
      }

      // 3. Heal PO number
      if (!result.po && localData.po) {
        result.po = localData.po;
      }

      // 4. Heal GSTIN
      if (!result.cgstin && localData.cgstin) {
        result.cgstin = localData.cgstin;
      }

      // 5. Heal Date
      if (!result.date && localData.date) {
        result.date = localData.date;
      }

      // 6. If Gemini missed rows or returned 0 rows, use localData.rows
      if ((!result.rows || !Array.isArray(result.rows) || result.rows.length === 0) && localData.rows && localData.rows.length > 0) {
        result.rows = localData.rows;
      }

      // 7. Heal State and Interstate tax status
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

    // Clean up rows, normalize numbers, and auto-compute missing rates or amounts
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
      ocrError: serverOcrError || null,
      trace,
    });
  } catch (err: any) {
    console.error("Error in parse-document route:", err);
    return NextResponse.json({ error: err.message || "Failed to parse document" }, { status: 500 });
  }
}
