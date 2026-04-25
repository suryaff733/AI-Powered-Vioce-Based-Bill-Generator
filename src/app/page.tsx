"use client";

import { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { invHTML } from "../lib/invoiceHTML";
import "./globals.css"; // Ensure global CSS has the original styles

type Row = { p: string; h: string; q: string; r: string; a: number };
type BillType = 'gst' | 'quotation' | 'cash';

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
  const [bills, setBills] = useState<any[]>([]);
  
  const [dlMsg, setDlMsg] = useState("");
  const [showBanner, setShowBanner] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewHtml, setPreviewHtml] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('svs4') || '[]');
      setBills(saved);
      const nums = saved.map((b: any) => parseInt(b.no)).filter((n: number) => !isNaN(n));
      setNo(String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, '0'));
    } catch (e) {}
    setDate(new Date().toISOString().split('T')[0]);
  }, []);

  const addRow = (p='', h='', q='', r='', a=0) => {
    setRows([...rows, { p, h, q, r, a }]);
  };

  const upd = (i: number, field: keyof Row, val: string) => {
    const newRows = [...rows];
    (newRows[i] as any)[field] = val;
    
    const q = parseFloat(newRows[i].q) || 0;
    const r = parseFloat(newRows[i].r) || 0;
    
    if (q > 0 && r > 0) {
      newRows[i].a = Math.round(q * r * 100) / 100;
    } else if (field === 'a') {
      newRows[i].a = parseFloat(val) || 0;
    }
    setRows(newRows);
  };

  const delRow = (i: number) => {
    const newRows = [...rows];
    newRows.splice(i, 1);
    setRows(newRows);
  };

  const sub = rows.reduce((s, x) => s + (parseFloat(x.a as any) || 0), 0);
  const isGst = applyGst && btype !== 'cash';
  const cgst = isGst ? Math.round(sub * 0.09 * 100) / 100 : 0;
  const sgst = isGst ? Math.round(sub * 0.09 * 100) / 100 : 0;
  const grand = sub + cgst + sgst;

  const fmtD = (n: number) => 'Rs. ' + (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getData = () => ({
    type: btype, no, date, po, transport, cname, caddr, cgstin,
    sname, saddr, sgstin, rows, applyGst: isGst,
    sub, cgst, sgst, grand, saved: new Date().toISOString()
  });

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
    setRows([{ p: "", h: "", q: "", r: "", a: 0 }, { p: "", h: "", q: "", r: "", a: 0 }, { p: "", h: "", q: "", r: "", a: 0 }]);
    const nums = bills.map((b: any) => parseInt(b.no)).filter((n: number) => !isNaN(n));
    setNo(String(nums.length ? Math.max(...nums) + 1 : 1).padStart(3, '0'));
  };

  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (activeSec === 'preview') {
      setPreviewHtml(invHTML(getData()));
    }
  }, [activeSec, btype, no, date, po, transport, cname, caddr, cgstin, sname, saddr, sgstin, rows, applyGst]);

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
      }).then((canvas) => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
        
        const fname = `SVS_${d.type.toUpperCase()}_${d.no}_${(d.date || '').replace(/-/g, '')}_${(d.cname || 'bill').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        pdf.save(fname);
        
        setIsDownloading(false);
        setDlMsg('PDF downloaded: ' + fname);
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 4000);
      }).catch(() => setIsDownloading(false));
    }, 600);
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-title">SVS Billing</div>
        <div className="tabs">
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
            <div className="field"><label>Customer Name</label><input value={cname} onChange={e => setCname(e.target.value)} placeholder="e.g. Avenue Supermarts Ltd." /></div>
            <div className="field"><label>Address</label><input value={caddr} onChange={e => setCaddr(e.target.value)} placeholder="e.g. Medipally D-Mart" /></div>
            <div className="field"><label>GSTIN</label><input value={cgstin} onChange={e => setCgstin(e.target.value)} placeholder="Optional" /></div>
          </div>
          <div className="card">
            <div className="card-title">Ship To Party <span style={{ fontSize: "10px", textTransform: "none", fontWeight: 400, color: "var(--color-text-secondary)" }}>(Optional)</span></div>
            <div className="field"><label>Name</label><input value={sname} onChange={e => setSname(e.target.value)} placeholder="Leave blank if same as Bill To" /></div>
            <div className="field"><label>Address</label><input value={saddr} onChange={e => setSaddr(e.target.value)} placeholder="Optional" /></div>
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
                      <td data-lbl="Particulars"><input value={r.p} placeholder="Description" onChange={e => upd(i, 'p', e.target.value)} /></td>
                      <td data-lbl="HSN/SAC"><input value={r.h} placeholder="HSN" onChange={e => upd(i, 'h', e.target.value)} /></td>
                      <td data-lbl="Qty"><input type="number" min="0" value={r.q} placeholder="0" onChange={e => upd(i, 'q', e.target.value)} /></td>
                      <td data-lbl="Rate (Rs.)"><input type="number" min="0" value={r.r} placeholder="0" onChange={e => upd(i, 'r', e.target.value)} /></td>
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
    </div>
  );
}
