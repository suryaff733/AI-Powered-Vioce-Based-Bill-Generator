import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");
const CATALOG_TMP_FILE = path.join(DATA_DIR, "catalog.tmp.json");
const CATALOG_BAK_FILE = path.join(DATA_DIR, "catalog.bak.json");
const DEFAULT_CATALOG_FILE = path.join(process.cwd(), "src", "app", "catalog.json");

function ensureCatalogExists() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(CATALOG_FILE)) {
      let defaultItems = [];
      if (fs.existsSync(DEFAULT_CATALOG_FILE)) {
        try {
          defaultItems = JSON.parse(fs.readFileSync(DEFAULT_CATALOG_FILE, "utf-8"));
        } catch (e) {}
      }
      fs.writeFileSync(CATALOG_FILE, JSON.stringify(defaultItems, null, 2), "utf-8");
    }
  } catch (err) {
    console.error("Error ensuring catalog file exists:", err);
  }
}

function readCatalog(): any[] {
  ensureCatalogExists();
  try {
    const content = fs.readFileSync(CATALOG_FILE, "utf-8");
    if (!content || !content.trim()) return [];
    return JSON.parse(content);
  } catch (err) {
    console.error("Corrupted catalog.json detected, attempting backup recovery:", err);
    try {
      if (fs.existsSync(CATALOG_BAK_FILE)) {
        const bakContent = fs.readFileSync(CATALOG_BAK_FILE, "utf-8");
        const recovered = JSON.parse(bakContent || "[]");
        writeCatalogAtomic(recovered);
        return recovered;
      }
    } catch (bakErr) {
      console.error("Catalog backup recovery failed:", bakErr);
    }
    return [];
  }
}

function writeCatalogAtomic(catalog: any[]): boolean {
  ensureCatalogExists();
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      try {
        fs.copyFileSync(CATALOG_FILE, CATALOG_BAK_FILE);
      } catch (e) {}
    }
    fs.writeFileSync(CATALOG_TMP_FILE, JSON.stringify(catalog, null, 2), "utf-8");
    fs.renameSync(CATALOG_TMP_FILE, CATALOG_FILE);
    return true;
  } catch (err) {
    console.error("Error atomically writing catalog.json:", err);
    try {
      fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), "utf-8");
      return true;
    } catch (e) {
      return false;
    }
  }
}

export async function GET() {
  try {
    const catalog = readCatalog();
    return NextResponse.json({ success: true, catalog }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const currentCatalog = readCatalog();

    if (body && typeof body.name === "string" && body.name.trim()) {
      const item = {
        name: body.name.trim(),
        defaultRate: typeof body.defaultRate === "number" && !isNaN(body.defaultRate) ? body.defaultRate : Number(body.defaultRate) || 0,
        hsn: body.hsn ? String(body.hsn).trim() : "",
      };

      const idx = currentCatalog.findIndex(
        (c) => c && c.name && c.name.toLowerCase().trim() === item.name.toLowerCase()
      );

      if (idx >= 0) {
        currentCatalog[idx] = { ...currentCatalog[idx], ...item };
      } else {
        currentCatalog.push(item);
      }

      writeCatalogAtomic(currentCatalog);
      return NextResponse.json({ success: true, catalog: currentCatalog }, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid product name provided" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const incoming = Array.isArray(body) ? body : body.catalog || [];
    const current = readCatalog();

    const map = new Map<string, any>();
    for (const c of current) {
      if (c && c.name) map.set(c.name.toLowerCase().trim(), c);
    }
    for (const c of incoming) {
      if (c && c.name) {
        const key = c.name.toLowerCase().trim();
        map.set(key, { ...map.get(key), ...c });
      }
    }

    const merged = Array.from(map.values());
    writeCatalogAtomic(merged);

    return NextResponse.json({ success: true, catalog: merged }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const name = url.searchParams.get("name")?.trim();

    if (!name) {
      return NextResponse.json({ error: "Product name required for deletion" }, { status: 400 });
    }

    let current = readCatalog();
    current = current.filter((c) => c && c.name && c.name.toLowerCase().trim() !== name.toLowerCase());

    writeCatalogAtomic(current);
    return NextResponse.json({ success: true, catalog: current }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
