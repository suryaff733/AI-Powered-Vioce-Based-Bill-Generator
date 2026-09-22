import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const BILLS_FILE = path.join(DATA_DIR, "bills.json");
const BILLS_TMP_FILE = path.join(DATA_DIR, "bills.tmp.json");
const BILLS_BAK_FILE = path.join(DATA_DIR, "bills.bak.json");

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

function getBillKey(b: any): string {
  if (!b) return "";
  const type = (b.type || "gst").toLowerCase().trim();
  const no = String(b.no || "0").trim();
  return `${type}_${no}`;
}

function sortBills(list: any[]): any[] {
  return [...list].sort((a, b) => {
    const dateA = a.date || "";
    const dateB = b.date || "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const numA = parseInt(String(a.no).replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(String(b.no).replace(/\D/g, ""), 10) || 0;
    if (numA !== numB) return numB - numA;
    return (b.saved || "").localeCompare(a.saved || "");
  });
}

function sanitizeBill(b: any): any {
  if (!b || typeof b !== "object") return null;
  const no = b.no ? String(b.no).trim() : "001";
  const type = b.type ? String(b.type).toLowerCase().trim() : "gst";
  const key = `${type}_${no}`;

  const sub = typeof b.sub === "number" && !isNaN(b.sub) ? b.sub : Number(b.sub) || 0;
  const discount = typeof b.discount === "number" && !isNaN(b.discount) ? b.discount : Number(b.discount) || 0;
  const discountAmt = typeof b.discountAmt === "number" && !isNaN(b.discountAmt) ? b.discountAmt : Number(b.discountAmt) || 0;
  const subAfterDiscount = typeof b.subAfterDiscount === "number" && !isNaN(b.subAfterDiscount) ? b.subAfterDiscount : Number(b.subAfterDiscount) || sub;
  const cgst = typeof b.cgst === "number" && !isNaN(b.cgst) ? b.cgst : Number(b.cgst) || 0;
  const sgst = typeof b.sgst === "number" && !isNaN(b.sgst) ? b.sgst : Number(b.sgst) || 0;
  const grand = typeof b.grand === "number" && !isNaN(b.grand) ? b.grand : Number(b.grand) || 0;

  return {
    id: b.id ? String(b.id).trim() : key,
    type,
    no,
    date: b.date ? String(b.date).trim() : new Date().toISOString().split("T")[0],
    po: b.po ? String(b.po).trim() : "",
    transport: b.transport ? String(b.transport).trim() : "",
    cname: b.cname ? String(b.cname).trim() : "",
    caddr: b.caddr ? String(b.caddr).trim() : "",
    cgstin: b.cgstin ? String(b.cgstin).trim() : "",
    sname: b.sname ? String(b.sname).trim() : "",
    saddr: b.saddr ? String(b.saddr).trim() : "",
    sgstin: b.sgstin ? String(b.sgstin).trim() : "",
    rows: Array.isArray(b.rows)
      ? b.rows.map((r: any) => ({
          p: r && r.p ? String(r.p).trim() : "",
          h: r && r.h ? String(r.h).trim() : "",
          q: r && r.q !== undefined ? String(r.q).trim() : "0",
          r: r && r.r !== undefined ? String(r.r).trim() : "0",
          a: typeof r?.a === "number" && !isNaN(r.a) ? r.a : Number(r?.a) || 0,
        }))
      : [],
    applyGst: b.applyGst !== undefined ? Boolean(b.applyGst) : type === "gst",
    sub,
    discount,
    discountAmt,
    subAfterDiscount,
    cgst,
    sgst,
    grand,
    saved: b.saved ? String(b.saved).trim() : new Date().toISOString(),
    updatedAt: b.updatedAt || new Date().toISOString(),
  };
}

