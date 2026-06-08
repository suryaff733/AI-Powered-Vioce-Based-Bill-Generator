"use client";

import { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { invHTML } from "../lib/invoiceHTML";
import "./globals.css"; // Ensure global CSS has the original styles
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import ConversationalDrawer from "./components/ConversationalDrawer";
import catalog from "./catalog.json";

type Row = { p: string; h: string; q: string; r: string; a: number };
type BillType = 'gst' | 'quotation' | 'cash';

function fallbackParseInput(transcript: string, state: string, language: string): any {
  const t = transcript.toLowerCase().trim();
  if (!t) {
    return {
      intent: "REPEAT",
      value: null,
      command: null,
      corrections: {},
      teFeedback: language === "te-IN" ? "నేను వినలేకపోయాను, మళ్లీ చెప్పండి." : "I couldn't hear that. Let's try that one more time."
    };
  }
  let value: any = null;
  let intent: "NEXT" | "PREVIOUS" | "REPEAT" | "CORRECT" | "COMMAND" = "NEXT";
  let command: any = null;
  let corrections: any = {};
  let teFeedback = "";

  // 1. Core navigation & basic commands
  if (t.includes("వెనక్కి") || t.includes("previous") || t.includes("go back") || t.includes("back")) {
    return { intent: "PREVIOUS", value: null, command: null, corrections: {}, teFeedback: "వెనక్కి వెళ్తున్నాము" };
  }
  if (t.includes("ఏమన్నావు") || t.includes("repeat") || t.includes("మళ్ళీ")) {
    return { intent: "REPEAT", value: null, command: null, corrections: {}, teFeedback: "మళ్ళీ చెప్తాను" };
  }
  if (t === "undo" || t.includes("రద్దు చేయి") || t.includes("undo last change") || t.includes("undo last action")) {
    return { intent: "COMMAND", value: null, command: { type: "UNDO", data: {} }, corrections: {}, teFeedback: "చివరి మార్పును రద్దు చేసాను" };
  }
  if (t === "redo" || t.includes("మళ్లీ చేయి") || t.includes("redo last action")) {
    return { intent: "COMMAND", value: null, command: { type: "REDO", data: {} }, corrections: {}, teFeedback: "రద్దు చేసిన మార్పును మళ్లీ చేసాను" };
  }
  if (t.includes("apply gst") || t.includes("gst add chey") || t.includes("జీఎస్టీ వర్తింపజేయి")) {
    return { intent: "COMMAND", value: null, command: { type: "APPLY_GST", data: {} }, corrections: {}, teFeedback: "GST వర్తింపజేసాము" };
  }
  if (t.includes("remove gst") || t.includes("gst teesei") || t.includes("జీఎస్టీ తీసిвеయి")) {
    return { intent: "COMMAND", value: null, command: { type: "REMOVE_GST", data: {} }, corrections: {}, teFeedback: "GST తీసివేసాము" };
  }
  if (t.includes("download invoice") || t.includes("generate pdf") || t.includes("పిడిఎఫ్ డౌన్‌లోడ్ చేయి") || t === "generate pdf" || t === "download pdf") {
    return { intent: "COMMAND", value: null, command: { type: "GENERATE_PDF", data: {} }, corrections: {}, teFeedback: "పిడిఎఫ్ డౌన్‌లోడ్ అవుతోంది" };
  }
  if (t.includes("start over") || t.includes("కొత్త బిల్లు") || t.includes("start new")) {
    return { intent: "COMMAND", value: null, command: { type: "START_NEW", data: {} }, corrections: {}, teFeedback: "కొత్త బిల్లు ప్రారంభించాము" };
  }
  if (t.includes("cancel invoice") || t.includes("క్యాన్సిల్ చేయి")) {
    return { intent: "COMMAND", value: null, command: { type: "CANCEL", data: {} }, corrections: {}, teFeedback: "బిల్లు క్యాన్సిల్ చేసాము" };
  }
  if (t.includes("save draft") || t.includes("డ్రాఫ్ట్ సేవ్ చేయి")) {
    return { intent: "COMMAND", value: null, command: { type: "SAVE_DRAFT", data: {} }, corrections: {}, teFeedback: "డ్రాఫ్ట్ సేవ్ చేసాము" };
  }
  if (t.includes("remove last item") || t.includes("చివరి ఐటమ్ తీసేయి") || t.includes("delete last item")) {
    return { intent: "COMMAND", value: null, command: { type: "REMOVE_LAST_ITEM", data: {} }, corrections: {}, teFeedback: "చివరి ఐటమ్ తీసివేసాము" };
  }  // --- New Dynamic Global Metadata & Grid Actions ---
  // Change customer name
  const changeCnameMatch = t.match(/change\s+(?:customer\s+)?name\s+(?:to\s+)?(.+)/i) || t.match(/కస్టమర్\s+పేరు\s+(.+)\s+గా\s+మార్చు/i) || t.match(/కస్టమర్\s+పేరు\s+(.+)/i);
  if (changeCnameMatch && (t.startsWith("change") || t.includes("కస్టమర్ పేరు"))) {
    const name = changeCnameMatch[1].trim();
    return {
      intent: "COMMAND",
      value: null,
      command: { type: "CHANGE_CUSTOMER_NAME", data: { name } },
      corrections: {},
      teFeedback: `కస్టమర్ పేరును ${name} కి మార్చాము`
    };
  }

  // Change customer address
  const changeCaddrMatch = t.match(/change\s+(?:customer\s+)?address\s+(?:to\s+)?(.+)/i) || t.match(/కస్టమర్\s+అడ్రస్\s+(.+)\s+గా\s+మార్చు/i) || t.match(/అడ్రస్\s+(.+)/i);
  if (changeCaddrMatch && (t.startsWith("change") || t.includes("అడ్రస్"))) {
    const addr = changeCaddrMatch[1].trim();
    return {
      intent: "COMMAND",
      value: null,
      command: { type: "CHANGE_CUSTOMER_ADDR", data: { addr } },
      corrections: {},
      teFeedback: `అడ్రస్‌ను ${addr} కి మార్చాము`
    };
  }

  // Change PO number
  const changePoMatch = t.match(/change\s+(?:po|purchase\s+order)\s*(?:number)?\s+(?:to\s+)?(.+)/i) || t.match(/పో\s+నెంబర్\s+(.+)/i);
  if (changePoMatch && (t.startsWith("change") || t.includes("పో నెంబర్"))) {
    const poVal = changePoMatch[1].trim();
    return {
      intent: "COMMAND",
      value: null,
      command: { type: "CHANGE_PO", data: { po: poVal } },
      corrections: {},
      teFeedback: `PO నెంబర్‌ను ${poVal} కి మార్చాము`
    };
  }

  // Change transport
  const changeTransportMatch = t.match(/change\s+transport\s+(?:to\s+)?(.+)/i) || t.match(/ట్రాన్స్పోర్ట్\s+(.+)/i);
  if (changeTransportMatch && (t.startsWith("change") || t.includes("ట్రాన్స్పోర్ట్"))) {
    const transp = changeTransportMatch[1].trim();
    return {
      intent: "COMMAND",
      value: null,
      command: { type: "CHANGE_TRANSPORT", data: { transport: transp } },
      corrections: {},
      teFeedback: `ట్రాన్స్‌పోర్ట్‌ను ${transp} కి మార్చాము`
    };
  }

  // Change document type
  const changeDocTypeMatch = t.match(/change\s+(?:invoice|billing|document|bill)\s+type\s+(?:to\s+)?(.+)/i) || t.match(/బిల్లు\s+రకం\s+(.+)/i);
  if (changeDocTypeMatch && (t.startsWith("change") || t.includes("బిల్లు రకం"))) {
    const docT = changeDocTypeMatch[1].toLowerCase().trim();
    let finalDocT: 'gst' | 'quotation' | 'cash' = 'gst';
    if (docT.includes("quotation") || docT.includes("కొటేషన్") || docT.includes("estimate")) {
      finalDocT = 'quotation';
    } else if (docT.includes("cash") || docT.includes("క్యాష్") || docT.includes("మెమో")) {
      finalDocT = 'cash';
    }
    return {
      intent: "COMMAND",
      value: null,
      command: { type: "CHANGE_DOC_TYPE", data: { btype: finalDocT } },
      corrections: {},
      teFeedback: `బిల్లు రకాన్ని ${finalDocT} కి మార్చాము`
    };
  }

  // Change Date
  const changeDateMatch = t.match(/change\s+date\s+(?:to\s+)?(.+)/i) || t.match(/తేదీ\s+(.+)/i);
  if (changeDateMatch && (t.startsWith("change") || t.includes("తేదీ"))) {
    const dt = changeDateMatch[1].trim();
    return {
      intent: "COMMAND",
      value: null,
      command: { type: "CHANGE_DATE", data: { date: dt } },
      corrections: {},
      teFeedback: `తేదీని ${dt} కి మార్చాము`
    };
  }

  // Row Sort by Amount
  if (t.match(/sort\s+(?:items|rows)?\s*(?:by\s+)?amount/i) || t.includes("ధరల ప్రకారం") || t.includes("ధర ప్రకారం అమర్చు")) {
    return {
      intent: "COMMAND",
      value: null,
      command: { type: "SORT_BY_AMOUNT", data: {} },
      corrections: {},
      teFeedback: "మొత్తం ధరల ప్రకారం ఐటమ్స్ అమర్చాము"
    };
  }

  // Row Sort by Name
  if (t.match(/sort\s+(?:items|rows)?\s*(?:by\s+)?name/i) || t.includes("పేర్ల ప్రకారం") || t.includes("పేరు ప్రకారం అమర్చు")) {
    return {
      intent: "COMMAND",
      value: null,
      command: { type: "SORT_BY_NAME", data: {} },
      corrections: {},
      teFeedback: "ఐటమ్స్ పేర్ల ప్రకారం అమర్చాము"
    };
  }

  // Move Row
  const moveRowMatch = t.match(/move\s+(?:item|row)\s+(\d+)\s+to\s+(?:item|row)\s+(\d+)/i) || t.match(/వరుస\s+(\d+)\s+నుండి\s+(\d+)\s+కి\s+మార్చు/i);
  if (moveRowMatch) {
    const fromIndex = parseInt(moveRowMatch[1]);
    const toIndex = parseInt(moveRowMatch[2]);
    return {
      intent: "COMMAND",
      value: null,
      command: { type: "MOVE_ROW", data: { from: fromIndex, to: toIndex } },
      corrections: {},
      teFeedback: `${fromIndex} వరుసను ${toIndex} వరుసకి మార్చాము`
    };
  }

  // Remove specific row by index
  const textIndices: Record<string, number> = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10
  };
  const teluguTextIndices: Record<string, number> = {
    "మొదటి": 1, "రెండవ": 2, "మూడవ": 3, "నాలుగవ": 4, "ఐదవ": 5
  };
  let parsedRemoveIdx = 0;
  
  const removeIndexMatch = t.match(/remove\s+(?:item|row)\s+(\d+)/i) || t.match(/delete\s+(?:item|row)\s+(\d+)/i);
  if (removeIndexMatch) {
    parsedRemoveIdx = parseInt(removeIndexMatch[1]);
  } else if (t.includes("remove") || t.includes("delete") || t.includes("తీసేయి")) {
    Object.keys(textIndices).forEach(key => {
      if (t.includes(key)) parsedRemoveIdx = textIndices[key];
    });
    Object.keys(teluguTextIndices).forEach(key => {
      if (t.includes(key)) parsedRemoveIdx = teluguTextIndices[key];
    });
  }

  if (parsedRemoveIdx > 0) {
    return {
      intent: "COMMAND",
      value: null,
      command: { type: "REMOVE_ROW_BY_INDEX", data: { index: parsedRemoveIdx } },
      corrections: {},
      teFeedback: `${parsedRemoveIdx} ఐటమ్ తీసివేసాము`
    };
  }

  // 2. Discount Commands
  const discountMatch = t.match(/(?:apply\s+)?(\d+)\s*(?:percent|%|శాతం)?\s*discount/i) || t.match(/discount\s*(?:of\s*)?(\d+)/i);
  if (discountMatch) {
    const percent = parseInt(discountMatch[1]) || 0;
    return {
      intent: "COMMAND",
      value: null,
      command: { type: "APPLY_DISCOUNT", data: { percent } },
      corrections: {},
      teFeedback: `${percent}% డిస్కౌంట్ వర్తింపజేసాను`
    };
  }

  // 3. Command Action Parsers (Add, Remove, Edit Quantity/Rate)
  const units = [
    "feet", "foot", "meter", "meters", "inch", "inches", "yard", "yards",
    "kg", "kilogram", "kilograms", "gram", "grams", "liter", "liters", "litre", "litres",
    "piece", "pieces", "unit", "units", "bundle", "bundles", "roll", "rolls",
    "box", "boxes", "pack", "packs", "nos", "no", "number", "numbers"
  ];

  const numberMap: Record<string, string> = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "twenty": "20", "thirty": "30", "forty": "40", "fifty": "50",
    "sixty": "60", "seventy": "70", "eighty": "80", "ninety": "90", "hundred": "100"
  };

  const cleanPhoneticNumbers = (str: string) => {
    let words = str.toLowerCase().split(/\s+/);
    let mapped = words.map(w => numberMap[w] !== undefined ? numberMap[w] : w);
    return mapped.join(" ");
  };

  const parseSingleProductSegment = (segText: string) => {
    let cleanText = segText.toLowerCase().trim();
    // remove "add " prefix
    if (cleanText.startsWith("add ")) {
      cleanText = cleanText.substring(4).trim();
    }

    cleanText = cleanPhoneticNumbers(cleanText);

    let rate: number | null = null;
    let qty: number | null = null;
    let unit = "Nos";
    let pName = "";

    // Parse rate if separator present
    const rateSeparators = [" at ", " rate ", " price ", " ధర "];
    let matchedSeparator = "";
    for (const sep of rateSeparators) {
      if (cleanText.includes(sep)) {
        matchedSeparator = sep;
        break;
      }
    }

    let leftPart = cleanText;
    if (matchedSeparator) {
      const parts = cleanText.split(matchedSeparator);
      leftPart = parts[0].trim();
      const rightPart = parts[1].trim();
      const rateNum = rightPart.match(/\d+(?:\.\d+)?/);
      if (rateNum) {
        rate = parseFloat(rateNum[0]);
      }
    }

    // Parse Qty, Unit, Name from leftPart
    const qtyMatch = leftPart.match(/^\s*(\d+(?:\.\d+)?)\s*(.*)/);
    if (qtyMatch) {
      qty = parseFloat(qtyMatch[1]);
      const rest = qtyMatch[2].trim();
      const words = rest.split(/\s+/);
      if (words.length > 0 && units.includes(words[0])) {
        unit = words[0];
        pName = words.slice(1).join(" ");
      } else {
        unit = "Nos";
        pName = rest;
      }
    } else {
      qty = null; // Missing quantity
      unit = "Nos";
      pName = leftPart;
    }

    // capitalize name properly
    pName = pName.replace(/\b\w/g, c => c.toUpperCase()).trim();

    return {
      p: pName,
      q: qty,
      u: unit,
      r: rate
    };
  };

  // Check if adding multiple products (e.g. "10 motors at 5000 and 5 starters at 2500")
  if (t.startsWith("add ") || t.match(/\d+\s+(?:feet|foot|meter|meters|inch|kg|gram|liter|piece|pieces|unit|units|bundle|bundles|roll|rolls|box|boxes|pack|packs|nos|motors|pumps|starters|pvc|cable|wire)/)) {
    const splitTokens = [" and ", " & ", " మరియు "];
    let splitUsed = "";
    for (const token of splitTokens) {
      if (t.includes(token)) {
        splitUsed = token;
        break;
      }
    }

    if (splitUsed) {
      const segments = transcript.split(new RegExp(splitUsed, "i"));
      const parsedItems = segments.map(seg => parseSingleProductSegment(seg));
      
      return {
        intent: "COMMAND",
        value: null,
        command: {
          type: "ADD_MULTI_ITEMS",
          data: { items: parsedItems }
        },
        corrections: {},
        teFeedback: `${parsedItems.length} రకాల ఐటమ్స్ యాడ్ చేసాను`
      };
    } else {
      const parsed = parseSingleProductSegment(transcript);
      return {
        intent: "COMMAND",
        value: null,
        command: {
          type: "ADD_ITEM",
          data: parsed
        },
        corrections: {},
        teFeedback: `${parsed.p} యాడ్ చేసాను`
      };
    }
  }

  // Matches "remove [particulars]" or "delete [particulars]"
  const removeMatch = t.match(/(?:remove|delete|తీసేయి)\s+([a-zA-Z0-9\s]+)/i);
  if (removeMatch) {
    const item = removeMatch[1].trim();
    return {
      intent: "COMMAND",
      value: null,
      command: {
        type: "REMOVE_ITEM",
        data: { p: item }
      },
      corrections: {},
      teFeedback: `${item} తీసివేసాను`
    };
  }

  // Matches "change [particulars] quantity to [qty]" or "change quantity to [qty]"
  const qtyMatch = t.match(/(?:change\s+)?(?:([a-zA-Z0-9\s]+?)\s+)?(?:quantity|qty)\s+(?:to\s+)?(\d+)/i);
  if (qtyMatch) {
    const item = qtyMatch[1] ? qtyMatch[1].trim() : "";
    const qty = qtyMatch[2];
    return {
      intent: "COMMAND",
      value: null,
      command: {
        type: "CHANGE_QUANTITY",
        data: { p: item, q: qty }
      },
      corrections: {},
      teFeedback: `క్వాంటిటీని ${qty} కి మార్చాము`
    };
  }

  // Matches "change [particulars] rate to [rate]" or "change rate to [rate]"
  const rateMatch = t.match(/(?:change\s+)?(?:([a-zA-Z0-9\s]+?)\s+)?(?:rate|price|ధర)\s+(?:to\s+)?(\d+)/i);
  if (rateMatch) {
    const item = rateMatch[1] ? rateMatch[1].trim() : "";
    const rate = rateMatch[2];
    return {
      intent: "COMMAND",
      value: null,
      command: {
        type: "CHANGE_RATE",
        data: { p: item, r: rate }
      },
      corrections: {},
      teFeedback: `ధరను ${rate} కి మార్చాము`
    };
  }

  // 4. Default state collectors
  switch (state) {
    case "COLLECTING_DOC_TYPE": {
      if (t.includes("gst") || t.includes("జీఎస్టీ") || t.includes("టాక్స్")) {
        value = "gst";
        teFeedback = "GST బిల్ సెలెక్ట్ చేసారు";
      } else if (t.includes("quotation") || t.includes("కొటేషన్") || t.includes("estimate")) {
        value = "quotation";
        teFeedback = "కొటేషన్ సెలెక్ట్ చేసారు";
      } else if (t.includes("cash") || t.includes("క్యాష్") || t.includes("మెమో")) {
        value = "cash";
        teFeedback = "క్యాష్ మెమో సెలెక్ట్ చేసారు";
      } else {
        value = "gst";
        teFeedback = "GST బిల్ సెలెక్ట్ చేసారు";
      }
      break;
    }
    case "COLLECTING_CUSTOMER_NAME": {
      value = transcript.trim();
      teFeedback = `కస్టమర్ పేరు: ${value}`;
      break;
    }
    case "COLLECTING_CUSTOMER_ADDR": {
      if (t.includes("skip") || t.includes("దాటвеయి") || t.includes("వద్దు") || t === "వద్దు") {
        value = "skip";
        teFeedback = "అడ్రస్ దాటవేసాము";
      } else {
        value = transcript.trim();
        teFeedback = `అడ్రస్: ${value}`;
      }
      break;
    }
    case "COLLECTING_ITEM_NAME": {
      if (t.includes("finish") || t.includes("అయిపోయింది") || t.includes("అంతే") || t.includes("చాలు") || t === "అయిపోయింది") {
        value = "finish";
        teFeedback = "ఐటమ్స్ లిస్ట్ పూర్తి చేసాము";
      } else {
        value = transcript.trim();
        teFeedback = `ఐటమ్ పేరు: ${value}`;
      }
      break;
    }
    case "COLLECTING_ITEM_QTY": {
      const teluguQtyMap: Record<string, string> = {
        "ఒకటి": "1", "ఒక": "1", "రెండు": "2", "మూడు": "3", "నాలుగు": "4",
        "ఐదు": "5", "ఆరు": "6", "ఏడు": "7", "ఎనిమిది": "8", "తొమ్మిది": "9",
        "పది": "10", "ఇరవై": "20", "ముప్పై": "30", "నలభై": "40", "యాభై": "50"
      };

      let matchedQty = "";
      Object.keys(teluguQtyMap).forEach(k => {
        if (t.includes(k)) matchedQty = teluguQtyMap[k];
      });

      if (!matchedQty) {
        const numMatch = t.match(/\d+/);
        matchedQty = numMatch ? numMatch[0] : "1";
      }

      value = matchedQty;
      teFeedback = `క్వాంటిటీ: ${value}`;
      break;
    }
    case "COLLECTING_ITEM_RATE": {
      const teluguRateMap: Record<string, number> = {
        "ఒకటి": 1, "రెండు": 2, "మూడు": 3, "నాలుగు": 4, "ఐదు": 5,
        "ఆరు": 6, "ఏడు": 7, "ఎనిమిది": 8, "తొమ్మిది": 9, "పది": 10
      };

      let baseVal = 0;
      let multiplier = 1;

      if (t.includes("వేలు") || t.includes("వేల") || t.includes("వెయ్యి")) {
        multiplier = 1000;
      } else if (t.includes("వందలు") || t.includes("వందల") || t.includes("వంద")) {
        multiplier = 100;
      }

      Object.keys(teluguRateMap).forEach(k => {
        if (t.includes(k)) baseVal = teluguRateMap[k];
      });

      let rateStr = "";
      if (baseVal > 0) {
        rateStr = String(baseVal * multiplier);
      } else {
        const numMatch = t.match(/\d+/g);
        if (numMatch) {
          rateStr = numMatch.join("");
        } else {
          rateStr = "100";
        }
      }

      value = rateStr;
      teFeedback = `ధర: Rs. ${parseFloat(value).toLocaleString("en-IN")}`;
      break;
    }
    case "CONFIRMING_TAX": {
      if (t.includes("yes") || t.includes("అవును") || t.includes("ఆడ్") || t.includes("చేయి")) {
        value = true;
        teFeedback = "GST వర్తింపజేసాము";
      } else {
        value = false;
        teFeedback = "GST తీసివేసాము";
      }
      break;
    }
    case "SUMMARY_REVIEW": {
      if (t.includes("yes") || t.includes("అవును") || t.includes("కన్ఫర్మ్") || t.includes("డౌన్లోడ్")) {
        value = "yes";
        teFeedback = "పిడిఎఫ్ డౌన్‌లోడ్ అవుతోంది";
      } else {
        value = "cancel";
        teFeedback = "బిల్లు క్యాన్సిల్ చేసాము";
      }
      break;
    }
    case "CLARIFYING_DUPLICATE": {
      if (t.includes("merge") || t.includes("కలిపి") || t.includes("yes") || t.includes("అవును") || t === "1" || t.includes("ఒకటి")) {
        value = "merge";
      } else {
        value = "separate";
      }
      break;
    }
    case "CLARIFYING_RATE_AMBIGUITY": {
      const cleanT = cleanPhoneticNumbers(t);
      const valMatch = cleanT.match(/\d+/);
      if (valMatch) {
        value = valMatch[0];
      } else {
        value = "5000"; // fallback
      }
      break;
    }
    case "CLARIFYING_PRODUCT_SUGGESTION": {
      const cleanT = cleanPhoneticNumbers(t);
      const valMatch = cleanT.match(/\d+/);
      if (valMatch) {
        value = valMatch[0]; // returns "1" or "2"
      } else {
        value = transcript.trim();
      }
      break;
    }
    case "CONFIRMING_DESTRUCTIVE": {
      if (t.includes("yes") || t.includes("అవును") || t.includes("చేయి") || t.includes("ok") || t === "yes") {
        value = true;
      } else {
        value = false;
      }
      break;
    }
    case "CONFIRMING_LOW_CONFIDENCE": {
      if (t.includes("yes") || t.includes("అవును") || t.includes("చేయి") || t.includes("ok") || t === "yes") {
        value = true;
      } else {
        value = false;
      }
      break;
    }
    default:
      value = transcript;
      break;
  }

  return {
    value,
    intent,
    command,
    corrections,
    teFeedback
  };
}

