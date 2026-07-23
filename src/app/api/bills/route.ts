import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const BILLS_FILE = path.join(DATA_DIR, "bills.json");

function ensureFileExists() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(BILLS_FILE)) {
      fs.writeFileSync(BILLS_FILE, JSON.stringify([], null, 2), "utf-8");
    }
  } catch (err) {
    console.error("Error ensuring data directory/file exists:", err);
  }
}

function readBills(): any[] {
  ensureFileExists();
  try {
    const content = fs.readFileSync(BILLS_FILE, "utf-8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error("Error reading bills.json:", err);
    return [];
  }
}

function writeBills(bills: any[]): boolean {
  ensureFileExists();
  try {
    fs.writeFileSync(BILLS_FILE, JSON.stringify(bills, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Error writing bills.json:", err);
    return false;
  }
}

// Generate unique key for a bill to prevent duplicates across devices
function getBillKey(b: any): string {
  if (!b) return "";
  if (b.id) return String(b.id);
  const type = b.type || "gst";
  const no = b.no || "0";
  return `${type}_${no}`;
}

/**
 * Merge two lists of bills intelligently.
 * Incoming items update existing ones or append new ones.
 */
function mergeBillsList(existingList: any[], incomingList: any[]): any[] {
  const map = new Map<string, any>();
  
  // Load existing into map
  for (const b of existingList) {
    const key = getBillKey(b);
    if (key) map.set(key, b);
  }
  
  // Merge incoming (incoming takes precedence or adds new)
  for (const b of incomingList) {
    const key = getBillKey(b);
    if (key) {
      map.set(key, { ...map.get(key), ...b });
    }
  }

  // Convert map values to array
  const merged = Array.from(map.values());

  // Sort by date (descending) or bill number (descending)
  return merged;
}

export async function GET() {
  try {
    const bills = readBills();
    return NextResponse.json({ success: true, bills }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const currentBills = readBills();

    // If body contains a single bill
    if (body && !Array.isArray(body) && (body.no !== undefined || body.id !== undefined)) {
      const singleBill = body;
      const key = getBillKey(singleBill);
      const idx = currentBills.findIndex((b) => getBillKey(b) === key);
      
      if (idx >= 0) {
        currentBills[idx] = singleBill;
      } else {
        currentBills.unshift(singleBill);
      }
      
      writeBills(currentBills);
      return NextResponse.json({ success: true, bills: currentBills }, { status: 200 });
    }

    // If body contains an array of bills or { bills: [...] }
    const incomingBills = Array.isArray(body) ? body : body.bills;
    if (Array.isArray(incomingBills)) {
      const merged = mergeBillsList(currentBills, incomingBills);
      writeBills(merged);
      return NextResponse.json({ success: true, bills: merged }, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid payload format" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const incomingBills = Array.isArray(body) ? body : body.bills || [];
    const currentBills = readBills();

    const merged = mergeBillsList(currentBills, incomingBills);
    writeBills(merged);

    return NextResponse.json({ success: true, bills: merged }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const no = url.searchParams.get("no");
    const type = url.searchParams.get("type");
    const id = url.searchParams.get("id");

    let currentBills = readBills();

    if (id) {
      currentBills = currentBills.filter((b) => String(b.id) !== String(id));
    } else if (no && type) {
      currentBills = currentBills.filter((b) => !(b.no === no && b.type === type));
    } else if (no) {
      currentBills = currentBills.filter((b) => b.no !== no);
    } else {
      return NextResponse.json({ error: "Missing bill identifier (no or id)" }, { status: 400 });
    }

    writeBills(currentBills);
    return NextResponse.json({ success: true, bills: currentBills }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