function readBills(): any[] {
  ensureFileExists();
  try {
    const content = fs.readFileSync(BILLS_FILE, "utf-8");
    if (!content || !content.trim()) return [];
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return sortBills(parsed.map(sanitizeBill).filter(Boolean));
  } catch (err) {
    console.error("Corrupted bills.json detected, attempting backup recovery:", err);
    try {
      if (fs.existsSync(BILLS_BAK_FILE)) {
        const bakContent = fs.readFileSync(BILLS_BAK_FILE, "utf-8");
        const recovered = JSON.parse(bakContent || "[]");
        if (Array.isArray(recovered)) {
          const sorted = sortBills(recovered.map(sanitizeBill).filter(Boolean));
          writeBillsAtomic(sorted);
          return sorted;
        }
      }
    } catch (bakErr) {
      console.error("Backup file recovery also failed:", bakErr);
    }
    return [];
  }
}

function writeBillsAtomic(bills: any[]): boolean {
  ensureFileExists();
  try {
    const sorted = sortBills(bills.map(sanitizeBill).filter(Boolean));
    // 1. Create a backup of current valid bills file
    if (fs.existsSync(BILLS_FILE)) {
      try {
        fs.copyFileSync(BILLS_FILE, BILLS_BAK_FILE);
      } catch (e) {}
    }
    // 2. Write to temporary file first (prevents partial write crashes)
    fs.writeFileSync(BILLS_TMP_FILE, JSON.stringify(sorted, null, 2), "utf-8");
    // 3. Atomically rename temporary file to actual file
    fs.renameSync(BILLS_TMP_FILE, BILLS_FILE);
    return true;
  } catch (err) {
    console.error("Error atomically writing bills.json:", err);
    try {
      const sorted = sortBills(bills.map(sanitizeBill).filter(Boolean));
      fs.writeFileSync(BILLS_FILE, JSON.stringify(sorted, null, 2), "utf-8");
      return true;
    } catch (e) {
      return false;
    }
  }
}

function mergeBillsList(existingList: any[], incomingList: any[]): any[] {
  const map = new Map<string, any>();
  
  for (const b of existingList) {
    const clean = sanitizeBill(b);
    if (clean) {
      const key = getBillKey(clean);
      if (key) map.set(key, clean);
    }
  }
  
  for (const b of incomingList) {
    const clean = sanitizeBill(b);
    if (clean) {
      const key = getBillKey(clean);
      if (key) {
        map.set(key, { ...map.get(key), ...clean, updatedAt: new Date().toISOString() });
      }
    }
  }

  return sortBills(Array.from(map.values()));
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

    if (body && !Array.isArray(body) && (body.no !== undefined || body.id !== undefined)) {
      const cleanBill = sanitizeBill({ ...body, updatedAt: new Date().toISOString() });
      if (!cleanBill) {
        return NextResponse.json({ error: "Invalid bill payload" }, { status: 400 });
      }
      const key = getBillKey(cleanBill);
      const idx = currentBills.findIndex((b) => getBillKey(b) === key);
      
      if (idx >= 0) {
        currentBills[idx] = cleanBill;
      } else {
        currentBills.unshift(cleanBill);
      }
      
      const sorted = sortBills(currentBills);
      writeBillsAtomic(sorted);
      return NextResponse.json({ success: true, bills: sorted }, { status: 200 });
    }

    const incomingBills = Array.isArray(body) ? body : body.bills;
    if (Array.isArray(incomingBills)) {
      const merged = mergeBillsList(currentBills, incomingBills);
      writeBillsAtomic(merged);
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
    writeBillsAtomic(merged);

    return NextResponse.json({ success: true, bills: merged }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const no = url.searchParams.get("no")?.trim();
    const type = url.searchParams.get("type")?.toLowerCase().trim();
    const id = url.searchParams.get("id")?.trim();

    let currentBills = readBills();

    if (id) {
      currentBills = currentBills.filter((b) => String(b.id).trim() !== id && getBillKey(b) !== id);
    } else if (no && type) {
      currentBills = currentBills.filter((b) => !(String(b.no).trim() === no && String(b.type).toLowerCase().trim() === type));
    } else if (no) {
      currentBills = currentBills.filter((b) => String(b.no).trim() !== no);
    } else {
      return NextResponse.json({ error: "Missing bill identifier (no or id)" }, { status: 400 });
    }

    const sorted = sortBills(currentBills);
    writeBillsAtomic(sorted);
    return NextResponse.json({ success: true, bills: sorted }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
