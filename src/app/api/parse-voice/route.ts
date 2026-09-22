import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { transcript, currentState, currentContext } = await req.json();

    if (!transcript || !transcript.trim()) {
      return NextResponse.json({ error: "Transcript is empty" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY in environment variables");
      return NextResponse.json(
        { error: "AI Parsing service is temporarily misconfigured. Please check GEMINI_API_KEY in .env.local." },
        { status: 500 }
      );
    }

    const todayDate = new Date().toISOString().split("T")[0];

    const systemPrompt = `You are the Conversational AI Billing Assistant for SVS Electrical & Mechanical Works, Hyderabad.
Your job is to parse a single user voice or typed transcript in Telugu (te-IN), English (en-IN), or mixed "Telugish", and map it to the active dialogue state or identify global command intents.

Context of SVS Billing Shop:
- Type of documents: GST Tax Invoice, Quotation, Cash Memo.
- Standard inventory: Electrical rewinding services, submersible motors, Texmo / Aquatex pumps, condensors, wiring, ceiling fans.
- Standard transactions speak in Telugu (e.g., "padi fans" -> 10 fans, "vei rupayalu" -> 1000 rupees).

Active Dialog State: "${currentState}"
Current Session Context Data: ${JSON.stringify(currentContext)}
User Spoken Transcript: "${transcript}"

Supported Units:
- Length: Feet, Foot, Meter, Meters, Inch, Inches, Yard
- Quantity: Piece, Pieces, Unit, Units, Nos, Number, Bundle, Bundles, Roll, Rolls, Box, Boxes, Pack, Packs
- Weight: KG, Kilogram, Gram, Ton
- Volume: Liter, Litre, ML
- Area: Sq Ft, Sq Meter

Task instructions:
1. Identify the user's intent:
   - 'COMMAND': User is issuing a direct global command at any state (e.g. "Add 10 motors at 5000", "Remove PVC pipe", "Change motor quantity to 20", "Apply GST", "Undo last action", "Start new invoice").
   - 'NEXT': User is answering the question posed by the current state (default flow).
   - 'PREVIOUS': User wants to go back or edit the previous field (e.g. "వెనక్కి వెళ్ళు", "go back", "previous").
   - 'REPEAT': User wants you to repeat the question (e.g. "ఏమన్నావు", "what", "repeat please").
   - 'CORRECT': User is explicitly correcting an already entered value (e.g. "change quantity to twenty", "ఫ్యాన్ రేటు ఐదు వందలు చెయ్").

2. Parse global commands:
   If 'intent' is 'COMMAND', populate the 'command' field in the JSON response:
   - **ADD_ITEM**: E.g. "Add 5 motors at 3000" -> { "type": "ADD_ITEM", "data": { "p": "Motor", "q": "5", "r": "3000", "u": "Nos" } }
   - **ADD_MULTI_ITEMS**: E.g. "10 motors at 5000 and 5 starters at 2500 and 20 switches at 150" -> { "type": "ADD_MULTI_ITEMS", "data": { "items": [ { "p": "Motor", "q": "10", "r": "5000", "u": "Nos" }, { "p": "Starter", "q": "5", "r": "2500", "u": "Nos" }, { "p": "Switch", "q": "20", "r": "150", "u": "Nos" } ] } }
   - **REMOVE_ITEM**: E.g. "Remove PVC pipe" -> { "type": "REMOVE_ITEM", "data": { "p": "PVC Pipe" } }
   - **CHANGE_QUANTITY**: E.g. "Change motor quantity to 20" -> { "type": "CHANGE_QUANTITY", "data": { "p": "Motor", "q": "20" } }
   - **CHANGE_RATE**: E.g. "Change motor rate to 4500" -> { "type": "CHANGE_RATE", "data": { "p": "Motor", "r": "4500" } }
   - **APPLY_GST**: E.g. "Apply GST" -> { "type": "APPLY_GST", "data": {} }
   - **REMOVE_GST**: E.g. "Remove GST" -> { "type": "REMOVE_GST", "data": {} }
   - **ADD_CUSTOMER**: E.g. "Change customer to ABC Traders" -> { "type": "ADD_CUSTOMER", "data": { "cname": "ABC Traders" } }
   - **GENERATE_PDF**: E.g. "Generate PDF" or "Download invoice" -> { "type": "GENERATE_PDF", "data": {} }
   - **START_NEW**: E.g. "Start new invoice" -> { "type": "START_NEW", "data": {} }
   - **CANCEL**: E.g. "Cancel invoice" -> { "type": "CANCEL", "data": {} }
   - **UNDO**: E.g. "Undo last action" or "Undo last change" -> { "type": "UNDO", "data": {} }
   - **REDO**: E.g. "Redo last action" -> { "type": "REDO", "data": {} }

3. Parse the target "value" matching the "currentState":
   - **'COLLECTING_DOC_TYPE'**: Must parse to "gst", "quotation", or "cash". Substrings like "GST", "కొటేషన్", "estimate", "క్యాష్ బిల్" must map correctly.
   - **'COLLECTING_CUSTOMER_NAME'**: Parse customer name in proper title casing. Translate Telugu characters to English equivalents (e.g. "రామారావు" -> "Rama Rao").
   - **'COLLECTING_CUSTOMER_ADDR'**: Parse address location. If they say "skip" ("దాటవేయి", "వద్దు"), return null or "skip".
   - **'COLLECTING_ITEM_NAME'**: Parse electrical product or service name. If they say "finish" ("అయిపోయింది", "అంతే", "no more"), return "finish".
   - **'COLLECTING_ITEM_QTY'**: Parse and extract quantity. Convert spoken Telugu numbers (e.g. ఒకటి -> 1, రెండు -> 2, padi -> 10, iravai -> 20, etc.). Return value as clean string.
   - **'COLLECTING_ITEM_RATE'**: Parse rate float value. Convert spoken Telugu prices (e.g. "మూడు వందలు" -> 300, "రెండు వేలు" -> 2000, etc.). Return value as clean string.
   - **'CONFIRMING_TAX'**: Parse to boolean true or false.
   - **'SUMMARY_REVIEW'**: Parse to "yes" (generate invoice) or "cancel".

4. Detect corrections:
   If 'intent' is 'CORRECT', return the path of the correction in the "corrections" dictionary:
   - Example: { "cname": "New Name" } or { "rows[0].q": "20" } or { "applyGst": false }.

Return EXACTLY a JSON response with the schema:
{
  "value": string | boolean | null,
  "intent": "NEXT" | "PREVIOUS" | "REPEAT" | "CORRECT" | "COMMAND",
  "command": { "type": string, "data": object } | null,
  "corrections": object,
  "teFeedback": string // Short prompt or feedback in clean, simple Telugu confirming what was captured (e.g. "GST బిల్ సెలెక్ట్ చేసారు" or "కస్టమర్ పేరు: ABC Traders" or "10 మోటార్లు యాడ్ చేసాను")
}

Do not include any Markdown headers, \`\`\`json wrappers, or chat description. Return purely the raw JSON string.`;

    let response: Response | undefined;
    let retries = 3;
    let delay = 1000;
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const modelsToTry = [modelName, "gemini-1.5-flash"];

    for (const model of modelsToTry) {
      for (let i = 0; i < retries; i++) {
        try {
          response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: systemPrompt,
                      },
                    ],
                  },
                ],
                generationConfig: {
                  responseMimeType: "application/json",
                },
              }),
            }
          );

          if (response.ok) {
            break;
          }

          if (response.status === 503 || response.status === 429) {
            console.warn(`Gemini API (${model}) returned ${response.status}. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
          } else {
            // Non-transient error, break retry loop to try next fallback model if 404
            break;
          }
        } catch (fetchErr) {
          console.error(`Fetch error with model ${model}:`, fetchErr);
        }
      }

      if (response && response.ok) {
        break;
      }
    }

    if (!response || !response.ok) {
      const errText = response ? await response.text() : "No response from API";
      console.error("Gemini API Dialog Parser error:", errText);
      return NextResponse.json({ error: "Failed to parse conversation with AI" }, { status: 502 });
    }

    const resData = await response.json();
    const resultText = resData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      return NextResponse.json({ error: "AI dialogue parser returned empty response" }, { status: 502 });
    }

    let parsedJson;
    try {
      const cleanedText = resultText
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/```$/, "")
        .trim();
      parsedJson = JSON.parse(cleanedText);
    } catch (parseErr: any) {
      console.error("JSON parsing error of AI response:", parseErr, resultText);
      return NextResponse.json({ error: "AI responded in an invalid dialogue format" }, { status: 502 });
    }

    return NextResponse.json(parsedJson, { status: 200 });
  } catch (error: any) {
    console.error("Error in parse-voice route:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
