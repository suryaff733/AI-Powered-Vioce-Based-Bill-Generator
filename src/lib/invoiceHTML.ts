export interface InvoiceRow {
  p?: string;
  h?: string;
  q?: string | number;
  r?: string | number;
  a?: number;
}

export interface InvoiceData {
  type: string;
  no?: string;
  date?: string;
  po?: string;
  transport?: string;
  cname?: string;
  caddr?: string;
  cgstin?: string;
  sname?: string;
  saddr?: string;
  sgstin?: string;
  rows?: InvoiceRow[];
  applyGst?: boolean;
  sub?: number;
  discount?: number;
  discountAmt?: number;
  subAfterDiscount?: number;
  cgst?: number;
  sgst?: number;
  grand?: number;
}

export function fmtR(n: number = 0): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtD(n: number = 0): string {
  return 'Rs. ' + fmtR(n);
}

export function esc(s: unknown): string {
  return (s === undefined || s === null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function numberToWords(num: number = 0): string {
  if (num === 0) return "Zero";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  
  const inWords = (n: number): string => {
    let str = "";
    if (n > 9999999) {
      str += inWords(Math.floor(n / 10000000)) + " Crore ";
      n %= 10000000;
    }
    if (n > 99999) {
      str += inWords(Math.floor(n / 100000)) + " Lakh ";
      n %= 100000;
    }
    if (n > 999) {
      str += inWords(Math.floor(n / 1000)) + " Thousand ";
      n %= 1000;
    }
    if (n > 99) {
      str += inWords(Math.floor(n / 100)) + " Hundred ";
      n %= 100;
    }
    if (n > 0) {
      if (n < 20) str += a[n] + " ";
      else {
        str += b[Math.floor(n / 10)] + " ";
        if (n % 10 > 0) str += a[n % 10] + " ";
      }
    }
    return str.trim();
  };

  const whole = Math.floor(num);
  const fraction = Math.round((num - whole) * 100);
  let res = inWords(whole);
  if (fraction > 0) {
    res += " and " + inWords(fraction) + " Paise";
  }
  return res + " Only";
}

export function invHTML_simple(d: InvoiceData): string {
  const typeLabel = d.type === 'quotation' ? 'QUOTATION' : 'CASH MEMO / BILL';
  const typeColor = '#003399';
  const dateStr = (d.date || '').split('-').reverse().join('/');

  const validRows = (d.rows || []).filter(function (it: InvoiceRow) {
    const q = typeof it.q === "number" ? it.q : parseFloat(it.q || "") || 0;
    const r = typeof it.r === "number" ? it.r : parseFloat(it.r || "") || 0;
    const a = typeof it.a === "number" ? it.a : parseFloat(String(it.a || "")) || 0;
    const rowAmt = (q > 0 && r > 0) ? q * r : a;
    return !!(it.p || it.h || it.q || it.r || rowAmt > 0);
  });

  const itemRows = validRows.map(function (it: InvoiceRow, i: number) {
    const q = typeof it.q === "number" ? it.q : parseFloat(it.q || "") || 0;
    const r = typeof it.r === "number" ? it.r : parseFloat(it.r || "") || 0;
    const a = typeof it.a === "number" ? it.a : parseFloat(String(it.a || "")) || 0;
    const rowAmt = (q > 0 && r > 0) ? q * r : a;
    return '<tr style="vertical-align: top;"><td style="text-align:center;padding:10px 8px;border-right:1px solid #003399;font-size:14px;">' + (i + 1) + '</td>' +
      '<td style="padding:10px 8px;border-right:1px solid #003399;text-align:left;font-size:14px;font-weight:600;">' + esc(it.p || '') + '</td>' +
      '<td style="text-align:center;padding:10px 8px;border-right:1px solid #003399;font-size:13px;">' + esc(it.h || '') + '</td>' +
      '<td style="text-align:center;padding:10px 8px;border-right:1px solid #003399;font-size:13px;">' + esc(it.q || '') + '</td>' +
      '<td style="text-align:right;padding:10px 8px;border-right:1px solid #003399;font-size:13px;">' + (r ? fmtR(r) : '') + '</td>' +
      '<td style="text-align:right;padding:10px 8px;font-size:14px;font-weight:700;">' + (rowAmt ? fmtR(rowAmt) + '/-' : '') + '</td></tr>';
  }).join('');

  let totals = '<tr style="font-weight: 700; color: #003399; font-size: 13px;">' +
    '<td style="border-right: 1px solid #003399;"></td>' +
    '<td style="border-right: 1px solid #003399;"></td>' +
    '<td colspan="3" style="border-top: 1px solid #003399; border-right: 1px solid #003399; padding: 7px 10px; text-align: left;">SUBTOTAL</td>' +
    '<td style="border-top: 1px solid #003399; padding: 7px 10px; text-align: right; color: #000; font-size: 14px;">' + fmtR(d.sub || 0) + '/-</td></tr>';

  if ((d.discount || 0) > 0) {
    totals += '<tr style="font-weight: 700; color: #666; font-size: 13px;">' +
      '<td style="border-right: 1px solid #003399;"></td>' +
      '<td style="border-right: 1px solid #003399;"></td>' +
      '<td colspan="3" style="border-top: 1px solid #003399; border-right: 1px solid #003399; padding: 7px 10px; text-align: left;">DISCOUNT (' + esc(d.discount) + '%)</td>' +
      '<td style="border-top: 1px solid #003399; padding: 7px 10px; text-align: right; color: #b91c1c; font-size: 14px;">- ' + fmtR(d.discountAmt || 0) + '/-</td></tr>';
  }

  if (d.applyGst) {
    if ((d.discount || 0) > 0) {
      totals += '<tr style="font-weight: 600; color: #444; font-size: 12px;">' +
        '<td style="border-right: 1px solid #003399;"></td>' +
        '<td style="border-right: 1px solid #003399;"></td>' +
        '<td colspan="3" style="border-top: 1px solid #003399; border-right: 1px solid #003399; padding: 5px 10px; text-align: left;">TAXABLE AMOUNT</td>' +
        '<td style="border-top: 1px solid #003399; padding: 5px 10px; text-align: right; color: #000; font-size: 13px;">' + fmtR(d.subAfterDiscount || d.sub || 0) + '/-</td></tr>';
    }
    totals += '<tr style="font-weight: 700; color: #CC0000; font-size: 13px;">' +
      '<td style="border-right: 1px solid #003399;"></td>' +
      '<td style="border-right: 1px solid #003399;"></td>' +
      '<td colspan="3" style="border-top: 1px solid #003399; border-right: 1px solid #003399; padding: 7px 10px; text-align: left;">CGST @ 9%</td>' +
      '<td style="border-top: 1px solid #003399; padding: 7px 10px; text-align: right; color: #000; font-size: 14px;">' + fmtR(d.cgst || 0) + '/-</td></tr>';
    totals += '<tr style="font-weight: 700; color: #CC0000; font-size: 13px;">' +
      '<td style="border-right: 1px solid #003399;"></td>' +
      '<td style="border-right: 1px solid #003399;"></td>' +
      '<td colspan="3" style="border-top: 1px solid #003399; border-right: 1px solid #003399; padding: 7px 10px; text-align: left;">SGST @ 9%</td>' +
      '<td style="border-top: 1px solid #003399; padding: 7px 10px; text-align: right; color: #000; font-size: 14px;">' + fmtR(d.sgst || 0) + '/-</td></tr>';
  }

  totals += '<tr style="font-weight: 800; color: #CC0000; font-size: 15px; background: #fff8f8;">' +
    '<td style="border-right: 1px solid #003399;"></td>' +
    '<td style="border-right: 1px solid #003399;"></td>' +
    '<td colspan="3" style="border-top: 2px solid #003399; border-right: 1px solid #003399; padding: 8px 10px; text-align: left; color:#003399;">GRAND TOTAL</td>' +
    '<td style="border-top: 2px solid #003399; padding: 8px 10px; text-align: right; color: #CC0000; font-size: 17px; font-weight: 900;">' + fmtR(d.grand || 0) + '/-</td></tr>';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif}' +
    '.inv{border:none;font-size:13px;color:#000;width:794px;height:1123px;box-sizing:border-box;margin:0 auto;display:flex;flex-direction:column;background:#fff;position:relative;padding:12px 16px;box-shadow:0 8px 24px rgba(0,0,0,0.1)}' +
    'table{border-collapse:collapse}' +
    '</style></head><body>' +
    '<div class="inv">' +

    '<div style="border: 2px solid #003399; padding: 12px; display: flex; flex-direction: column; flex: 1; border-radius: 4px;">' +

    '<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#003399;align-items:flex-start;">' +
    '<div>Prop. S. Venkateshwara Rao<br>GSTIN : 36BXYPS4294L1Z7</div>' +
    '<div style="font-size:18px;text-decoration:underline;color:' + typeColor + ';">' + esc(typeLabel) + '</div>' +
    '<div style="text-align:right;">Cell : 9848693461<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: 8074312463</div>' +
    '</div>' +

    '<div style="text-align:center;margin-top:12px;">' +
    '<div style="color:#FF3300;font-size:28px;font-weight:900;font-family:\'Arial Black\',Impact,sans-serif;letter-spacing:0.5px;">SRI VENKATA SURYA ELECTRICAL</div>' +
    '<div style="color:#003399;font-size:23px;font-weight:900;font-family:\'Arial Black\',Impact,sans-serif;margin-top:2px;">&amp; MOTOR MECHANICAL WORKS</div>' +
    '<div style="color:#FF3300;font-size:13px;font-weight:700;margin-top:8px;">ALL KINDS OF ELECTRICAL MOTORS &amp; SUBMERSIBLE MOTORS REWINDING Etc.,</div>' +
    '<div style="color:#003399;font-size:13px;margin-top:4px;">Plot No. : 21, Nirmala Nagar Colony, Karmanghat, Hyderabad - 500 079. (T.G.)</div>' +
    '</div>' +

    '<div style="border-top:1px solid #003399;margin:12px 0;"></div>' +

    '<div style="display:flex;justify-content:space-between;font-size:16px;margin-bottom:12px;padding:0 8px;">' +
    '<div style="color:#CC0000;font-weight:700;">No. <span style="font-size:22px;margin-left:8px;">' + esc(d.no || '') + '</span></div>' +
    '<div style="color:#003399;font-weight:700;">Date : <span style="color:#000;border-bottom:1px dashed #003399;padding-bottom:2px;margin-left:4px;min-width:130px;display:inline-block;text-align:center;">' + esc(dateStr) + '</span></div>' +
    '</div>' +

    '<div style="font-size:16px;color:#003399;margin-bottom:6px;padding:0 8px;display:flex;align-items:flex-end;">' +
    '<span style="white-space:nowrap;margin-right:12px;font-weight:700;">M/s.</span>' +
    '<div style="border-bottom:1px solid #003399;flex:1;color:#000;font-family:\'Courier New\',Courier,monospace;font-size:18px;font-weight:700;padding-bottom:2px;padding-left:8px;">' + esc(d.cname || '') + '</div>' +
    '</div>' +
    '<div style="font-size:16px;color:#003399;margin-bottom:14px;padding:0 8px;display:flex;align-items:flex-end;">' +
    '<div style="border-bottom:1px solid #003399;width:100%;height:22px;color:#000;font-family:\'Courier New\',Courier,monospace;font-size:16px;padding-bottom:2px;padding-left:8px;">' + esc(d.caddr || '') + '</div>' +
    '</div>' +

    '<div style="border-top:1px solid #003399;"></div>' +

    '<div style="flex:1;display:flex;flex-direction:column;position:relative;margin-top:-1px;border-bottom:1px solid #003399;">' +
    '<div style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;overflow:hidden;display:flex;align-items:center;justify-content:center;opacity:0.05;">' +
    '<div style="transform:rotate(-35deg);font-size:44px;font-weight:900;color:#003399;text-align:center;line-height:1.4;">SRI VENKATA SURYA ELECTRICAL<br>&amp; MOTOR MECHANICAL WORKS</div>' +
    '</div>' +

    '<table style="width:100%;height:100%;border-collapse:collapse;position:relative;z-index:1;">' +
    '<thead>' +
    '<tr style="color:#003399;font-weight:700;font-size:13px;background:#f8fafc;">' +
    '<th style="border-right:1px solid #003399;border-bottom:1px solid #003399;padding:8px 6px;width:38px;">Sl.<br>No.</th>' +
    '<th style="border-right:1px solid #003399;border-bottom:1px solid #003399;padding:8px 6px;text-align:left;">PARTICULARS</th>' +
    '<th style="border-right:1px solid #003399;border-bottom:1px solid #003399;padding:8px 6px;width:65px;">HSN<br>Code</th>' +
    '<th style="border-right:1px solid #003399;border-bottom:1px solid #003399;padding:8px 6px;width:50px;">Qty.</th>' +
    '<th style="border-right:1px solid #003399;border-bottom:1px solid #003399;padding:8px 6px;width:80px;text-align:right;">Rate</th>' +
    '<th style="border-bottom:1px solid #003399;padding:8px 6px;width:120px;text-align:right;">AMOUNT<br>Rs.</th>' +
    '</tr>' +
    '</thead>' +
    '<tbody>' +
    itemRows +
    '<tr style="height:100%;">' +
    '<td style="border-right:1px solid #003399;"></td>' +
    '<td style="border-right:1px solid #003399;"></td>' +
    '<td style="border-right:1px solid #003399;"></td>' +
    '<td style="border-right:1px solid #003399;"></td>' +
    '<td style="border-right:1px solid #003399;"></td>' +
    '<td></td>' +
    '</tr>' +
    '</tbody>' +
    '<tfoot>' +
    totals +
    '</tfoot>' +
    '</table>' +
    '</div>' +

    '<div style="display:flex;justify-content:space-between;align-items:stretch;margin-top:10px;border-top:1px solid #003399;padding-top:8px;">' +
    '<div style="flex:1;font-size:11px;">' +
    '<div style="font-weight:700;color:#CC0000;margin-bottom:2px;">Our Bank Details :</div>' +
    '<div style="font-size:12px;font-weight:700;color:#003399;">AXIS BANK, BN Reddy Branch</div>' +
    '<div style="color:#000;">A/c. No. : 917020076235758, IFSC Code : UTIB0003061</div>' +
    '<div style="margin-top:6px;font-weight:700;color:#003399;">Amount in Words : <span style="font-weight:400;color:#000;">' + esc(numberToWords(d.grand || 0)) + '</span></div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;min-width:240px;text-align:right;">' +
    '<div style="color:#CC0000;font-size:12px;font-weight:700;">For SRI VENKATA SURYA ELECTRICAL<br>&amp; MOTOR MECHANICAL WORKS</div>' +
    '<div style="height:30px;"></div>' +
    '<div style="color:#000;font-size:11px;font-weight:700;border-top:1px solid #003399;padding-top:3px;min-width:140px;text-align:center;">Authorised Signatory</div>' +
    '</div>' +
    '</div>' +

    '</div>' +
    '</div></body></html>';
}

export function invHTML(d: InvoiceData): string {
  if (d.type === 'quotation' || d.type === 'cash') {
    return invHTML_simple(d);
  }
  const typeLabel = d.type === 'gst' ? 'TAX INVOICE' : d.type === 'quotation' ? 'QUOTATION' : 'CASH MEMO / BILL';
  const typeColor = '#003399';
  
  let totHtml = '<div style="display:flex;justify-content:space-between;padding:5px 10px;border-bottom:1px solid #eee;font-size:13px"><span style="color:#003399;font-weight:700">SUBTOTAL</span><span>' + fmtR(d.sub || 0) + '</span></div>';
  if ((d.discount || 0) > 0) {
    totHtml += '<div style="display:flex;justify-content:space-between;padding:5px 10px;border-bottom:1px solid #eee;font-size:13px"><span style="color:#666;font-weight:700">DISCOUNT (' + esc(d.discount) + '%)</span><span style="color:#b91c1c;">- ' + fmtR(d.discountAmt || 0) + '</span></div>';
    totHtml += '<div style="display:flex;justify-content:space-between;padding:5px 10px;border-bottom:1px solid #eee;font-size:12px"><span style="color:#444;font-weight:600">TAXABLE VALUE</span><span>' + fmtR(d.subAfterDiscount || d.sub || 0) + '</span></div>';
  }
  if (d.applyGst) {
    totHtml += '<div style="display:flex;justify-content:space-between;padding:5px 10px;border-bottom:1px solid #eee;font-size:13px"><span style="color:#CC0000;font-weight:700">CGST @ 9 %</span><span>' + fmtR(d.cgst || 0) + '</span></div>';
    totHtml += '<div style="display:flex;justify-content:space-between;padding:5px 10px;border-bottom:1px solid #eee;font-size:13px"><span style="color:#CC0000;font-weight:700">SGST @ 9 %</span><span>' + fmtR(d.sgst || 0) + '</span></div>';
  }
  totHtml += '<div style="display:flex;justify-content:space-between;padding:7px 10px;font-size:14px;font-weight:800;color:#CC0000;background:#fff5f5"><span>GRAND TOTAL</span><span style="font-size:16px">' + fmtR(d.grand || 0) + '</span></div>';

  const stampHtml = '<div style="display:flex;gap:30px;align-items:flex-end;">' +
    '<div style="text-align:center;padding-top:4px;border-top:1px solid #003399;min-width:120px;">Receiver\'s Signature</div>' +
    '<div style="position:relative;display:inline-block;text-align:center;color:#003399;font-family:Arial,sans-serif;line-height:1.2;font-size:10px;">' +
    '<div style="font-weight:700;font-size:12px;color:#CC0000;">For SRI VENKATA SURYA</div>' +
    '<div style="font-weight:700;">Electrical &amp; Motor Mechanical Works</div>' +
    '<div style="height:30px;"></div>' +
    '<div>Authorised Signatory</div>' +
    '<div style="font-weight:700;">S. Venkateshwar Rao</div>' +
    '<div>Proprietor</div>' +
    '</div>' +
    '</div>';

  const validRows = (d.rows || []).filter(function (it: InvoiceRow) {
    const q = typeof it.q === "number" ? it.q : parseFloat(it.q || "") || 0;
    const r = typeof it.r === "number" ? it.r : parseFloat(it.r || "") || 0;
    const a = typeof it.a === "number" ? it.a : parseFloat(String(it.a || "")) || 0;
    const rowAmt = (q > 0 && r > 0) ? q * r : a;
    return !!(it.p || it.h || it.q || it.r || rowAmt > 0);
  });

  const itemRows = validRows.map(function (it: InvoiceRow, i: number) {
    const q = typeof it.q === "number" ? it.q : parseFloat(it.q || "") || 0;
    const r = typeof it.r === "number" ? it.r : parseFloat(it.r || "") || 0;
    const a = typeof it.a === "number" ? it.a : parseFloat(String(it.a || "")) || 0;
    const rowAmt = (q > 0 && r > 0) ? q * r : a;
    return '<tr style="vertical-align:top"><td style="text-align:center;padding:8px;border-right:1px solid #003399;border-bottom:1px solid #eee">' + (i + 1) + '</td>' +
      '<td style="padding:8px;border-right:1px solid #003399;border-bottom:1px solid #eee;font-weight:600;">' + esc(it.p || '') + '</td>' +
      '<td style="text-align:center;padding:8px;border-right:1px solid #003399;border-bottom:1px solid #eee">' + esc(it.h || '') + '</td>' +
      '<td style="text-align:center;padding:8px;border-right:1px solid #003399;border-bottom:1px solid #eee">' + esc(it.q || '') + '</td>' +
      '<td style="text-align:right;padding:8px;border-right:1px solid #003399;border-bottom:1px solid #eee">' + (r ? fmtR(r) : '') + '</td>' +
      '<td style="text-align:right;padding:8px;border-bottom:1px solid #eee;font-weight:700;">' + fmtR(rowAmt) + '</td></tr>';
  }).join('');

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif}' +
    '.inv{border:1px solid #003399;font-size:13px;color:#000;width:794px;height:1123px;box-sizing:border-box;margin:0 auto;display:flex;flex-direction:column;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,0.1)}' +
    'table{border-collapse:collapse}' +
    '</style></head><body>' +
    '<div class="inv">' +
    '<div style="background:#E8A000;height:8px;flex-shrink:0"></div>' +
    '<div style="padding:8px 12px 6px;font-size:10px;flex-shrink:0">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
    '<div><strong>GSTIN : 36BXYPS4294L1Z7</strong><br>Vendor Code : 407135</div>' +
    '<div style="font-weight:700;color:' + typeColor + ';font-size:16px">' + esc(typeLabel) + '</div>' +
    '<div style="text-align:right">Cell : 9848693461<br>: 8074312463</div>' +
    '</div>' +
    '</div>' +
    '<div style="text-align:center;padding:6px 10px 8px;flex-shrink:0">' +
    '<div style="font-size:22px;font-weight:900;color:#CC0000;line-height:1.2;letter-spacing:0.5px;">SRI VENKATA SURYA ELECTRICAL &amp; MOTOR MECHANICAL WORKS</div>' +
    '<div style="font-size:13px;font-weight:700;color:#003399;margin-top:4px">SALES &amp; SERVICE : ALL KINDS OF MOTOR REWINDING WORKS ARE AVAILABLE</div>' +
    '<div style="font-size:11px;margin-top:2px">Plot No. : 21, Nirmala Nagar Colony, Karmanghat, Hyderabad - 500 079. (T.G.)</div>' +
    '</div>' +
    '<div style="border-top:1px solid #003399;flex-shrink:0"></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #003399;flex-shrink:0">' +
    '<div style="padding:10px 12px">' +
    '<div style="display:flex;gap:4px;font-size:13px;margin-bottom:6px"><span style="min-width:85px">Invoice No. :</span><span style="font-weight:700;color:#CC0000">' + esc(d.no || '') + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:13px"><span style="min-width:85px">Invoice Date :</span><span style="font-weight:700;color:#003399">' + esc(d.date || '') + '</span></div>' +
    '</div>' +
    '<div style="padding:10px 12px;border-left:1px solid #003399">' +
    '<div style="display:flex;gap:4px;font-size:13px;margin-bottom:6px"><span style="min-width:95px">Transport Mode :</span><span>' + esc(d.transport || '') + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:13px;margin-bottom:6px"><span style="min-width:95px">Vehicle Number :</span><span></span></div>' +
    '<div style="display:flex;gap:4px;font-size:13px"><span style="min-width:95px">P.O. Number :</span><span style="font-weight:600;">' + esc(d.po || '') + '</span></div>' +
    '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #003399;flex-shrink:0">' +
    '<div style="border-right:1px solid #003399">' +
    '<div style="font-size:10px;font-weight:700;color:#003399;text-align:center;padding:6px 0;border-bottom:1px solid #003399;background:#f0f4ff;">BILL TO PARTY</div>' +
    '<div style="padding:10px 12px;">' +
    '<div style="display:flex;gap:4px;font-size:13px;margin-bottom:6px"><span style="min-width:60px">Name :</span><span style="font-weight:700">' + esc(d.cname || '') + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:13px;margin-bottom:6px"><span style="min-width:60px">Address :</span><span>' + esc(d.caddr || '') + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:13px"><span style="min-width:60px">GSTIN :</span><span style="color:#6600cc;font-weight:600;">' + esc(d.cgstin || '') + '</span></div>' +
    '</div>' +
    '</div>' +
    '<div>' +
    '<div style="font-size:10px;font-weight:700;color:#003399;text-align:center;padding:6px 0;border-bottom:1px solid #003399;background:#f0f4ff;">SHIP TO PARTY</div>' +
    '<div style="padding:10px 12px;">' +
    '<div style="display:flex;gap:4px;font-size:13px;margin-bottom:6px"><span style="min-width:60px">Name :</span><span style="font-weight:700">' + esc(d.sname || '') + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:13px;margin-bottom:6px"><span style="min-width:60px">Address :</span><span>' + esc(d.saddr || '') + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:13px"><span style="min-width:60px">GSTIN :</span><span style="color:#6600cc;font-weight:600;">' + esc(d.sgstin || '') + '</span></div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div style="flex:1;background:#fff;display:flex;flex-direction:column;">' +
    '<table style="width:100%;height:100%;font-size:13px;border-collapse:collapse;"><thead><tr>' +
    '<th style="width:35px;background:#f0f4ff;color:#003399;font-weight:700;padding:10px 8px;border-right:1px solid #003399;border-bottom:1px solid #003399;text-align:center">Sl.</th>' +
    '<th style="background:#f0f4ff;color:#003399;font-weight:700;padding:10px 8px;border-right:1px solid #003399;border-bottom:1px solid #003399;text-align:left">PARTICULARS</th>' +
    '<th style="width:75px;background:#f0f4ff;color:#003399;font-weight:700;padding:10px 8px;border-right:1px solid #003399;border-bottom:1px solid #003399;text-align:center">HSN/SAC</th>' +
    '<th style="width:55px;background:#f0f4ff;color:#003399;font-weight:700;padding:10px 8px;border-right:1px solid #003399;border-bottom:1px solid #003399;text-align:center">Qty</th>' +
    '<th style="width:85px;background:#f0f4ff;color:#003399;font-weight:700;padding:10px 8px;border-right:1px solid #003399;border-bottom:1px solid #003399;text-align:right">Rate</th>' +
    '<th style="width:100px;background:#f0f4ff;color:#003399;font-weight:700;padding:10px 8px;border-bottom:1px solid #003399;text-align:right">AMOUNT</th>' +
    '</tr></thead><tbody>' + itemRows + 
    '<tr style="height:100%;">' +
    '<td style="border-right:1px solid #003399;"></td>' +
    '<td style="border-right:1px solid #003399;"></td>' +
    '<td style="border-right:1px solid #003399;"></td>' +
    '<td style="border-right:1px solid #003399;"></td>' +
    '<td style="border-right:1px solid #003399;"></td>' +
    '<td></td>' +
    '</tr>' +
    '</tbody></table>' +
    '</div>' +
    '<div style="display:flex;border-top:1px solid #003399;flex-shrink:0">' +
    '<div style="font-size:10px;flex:1">' +
    '<div style="padding:10px 12px 0;">' +
    '<div style="color:#CC0000;font-weight:700;margin-bottom:3px">Our Bank Details :</div>' +
    '<div style="color:#CC0000;font-weight:700;font-size:13px">AXIS BANK, BN Reddy Branch</div>' +
    '<div style="color:#CC0000;font-weight:700;margin-top:2px">A/c. No. : 917020076235758, IFSC Code : UTIB0003061</div>' +
    '</div>' +
    '<div style="border-top:1px solid #003399;border-bottom:1px solid #003399;margin:8px 0;padding:6px 12px;font-weight:700;">Rupees : <span style="font-weight:400;color:#000;">' + esc(numberToWords(d.grand || 0)) + '</span></div>' +
    '<div style="font-size:9.5px;color:#333;line-height:1.6;padding:0 12px 10px;">' +
    '<strong style="font-size:10.5px;color:#000;">Terms &amp; Conditions</strong><br>' +
    '1. Goods once cleared from our godown cannot be returned, exchanged, or re-entered into the godown.<br>' +
    '2. We are not responsible for any breakage, shortage, or any type of loss after dispatch.<br>' +
    '3. Subject to R.R. Dist. Jurisdiction.' +
    '</div>' +
    '</div>' +
    '<div style="width:46%;border-left:1px solid #003399">' + totHtml + '</div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-end;padding:10px 12px;border-top:1px solid #003399;font-size:10px;flex-shrink:0">' +
    '<div style="display:flex;gap:18px;align-items:center">' +
    '<div style="display:flex;flex-direction:column;align-items:center;">' +
    '<div style="width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:24px solid #E63900;margin-bottom:4px;"></div>' +
    '<span style="color:#E63900;font-weight:900;font-size:14px;letter-spacing:0.5px;line-height:1;display:inline-block;">AQUATEX</span>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;align-items:center;">' +
    '<div style="border:2px solid #E63900;color:#E63900;font-weight:900;font-size:14px;padding:6px 12px 4px;border-radius:8px;letter-spacing:1px;margin-bottom:2px;display:inline-block;line-height:1;">TEXMO</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;align-items:center;">' +
    '<div style="background:#E63900;color:#fff;padding:6px 14px 4px;border-radius:8px;font-weight:900;font-size:14px;letter-spacing:0.5px;margin-bottom:4px;display:inline-block;line-height:1;">AQUA GROUP</div>' +
    '<span style="color:#E63900;font-size:12px;font-style:italic;line-height:1;">Pumps you can rely on</span>' +
    '</div>' +
    '</div>' +
    stampHtml +
    '</div>' +
    '<div style="background:#E8A000;height:6px;flex-shrink:0"></div>' +
    '</div></body></html>';
}