function transliterateTeluguToEnglish(text: string): string {
  const consonants: Record<string, string> = {
    'క': 'k', 'ఖ': 'kh', 'గ': 'g', 'ఘ': 'gh', 'ఙ': 'gn',
    'చ': 'ch', 'ఛ': 'chh', 'జ': 'j', 'ఝ': 'jh', 'ఞ': 'ny',
    'ట': 't', 'ఠ': 'th', 'డ': 'd', 'ఢ': 'dh', 'ణ': 'n',
    'త': 'th', 'థ': 'th', 'ద': 'd', 'ధ': 'dh', 'న': 'n',
    'ప': 'p', 'ఫ': 'ph', 'బ': 'b', 'భ': 'bh', 'మ': 'm',
    'య': 'y', 'ర': 'r', 'ల': 'l', 'వ': 'v', 'శ': 'sh', 'ష': 'sh',
    'స': 's', 'హ': 'h', 'ళ': 'l', 'క్ష': 'ksh', 'ఱ': 'r'
  };

  const independentVowels: Record<string, string> = {
    'అ': 'a', 'ఆ': 'a', 'ఇ': 'i', 'ఈ': 'ee', 'ఉ': 'u', 'ఊ': 'oo', 'ఋ': 'ru',
    'ఎ': 'e', 'ఏ': 'e', 'ఐ': 'ai', 'ఒ': 'o', 'ఓ': 'o', 'ఔ': 'au'
  };

  const vowelSigns: Record<string, string> = {
    'ా': 'a', 'ి': 'i', 'ీ': 'ee', 'ు': 'u', 'ూ': 'oo', 'ృ': 'ru',
    'ె': 'e', 'ే': 'e', 'ై': 'ai', 'ొ': 'o', 'ో': 'o', 'ౌ': 'au',
    'ం': 'm', 'ః': 'h'
  };

  let result = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (consonants[char] !== undefined) {
      let sound = consonants[char];
      const nextChar = text[i + 1];
      if (nextChar === '్') {
        result += sound;
        i++; // skip halant
      } else if (vowelSigns[nextChar] !== undefined) {
        result += sound + vowelSigns[nextChar];
        i++; // skip vowel sign
      } else {
        result += sound + 'a';
      }
    } else if (independentVowels[char] !== undefined) {
      result += independentVowels[char];
    } else if (vowelSigns[char] !== undefined) {
      result += vowelSigns[char];
    } else {
      result += char;
    }
  }
  
  return result
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function getLevenshteinDistance(a: string, b: string): number {
  const tmp = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

function autocorrectElectricalTerminology(text: string): string {
  if (!text) return text;

  // 1. Phrase replacement (case-insensitive) before individual word mapping
  // This collapses multi-word spoken numbers like "van payimt phaiv" -> "1.5"
  let processedText = text;
  const phraseMap: { pattern: RegExp; replacement: string }[] = [
    // 1.5 variants
    { pattern: /\b(?:van|one|wan)\s+(?:payimt|payint|point|poiynt)\s+(?:phaiv|phive|five)\b/gi, replacement: "1.5" },
    { pattern: /\b(?:van|one|wan)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "1.5" },
    
    // 2.5 variants
    { pattern: /\b(?:tu|too|two)\s+(?:payimt|payint|point|poiynt)\s+(?:phaiv|phive|five)\b/gi, replacement: "2.5" },
    { pattern: /\b(?:tu|too|two)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "2.5" },

    // 3.5 variants
    { pattern: /\b(?:tri|three)\s+(?:payimt|payint|point|poiynt)\s+(?:phaiv|phive|five)\b/gi, replacement: "3.5" },
    { pattern: /\b(?:tri|three)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "3" },

    // 4.5 and other decimals
    { pattern: /\b(?:fore|four)\s+(?:payimt|payint|point|poiynt)\s+(?:phaiv|phive|five)\b/gi, replacement: "4.5" },
    { pattern: /\b(?:fore|four)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "4" },
    { pattern: /\b(?:phaiv|phive|five)\s+(?:payimt|payint|point|poiynt)\s+(?:phaiv|phive|five)\b/gi, replacement: "5.5" },
    { pattern: /\b(?:phaiv|phive|five)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "5" },
    { pattern: /\b(?:seks|siks|six)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "6" },
    { pattern: /\b(?:sevn|seven)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "7" },
    { pattern: /\b(?:eyt|eight)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "8" },
    { pattern: /\b(?:nayn|nine)\s+(?:payimt|payint|point|poiynt)\b/gi, replacement: "9" },
    
    // Brand or product specific phrases
    { pattern: /\b(?:h\s*\.?\s*p\b)/gi, replacement: "HP" },
    { pattern: /\bsq\s*(?:mm|\.?)\b/gi, replacement: "Sq.mm" },
  ];

  phraseMap.forEach(({ pattern, replacement }) => {
    processedText = processedText.replace(pattern, replacement);
  });

  const svsVocabulary = [
    "Sudhakar", "Motor", "Submersible", "Texmo", "Aquatex", "Cable", "Wire",
    "Rewinding", "Condenser", "Ceiling", "Exhaust", "Starter", "Wiring", 
    "Switch", "Light", "Board", "Pipe", "Meter", "Meters", "Square", "Point",
    "Finolex", "Polycab", "Havells", "Pump", "Pumps", "Service", "HP"
  ];

  const phoneticMap: Record<string, string> = {
    // Single numbers
    "van": "1.5",
    "wan": "1",
    "tu": "2",
    "too": "2",
    "tri": "3",
    "fore": "4",
    "phaiv": "5",
    "phive": "5",
    "seks": "6",
    "siks": "6",
    "sevn": "7",
    "eyt": "8",
    "nayn": "9",
    
    // Terms
    "payimt": "Point",
    "payint": "Point",
    "cabel": "Cable",
    "kabel": "Cable",
    "cabble": "Cable",
    "wair": "Wire",
    "vayr": "Wire",
    "wirre": "Wire",
    "skwer": "Square",
    "skwear": "Square",
    "soorya": "Surya",
    "suriya": "Surya",
    "suria": "Surya",
    
    // Brands
    "phinolex": "Finolex",
    "policab": "Polycab",
    "havels": "Havells",
    "teksmo": "Texmo",
    "akwatex": "Aquatex",
    
    // Words
    "motar": "Motor",
    "moter": "Motor",
    "condensor": "Condenser",
    "condensr": "Condenser",
    "candenser": "Condenser",
    "candensor": "Condenser",
    "submersibal": "Submersible",
    "submergible": "Submersible",
    "pamp": "Pump",
    "pampu": "Pump",
    "pumb": "Pump",
    "stater": "Starter",
    "startar": "Starter",
    "statr": "Starter",
    "swich": "Switch",
    "bod": "Board",
    "pip": "Pipe",
    "paip": "Pipe",
    "celing": "Ceiling",
    "ciling": "Ceiling",
    "egzast": "Exhaust",
    "exast": "Exhaust",
    "exhast": "Exhaust",
    "leight": "Light",
    "lite": "Light",
    "miters": "Meters",
    "miter": "Meter",
    "rewainding": "Rewinding",
    "sarvice": "Service",
    "sarvis": "Service",
    "servis": "Service"
  };

  const words = processedText.split(/\s+/);
  const correctedWords = words.map(word => {
    const cleanWord = word.toLowerCase().replace(/[^a-z0-9.]/g, "");
    if (!cleanWord) return word;

    const hasPluralS = cleanWord.endsWith("s") && cleanWord.length > 3;
    const singularCleanWord = hasPluralS ? cleanWord.slice(0, -1) : cleanWord;

    let replacement: string | undefined;

    if (phoneticMap[cleanWord] !== undefined) {
      replacement = phoneticMap[cleanWord];
    } else if (hasPluralS && phoneticMap[singularCleanWord] !== undefined) {
      replacement = phoneticMap[singularCleanWord] + "s";
    }

    if (replacement !== undefined) {
      return word[0] === word[0].toUpperCase()
        ? replacement[0].toUpperCase() + replacement.slice(1)
        : replacement.toLowerCase();
    }

    for (const vocab of svsVocabulary) {
      const vocabLower = vocab.toLowerCase();
      
      if (cleanWord.length > 3 && getLevenshteinDistance(cleanWord, vocabLower) <= 2) {
        return word[0] === word[0].toUpperCase() ? vocab : vocab.toLowerCase();
      }
      
      if (hasPluralS && singularCleanWord.length > 3 && getLevenshteinDistance(singularCleanWord, vocabLower) <= 2) {
        const replacementPlural = vocab + "s";
        return word[0] === word[0].toUpperCase() ? replacementPlural : replacementPlural.toLowerCase();
      }
    }

    return word;
  });

  return correctedWords.join(" ");
}

function translateOrTransliterateTelugu(text: string): string {
  if (!text) return text;
  
  const teluguToEnglishMap: Record<string, string> = {
    "సుధాకర్": "Sudhakar",
    "హెచ్పి": "HP",
    "హెచ్.పి": "HP",
    "స్క్వేర్": "Square",
    "ఎం ఎం": "MM",
    "ఎమ్ ఎమ్": "MM",
    "ఎమ్ఎమ్": "MM",
    "కేబుల్": "Cable",
    "వైర్": "Wire",
    "మోటార్": "Motor",
    "మోటారు": "Motor",
    "రీవైండింగ్": "Rewinding",
    "సర్వీస్": "Service",
    "సర్వీసు": "Service",
    "ఫ్యాన్": "Fan",
    "ఫ్యాను": "Fan",
    "సీలింగ్": "Ceiling",
    "కండెన్సర్": "Condenser",
    "సబ్మెర్సిబుల్": "Submersible",
    "పంప్": "Pump",
    "పంపు": "Pump",
    "స్టార్టర్": "Starter",
    "వైరింగ్": "Wiring",
    "స్విచ్": "Switch",
    "లైట్": "Light",
    "బోర్డ్": "Board",
    "పైప్": "Pipe",
    "పైపు": "Pipe",
    "మీటర్లు": "Meters",
    "మీటర్": "Meter",
    "మీటరు": "Meter",
    "హైదరాబాద్": "Hyderabad",
    "దాటవేయి": "Skip",
    "అయిపోయింది": "Finish",
    "అవును": "Yes",
    "వద్దు": "No",
    "టాక్స్": "Tax"
  };

  let processedText = text;
  
  const sortedKeys = Object.keys(teluguToEnglishMap).sort((a, b) => b.length - a.length);
  
  sortedKeys.forEach(key => {
    const regex = new RegExp(key, "gi");
    processedText = processedText.replace(regex, teluguToEnglishMap[key]);
  });

  const teluguRegex = /[\u0C00-\u0C7F]/;
  const words = processedText.split(" ");
  
  const mappedWords = words.map(word => {
    if (teluguRegex.test(word)) {
      return transliterateTeluguToEnglish(word);
    }
    return word;
  });

  const translatedText = mappedWords.join(" ");
  return autocorrectElectricalTerminology(translatedText);
}

export default function App() {
  const [btype, setBtype] = useState<BillType>('gst');
  const [activeSec, setActiveSec] = useState<'create' | 'preview' | 'history'>('create');
  
  const [no, setNo] = useState("001");
  const [date, setDate] = useState("");
  const [po, setPo] = useState("");
  const [transport, setTransport] = useState("");
  
  const [cname, setCname] = useState("AVENUE SUPERMARTS LTD");
  const [caddr, setCaddr] = useState("");
  const [cgstin, setCgstin] = useState("36BXYPS4294L1Z7");
  
  const [sname, setSname] = useState("");
  const [saddr, setSaddr] = useState("");
  const [sgstin, setSgstin] = useState("");
  
  const [rows, setRows] = useState<Row[]>([
    { p: "", h: "", q: "", r: "", a: 0 },
    { p: "", h: "", q: "", r: "", a: 0 },
    { p: "", h: "", q: "", r: "", a: 0 },
  ]);
  
  const [applyGst, setApplyGst] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [bills, setBills] = useState<any[]>([]);
  
  const [dlMsg, setDlMsg] = useState("");
  const [showBanner, setShowBanner] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewHtml, setPreviewHtml] = useState("");

  const [signatureUrl, setSignatureUrl] = useState<string>("");
  const [isUploadingSig, setIsUploadingSig] = useState(false);

  const [dscFile, setDscFile] = useState<string>("");
  const [dscPassword, setDscPassword] = useState<string>("");
  const [sigMode, setSigMode] = useState<"file" | "usb">("file");
  const [usbProvider, setUsbProvider] = useState<"signer_digital" | "custom_ws">("signer_digital");
  const [customWsUrl, setCustomWsUrl] = useState<string>("ws://127.0.0.1:12345");
  const [usbTokenPin, setUsbTokenPin] = useState<string>("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'success' | 'error' | null, message: string }>({ status: null, message: "" });

  const [isParsing, setIsParsing] = useState(false);
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [fsmState, setFsmState] = useState<string>("IDLE");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [activeFieldFocus, setActiveFieldFocus] = useState<string>("btype");
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  const pushToUndo = () => {
    const snapshot = {
      btype,
      cname,
      caddr,
      cgstin,
      applyGst,
      discount,
      rows: JSON.parse(JSON.stringify(rows))
    };
    setUndoStack(prev => [...prev, snapshot]);
    setRedoStack([]);
  };
  
  const [fsmContext, setFsmContext] = useState<any>({
    btype: "gst",
    cname: "",
    caddr: "",
    cgstin: "",
    po: "",
    transport: "",
    rows: [],
    applyGst: true,
    currentItem: { p: "", h: "", q: "", r: "" },
    pendingCommand: null,
    productSuggestions: [],
    history: []
  });

  const {
    isListening,
    transcript,
    error: speechError,
    isSupported,
    language,
    confidence,
    startListening,
    stopListening,
    resetTranscript,
    changeLanguage
  } = useSpeechRecognition();

  const FSM_PROMPTS: Record<string, { en: string; te: string }> = {
    COLLECTING_DOC_TYPE: {
      en: "Hello! Let's get started on your billing. What type of document are we making today? You can say GST Invoice, Quotation, or Cash Memo.",
      te: "నమస్తే అండీ! బిల్లింగ్ చేద్దామా. ఈరోజు ఏ రకం బిల్లు తయారు చేయాలి? GST ఇన్వాయిస్, కొటేషన్, లేదా క్యాష్ మెమో చెప్పండి."
    },
    COLLECTING_CUSTOMER_NAME: {
      en: "Which customer are we billing today?",
      te: "ఈ బిల్లు ఏ కస్టమర్ పేరు మీద తయారు చేయాలి?"
    },
    COLLECTING_CUSTOMER_ADDR: {
      en: "Where is this customer located? You can speak the address or just say 'skip' if you don't need it.",
      te: "కస్టమర్ అడ్రస్ లేదా ఊరి పేరు చెప్తారా? లేదంటే 'స్కిప్' అనండి."
    },
    COLLECTING_ITEM_NAME: {
      en: "What would you like to add? Let me know the product name.",
      te: "ఏ ఐటమ్స్ యాడ్ చేద్దాం? ప్రోడక్ట్ పేరు చెప్పండి (అయిపోతే 'అంతే' లేదా 'పూర్తయింది' చెప్పండి)."
    },
    COLLECTING_ITEM_QTY: {
      en: "How many of these would you like to add?",
      te: "దీని క్వాంటిటీ ఎంతో చెప్తారా?"
    },
    COLLECTING_ITEM_RATE: {
      en: "How much are we charging per unit?",
      te: "ఒక్కదాని ధర ఎంత వేద్దాం?"
    },
    CONFIRMING_TAX: {
      en: "Shall I include GST for this invoice?",
      te: "దీనికి GST వర్తింపజేయాలా?"
    },
    SUMMARY_REVIEW: {
      en: "Everything looks good! Would you like me to generate and download the invoice now?",
      te: "బిల్లు అంతా సిద్ధంగా ఉంది అండీ. ఇన్‌వాయిస్ పిడిఎఫ్ డౌన్‌లోడ్ చేయమంటారా?"
    },
    CLARIFYING_DUPLICATE: {
      en: "This product is already on the invoice. Shall I merge the quantities, or would you prefer a separate line item?",
      te: "ఈ ఐటమ్ ఇప్పటికే బిల్లులో ఉంది. క్వాంటిటీని కలపమంటారా (merge) లేదా వేరే వరుసగా రాయమంటారా (separate)?"
    },
    CLARIFYING_RATE_AMBIGUITY: {
      en: "Just double-checking the rate. Did you mean ₹50, ₹500, or ₹5000?",
      te: "ఒక్కసారి ధర కన్ఫర్మ్ చేయండి. మీరు ₹50 చెప్పారా, ₹500 చెప్పారా లేక ₹5000 చెప్పారా?"
    },
    CLARIFYING_PRODUCT_SUGGESTION: {
      en: "I found a few similar items in the catalog. Which one did you mean?",
      te: "మన కేటలాగ్‌లో కొన్ని సరిపోలే ప్రోడక్ట్స్ కనిపించాయి. ఇందులో ఏది యాడ్ చేయాలి?"
    },
    CONFIRMING_DESTRUCTIVE: {
      en: "Are you sure you'd like to perform this action? This will clear or cancel the invoice.",
      te: "మీరు ఖచ్చితంగా ఈ ఇన్వాయిస్‌ను రీసెట్ లేదా క్యాన్సిల్ చేయాలనుకుంటున్నారా?"
    },
    CONFIRMING_LOW_CONFIDENCE: {
      en: "Is this action correct?",
      te: "నేను విన్నది సరైనదేనా?"
    },
    COMPLETE: {
      en: "Your invoice is ready! The PDF has been downloaded successfully.",
      te: "మీ ఇన్వాయిస్ రెడీ అయిపోయింది అండీ! PDF కూడా డౌన్‌లోడ్ చేసాము."
    }
  };

  const speakText = (text: string, langCode: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const wasListening = isListening;
    if (wasListening) {
      stopListening();
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    const voices = window.speechSynthesis.getVoices();
    let voice = null;
    if (langCode.startsWith("te")) {
      voice = voices.find(v => v.lang.startsWith("te") && v.name.toLowerCase().includes("gita")) ||
              voices.find(v => v.lang.startsWith("te"));
    } else {
      voice = voices.find(v => v.lang.startsWith("en-IN") && (v.name.toLowerCase().includes("veena") || v.name.toLowerCase().includes("rishi") || v.name.toLowerCase().includes("isha") || v.name.toLowerCase().includes("sangeeta"))) ||
              voices.find(v => v.lang.startsWith("en-IN")) ||
              voices.find(v => v.lang.startsWith("en-US") && v.name.toLowerCase().includes("samantha")) ||
              voices.find(v => v.lang.startsWith("en"));
    }

    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;

    utterance.onend = () => {
      if (wasListening && showAiDrawer) {
        startListening();
      }
    };

    utterance.onerror = () => {
      if (wasListening && showAiDrawer) {
        startListening();
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const startConversationalAssistant = () => {
    setShowAiDrawer(true);
    resetTranscript();
    
    // Clear context and FSM
    setFsmState("COLLECTING_DOC_TYPE");
    setFsmContext({
      btype: "gst",
      cname: "",
      caddr: "",
      cgstin: "",
      po: "",
      transport: "",
      rows: [],
      applyGst: true,
      currentItem: { p: "", h: "", q: "", r: "" },
      history: []
    });

    const initialMsg = {
      sender: "ai" as const,
      text: FSM_PROMPTS.COLLECTING_DOC_TYPE.en,
      teText: FSM_PROMPTS.COLLECTING_DOC_TYPE.te,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    setChatMessages([initialMsg]);
    setActiveFieldFocus("btype");

    const speakPhrase = language === "te-IN" ? FSM_PROMPTS.COLLECTING_DOC_TYPE.te : FSM_PROMPTS.COLLECTING_DOC_TYPE.en;
    speakText(speakPhrase, language);
  };

  const handleMicClick = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  };

  const handleConversationalInput = async (userInputText: string, confidenceScore?: number) => {
    if (!userInputText.trim()) return;

    // 1. Transcript Filler Cleanup
    let cleanedInput = userInputText.toLowerCase().trim();
    const fillers = [
      /\buh\b/g, /\bumm\b/g, /\bum\b/g, /\beh\b/g, /\bah\b/g, 
      /\bactually\b/g, /\bbasically\b/g, /\byou know\b/g, 
      /\blisten\b/g, /\bso yeah\b/g, /\bwell\b/g, /\bhaha\b/g
    ];
    fillers.forEach(regex => {
      cleanedInput = cleanedInput.replace(regex, "");
    });
    cleanedInput = cleanedInput.replace(/\s+/g, " ").trim();
    let displayInput = cleanedInput ? cleanedInput.charAt(0).toUpperCase() + cleanedInput.slice(1) : userInputText;

    // 2. Low Confidence Failsafe Intercept
    let nextContext = { ...fsmContext };
    if (confidenceScore !== undefined && confidenceScore < 80) {
      const parsedTemp = fallbackParseInput(cleanedInput, fsmState, language);
      if (parsedTemp && parsedTemp.intent === "COMMAND" && parsedTemp.command) {
        nextContext.pendingCommand = parsedTemp.command;
        setFsmState("CONFIRMING_LOW_CONFIDENCE");
        setFsmContext(nextContext);
        
        let cmdDesc = "";
        let cmdDescTe = "";
        const { type, data } = parsedTemp.command;
        if (type === "ADD_ITEM") {
          cmdDesc = `add ${data.q || "1"} ${data.p || "item"} at ₹${data.r || "0"}`;
          cmdDescTe = `${data.p || "ఐటమ్"} ని ₹${data.r || "0"} ధరతో ${data.q || "1"} చేర్చడం`;
        } else if (type === "REMOVE_ITEM") {
          cmdDesc = `remove ${data.p || "item"}`;
          cmdDescTe = `${data.p || "ఐటమ్"} ని తీసివేయడం`;
        } else {
          cmdDesc = `${type.replace("_", " ").toLowerCase()}`;
          cmdDescTe = "ఈ మార్పును చేయడం";
        }
        
        const confirmTextEn = `I think I heard: "${cmdDesc}". Is that correct?`;
        const confirmTextTe = `నేను "${cmdDescTe}" అని విన్నాను. ఇది సరైనదేనా?`;
        
        const userMsg = {
          sender: "user" as const,
          text: displayInput,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        const confirmBubble = {
          sender: "ai" as const,
          text: confirmTextEn,
          teText: confirmTextTe,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, userMsg, confirmBubble]);
        speakText(language === "te-IN" ? confirmTextTe : confirmTextEn, language);
        resetTranscript();
        return;
      }
    }

    // Add User message bubble
    const userMsg = {
      sender: "user" as const,
      text: displayInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMsg]);
    setIsParsing(true);

    try {
      const res = await fetch("/api/parse-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: userInputText,
          currentState: fsmState,
          currentContext: fsmContext
        }),
      });

      let parsed;
      if (res.ok) {
        try {
          parsed = await res.json();
          if (!parsed || typeof parsed !== "object" || !parsed.intent) {
            console.warn("AI responded with incomplete JSON structure. Triggering rules fallback.");
            parsed = fallbackParseInput(userInputText, fsmState, language);
          }
        } catch (jsonErr) {
          console.warn("Failed to parse AI response JSON. Triggering rules fallback:", jsonErr);
          parsed = fallbackParseInput(userInputText, fsmState, language);
        }
      } else {
        const errorText = await res.text().catch(() => "Unknown error");
        console.warn(`AI dialogue parser endpoint returned ${res.status}: ${errorText}. Falling back to local rules-based parser.`);
        parsed = fallbackParseInput(userInputText, fsmState, language);
      }

      await handleFsmTransition(parsed, userInputText);
    } catch (err: any) {
      console.warn("AI dialogue parser exception. Falling back to local rule-based parser:", err);
      try {
        const parsed = fallbackParseInput(userInputText, fsmState, language);
        await handleFsmTransition(parsed, userInputText);
      } catch (fallbackErr: any) {
        console.error("Local fallback parser also failed:", fallbackErr);
        const errorMsg = {
          sender: "ai" as const,
          text: "Error: Could not parse input. Please try typing manually.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, errorMsg]);
      }
    } finally {
      setIsParsing(false);
      resetTranscript();
    }
  };

  const matchProduct = (inputName: string): { matches: string[]; exact: boolean } => {
    const cleanInput = inputName.toLowerCase().trim();
    const exactMatch = catalog.find(item => item.name.toLowerCase() === cleanInput);
    if (exactMatch) {
      return { matches: [exactMatch.name], exact: true };
    }

    // Check substring matches
    const substringMatches = catalog.filter(item => 
      item.name.toLowerCase().includes(cleanInput) || cleanInput.includes(item.name.toLowerCase())
    );
    if (substringMatches.length > 0) {
      return { matches: substringMatches.map(m => m.name), exact: substringMatches.length === 1 };
    }

    // Fuzzy matching using Levenshtein distance
    const suggestions = catalog
      .map(item => ({
        name: item.name,
        distance: getLevenshteinDistance(cleanInput, item.name.toLowerCase())
      }))
      .filter(item => item.distance <= 3)
      .sort((a, b) => a.distance - b.distance)
      .map(item => item.name);

    return { matches: suggestions, exact: false };
  };

  const handleFsmTransition = async (aiParsed: any, rawText: string) => {
    if (!aiParsed || typeof aiParsed !== "object") {
      console.warn("Invalid FSM dialog structure. Invoking rules fallback.");
      aiParsed = fallbackParseInput(rawText, fsmState, language);
    }

    let {
      value = null,
      intent = "NEXT",
      corrections = {},
      teFeedback = "",
      command = null
    } = aiParsed;
    
    let nextContext = { ...fsmContext };

    // --- Layer 3: Command Validation Layer ---
    const runValidationChecks = (cmd: any): { valid: boolean; stateChange?: string; errorMsgEn?: string; errorMsgTe?: string; teFeedback?: string; updatedCmd?: any } => {
      if (!cmd || typeof cmd !== "object") return { valid: true };
      const { type, data } = cmd;

      if (type === "ADD_ITEM") {
        const parsedName = translateOrTransliterateTelugu(data.p || "Item");
        const matchResult = matchProduct(parsedName);
        let pName = parsedName;

        if (matchResult.exact && matchResult.matches.length === 1) {
          pName = matchResult.matches[0];
          data.p = pName; // auto-correct in command payload!
        } else if (!matchResult.exact && matchResult.matches.length > 1) {
          // Ambiguous match! Transition to CLARIFYING_PRODUCT_SUGGESTION
          nextContext.pendingCommand = cmd;
          nextContext.productSuggestions = matchResult.matches;
          const optionsStr = matchResult.matches.map((m, idx) => `${idx + 1}. ${m}`).join(", ");
          return {
            valid: false,
            stateChange: "CLARIFYING_PRODUCT_SUGGESTION",
            errorMsgEn: `I found multiple matching products in the catalog. Did you mean: ${optionsStr}?`,
            teFeedback: `చాలా మ్యాచింగ్ ఐటమ్స్ ఉన్నాయి.`,
            errorMsgTe: `కేటలాగ్‌లో కొన్ని సరిపోలే ప్రోడక్ట్స్ కనిపించాయి. మీరు ఏది ఉద్దేశించారు: ${optionsStr}?`
          };
        }

        const lowerName = pName.toLowerCase().trim();

        // 1. Invalid / Negative / Zero Quantity Check
        const parsedQtyVal = parseFloat(String(data.q));
        if (data.q !== null && data.q !== undefined && (isNaN(parsedQtyVal) || parsedQtyVal <= 0)) {
          nextContext.currentItem = { p: pName, h: "", q: "", r: String(data.r || "0") };
          return {
            valid: false,
            stateChange: "COLLECTING_ITEM_QTY",
            errorMsgEn: `Quantity must be greater than zero. How many ${pName} would you like to add?`,
            errorMsgTe: `క్వాంటిటీ సున్నా కంటే ఎక్కువ ఉండాలి. దయచేసి ${pName} క్వాంటిటీ ఎంతో చెప్పండి.`
          };
        }

        // Missing Quantity Check
        if (data.q === null || data.q === undefined) {
          nextContext.currentItem = { p: pName, h: "", q: "", r: String(data.r || "0") };
          return {
            valid: false,
            stateChange: "COLLECTING_ITEM_QTY",
            errorMsgEn: `How many ${pName} would you like to add?`,
            errorMsgTe: `దయచేసి ${pName} క్వాంటిటీ ఎంత చెప్పండి.`
          };
        }

        // 2. Invalid / Negative / Zero Rate Check
        const parsedRateVal = parseFloat(String(data.r));
        if (data.r !== null && data.r !== undefined && (isNaN(parsedRateVal) || parsedRateVal <= 0)) {
          const finalQty = `${data.q} ${data.u || "Nos"}`;
          nextContext.currentItem = { p: pName, h: "", q: finalQty, r: "" };
          return {
            valid: false,
            stateChange: "COLLECTING_ITEM_RATE",
            errorMsgEn: `Rate must be greater than zero. What is the rate for ${pName}?`,
            errorMsgTe: `ధర సున్నా కంటే ఎక్కువ ఉండాలి. దయచేసి ${pName} ధర ఎంతో చెప్పండి.`
          };
        }

        // Missing Rate Check
        if (data.r === null || data.r === undefined) {
          const finalQty = `${data.q} ${data.u || "Nos"}`;
          nextContext.currentItem = { p: pName, h: "", q: finalQty, r: "" };
          return {
            valid: false,
            stateChange: "COLLECTING_ITEM_RATE",
            errorMsgEn: `What is the rate for ${pName}?`,
            errorMsgTe: `దయచేసి ${pName} ధర ఎంత చెప్పండి.`
          };
        }

        // 3. Ambiguous Rate Check (e.g. rate 50 for motors/pumps/starters/condensers)
        const parsedRate = parseFloat(String(data.r));
        const ambiguousWords = ["motor", "starter", "pump", "aquatex", "texmo", "condenser", "rewinding"];
        const isAmbiguousMachine = ambiguousWords.some(w => lowerName.includes(w));
        if (isAmbiguousMachine && parsedRate > 0 && parsedRate <= 100) {
          nextContext.pendingCommand = cmd;
          return {
            valid: false,
            stateChange: "CLARIFYING_RATE_AMBIGUITY",
            errorMsgEn: `I detected an ambiguous rate of ₹${parsedRate} for ${pName}. Did you mean: ₹${parsedRate}, ₹${parsedRate * 10}, or ₹${parsedRate * 100}?`,
            teFeedback: `ధర అస్పష్టంగా ఉంది.`,
            errorMsgTe: `మీరు ${pName} కి ₹${parsedRate} చెప్పారా, లేక ₹${parsedRate * 10} లేదా ₹${parsedRate * 100} నా?`
          };
        }

        // 4. Duplicate Item Check
        const isDuplicate = rows.some(r => r.p && r.p.toLowerCase().trim() === lowerName);
        if (isDuplicate) {
          nextContext.pendingCommand = cmd;
          return {
            valid: false,
            stateChange: "CLARIFYING_DUPLICATE",
            errorMsgEn: `${pName} already exists in the invoice. Would you like to merge quantities or create a separate line item?`,
            teFeedback: `ఈ ఐటమ్ ఇప్పటికే బిల్లులో ఉంది.`,
            errorMsgTe: `${pName} ఇప్పటికే బిల్లులో ఉంది. క్వాంటిటీని కలపాలా (merge) లేక కొత్త వరుసగా యాడ్ చేయాలా (separate)?`
          };
        }
      }

      if (type === "ADD_MULTI_ITEMS") {
        const items = data.items || [];
        for (let i = 0; i < items.length; i++) {
          const singleCmd = { type: "ADD_ITEM", data: items[i] };
          const check = runValidationChecks(singleCmd);
          if (!check.valid) {
            // Keep track of which multi-item failed
            nextContext.pendingCommand = cmd;
            return check;
          }
        }
      }

      if (type === "CHANGE_QUANTITY") {
        const qVal = parseFloat(String(data.q));
        if (isNaN(qVal) || qVal <= 0) {
          return {
            valid: false,
            stateChange: fsmState,
            errorMsgEn: "Quantity must be a positive number greater than zero.",
            errorMsgTe: "క్వాంటిటీ ఖచ్చితంగా సున్నా కంటే ఎక్కువ ఉండాలి."
          };
        }
      }

      if (type === "CHANGE_RATE") {
        const rVal = parseFloat(String(data.r));
        if (isNaN(rVal) || rVal <= 0) {
          return {
            valid: false,
            stateChange: fsmState,
            errorMsgEn: "Rate must be a positive number greater than zero.",
            errorMsgTe: "ధర ఖచ్చితంగా సున్నా కంటే ఎక్కువ ఉండాలి."
          };
        }
      }

      if (type === "APPLY_DISCOUNT") {
        const percent = parseFloat(String(data.percent));
        if (isNaN(percent) || percent < 0 || percent > 100) {
          return {
            valid: false,
            stateChange: fsmState,
            errorMsgEn: "Discount percentage must be between 0 and 100.",
            errorMsgTe: "డిస్కౌంట్ శాతం 0 నుండి 100 లోపు మాత్రమే ఉండాలి."
          };
        }
      }

      return { valid: true };
    };

    // Intercept clarifying states first
    if (fsmState === "CLARIFYING_DUPLICATE") {
      const choice = value || "separate";
      const pending = fsmContext.pendingCommand;
      nextContext.pendingCommand = null;

      if (pending) {
        pushToUndo();
        const pName = translateOrTransliterateTelugu(pending.data.p || "Item");
        const lowerName = pName.toLowerCase().trim();
        const qVal = String(pending.data.q || "1").replace(/[^0-9.]/g, "");
        const rVal = String(pending.data.r || "0").replace(/[^0-9.]/g, "");
        const unit = pending.data.u || "Nos";
        
        const qtyNum = parseFloat(qVal) || 1;
        const rateNum = parseFloat(rVal) || 0;
        
        if (choice === "merge") {
          // Merge quantities
          const updatedRows = rows.map(r => {
            if (r.p && r.p.toLowerCase().trim() === lowerName) {
              const currentQtyNum = parseFloat(r.q) || 0;
              const newQtyNum = currentQtyNum + qtyNum;
              const finalQty = `${newQtyNum} ${unit}`;
              const amount = Math.round(newQtyNum * rateNum * 100) / 100;
              return { ...r, q: finalQty, r: rVal, a: amount };
            }
            return r;
          });
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          
          teFeedback = `క్వాంటిటీని కలిపి అప్‌డేట్ చేసాను`;
        } else {
          // Add as separate line item
          const finalQty = qVal ? `${qVal} ${unit}` : `1 ${unit}`;
          const amount = Math.round(qtyNum * rateNum * 100) / 100;
          const newRow = { p: pName, h: "", q: finalQty, r: rVal, a: amount };
          const updatedRows = [...rows.filter(r => r.p || r.h || r.q || r.r), newRow];
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          
          teFeedback = `కొత్త వరుసగా చేర్చాను`;
        }
      }

      setFsmState("COLLECTING_ITEM_NAME");
      setFsmContext(nextContext);
      setActiveFieldFocus("rows-particulars");

      const prompts = FSM_PROMPTS.COLLECTING_ITEM_NAME;
      const completeMsg = {
        sender: "ai" as const,
        text: `Done! I've resolved that duplicate item for you. ${prompts.en}`,
        teText: `${teFeedback}. ${prompts.te}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, completeMsg]);

      const speakPhrase = language === "te-IN" ? `${teFeedback}. ${prompts.te}` : `Done! I've resolved that duplicate item for you. ${prompts.en}`;
      speakText(speakPhrase, language);
      return;
    }

    if (fsmState === "CLARIFYING_RATE_AMBIGUITY") {
      const chosenRate = value || "5000";
      const pending = fsmContext.pendingCommand;
      nextContext.pendingCommand = null;

      if (pending) {
        // Update pending rate and re-run FSM transition
        if (pending.type === "ADD_ITEM") {
          pending.data.r = chosenRate;
        } else if (pending.type === "ADD_MULTI_ITEMS") {
          // Update the first item in the list that had missing or ambiguous rate
          const ambiguousWords = ["motor", "starter", "pump", "aquatex", "texmo", "condenser", "rewinding"];
          for (let i = 0; i < pending.data.items.length; i++) {
            const it = pending.data.items[i];
            const lowerName = String(it.p || "").toLowerCase();
            const isAmbiguous = ambiguousWords.some(w => lowerName.includes(w));
            const parsedRate = parseFloat(String(it.r));
            if (isAmbiguous && parsedRate > 0 && parsedRate <= 100) {
              it.r = chosenRate;
              break;
            }
          }
        }
        setFsmState("COLLECTING_ITEM_NAME");
        setFsmContext(nextContext);
        // Recursively re-run
        await handleFsmTransition({ intent: "COMMAND", command: pending }, rawText);
        return;
      }

      setFsmState("COLLECTING_ITEM_NAME");
      setFsmContext(nextContext);
      return;
    }

    if (fsmState === "CLARIFYING_PRODUCT_SUGGESTION") {
      const choice = value;
      const pending = fsmContext.pendingCommand;
      nextContext.pendingCommand = null;
      nextContext.productSuggestions = [];

      let resolvedProduct = "";
      const suggestions = fsmContext.productSuggestions || [];
      const parsedIndex = parseInt(String(choice)) - 1;

      if (!isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex < suggestions.length) {
        resolvedProduct = suggestions[parsedIndex];
      } else if (typeof choice === "string" && choice.trim()) {
        const chosenStr = choice.toLowerCase().trim();
        const exactMatch = suggestions.find((s: string) => s.toLowerCase().trim() === chosenStr);
        if (exactMatch) {
          resolvedProduct = exactMatch;
        } else {
          let minDistance = 999;
          let closestSuggestion = "";
          suggestions.forEach((s: string) => {
            const dist = getLevenshteinDistance(chosenStr, s.toLowerCase().trim());
            if (dist < minDistance) {
              minDistance = dist;
              closestSuggestion = s;
            }
          });
          if (minDistance <= 3) {
            resolvedProduct = closestSuggestion;
          }
        }
      }

      if (pending && resolvedProduct) {
        if (pending.type === "ADD_ITEM") {
          pending.data.p = resolvedProduct;
        } else if (pending.type === "ADD_MULTI_ITEMS") {
          for (let i = 0; i < pending.data.items.length; i++) {
            const it = pending.data.items[i];
            const matchResult = matchProduct(it.p || "");
            if (!matchResult.exact && matchResult.matches.length > 1) {
              it.p = resolvedProduct;
              break;
            }
          }
        }
        setFsmState("COLLECTING_ITEM_NAME");
        setFsmContext(nextContext);
        await handleFsmTransition({ intent: "COMMAND", command: pending }, rawText);
        return;
      }

      // If we couldn't resolve, redirect to item name collection gracefully
      setFsmState("COLLECTING_ITEM_NAME");
      setFsmContext(nextContext);
      const prompts = FSM_PROMPTS.COLLECTING_ITEM_NAME;
      const errorMsg = {
        sender: "ai" as const,
        text: `Invalid selection. ${prompts.en}`,
        teText: `ఎంపిక సరికాదు. ${prompts.te}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, errorMsg]);
      speakText(language === "te-IN" ? `ఎంపిక సరికాదు. ${prompts.te}` : `Invalid selection. ${prompts.en}`, language);
      return;
    }

    if (fsmState === "CONFIRMING_DESTRUCTIVE") {
      const isConfirmed = value === true;
      const pending = fsmContext.pendingCommand;
      nextContext.pendingCommand = null;

      if (isConfirmed && pending) {
        if (pending.type === "START_NEW") {
          resetForm();
          resetFsm();
          return;
        }
        if (pending.type === "CANCEL") {
          resetFsm();
          return;
        }
      }

      // If they rejected or no pending command, go back to COLLECTING_ITEM_NAME
      setFsmState("COLLECTING_ITEM_NAME");
      setFsmContext(nextContext);
      
      const prompts = FSM_PROMPTS.COLLECTING_ITEM_NAME;
      const cancelBubble = {
        sender: "ai" as const,
        text: `Action cancelled. ${prompts.en}`,
        teText: `రద్దు చేసాము. ${prompts.te}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, cancelBubble]);
      speakText(language === "te-IN" ? `రద్దు చేసాము. ${prompts.te}` : `Action cancelled. ${prompts.en}`, language);
      return;
    }

    if (fsmState === "CONFIRMING_LOW_CONFIDENCE") {
      const isConfirmed = value === true;
      const pending = fsmContext.pendingCommand;
      nextContext.pendingCommand = null;

      if (isConfirmed && pending) {
        setFsmState("COLLECTING_ITEM_NAME");
        setFsmContext(nextContext);
        await handleFsmTransition({ intent: "COMMAND", command: pending }, rawText);
        return;
      }

      setFsmState("COLLECTING_ITEM_NAME");
      setFsmContext(nextContext);
      
      const prompts = FSM_PROMPTS.COLLECTING_ITEM_NAME;
      const cancelBubble = {
        sender: "ai" as const,
        text: `Got it, I've cancelled the action. Let's continue with the invoice. ${prompts.en}`,
        teText: `సరేనండి, రద్దు చేసాము. ${prompts.te}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, cancelBubble]);
      speakText(language === "te-IN" ? `సరేనండి, రద్దు చేసాము. ${prompts.te}` : `Got it, I've cancelled the action. ${prompts.en}`, language);
      return;
    }

    if (intent === "COMMAND" || command) {
      // Intercept destructive commands for confirmation lock
      if (command && (command.type === "START_NEW" || command.type === "CANCEL")) {
        nextContext.pendingCommand = command;
        setFsmState("CONFIRMING_DESTRUCTIVE");
        setFsmContext(nextContext);

        const prompts = FSM_PROMPTS.CONFIRMING_DESTRUCTIVE;
        const confirmBubble = {
          sender: "ai" as const,
          text: prompts.en,
          teText: prompts.te,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, confirmBubble]);
        speakText(language === "te-IN" ? prompts.te : prompts.en, language);
        return;
      }

      // Run Layer 3 validation checks
      const validation = runValidationChecks(command);
      if (!validation.valid) {
        setFsmState(validation.stateChange!);
        setFsmContext(nextContext);
        if (validation.stateChange === "COLLECTING_ITEM_QTY") setActiveFieldFocus("rows-qty");
        else if (validation.stateChange === "COLLECTING_ITEM_RATE") setActiveFieldFocus("rows-rate");

        const errorBubble = {
          sender: "ai" as const,
          text: validation.errorMsgEn!,
          teText: validation.errorMsgTe!,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, errorBubble]);

        const speakPhrase = language === "te-IN" ? validation.errorMsgTe! : validation.errorMsgEn!;
        speakText(speakPhrase, language);
        return;
      }

      pushToUndo();
      const { type, data } = command;
      
      switch (type) {
        case "ADD_ITEM": {
          const pName = translateOrTransliterateTelugu(data.p || "Item");
          const qVal = String(data.q || "1").replace(/[^0-9.]/g, "");
          const rVal = String(data.r || "0").replace(/[^0-9.]/g, "");
          const unit = data.u || "Nos";
          const finalQty = qVal ? `${qVal} ${unit}` : `1 ${unit}`;
          
          const qtyNum = parseFloat(qVal) || 1;
          const rateNum = parseFloat(rVal) || 0;
          const amount = Math.round(qtyNum * rateNum * 100) / 100;
          
          const newRow = { p: pName, h: "", q: finalQty, r: rVal, a: amount };
          const updatedRows = [...rows.filter(r => r.p || r.h || r.q || r.r), newRow];
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          break;
        }
        case "ADD_MULTI_ITEMS": {
          const itemsList = data.items || [];
          let updatedRows = [...rows.filter(r => r.p || r.h || r.q || r.r)];
          
          itemsList.forEach((it: any) => {
            const pName = translateOrTransliterateTelugu(it.p || "Item");
            const qVal = String(it.q || "1").replace(/[^0-9.]/g, "");
            const rVal = String(it.r || "0").replace(/[^0-9.]/g, "");
            const unit = it.u || "Nos";
            const finalQty = qVal ? `${qVal} ${unit}` : `1 ${unit}`;
            
            const qtyNum = parseFloat(qVal) || 1;
            const rateNum = parseFloat(rVal) || 0;
            const amount = Math.round(qtyNum * rateNum * 100) / 100;
            
            updatedRows.push({ p: pName, h: "", q: finalQty, r: rVal, a: amount });
          });
          
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          break;
        }
        case "REMOVE_ITEM": {
          const searchName = String(data.p || "").toLowerCase().trim();
          const updatedRows = rows.filter(r => {
            if (!r.p) return false;
            return r.p.toLowerCase().trim() !== searchName;
          });
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          break;
        }
        case "REMOVE_LAST_ITEM": {
          const updatedRows = [...rows];
          if (updatedRows.length > 0) {
            updatedRows.pop();
          }
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          break;
        }
        case "CHANGE_QUANTITY": {
          const searchName = String(data.p || "").toLowerCase().trim();
          const newQ = String(data.q || "1").replace(/[^0-9.]/g, "");
          
          const updatedRows = rows.map(r => {
            if (r.p && (searchName === "" || r.p.toLowerCase().includes(searchName))) {
              const existingUnit = r.q.replace(/[0-9.\s]/g, "") || "Nos";
              const finalQty = `${newQ} ${existingUnit}`;
              const qtyNum = parseFloat(newQ) || 1;
              const rateNum = parseFloat(r.r) || 0;
              const amount = Math.round(qtyNum * rateNum * 100) / 100;
              return { ...r, q: finalQty, a: amount };
            }
            return r;
          });
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          break;
        }
        case "CHANGE_RATE": {
          const searchName = String(data.p || "").toLowerCase().trim();
          const newR = String(data.r || "0").replace(/[^0-9.]/g, "");
          
          const updatedRows = rows.map(r => {
            if (r.p && (searchName === "" || r.p.toLowerCase().includes(searchName))) {
              const qtyNum = parseFloat(r.q) || 1;
              const rateNum = parseFloat(newR) || 0;
              const amount = Math.round(qtyNum * rateNum * 100) / 100;
              return { ...r, r: newR, a: amount };
            }
            return r;
          });
          setRows(updatedRows);
          nextContext.rows = updatedRows;
          break;
        }
        case "APPLY_DISCOUNT": {
          const percent = parseFloat(data.percent) || 0;
          setDiscount(percent);
          nextContext.discount = percent;
          break;
        }
        case "APPLY_GST": {
          setApplyGst(true);
          nextContext.applyGst = true;
          break;
        }
        case "REMOVE_GST": {
          setApplyGst(false);
          nextContext.applyGst = false;
          break;
        }
        case "ADD_CUSTOMER": {
          if (data.cname) {
            const cleanCname = translateOrTransliterateTelugu(data.cname);
            setCname(cleanCname);
            nextContext.cname = cleanCname;
          }
          if (data.caddr) {
            const cleanCaddr = translateOrTransliterateTelugu(data.caddr);
            setCaddr(cleanCaddr);
            nextContext.caddr = cleanCaddr;
          }
          break;
        }
        case "GENERATE_PDF": {
          saveBill();
          localStorage.removeItem('svs_active_conv');
          setFsmState("COMPLETE");
          setTimeout(() => downloadPDF(), 500);
          break;
        }
        case "START_NEW": {
          resetForm();
          resetFsm();
          break;
        }
        case "CANCEL": {
          resetFsm();
          break;
        }
        case "CHANGE_CUSTOMER_NAME": {
          const name = translateOrTransliterateTelugu(data.name);
          setCname(name);
          nextContext.cname = name;
          teFeedback = `కస్టమర్ పేరును ${name} గా మార్చాము`;
          break;
        }
        case "CHANGE_CUSTOMER_ADDR": {
          const addr = translateOrTransliterateTelugu(data.addr);
          setCaddr(addr);
          nextContext.caddr = addr;
          teFeedback = `అడ్రస్‌ను ${addr} గా మార్చాము`;
          break;
        }
        case "CHANGE_PO": {
          const poVal = data.po;
          setPo(poVal);
          nextContext.po = poVal;
          teFeedback = `PO నెంబర్‌ను ${poVal} గా మార్చాము`;
          break;
        }
        case "CHANGE_TRANSPORT": {
          const transp = translateOrTransliterateTelugu(data.transport);
          setTransport(transp);
          nextContext.transport = transp;
          teFeedback = `ట్రాన్స్‌పోర్ట్‌ను ${transp} గా మార్చాము`;
          break;
        }
        case "CHANGE_DOC_TYPE": {
          const docT = data.btype;
          setBtype(docT);
          nextContext.btype = docT;
          teFeedback = `బిల్లు రకాన్ని ${docT} గా మార్చాము`;
          break;
        }
        case "CHANGE_DATE": {
          const dt = data.date;
          setDate(dt);
          nextContext.date = dt;
          teFeedback = `తేదీని ${dt} గా మార్చాము`;
          break;
        }
        case "SORT_BY_AMOUNT": {
          const filteredRows = rows.filter(r => r.p || r.h || r.q || r.r);
          const sorted = [...filteredRows].sort((a, b) => (b.a || 0) - (a.a || 0));
          setRows(sorted);
          nextContext.rows = sorted;
          teFeedback = "ధరల ప్రకారం ఐటమ్స్ అమర్చాము";
          break;
        }
        case "SORT_BY_NAME": {
          const filteredRows = rows.filter(r => r.p || r.h || r.q || r.r);
          const sorted = [...filteredRows].sort((a, b) => a.p.localeCompare(b.p));
          setRows(sorted);
          nextContext.rows = sorted;
          teFeedback = "పేర్ల ప్రకారం ఐటమ్స్ అమర్చాము";
          break;
        }
        case "MOVE_ROW": {
          const from = parseInt(data.from) - 1;
          const to = parseInt(data.to) - 1;
          const filteredRows = rows.filter(r => r.p || r.h || r.q || r.r);
          if (from >= 0 && from < filteredRows.length && to >= 0 && to < filteredRows.length) {
            const updated = [...filteredRows];
            const [moved] = updated.splice(from, 1);
            updated.splice(to, 0, moved);
            setRows(updated);
            nextContext.rows = updated;
            teFeedback = `${from + 1} వరుసను ${to + 1} కి మార్చాము`;
          } else {
            teFeedback = "వరుస నెంబర్ సరికాదు";
          }
          break;
        }
        case "REMOVE_ROW_BY_INDEX": {
          const idx = parseInt(data.index) - 1;
          const filteredRows = rows.filter(r => r.p || r.h || r.q || r.r);
          if (idx >= 0 && idx < filteredRows.length) {
            const removedItem = filteredRows[idx].p || "Item";
            const updated = filteredRows.filter((_, i) => i !== idx);
            setRows(updated);
            nextContext.rows = updated;
            teFeedback = `${removedItem} ని తీసివేసాము`;
          } else {
            teFeedback = "ఐటమ్ నెంబర్ సరికాదు";
          }
          break;
        }
        case "SAVE_DRAFT": {
          const draft = {
            state: fsmState,
            context: fsmContext,
            messages: chatMessages
          };
          try {
            localStorage.setItem('svs_active_conv', JSON.stringify(draft));
          } catch (e) {}
          break;
        }
        case "UNDO": {
          const newUndoStack = [...undoStack];
          newUndoStack.pop(); // discard snapshot we just pushed
          setUndoStack(newUndoStack);
          
          if (newUndoStack.length > 0) {
            const prevSnapshot = newUndoStack[newUndoStack.length - 1];
            setBtype(prevSnapshot.btype);
            setCname(prevSnapshot.cname);
            setCaddr(prevSnapshot.caddr);
            setCgstin(prevSnapshot.cgstin);
            setApplyGst(prevSnapshot.applyGst);
            setDiscount(prevSnapshot.discount !== undefined ? prevSnapshot.discount : 0);
            setRows(prevSnapshot.rows);
            nextContext.rows = prevSnapshot.rows;
            nextContext.cname = prevSnapshot.cname;
            nextContext.caddr = prevSnapshot.caddr;
            nextContext.applyGst = prevSnapshot.applyGst;
            nextContext.discount = prevSnapshot.discount !== undefined ? prevSnapshot.discount : 0;
          }
          break;
        }
        case "REDO": {
          if (redoStack.length > 0) {
            const newRedoStack = [...redoStack];
            const nextSnapshot = newRedoStack.pop();
            setRedoStack(newRedoStack);
            
            if (nextSnapshot) {
              setBtype(nextSnapshot.btype);
              setCname(nextSnapshot.cname);
              setCaddr(nextSnapshot.caddr);
              setCgstin(nextSnapshot.cgstin);
              setApplyGst(nextSnapshot.applyGst);
              setDiscount(nextSnapshot.discount !== undefined ? nextSnapshot.discount : 0);
              setRows(nextSnapshot.rows);
              nextContext.rows = nextSnapshot.rows;
              nextContext.cname = nextSnapshot.cname;
              nextContext.caddr = nextSnapshot.caddr;
              nextContext.applyGst = nextSnapshot.applyGst;
              nextContext.discount = nextSnapshot.discount !== undefined ? nextSnapshot.discount : 0;
            }
          }
          break;
        }
        default:
          break;
      }
      
      let friendlyText = "";
      switch (type) {
        case "ADD_ITEM":
          friendlyText = `Done. I've added ${data.p || "the item"} to the invoice.`;
          break;
        case "ADD_MULTI_ITEMS":
          friendlyText = `Got it. I've added all those items to the invoice.`;
          break;
        case "REMOVE_ITEM":
          friendlyText = `Okay, I've removed ${data.p || "the item"} from the invoice.`;
          break;
        case "REMOVE_LAST_ITEM":
          friendlyText = `Done, I've removed the last item.`;
          break;
        case "CHANGE_QUANTITY":
          friendlyText = `Got it. I've updated the quantity to ${data.q}.`;
          break;
        case "CHANGE_RATE":
          friendlyText = `Done. I've updated the rate to ₹${data.r}.`;
          break;
        case "APPLY_DISCOUNT":
          friendlyText = `Applied a ${data.percent}% discount to the invoice.`;
          break;
        case "APPLY_GST":
          friendlyText = `GST is now included in the total.`;
          break;
        case "REMOVE_GST":
          friendlyText = `Okay, GST has been removed from this invoice.`;
          break;
        case "CHANGE_CUSTOMER_NAME":
          friendlyText = `Done, customer name is now updated to ${data.name}.`;
          break;
        case "CHANGE_CUSTOMER_ADDR":
          friendlyText = `Got it. I've updated the address to ${data.addr}.`;
          break;
        case "CHANGE_PO":
          friendlyText = `Done. I've updated the PO number to ${data.po}.`;
          break;
        case "CHANGE_TRANSPORT":
          friendlyText = `Got it. I've updated the transport mode to ${data.transport}.`;
          break;
        case "CHANGE_DOC_TYPE":
          friendlyText = `Okay, I've changed the billing document type to ${data.btype?.toUpperCase()}.`;
          break;
        case "CHANGE_DATE":
          friendlyText = `Done. The invoice date is now updated to ${data.date}.`;
          break;
        case "SORT_BY_AMOUNT":
          friendlyText = `I've sorted the items by total amount.`;
          break;
        case "SORT_BY_NAME":
          friendlyText = `I've sorted the items alphabetically by name.`;
          break;
        case "MOVE_ROW":
          friendlyText = `Done, I've moved that item to position ${data.to}.`;
          break;
        case "REMOVE_ROW_BY_INDEX":
          friendlyText = `Removed the item at position ${data.index}.`;
          break;
        case "UNDO":
          friendlyText = `Undone. I've reverted the last change.`;
          break;
        case "REDO":
          friendlyText = `Redone. I've re-applied the action.`;
          break;
        case "SAVE_DRAFT":
          friendlyText = `I've successfully saved a draft of this invoice.`;
          break;
        default:
          friendlyText = `Command executed: ${type.replace("_", " ")}.`;
          break;
      }

      setFsmContext(nextContext);
      
      const feedbackBubble = {
        sender: "ai" as const,
        text: friendlyText,
        teText: teFeedback || `ఆదేశాన్ని అమలు చేసాను.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, feedbackBubble]);
      
      const speakPhrase = language === "te-IN" 
        ? (teFeedback || "ఆదేశాన్ని అమలు చేసాను.") 
        : friendlyText;
      speakText(speakPhrase, language);
      return;
    }

    if (intent === "CORRECT" && corrections) {
      pushToUndo();
      Object.keys(corrections).forEach(path => {
        let val = corrections[path];
        if (typeof val === "string") {
          val = translateOrTransliterateTelugu(val);
        }
        if (path === "cname") { setCname(val); nextContext.cname = val; }
        else if (path === "caddr") { setCaddr(val); nextContext.caddr = val; }
        else if (path === "applyGst") { setApplyGst(val === true); nextContext.applyGst = val === true; }
        else if (path === "btype") { setBtype(val); nextContext.btype = val; }
      });
      setFsmContext(nextContext);
      
      const correctionBubble = {
        sender: "ai" as const,
        text: `Correction applied successfully.`,
        teText: teFeedback || `సవరణలు చేసాను.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, correctionBubble]);

      const speakPhrase = language === "te-IN" ? (teFeedback || "సవరణలు చేసాను.") : "Correction applied successfully.";
      speakText(speakPhrase, language);
      return;
    }

    if (intent === "PREVIOUS") {
      const history = [...fsmContext.history];
      if (history.length > 0) {
        const prevState = history.pop() as string;
        setFsmState(prevState);
        nextContext.history = history;
        setFsmContext(nextContext);
        
        const prompts = (FSM_PROMPTS as any)[prevState];
        const goBackBubble = {
          sender: "ai" as const,
          text: `Going back. ${prompts.en}`,
          teText: prompts.te,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, goBackBubble]);

        const speakPhrase = language === "te-IN" ? `వెనక్కి వెళ్తున్నాము. ${prompts.te}` : `Going back. ${prompts.en}`;
        speakText(speakPhrase, language);
      } else {
        const cannotGoBackMsg = {
          sender: "ai" as const,
          text: "Already at the beginning of document creation.",
          teText: "ఇదే మొదటి స్టెప్, వెనక్కి వెళ్ళలేము.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages(prev => [...prev, cannotGoBackMsg]);

        const speakPhrase = language === "te-IN" ? "ఇదే మొదటి స్టెప్, వెనక్కి వెళ్ళలేము." : "Already at the beginning of document creation.";
        speakText(speakPhrase, language);
      }
      return;
    }

    if (intent === "REPEAT") {
      const prompts = (FSM_PROMPTS as any)[fsmState];
      const repeatBubble = {
        sender: "ai" as const,
        text: prompts.en,
        teText: prompts.te,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, repeatBubble]);

      const speakPhrase = language === "te-IN" ? prompts.te : prompts.en;
      speakText(speakPhrase, language);
      return;
    }

    // Default flow: intent === "NEXT"
    pushToUndo();
    nextContext.history = [...fsmContext.history, fsmState];
    let nextState = fsmState;

    switch (fsmState) {
      case "COLLECTING_DOC_TYPE": {
        const val = value || "gst";
        setBtype(val as any);
        nextContext.btype = val;
        nextState = "COLLECTING_CUSTOMER_NAME";
        setActiveFieldFocus("cname");
        break;
      }
      case "COLLECTING_CUSTOMER_NAME": {
        const val = value || "Cash Customer";
        const cleanVal = translateOrTransliterateTelugu(val as string);
        setCname(cleanVal);
        nextContext.cname = cleanVal;
        nextState = "COLLECTING_CUSTOMER_ADDR";
        setActiveFieldFocus("caddr");
        break;
      }
      case "COLLECTING_CUSTOMER_ADDR": {
        const val = value === "skip" || !value ? "" : value;
        const cleanVal = translateOrTransliterateTelugu(val as string);
        setCaddr(cleanVal);
        nextContext.caddr = cleanVal;
        nextState = "COLLECTING_ITEM_NAME";
        setActiveFieldFocus("rows-particulars");
        break;
      }
      case "COLLECTING_ITEM_NAME": {
        if (value === "finish") {
          const nonElItems = rows.filter(r => r.p.trim() !== "");
          if (nonElItems.length === 0) {
            nextState = "COLLECTING_ITEM_NAME";
            setActiveFieldFocus("rows-particulars");
            
            const noItemBubble = {
              sender: "ai" as const,
              text: "Please add at least one product before finishing.",
              teText: "దయచేసి కనీసం ఒక ప్రోడక్ట్ అయినా బిల్లులో చేర్చండి.",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setChatMessages(prev => [...prev, noItemBubble]);
            
            const speakPhrase = language === "te-IN"
              ? "దయచేసి కనీసం ఒక ప్రోడక్ట్ అయినా బిల్లులో చేర్చండి."
              : "Please add at least one product before finishing.";
            speakText(speakPhrase, language);
            return;
          }
          nextState = "CONFIRMING_TAX";
          setActiveFieldFocus("apply-gst");
        } else {
          const val = value || "";
          const cleanVal = translateOrTransliterateTelugu(val as string);
          nextContext.currentItem = { p: cleanVal, h: "", q: "", r: "" };
          nextState = "COLLECTING_ITEM_QTY";
          setActiveFieldFocus("rows-qty");
        }
        break;
      }
      case "COLLECTING_ITEM_QTY": {
        const rawVal = String(value || "1");
        const sanitizedVal = rawVal.replace(/[^0-9.]/g, "");
        const finalVal = sanitizedVal || "1";
        
        let detectedUnit = "Nos";
        const unitsList = [
          "feet", "foot", "meter", "meters", "inch", "inches", "yard", "yards",
          "kg", "kilogram", "kilograms", "gram", "grams", "liter", "liters", "litre", "litres",
          "piece", "pieces", "unit", "units", "bundle", "bundles", "roll", "rolls",
          "box", "boxes", "pack", "packs", "nos", "no", "number", "numbers"
        ];
        const cleanT = rawText.toLowerCase();
        for (const u of unitsList) {
          if (cleanT.includes(u)) {
            detectedUnit = u.charAt(0).toUpperCase() + u.slice(1);
            break;
          }
        }

        nextContext.currentItem.q = `${finalVal} ${detectedUnit}`;
        nextState = "COLLECTING_ITEM_RATE";
        setActiveFieldFocus("rows-rate");
        break;
      }
      case "COLLECTING_ITEM_RATE": {
        const rawVal = String(value || "0");
        const sanitizedVal = rawVal.replace(/[^0-9.]/g, "");
        const finalVal = sanitizedVal || "0";
        nextContext.currentItem.r = finalVal;
        
        const qtyNum = parseFloat(nextContext.currentItem.q) || 1;
        const rateNum = parseFloat(finalVal) || 0;
        const amount = Math.round(qtyNum * rateNum * 100) / 100;
        
        const newRow = {
          p: nextContext.currentItem.p,
          h: "",
          q: nextContext.currentItem.q.includes(" ") ? nextContext.currentItem.q : `${nextContext.currentItem.q} Nos`,
          r: finalVal,
          a: amount
        };

        const updatedRows = [...rows.filter(r => r.p || r.h || r.q || r.r), newRow];
        setRows(updatedRows);
        nextContext.rows = updatedRows;
        
        nextContext.currentItem = { p: "", h: "", q: "", r: "" };
        nextState = "COLLECTING_ITEM_NAME";
        setActiveFieldFocus("rows-particulars");
        break;
      }
      case "CONFIRMING_TAX": {
        const val = value === undefined ? true : value;
        setApplyGst(!!val);
        nextContext.applyGst = !!val;
        nextState = "SUMMARY_REVIEW";
        setActiveFieldFocus("actions");
        break;
      }
      case "SUMMARY_REVIEW": {
        if (value === "yes") {
          nextState = "COMPLETE";
          saveBill();
          localStorage.removeItem('svs_active_conv');
          setTimeout(() => downloadPDF(), 500);
        } else {
          nextState = "IDLE";
          setShowAiDrawer(false);
          localStorage.removeItem('svs_active_conv');
        }
        break;
      }
      default:
        break;
    }

    setFsmState(nextState);
    setFsmContext(nextContext);

    const prompts = (FSM_PROMPTS as any)[nextState];
    if (prompts) {
      const nextBubble = {
        sender: "ai" as const,
        text: prompts.en,
        teText: prompts.te,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => {
        if (teFeedback) {
          return [
            ...prev,
            {
              sender: "ai" as const,
              text: `Got it.`,
              teText: teFeedback,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            },
            nextBubble
          ];
        }
        return [...prev, nextBubble];
      });

      const verbalFeedback = teFeedback ? `${teFeedback}. ` : "";
      const speakPrompt = language === "te-IN" ? prompts.te : prompts.en;
      const speakPhrase = language === "te-IN" ? (verbalFeedback + speakPrompt) : speakPrompt;
      speakText(speakPhrase, language);
    }
  };

  const prevIsListening = useRef(false);
  const [temporalBuffer, setTemporalBuffer] = useState<string>("");
  const temporalTimerRef = useRef<any>(null);

  useEffect(() => {
    if (prevIsListening.current && !isListening && transcript.trim()) {
      if (showAiDrawer) {
        if (temporalTimerRef.current) {
          clearTimeout(temporalTimerRef.current);
        }
        
        const combinedText = (temporalBuffer + " " + transcript).trim();
        setTemporalBuffer(combinedText);
        
        temporalTimerRef.current = setTimeout(() => {
          handleConversationalInput(combinedText, confidence);
          setTemporalBuffer("");
        }, 600);
      }
    }
    prevIsListening.current = isListening;
  }, [isListening, transcript, showAiDrawer, confidence]);

  const handleCloseDrawer = () => {
    setShowAiDrawer(false);
    window.speechSynthesis.cancel();
    stopListening();
  };

  const handleLanguageChange = (lang: string) => {
    changeLanguage(lang);
    window.speechSynthesis.cancel();
    const announcement = lang === "te-IN" 
      ? "భాష తెలుగులోకి మార్చబడింది" 
      : "Language changed to English";
    speakText(announcement, lang);
  };

  const handleResumeFsm = () => {
    try {
      const savedConv = localStorage.getItem('svs_active_conv');
      if (savedConv) {
        const { state, context, messages } = JSON.parse(savedConv);
        setFsmState(state);
        setFsmContext(context);
        setChatMessages(messages);
        
        if (context.btype) setBtype(context.btype);
        if (context.cname) setCname(context.cname);
        if (context.caddr) setCaddr(context.caddr);
        if (context.cgstin) setCgstin(context.cgstin);
        if (context.applyGst !== undefined) setApplyGst(context.applyGst);
        if (context.rows && context.rows.length > 0) setRows(context.rows);
        
        setShowAiDrawer(true);
      }
    } catch (e) {
      console.error("Failed to restore FSM draft:", e);
    }
    setShowResumeBanner(false);
  };

  const handleDiscardFsmDraft = () => {
    localStorage.removeItem('svs_active_conv');
    setShowResumeBanner(false);
  };

  const resetFsm = () => {
    setFsmState("IDLE");
    setShowAiDrawer(false);
    resetTranscript();
    localStorage.removeItem('svs_active_conv');
    window.speechSynthesis.cancel();
    stopListening();
  };

  useEffect(() => {
    if (fsmState !== "IDLE" && fsmState !== "COMPLETE") {
      const draft = {
        state: fsmState,
        context: fsmContext,
        messages: chatMessages
      };
      localStorage.setItem('svs_active_conv', JSON.stringify(draft));
    }
  }, [fsmState, fsmContext, chatMessages]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('svs4') || '[]');
      setBills(saved);
      const nums = saved.map((b: any) => parseInt(b.no)).filter((n: number) => !isNaN(n));
      setNo(String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, '0'));
      const savedSig = localStorage.getItem('svs_sig');
      if (savedSig) setSignatureUrl(savedSig);
      const savedDsc = localStorage.getItem('svs_dsc');
      if (savedDsc) setDscFile(savedDsc);
      const savedDscPwd = localStorage.getItem('svs_dsc_pwd');
      if (savedDscPwd) setDscPassword(savedDscPwd);
      const savedSigMode = localStorage.getItem('svs_sig_mode') as 'file' | 'usb';
      if (savedSigMode) setSigMode(savedSigMode);
      const savedUsbProvider = localStorage.getItem('svs_usb_provider') as 'signer_digital' | 'custom_ws';
      if (savedUsbProvider) setUsbProvider(savedUsbProvider);
      const savedCustomWsUrl = localStorage.getItem('svs_custom_ws_url');
      if (savedCustomWsUrl) setCustomWsUrl(savedCustomWsUrl);
      const savedUsbTokenPin = localStorage.getItem('svs_usb_token_pin');
      if (savedUsbTokenPin) setUsbTokenPin(savedUsbTokenPin);
      
      const savedConv = localStorage.getItem('svs_active_conv');
      if (savedConv) {
        setShowResumeBanner(true);
      }
    } catch (e) {}
    setDate(new Date().toISOString().split('T')[0]);
  }, []);

  const addRow = (p='', h='', q='', r='', a=0) => {
    setRows([...rows, { p, h, q, r, a }]);
  };

  const upd = (i: number, field: keyof Row, val: string) => {
    const newRows = [...rows];
    (newRows[i] as any)[field] = val;
    
    const q = parseFloat(newRows[i].q);
    const r = parseFloat(newRows[i].r);
    
    if (!isNaN(q) && !isNaN(r) && q >= 0 && r >= 0) {
      newRows[i].a = Math.round(q * r * 100) / 100;
    } else {
      newRows[i].a = 0;
    }
    setRows(newRows);
  };

  const delRow = (i: number) => {
    const newRows = [...rows];
    newRows.splice(i, 1);
    setRows(newRows);
  };

  const sub = rows.reduce((s, x) => s + (parseFloat(x.a as any) || 0), 0);
  const discountAmt = Math.round(sub * (discount / 100) * 100) / 100;
  const subAfterDiscount = sub - discountAmt;
  const isGst = applyGst && btype !== 'cash';
  const cgst = isGst ? Math.round(subAfterDiscount * 0.09 * 100) / 100 : 0;
  const sgst = isGst ? Math.round(subAfterDiscount * 0.09 * 100) / 100 : 0;
  const grand = subAfterDiscount + cgst + sgst;

  const fmtD = (n: number) => 'Rs. ' + (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getData = () => ({
    type: btype, no, date, po, transport, cname, caddr, cgstin,
    sname, saddr, sgstin, rows, applyGst: isGst,
    sub, discount, discountAmt, subAfterDiscount, cgst, sgst, grand, saved: new Date().toISOString(), signatureUrl
  });

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSig(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64data = reader.result;
        const res = await fetch("/api/upload-signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64data }),
        });
        const data = await res.json();
        if (data.url) {
          setSignatureUrl(data.url);
          localStorage.setItem('svs_sig', data.url);
        } else {
          alert("Upload failed: " + (data.error || "Unknown error"));
        }
        setIsUploadingSig(false);
      };
    } catch (err) {
      console.error(err);
      setIsUploadingSig(false);
      alert("Upload failed");
    }
  };

  const handleDscUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      const base64data = (reader.result as string).split(',')[1];
      setDscFile(base64data);
      localStorage.setItem('svs_dsc', base64data);
    };
  };

  const handleDscPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDscPassword(val);
    localStorage.setItem('svs_dsc_pwd', val);
  };

  const signViaWebSocket = (url: string, hash: string, pin: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Connection to local WebSocket bridge timed out."));
        }, 10000);
        
        ws.onopen = () => {
          ws.send(JSON.stringify({
            action: "sign",
            hash: hash,
            pin: pin
          }));
        };
        
        ws.onmessage = (event) => {
          clearTimeout(timeout);
          ws.close();
          try {
            const data = JSON.parse(event.data);
            if (data.status === "success" && data.signature) {
              resolve(data.signature);
            } else {
              reject(new Error(data.error || "Local bridge returned an error response."));
            }
          } catch (e) {
            reject(new Error("Failed to parse local bridge response."));
          }
        };
        
        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Could not connect to the local WebSocket bridge at " + url));
        };
        
        ws.onclose = () => {
          clearTimeout(timeout);
        };
      } catch (e: any) {
        reject(new Error("WebSocket initialization failed: " + e.message));
      }
    });
  };

  const testUsbConnection = async () => {
    setTestingConnection(true);
    setTestResult({ status: null, message: "Testing..." });
    
    if (usbProvider === 'signer_digital') {
      try {
        const sd = (window as any).SignerDigital;
        if (!sd) {
          throw new Error("Signer.Digital browser extension is not detected. Please verify it is installed and enabled.");
        }
        const cert = await sd.getSelectedCertificate("", true);
        if (!cert || !cert.thumbprint) {
          throw new Error("No certificate selected or USB token not inserted.");
        }
        setTestResult({
          status: 'success',
          message: `✓ Connected to USB token!\nSubject: ${cert.subjectName || 'Unknown'}\nThumbprint: ${cert.thumbprint}`
        });
      } catch (err: any) {
        setTestResult({
          status: 'error',
          message: `✗ Error: ${err.message}`
        });
      }
    } else if (usbProvider === 'custom_ws') {
      try {
        const wsResult = await new Promise<string>((resolve, reject) => {
          const ws = new WebSocket(customWsUrl);
          const timeout = setTimeout(() => { ws.close(); reject(new Error("Connection timed out.")); }, 3000);
          
          ws.onopen = () => {
            ws.send(JSON.stringify({ action: "ping" }));
          };
          ws.onmessage = (event) => {
            clearTimeout(timeout);
            ws.close();
            resolve(event.data);
          };
          ws.onerror = () => {
            clearTimeout(timeout);
            reject(new Error("Connection error"));
          };
        });
        
        const data = JSON.parse(wsResult);
        if (data.status === "success" || data.status === "pong") {
          setTestResult({
            status: 'success',
            message: `✓ Connected to local WebSocket bridge!\nServer Version/Info: ${data.info || 'ePass2003 Bridge v1.0'}`
          });
        } else {
          setTestResult({ status: 'error', message: `✗ Bridge returned error: ${data.error}` });
        }
      } catch (err: any) {
        setTestResult({
          status: 'error',
          message: `✗ Could not connect to local bridge at ${customWsUrl}.\nMake sure your local python/Node bridge is running.`
        });
      }
    }
    setTestingConnection(false);
  };

  const saveBill = () => {
    const d = getData();
    const newBills = [...bills];
    const idx = newBills.findIndex(b => b.no === d.no && b.type === d.type);
    if (idx >= 0) newBills[idx] = d;
    else newBills.unshift(d);
    
    setBills(newBills);
    try { localStorage.setItem('svs4', JSON.stringify(newBills)) } catch (e) {}
    setActiveSec('history');
  };

  const loadBill = (i: number) => {
    const d = bills[i];
    setBtype(d.type);
    setNo(d.no || '');
    setDate(d.date || '');
    setPo(d.po || '');
    setTransport(d.transport || '');
    setCname(d.cname || '');
    setCaddr(d.caddr || '');
    setCgstin(d.cgstin || '');
    setSname(d.sname || '');
    setSaddr(d.saddr || '');
    setSgstin(d.sgstin || '');
    setApplyGst(!!d.applyGst);
    setRows(d.rows || []);
    setSignatureUrl(d.signatureUrl || localStorage.getItem('svs_sig') || "");
    setActiveSec('create');
  };

  const delBill = (i: number) => {
    if (!confirm('Delete this bill?')) return;
    const newBills = [...bills];
    newBills.splice(i, 1);
    setBills(newBills);
    try { localStorage.setItem('svs4', JSON.stringify(newBills)) } catch (e) {}
  };

  const resetForm = () => {
    setCaddr(''); setSname(''); setSaddr(''); setSgstin(''); setPo(''); setTransport('');
    setCname('AVENUE SUPERMARTS LTD');
    setCgstin('36BXYPS4294L1Z7');
    setDiscount(0);
    setRows([{ p: "", h: "", q: "", r: "", a: 0 }, { p: "", h: "", q: "", r: "", a: 0 }, { p: "", h: "", q: "", r: "", a: 0 }]);
    const nums = bills.map((b: any) => parseInt(b.no)).filter((n: number) => !isNaN(n));
    setNo(String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, '0'));
  };

  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (activeSec === 'preview') {
      setPreviewHtml(invHTML(getData()));
    }
  }, [activeSec, btype, no, date, po, transport, cname, caddr, cgstin, sname, saddr, sgstin, rows, applyGst, signatureUrl, discount]);

  const downloadPDF = () => {
    setIsDownloading(true);
    const d = getData();
    const iframe = iframeRef.current;
    if (!iframe) return;

    const h = invHTML(d);
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(h);
    doc.close();

    setTimeout(() => {
      const invEl = doc.querySelector('.inv') as HTMLElement;
      if (!invEl) {
        setIsDownloading(false);
        return;
      }

      html2canvas(invEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 794,
        height: 1123
      }).then(async (canvas) => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
        
        const fname = `SVS_${d.type.toUpperCase()}_${d.no}_${(d.date || '').replace(/-/g, '')}_${(d.cname || 'bill').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        
        let signatureApplied = false;

        if (sigMode === 'file' && dscFile && dscPassword) {
          try {
            // Get raw PDF base64 (remove data URI prefix)
            const pdfBase64 = pdf.output('datauristring').split(',')[1];
            
            const res = await fetch("/api/sign-pdf", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pdfBase64,
                p12Base64: dscFile,
                password: dscPassword
              }),
            });
            
            const result = await res.json();
            
            if (result.signedPdfBase64) {
              const link = document.createElement('a');
              link.href = `data:application/pdf;base64,${result.signedPdfBase64}`;
              link.download = fname.replace('.pdf', '_signed.pdf');
              link.click();
              signatureApplied = true;
            } else {
              alert("Signing failed: " + result.error);
              pdf.save(fname); // fallback
            }
          } catch (err) {
            console.error("Signing error", err);
            alert("Error applying DSC signature. Downloading unsigned PDF.");
            pdf.save(fname);
          }
        } else if (sigMode === 'usb') {
          try {
            const pdfBase64 = pdf.output('datauristring').split(',')[1];
            
            const res = await fetch("/api/prepare-usb-sign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pdfBase64 }),
            });
            
            if (!res.ok) {
              const errData = await res.json();
              throw new Error(errData.error || "Failed to prepare PDF for USB signing");
            }
            
            const prepData = await res.json();
            const { hash, pdfWithPlaceholderBase64, placeholderPos, placeholderLength } = prepData;
            
            let signatureHex = "";
            if (usbProvider === 'signer_digital') {
              const sd = (window as any).SignerDigital;
              if (!sd) {
                throw new Error("Signer.Digital extension not detected. Please make sure it is installed and running.");
              }
              
              const cert = await sd.getSelectedCertificate("", true);
              if (!cert || !cert.thumbprint) {
                throw new Error("No certificate selected or USB token not found.");
              }
              
              signatureHex = await sd.signPdfHash(hash, cert.thumbprint, "SHA-256");
            } else if (usbProvider === 'custom_ws') {
              signatureHex = await signViaWebSocket(customWsUrl, hash, usbTokenPin);
            }
            
            if (!signatureHex) {
              throw new Error("Failed to retrieve signature from the USB token.");
            }
            
            // Inject signature hex client-side directly into PDF base64 binary array
            const binaryString = window.atob(pdfWithPlaceholderBase64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            let paddedSignature = signatureHex.toLowerCase().trim();
            if (paddedSignature.startsWith('0x')) {
              paddedSignature = paddedSignature.slice(2);
            }
            if (paddedSignature.length > placeholderLength) {
              throw new Error(`Signature length (${paddedSignature.length}) exceeds the reserved placeholder length (${placeholderLength})`);
            }
            paddedSignature = paddedSignature.padEnd(placeholderLength, '0');
            
            const encoder = new TextEncoder();
            const sigBytes = encoder.encode(paddedSignature);
            bytes.set(sigBytes, placeholderPos + 1);
            
            const blob = new Blob([bytes], { type: "application/pdf" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fname.replace('.pdf', '_signed.pdf');
            link.click();
            signatureApplied = true;
          } catch (err: any) {
            console.error("USB Signing error", err);
            alert("Error applying USB Digital Signature: " + err.message + "\nDownloading unsigned PDF.");
            pdf.save(fname);
          }
        } else {
          pdf.save(fname);
        }
        
        setIsDownloading(false);
        setDlMsg('PDF downloaded' + (signatureApplied ? ' (Signed)' : '') + ': ' + fname);
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 4000);
      }).catch(() => setIsDownloading(false));
    }, 600);
  };

  return (
    <div className="app">
      {showResumeBanner && (
        <div
          style={{
            backgroundColor: "#fff8eb",
            borderBottom: "1px solid #fee2e2",
            padding: "10px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "12px",
            color: "#b45309",
            fontWeight: 500,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px" }}>💡</span>
            <span>
              {language === "te-IN"
                ? "మునుపటి వాయిస్ బిల్లింగ్ సెషన్ కనుగొనబడింది. దాన్ని కొనసాగిస్తారా?"
                : "An incomplete AI Billing Assistant draft was found. Do you want to resume?"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleResumeFsm}
              className="btn btn-sm btn-blue"
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                backgroundColor: "#003399",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {language === "te-IN" ? "కొనసాగించు" : "Resume"}
            </button>
            <button
              onClick={handleDiscardFsmDraft}
              className="btn btn-sm btn-red"
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                backgroundColor: "#ef4444",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {language === "te-IN" ? "వద్దు" : "Discard"}
            </button>
          </div>
        </div>
      )}
      <div className="topbar">
        <div className="topbar-title">SVS Billing</div>
        <div className="tabs" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-blue"
            onClick={startConversationalAssistant}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "linear-gradient(135deg, #003399, #1d4ed8)",
              color: "#fff",
              border: "none",
              boxShadow: "0 2px 4px rgba(29, 78, 216, 0.2)",
              cursor: "pointer",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 21l-1.813-5.096L2 14l5.096-1.813L9 7l1.813 5.096L14 14l-5.096 1.813zM19.071 4.929l-.707 1.97-.707-1.97-1.97-.707 1.97-.707.707-1.97.707 1.97 1.97.707-1.97.707zM19.071 19.071l-.707 1.97-.707-1.97-1.97-.707 1.97-.707.707-1.97.707 1.97 1.97.707-1.97.707z"
              />
            </svg>
            <span style={{ fontWeight: 600 }}>Create Invoice with AI</span>
          </button>
          <div className={`tab ${btype === 'gst' ? 'on' : ''}`} onClick={() => setBtype('gst')}>GST Invoice</div>
          <div className={`tab ${btype === 'quotation' ? 'on' : ''}`} onClick={() => setBtype('quotation')}>Quotation</div>
          <div className={`tab ${btype === 'cash' ? 'on' : ''}`} onClick={() => setBtype('cash')}>Cash Memo</div>
        </div>
      </div>

      <div className="nav">
        <div className={`nav-tab ${activeSec === 'create' ? 'on' : ''}`} onClick={() => setActiveSec('create')}>Create</div>
        <div className={`nav-tab ${activeSec === 'preview' ? 'on' : ''}`} onClick={() => setActiveSec('preview')}>Preview</div>
        <div className={`nav-tab ${activeSec === 'history' ? 'on' : ''}`} onClick={() => setActiveSec('history')}>History (<span id="hc">{bills.length}</span>)</div>
      </div>

      {activeSec === 'create' && (
        <div id="sec-create">
          <div className="card">
            <div className="card-title">Bill Details</div>
            <div className="g2">
              <div className="field"><label>Bill No.</label><input value={no} onChange={e => setNo(e.target.value)} /></div>
              <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            </div>
            <div className="g2">
              <div className="field"><label>PO Number</label><input value={po} onChange={e => setPo(e.target.value)} placeholder="Optional" /></div>
              <div className="field"><label>Transport Mode</label><input value={transport} onChange={e => setTransport(e.target.value)} placeholder="Optional" /></div>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Bill To Party</div>
            <div className="field"><label>Customer Name</label><input value={cname} onChange={e => setCname(e.target.value)} onBlur={e => setCname(translateOrTransliterateTelugu(e.target.value))} placeholder="e.g. Avenue Supermarts Ltd." style={{ borderColor: activeFieldFocus === 'cname' ? '#003399' : '', boxShadow: activeFieldFocus === 'cname' ? '0 0 0 3px rgba(0, 51, 153, 0.2)' : '' }} /></div>
            <div className="field"><label>Address</label><input value={caddr} onChange={e => setCaddr(e.target.value)} onBlur={e => setCaddr(translateOrTransliterateTelugu(e.target.value))} placeholder="e.g. Medipally D-Mart" style={{ borderColor: activeFieldFocus === 'caddr' ? '#003399' : '', boxShadow: activeFieldFocus === 'caddr' ? '0 0 0 3px rgba(0, 51, 153, 0.2)' : '' }} /></div>
            <div className="field"><label>GSTIN</label><input value={cgstin} onChange={e => setCgstin(e.target.value)} placeholder="Optional" /></div>
          </div>
          <div className="card">
            <div className="card-title">Ship To Party <span style={{ fontSize: "10px", textTransform: "none", fontWeight: 400, color: "var(--color-text-secondary)" }}>(Optional)</span></div>
            <div className="field"><label>Name</label><input value={sname} onChange={e => setSname(e.target.value)} onBlur={e => setSname(translateOrTransliterateTelugu(e.target.value))} placeholder="Leave blank if same as Bill To" /></div>
            <div className="field"><label>Address</label><input value={saddr} onChange={e => setSaddr(e.target.value)} onBlur={e => setSaddr(translateOrTransliterateTelugu(e.target.value))} placeholder="Optional" /></div>
            <div className="field"><label>GSTIN</label><input value={sgstin} onChange={e => setSgstin(e.target.value)} placeholder="Optional" /></div>
          </div>
          <div className="card">
            <div className="card-title">Line Items</div>
            <div className="items-wrap">
              <table className="it">
                <thead><tr>
                  <th style={{ width: "24px" }}>#</th>
                  <th style={{ minWidth: "120px" }}>Particulars</th>
                  <th style={{ width: "55px" }}>HSN/SAC</th>
                  <th style={{ width: "45px" }}>Qty</th>
                  <th style={{ width: "70px" }}>Rate (Rs.)</th>
                  <th style={{ width: "70px" }}>Amount</th>
                  <th style={{ width: "28px" }}></th>
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: "center", color: "#888" }}>{i + 1}</td>
                      <td data-lbl="Particulars"><input value={r.p} placeholder="Description" onChange={e => upd(i, 'p', e.target.value)} onBlur={e => upd(i, 'p', translateOrTransliterateTelugu(e.target.value))} style={{ borderColor: (activeFieldFocus === 'rows-particulars' && i === rows.length - 1) ? '#003399' : '', boxShadow: (activeFieldFocus === 'rows-particulars' && i === rows.length - 1) ? '0 0 0 3px rgba(0, 51, 153, 0.2)' : '' }} /></td>
                      <td data-lbl="HSN/SAC"><input value={r.h} placeholder="HSN" onChange={e => upd(i, 'h', e.target.value)} /></td>
                      <td data-lbl="Qty"><input type="text" value={r.q} placeholder="0" onChange={e => upd(i, 'q', e.target.value)} style={{ borderColor: (activeFieldFocus === 'rows-qty' && i === rows.length - 1) ? '#003399' : '', boxShadow: (activeFieldFocus === 'rows-qty' && i === rows.length - 1) ? '0 0 0 3px rgba(0, 51, 153, 0.2)' : '' }} /></td>
                      <td data-lbl="Rate (Rs.)"><input type="number" min="0" value={r.r} placeholder="0" onChange={e => upd(i, 'r', e.target.value)} style={{ borderColor: (activeFieldFocus === 'rows-rate' && i === rows.length - 1) ? '#003399' : '', boxShadow: (activeFieldFocus === 'rows-rate' && i === rows.length - 1) ? '0 0 0 3px rgba(0, 51, 153, 0.2)' : '' }} /></td>
                      <td className="amt" data-lbl="Amount">{r.a ? r.a.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</td>
                      <td><button className="btn btn-red btn-sm" onClick={() => delRow(i)}>x</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-sm" onClick={() => addRow()}>+ Add Item</button>
            <div style={{ marginTop: "10px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                <input type="checkbox" checked={applyGst} onChange={e => setApplyGst(e.target.checked)} style={{ width: "auto" }} /> Apply GST (CGST 9% + SGST 9%)
              </label>
            </div>
            <div className="totals-box" style={{ marginTop: "10px" }}>
              <div className="tline"><span className="lbl">Subtotal</span><span>{fmtD(sub)}</span></div>
              <div className="tline"><span className="lbl">CGST @ 9%</span><span>{fmtD(cgst)}</span></div>
              <div className="tline"><span className="lbl">SGST @ 9%</span><span>{fmtD(sgst)}</span></div>
              <div className="tline grand"><span className="lbl">Grand Total</span><span>{fmtD(grand)}</span></div>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Settings & Signature</div>
            <div className="g2">
              <div className="field">
                <label>Authorized Signatory Signature (Image)</label>
                <input type="file" accept="image/*" onChange={handleSignatureUpload} disabled={isUploadingSig} />
                {isUploadingSig && <div style={{ fontSize: "12px", color: "#003399", marginTop: "4px" }}>Uploading signature...</div>}
                {signatureUrl && (
                  <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <img src={signatureUrl} alt="Signature" style={{ maxHeight: "45px", border: "1px solid #e2e8f0", padding: "2px", borderRadius: "4px", background: "#fff" }} />
                    <button className="btn btn-sm btn-red" onClick={() => { setSignatureUrl(''); localStorage.removeItem('svs_sig'); }}>Remove</button>
                  </div>
                )}
              </div>
              <div className="field">
                <label>Digital Signature (DSC) Mode</label>
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      flex: 1,
                      backgroundColor: sigMode === 'file' ? '#003399' : '#e2e8f0',
                      color: sigMode === 'file' ? '#fff' : '#475569',
                      border: "none",
                      padding: "6px",
                      borderRadius: "4px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                    onClick={() => { setSigMode('file'); localStorage.setItem('svs_sig_mode', 'file'); }}
                  >
                    File-based (.p12)
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      flex: 1,
                      backgroundColor: sigMode === 'usb' ? '#003399' : '#e2e8f0',
                      color: sigMode === 'usb' ? '#fff' : '#475569',
                      border: "none",
                      padding: "6px",
                      borderRadius: "4px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                    onClick={() => { setSigMode('usb'); localStorage.setItem('svs_sig_mode', 'usb'); }}
                  >
                    USB Hardware Token
                  </button>
                </div>

                {sigMode === 'file' ? (
                  <div>
                    <label>DSC Certificate (.p12 / .pfx)</label>
                    <input type="file" accept=".p12,.pfx" onChange={handleDscUpload} />
                    {dscFile && <div style={{ fontSize: "12px", color: "green", marginTop: "4px" }}>✓ Certificate loaded</div>}
                    {dscFile && (
                      <div style={{ marginTop: "8px" }}>
                        <label>DSC Password</label>
                        <input type="password" value={dscPassword} onChange={handleDscPasswordChange} placeholder="Certificate Password" />
                      </div>
                    )}
                    {dscFile && (
                      <button className="btn btn-sm btn-red" style={{marginTop:"8px"}} onClick={() => { setDscFile(''); setDscPassword(''); localStorage.removeItem('svs_dsc'); localStorage.removeItem('svs_dsc_pwd'); }}>Remove DSC</button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="field" style={{ marginBottom: "10px" }}>
                      <label>USB Token Driver / Bridge</label>
                      <select
                        value={usbProvider}
                        onChange={e => {
                          const val = e.target.value as any;
                          setUsbProvider(val);
                          localStorage.setItem('svs_usb_provider', val);
                        }}
                        style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", background: "#fff" }}
                      >
                        <option value="signer_digital">Signer.Digital Browser Extension</option>
                        <option value="custom_ws">Local WebSocket Bridge (ws://)</option>
                      </select>
                    </div>

                    {usbProvider === 'custom_ws' && (
                      <>
                        <div className="field" style={{ marginBottom: "8px" }}>
                          <label>WebSocket Address</label>
                          <input
                            type="text"
                            value={customWsUrl}
                            placeholder="ws://127.0.0.1:12345"
                            onChange={e => {
                              setCustomWsUrl(e.target.value);
                              localStorage.setItem('svs_custom_ws_url', e.target.value);
                            }}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: "8px" }}>
                          <label>Token PIN / Password</label>
                          <input
                            type="password"
                            value={usbTokenPin}
                            placeholder="USB Token PIN (e.g. 12345678)"
                            onChange={e => {
                              setUsbTokenPin(e.target.value);
                              localStorage.setItem('svs_usb_token_pin', e.target.value);
                            }}
                          />
                        </div>
                      </>
                    )}

                    <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={testingConnection}
                        onClick={testUsbConnection}
                        style={{ alignSelf: "flex-start", padding: "4px 8px" }}
                      >
                        {testingConnection ? "Testing..." : "Test USB Token Connection"}
                      </button>
                      
                      {testResult.status && (
                        <div
                          style={{
                            fontSize: "11px",
                            padding: "8px",
                            borderRadius: "4px",
                            whiteSpace: "pre-wrap",
                            backgroundColor: testResult.status === 'success' ? '#f0fdf4' : '#fef2f2',
                            color: testResult.status === 'success' ? '#15803d' : '#b91c1c',
                            border: `1px solid ${testResult.status === 'success' ? '#bbf7d0' : '#fecaca'}`
                          }}
                        >
                          {testResult.message}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="act-row">
            <button className="btn" onClick={resetForm}>Reset</button>
            <button className="btn" onClick={() => setActiveSec('preview')}>Preview</button>
            <button className="btn btn-blue" onClick={saveBill}>Save Bill</button>
          </div>
        </div>
      )}

      {activeSec === 'preview' && (
        <div id="sec-preview">
          <div className={`dl-banner ${showBanner ? 'show' : ''}`} id="dl-banner">
            <span style={{ fontSize: "16px" }}>✓</span>
            <span>{dlMsg}</span>
          </div>
          <div className="prev-wrap">
            <div dangerouslySetInnerHTML={{ __html: previewHtml }}></div>
          </div>
          <div className="act-row">
            <button className="btn" onClick={() => setActiveSec('create')}>← Edit</button>
            <button className="btn btn-blue" onClick={saveBill}>Save</button>
            <button className="btn btn-green" onClick={downloadPDF} disabled={isDownloading}>
              {isDownloading ? 'Generating...' : '⬇ Download PDF'}
            </button>
          </div>
          {/* Hidden iframe for PDF generation to ensure perfect rendering outside flexboxes */}
          <iframe ref={iframeRef} style={{ position: "absolute", left: "-9999px", top: "-9999px", width: "794px", height: "1123px", border: "none" }} />
        </div>
      )}

      {activeSec === 'history' && (
        <div id="sec-history">
          {!bills.length ? (
            <div className="empty">No saved bills yet.</div>
          ) : (
            bills.map((b, i) => (
              <div key={i} className="hist-item" onClick={() => loadBill(i)}>
                <div style={{ flex: 1 }}>
                  <div className="hi-no">#{b.no}
                    {b.type === 'gst' && <span className="tag tag-gst">GST</span>}
                    {b.type === 'quotation' && <span className="tag tag-q">Quotation</span>}
                    {b.type === 'cash' && <span className="tag tag-c">Cash Memo</span>}
                  </div>
                  <div className="hi-meta">{b.cname || '—'} &nbsp;·&nbsp; {b.date || '—'}</div>
                </div>
                <div className="hi-amt">Rs.{fmtD(b.grand).replace('Rs. ', '')}</div>
                <div style={{ display: "flex", gap: "4px" }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-sm" onClick={() => loadBill(i)}>Edit</button>
                  <button className="btn btn-green btn-sm" onClick={() => { loadBill(i); setTimeout(() => setActiveSec('preview'), 100); }}>PDF</button>
                  <button className="btn btn-red btn-sm" onClick={() => delBill(i)}>Del</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      <ConversationalDrawer
        isOpen={showAiDrawer}
        onClose={handleCloseDrawer}
        messages={chatMessages}
        isListening={isListening}
        language={language}
        onLanguageChange={handleLanguageChange}
        onMicClick={handleMicClick}
        onTextInput={handleConversationalInput}
        isParsing={isParsing}
        currentState={fsmState}
        contextData={fsmContext}
        onConfirmAndApply={() => {}}
        onReset={resetFsm}
        speechError={speechError}
        isSpeechSupported={isSupported}
      />
    </div>
  );
}
