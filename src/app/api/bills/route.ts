import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function getBillKey(b: any): string {
  if (!b) return "";
  const type = (b.type || "gst").toLowerCase().trim();
  const no = String(b.no || "0").trim();
  return `${type}_${no}`;
}

export function sortBills(list: any[]): any[] {
  return [...list].sort((a, b) => {
    const dateA = a.date || "";
    const dateB = b.date || "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const numA = parseInt(String(a.no).replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(String(b.no).replace(/\D/g, ""), 10) || 0;
    if (numA !== numB) return numB - numA;
    return (b.saved || b.updatedAt || "").localeCompare(a.saved || a.updatedAt || "");
  });
}

export function sanitizeBill(b: any): any {
  if (!b || typeof b !== "object") return null;
  const rawNo = b.no !== undefined && b.no !== null ? String(b.no).trim() : "";
  const numOnly = parseInt(rawNo.replace(/\D/g, ""), 10);
  const no = !isNaN(numOnly) && numOnly > 0 
    ? String(numOnly).padStart(3, '0') 
    : (rawNo || "001");
  const type = b.type ? String(b.type).toLowerCase().trim() : "gst";
  const key = `${type}_${no}`;

  const cleanRows = Array.isArray(b.rows)
    ? b.rows
        .map((r: any) => {
          const p = r && r.p ? String(r.p).trim() : "";
          const h = r && r.h ? String(r.h).trim() : "";
          const q = r && r.q !== undefined ? String(r.q).trim() : "";
          const rVal = r && r.r !== undefined ? String(r.r).trim() : "";
          const qNum = parseFloat(q) || 0;
          const rNum = parseFloat(rVal) || 0;
          let a = typeof r?.a === "number" && !isNaN(r.a) ? r.a : Number(r?.a) || 0;
          if (qNum > 0 && rNum > 0) {
            a = Math.round(qNum * rNum * 100) / 100;
          }
          return { p, h, q, r: rVal, a };
        })
        .filter((r: any) => !!(r.p || r.h || (parseFloat(r.q) > 0) || (parseFloat(r.r) > 0) || r.a > 0))
    : [];

  const sub = cleanRows.reduce((acc: number, r: any) => acc + (Number(r.a) || 0), 0);
  const discount = typeof b.discount === "number" && !isNaN(b.discount) ? Math.max(0, b.discount) : Math.max(0, Number(b.discount) || 0);
  const discountAmt = Math.round(sub * (discount / 100) * 100) / 100;
  const subAfterDiscount = Math.max(0, Math.round((sub - discountAmt) * 100) / 100);
  const applyGst = b.applyGst !== undefined ? Boolean(b.applyGst) : type === "gst";
  const isGst = applyGst && type !== "cash";
  const cgst = isGst ? Math.round(subAfterDiscount * 0.09 * 100) / 100 : 0;
  const sgst = isGst ? Math.round(subAfterDiscount * 0.09 * 100) / 100 : 0;
  const grand = Math.round((subAfterDiscount + cgst + sgst) * 100) / 100;

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
    rows: cleanRows.length > 0 ? cleanRows : [
      { p: "", h: "", q: "", r: "", a: 0 },
      { p: "", h: "", q: "", r: "", a: 0 },
      { p: "", h: "", q: "", r: "", a: 0 }
    ],
    applyGst: isGst,
    sub,
    discount,
    discountAmt,
    subAfterDiscount,
    cgst,
    sgst,
    grand,
    signatureUrl: b.signatureUrl ? String(b.signatureUrl).trim() : "",
    saved: b.saved ? String(b.saved).trim() : new Date().toISOString(),
    updatedAt: b.updatedAt || new Date().toISOString(),
  };
}

export function deduplicateBills(list: any[]): any[] {
  const keyMap = new Map<string, any>();
  const contentMap = new Map<string, any>();

  for (const item of list) {
    const clean = sanitizeBill(item);
    if (!clean) continue;

    const rowsFingerprint = (clean.rows || [])
      .filter((r: any) => r.p || r.a)
      .map((r: any) => `${r.p}|${r.q}|${r.r}|${r.a}`)
      .join(";");
    const contentKey = `${clean.type}|${clean.cname.toLowerCase().trim()}|${clean.date}|${clean.po.toLowerCase().trim()}|${clean.grand}|${rowsFingerprint}`;
    const billKey = getBillKey(clean);

    if (contentMap.has(contentKey)) {
      const existing = contentMap.get(contentKey);
      const numExisting = parseInt(String(existing.no).replace(/\D/g, ""), 10) || 0;
      const numClean = parseInt(String(clean.no).replace(/\D/g, ""), 10) || 0;
      if (numClean > numExisting) {
        keyMap.delete(getBillKey(existing));
        keyMap.set(billKey, clean);
        contentMap.set(contentKey, clean);
      }
    } else {
      keyMap.set(billKey, clean);
      contentMap.set(contentKey, clean);
    }
  }

  return sortBills(Array.from(keyMap.values()));
}

interface SupabaseBillRow {
  id: string;
  type: string;
  no: string;
  date: string;
  cname: string;
  grand: number;
  data: any;
  updated_at: string;
}

function formatBillForSupabase(b: any): SupabaseBillRow | null {
  const clean = sanitizeBill(b);
  if (!clean) return null;
  return {
    id: clean.id,
    type: clean.type,
    no: clean.no,
    date: clean.date || "",
    cname: clean.cname || "",
    grand: clean.grand || 0,
    data: clean,
    updated_at: new Date().toISOString(),
  };
}

async function fetchAllBillsFromSupabase(): Promise<any[]> {
  const { data, error } = await supabase
    .from("bills")
    .select("data")
    .order("date", { ascending: false });

  if (error) {
    console.error("Supabase fetch error:", error);
    throw new Error(error.message);
  }

  const bills = (data || []).map((d: any) => d.data).filter(Boolean);
  return deduplicateBills(bills);
}

export async function GET() {
  try {
    const bills = await fetchAllBillsFromSupabase();
    return NextResponse.json({ success: true, bills }, { status: 200 });
  } catch (error: any) {
    console.error("GET /api/bills error:", error);
    return NextResponse.json({ success: false, error: error.message, bills: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Single bill save/update
    if (body && !Array.isArray(body) && (body.no !== undefined || body.id !== undefined)) {
      const cleanBill = sanitizeBill({ ...body, updatedAt: new Date().toISOString() });
      if (!cleanBill) {
        return NextResponse.json({ error: "Invalid bill payload" }, { status: 400 });
      }

      const row = formatBillForSupabase(cleanBill);
      if (row) {
        const { error } = await supabase.from("bills").upsert(row, { onConflict: "id" });
        if (error) {
          console.error("Supabase upsert error:", error);
          throw new Error(error.message);
        }
      }

      const bills = await fetchAllBillsFromSupabase();
      return NextResponse.json({ success: true, bills }, { status: 200 });
    }

    // Bulk bills save/merge
    const incomingBills = Array.isArray(body) ? body : body.bills;
    if (Array.isArray(incomingBills)) {
      const rows: SupabaseBillRow[] = incomingBills
        .map((b: any) => formatBillForSupabase(b))
        .filter((r: SupabaseBillRow | null): r is SupabaseBillRow => r !== null);

      if (rows.length > 0) {
        const { error } = await supabase.from("bills").upsert(rows, { onConflict: "id" });
        if (error) {
          console.error("Supabase bulk upsert error:", error);
          throw new Error(error.message);
        }
      }

      const bills = await fetchAllBillsFromSupabase();
      return NextResponse.json({ success: true, bills }, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid payload format" }, { status: 400 });
  } catch (error: any) {
    console.error("POST /api/bills error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const incomingBills = Array.isArray(body) ? body : body.bills || [];

    const rows: SupabaseBillRow[] = incomingBills
      .map((b: any) => formatBillForSupabase(b))
      .filter((r: SupabaseBillRow | null): r is SupabaseBillRow => r !== null);

    if (rows.length > 0) {
      const { error } = await supabase.from("bills").upsert(rows, { onConflict: "id" });
      if (error) {
        throw new Error(error.message);
      }
    }

    const bills = await fetchAllBillsFromSupabase();
    return NextResponse.json({ success: true, bills }, { status: 200 });
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

    let targetId = id;
    if (!targetId && no && type) {
      targetId = `${type}_${no}`;
    }

    if (targetId) {
      const { error } = await supabase.from("bills").delete().eq("id", targetId);
      if (error) throw new Error(error.message);
    } else if (no) {
      const { error } = await supabase.from("bills").delete().eq("no", no);
      if (error) throw new Error(error.message);
    } else {
      return NextResponse.json({ error: "Missing bill identifier (no or id)" }, { status: 400 });
    }

    const bills = await fetchAllBillsFromSupabase();
    return NextResponse.json({ success: true, bills }, { status: 200 });
  } catch (error: any) {
    console.error("DELETE /api/bills error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
