export function fmtR(n: number) {
  return (Math.round(n * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtD(n: number) {
  return 'Rs. ' + fmtR(n);
}

export function esc(s: string) {
  return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function invHTML_simple(d: any) {
  var title = d.type === 'quotation' ? 'QUOTATION' : 'CASH MEMO / BILL';
  var dateStr = (d.date || '').split('-').reverse().join('/');

  var itemRows = (d.rows || []).map(function (it: any, i: number) {
    var q = parseFloat(it.q) || 0, r = parseFloat(it.r) || 0, a = parseFloat(it.a) || 0;
    var rowAmt = (q > 0 && r > 0) ? q * r : a;
    if (!it.p && !it.h && !it.q && !it.r && rowAmt === 0) return '';
    return '<tr style="vertical-align: top;"><td style="text-align:center;padding:10px 8px;border-right:1px solid #003399;font-size:15px;">' + (i + 1) + '</td>' +
      '<td style="padding:10px 8px;border-right:1px solid #003399;text-align:left;font-size:15px;">' + esc(it.p || '') + '</td>' +
      '<td style="text-align:center;padding:10px 8px;border-right:1px solid #003399;font-size:14px;">' + esc(it.h || '') + '</td>' +
      '<td style="text-align:center;padding:10px 8px;border-right:1px solid #003399;font-size:14px;">' + (it.q || '') + '</td>' +
      '<td style="text-align:right;padding:10px 8px;border-right:1px solid #003399;font-size:14px;">' + (r ? fmtR(r) : '') + '</td>' +
      '<td style="text-align:right;padding:10px 8px;font-size:15px;">' + (rowAmt ? fmtR(rowAmt) + '/-' : '') + '</td></tr>';
  }).join('');

  var totals = '<tr style="font-weight: 700; color: #CC0000; font-size: 14px;">' +
    '<td style="border-right: 1px solid #003399;"></td>' +
    '<td style="border-right: 1px solid #003399;"></td>' +
    '<td colspan="3" style="border-top: 1px solid #003399; border-right: 1px solid #003399; padding: 8px 10px; text-align: left;">TOTAL</td>' +
    '<td style="border-top: 1px solid #003399; padding: 8px 10px; text-align: right; color: #000; font-size: 16px;">' + fmtR(d.sub) + '/-</td></tr>';

  if (d.applyGst) {
    totals += '<tr style="font-weight: 700; color: #CC0000; font-size: 14px;">' +
      '<td style="border-right: 1px solid #003399;"></td>' +
      '<td style="border-right: 1px solid #003399;"></td>' +
      '<td colspan="3" style="border-top: 1px solid #003399; border-right: 1px solid #003399; padding: 8px 10px; text-align: left;">CGST @ 9%</td>' +
      '<td style="border-top: 1px solid #003399; padding: 8px 10px; text-align: right; color: #000; font-size: 16px;">' + fmtR(d.cgst) + '/-</td></tr>';
    totals += '<tr style="font-weight: 700; color: #CC0000; font-size: 14px;">' +
      '<td style="border-right: 1px solid #003399;"></td>' +
      '<td style="border-right: 1px solid #003399;"></td>' +
      '<td colspan="3" style="border-top: 1px solid #003399; border-right: 1px solid #003399; padding: 8px 10px; text-align: left;">SGST @ 9%</td>' +
      '<td style="border-top: 1px solid #003399; padding: 8px 10px; text-align: right; color: #000; font-size: 16px;">' + fmtR(d.sgst) + '/-</td></tr>';
  }

  totals += '<tr style="font-weight: 700; color: #CC0000; font-size: 14px;">' +
    '<td style="border-right: 1px solid #003399;"></td>' +
    '<td style="border-right: 1px solid #003399;"></td>' +
    '<td colspan="3" style="border-top: 1px solid #003399; border-right: 1px solid #003399; padding: 8px 10px; text-align: left;">GRAND TOTAL</td>' +
    '<td style="border-top: 1px solid #003399; padding: 8px 10px; text-align: right; color: #000; font-size: 18px;">' + fmtR(d.grand) + '/-</td></tr>';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif}' +
    '.inv{border:none;font-size:14px;color:#000;width:794px;height:1123px;box-sizing:border-box;margin:0 auto;display:flex;flex-direction:column;background:#fff;position:relative;padding:12px 16px;box-shadow:0 8px 24px rgba(0,0,0,0.1)}' +
    'table{border-collapse:collapse}' +
    '</style></head><body>' +
    '<div class="inv">' +

    '<div style="border: 2px solid #003399; padding: 12px; display: flex; flex-direction: column; flex: 1; border-radius: 4px;">' +

    '<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#003399;align-items:flex-start;">' +
    '<div>Prop. S. Venkateshwara Rao<br>GSTIN : 36BXYPS4294L1Z7</div>' +
    '<div style="font-size:18px;text-decoration:underline;">' + title + '</div>' +
    '<div style="text-align:right;">Cell : 9848693461<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: 8074312463</div>' +
    '</div>' +

    '<div style="text-align:center;margin-top:16px;">' +
    '<div style="color:#FF3300;font-size:32px;font-weight:900;font-family:\'Arial Black\',Impact,sans-serif;letter-spacing:0.5px;">SRI VENKATA SURYA ELECTRICAL</div>' +
    '<div style="color:#003399;font-size:26px;font-weight:900;font-family:\'Arial Black\',Impact,sans-serif;margin-top:2px;">&amp; MOTOR MECHANICAL WORKS</div>' +
    '<div style="color:#FF3300;font-size:14px;font-weight:700;margin-top:10px;">ALL KINDS OF ELECTRICAL MOTORS &amp; SUBMERSIBLE MOTORS REWINDING Etc.,</div>' +
    '<div style="color:#003399;font-size:14px;margin-top:6px;">Plot No. : 21, Nirmala Nagar Colony, Karmanghat, Hyderabad - 500 079. (T.G.)</div>' +
    '</div>' +

    '<div style="border-top:1px solid #003399;margin:16px 0;"></div>' +

    '<div style="display:flex;justify-content:space-between;font-size:18px;margin-bottom:16px;padding:0 8px;">' +
    '<div style="color:#CC0000;font-weight:700;">No. <span style="font-size:24px;margin-left:8px;">' + esc(d.no) + '</span></div>' +
    '<div style="color:#003399;font-weight:700;">Date : <span style="color:#000;border-bottom:1px dashed #003399;padding-bottom:2px;margin-left:4px;min-width:140px;display:inline-block;text-align:center;">' + esc(dateStr) + '</span></div>' +
    '</div>' +

    '<div style="font-size:18px;color:#003399;margin-bottom:8px;padding:0 8px;display:flex;align-items:flex-end;">' +
    '<span style="white-space:nowrap;margin-right:12px;">M/s.</span>' +
    '<div style="border-bottom:1px solid #003399;flex:1;color:#000;font-family:\'Courier New\',Courier,monospace;font-size:20px;padding-bottom:2px;padding-left:8px;">' + esc(d.cname) + '</div>' +
    '</div>' +
    '<div style="font-size:18px;color:#003399;margin-bottom:20px;padding:0 8px;display:flex;align-items:flex-end;">' +
    '<div style="border-bottom:1px solid #003399;width:100%;height:24px;color:#000;font-family:\'Courier New\',Courier,monospace;font-size:20px;padding-bottom:2px;padding-left:8px;">' + esc(d.caddr || '') + '</div>' +
    '</div>' +

    '<div style="border-top:1px solid #003399;"></div>' +

    '<div style="flex:1;display:flex;flex-direction:column;position:relative;margin-top:-1px;border-bottom:1px solid #003399;">' +
    '<div style="position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;overflow:hidden;display:flex;align-items:center;justify-content:center;opacity:0.06;">' +
    '<div style="transform:rotate(-35deg);font-size:48px;font-weight:900;color:#003399;text-align:center;line-height:1.4;">SRI VENKATA SURYA ELECTRICAL<br>&amp; MOTOR MECHANICAL WORKS</div>' +
    '</div>' +

    '<table style="width:100%;height:100%;border-collapse:collapse;position:relative;z-index:1;">' +
    '<thead>' +
    '<tr style="color:#003399;font-weight:700;font-size:14px;background:#fff;">' +
    '<th style="border-right:1px solid #003399;border-bottom:1px solid #003399;padding:10px 6px;width:40px;">Sl.<br>No.</th>' +
    '<th style="border-right:1px solid #003399;border-bottom:1px solid #003399;padding:10px 6px;">PARTICULARS</th>' +
    '<th style="border-right:1px solid #003399;border-bottom:1px solid #003399;padding:10px 6px;width:60px;">HSN<br>Code</th>' +
    '<th style="border-right:1px solid #003399;border-bottom:1px solid #003399;padding:10px 6px;width:50px;">Qty.</th>' +
    '<th style="border-right:1px solid #003399;border-bottom:1px solid #003399;padding:10px 6px;width:80px;">Rate</th>' +
    '<th style="border-bottom:1px solid #003399;padding:10px 6px;width:120px;">AMOUNT<br>Rs.</th>' +
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

    '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px;">' +
    '<div style="display:flex;gap:12px;align-items:center;">' +
    '<div style="display:flex;flex-direction:column;align-items:center;">' +
    '<div style="width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-bottom:20px solid #E63900;margin-bottom:2px;"></div>' +
    '<span style="color:#E63900;font-weight:900;font-size:12px;">AQUATEX</span>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;align-items:center;">' +
    '<div style="border:2px solid #E63900;color:#E63900;font-weight:900;font-size:12px;padding:2px 8px;border-radius:50%/100%;letter-spacing:1px;transform:scaleX(1.2);">TEXMO</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;align-items:center;line-height:1.2;margin-left:12px;">' +
    '<span style="background:#E63900;color:#fff;padding:2px 14px;border-radius:12px;font-weight:900;font-size:12px;">AQUA GROUP</span>' +
    '<span style="color:#E63900;font-size:10px;font-style:italic;margin-top:2px;">Pumps you can rely on</span>' +
    '</div>' +
    '</div>' +
    '<div style="color:#E63900;font-size:14px;font-weight:700;margin-bottom:8px;text-align:right;">For SRI VENKATA SURYA ELECTRICAL<br>&amp; MOTOR MECHANICAL WORKS</div>' +
    '</div>' +

    '</div>' +
    '</div></body></html>';
}

export function invHTML(d: any) {
  if (d.type === 'quotation' || d.type === 'cash') {
    return invHTML_simple(d);
  }
  var typeLabel = d.type === 'gst' ? 'TAX INVOICE' : d.type === 'quotation' ? 'QUOTATION' : 'CASH MEMO / BILL';
  var typeColor = d.type === 'gst' ? '#003399' : d.type === 'quotation' ? '#CC6600' : '#006600';
  var totHtml = '<div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #eee;font-size:11px"><span style="color:#003399;font-weight:700">TOTAL</span><span>' + fmtR(d.sub) + '</span></div>';
  if (d.applyGst) {
    totHtml += '<div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #eee;font-size:11px"><span style="color:#CC0000;font-weight:700">CGST @ 9 %</span><span>' + fmtR(d.cgst) + '</span></div>';
    totHtml += '<div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #eee;font-size:11px"><span style="color:#CC0000;font-weight:700">SGST @ 9 %</span><span>' + fmtR(d.sgst) + '</span></div>';
  }
  totHtml += '<div style="display:flex;justify-content:space-between;padding:8px 10px;font-size:13px;font-weight:700;color:#003399;background:#f0f4ff"><span>GRAND TOTAL</span><span>' + fmtR(d.grand) + '</span></div>';

  var itemRows = (d.rows || []).map(function (it: any, i: number) {
    var q = parseFloat(it.q) || 0, r = parseFloat(it.r) || 0, a = parseFloat(it.a) || 0;
    var rowAmt = (q > 0 && r > 0) ? q * r : a;
    return '<tr style="vertical-align:top"><td style="text-align:center;padding:6px 8px;border-right:1px solid #003399;border-bottom:1px solid #eee">' + (i + 1) + '</td>' +
      '<td style="padding:6px 8px;border-right:1px solid #003399;border-bottom:1px solid #eee">' + esc(it.p || '') + '</td>' +
      '<td style="text-align:center;padding:6px 8px;border-right:1px solid #003399;border-bottom:1px solid #eee">' + esc(it.h || '') + '</td>' +
      '<td style="text-align:center;padding:6px 8px;border-right:1px solid #003399;border-bottom:1px solid #eee">' + (it.q || '') + '</td>' +
      '<td style="text-align:right;padding:6px 8px;border-right:1px solid #003399;border-bottom:1px solid #eee">' + (r ? fmtR(r) : '') + '</td>' +
      '<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #eee">' + fmtR(rowAmt) + '</td></tr>';
  }).join('');

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif}' +
    '.inv{border:1px solid #003399;font-size:11px;color:#000;width:794px;height:1123px;box-sizing:border-box;margin:0 auto;display:flex;flex-direction:column;background:#fff}' +
    'table{border-collapse:collapse}' +
    '</style></head><body>' +
    '<div class="inv">' +
    '<div style="background:#E8A000;height:8px;flex-shrink:0"></div>' +
    '<div style="padding:8px 12px 6px;font-size:10px;flex-shrink:0">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
    '<div><strong>GSTIN : 36BXYPS4294L1Z7</strong><br>Vender Code : 407135</div>' +
    '<div style="font-weight:700;color:' + typeColor + ';font-size:16px">' + typeLabel + '</div>' +
    '<div style="text-align:right">Cell : 9848693461<br>: 8074312463</div>' +
    '</div>' +
    '</div>' +
    '<div style="text-align:center;padding:6px 10px 8px;flex-shrink:0">' +
    '<div style="font-size:20px;font-weight:700;color:#CC0000;line-height:1.2">SRI VENKATA SURYA ELECTRICAL &amp; MECHANICAL WORKS</div>' +
    '<div style="font-size:11px;font-weight:700;color:#003399;margin-top:4px">SALES &amp; SERVICE : ALL KINDS OF MOTOR REWINDING WORKS ARE AVAILABLE</div>' +
    '<div style="font-size:10px;margin-top:2px">Plot No. : 21, Nirmala Nagar Colony, Karmanghat, Hyderabad - 500 079. (T.G.)</div>' +
    '</div>' +
    '<div style="border-top:1px solid #003399;flex-shrink:0"></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #003399;flex-shrink:0">' +
    '<div style="padding:6px 10px">' +
    '<div style="display:flex;gap:4px;font-size:11px;margin-bottom:4px"><span style="min-width:85px">Invoice No. :</span><span style="font-weight:700;color:#CC0000">' + esc(d.no) + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:11px"><span style="min-width:85px">Invoice Date :</span><span style="font-weight:700;color:#003399">' + esc(d.date) + '</span></div>' +
    '</div>' +
    '<div style="padding:6px 10px;border-left:1px solid #003399">' +
    '<div style="display:flex;gap:4px;font-size:11px;margin-bottom:4px"><span style="min-width:95px">Transport Mode :</span><span>' + esc(d.transport || '') + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:11px;margin-bottom:4px"><span style="min-width:95px">Vehicle Number :</span><span></span></div>' +
    '<div style="display:flex;gap:4px;font-size:11px"><span style="min-width:95px">P.O. Number :</span><span>' + esc(d.po || '') + '</span></div>' +
    '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #003399;flex-shrink:0">' +
    '<div style="padding:6px 10px;border-right:1px solid #003399">' +
    '<div style="font-size:10px;font-weight:700;color:#003399;text-align:center;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #ccc">BILL TO PARTY</div>' +
    '<div style="display:flex;gap:4px;font-size:11px;margin-bottom:3px"><span style="min-width:60px">Name :</span><span style="font-weight:700">' + esc(d.cname || '') + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:11px;margin-bottom:3px"><span style="min-width:60px">Address :</span><span>' + esc(d.caddr || '') + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:11px"><span style="min-width:60px">GSTIN :</span><span style="color:#6600cc">' + esc(d.cgstin || '') + '</span></div>' +
    '</div>' +
    '<div style="padding:6px 10px">' +
    '<div style="font-size:10px;font-weight:700;color:#003399;text-align:center;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #ccc">SHIP TO PARTY</div>' +
    '<div style="display:flex;gap:4px;font-size:11px;margin-bottom:3px"><span style="min-width:60px">Name :</span><span style="font-weight:700">' + esc(d.sname || '') + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:11px;margin-bottom:3px"><span style="min-width:60px">Address :</span><span>' + esc(d.saddr || '') + '</span></div>' +
    '<div style="display:flex;gap:4px;font-size:11px"><span style="min-width:60px">GSTIN :</span><span style="color:#6600cc">' + esc(d.sgstin || '') + '</span></div>' +
    '</div>' +
    '</div>' +
    '<div style="flex:1;background:#fff;display:flex;flex-direction:column;">' +
    '<table style="width:100%;height:100%;font-size:11px"><thead><tr>' +
    '<th style="width:35px;background:#f0f4ff;color:#003399;font-weight:700;padding:8px;border-right:1px solid #003399;border-bottom:1px solid #003399;text-align:center">Sl.</th>' +
    '<th style="background:#f0f4ff;color:#003399;font-weight:700;padding:8px;border-right:1px solid #003399;border-bottom:1px solid #003399;text-align:left">PARTICULARS</th>' +
    '<th style="width:75px;background:#f0f4ff;color:#003399;font-weight:700;padding:8px;border-right:1px solid #003399;border-bottom:1px solid #003399;text-align:center">HSN/SAC</th>' +
    '<th style="width:55px;background:#f0f4ff;color:#003399;font-weight:700;padding:8px;border-right:1px solid #003399;border-bottom:1px solid #003399;text-align:center">Qty</th>' +
    '<th style="width:85px;background:#f0f4ff;color:#003399;font-weight:700;padding:8px;border-right:1px solid #003399;border-bottom:1px solid #003399;text-align:right">Rate</th>' +
    '<th style="width:100px;background:#f0f4ff;color:#003399;font-weight:700;padding:8px;border-bottom:1px solid #003399;text-align:right">AMOUNT</th>' +
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
    '<div style="padding:10px 12px;font-size:10px;flex:1">' +
    '<div style="color:#CC0000;font-weight:700;margin-bottom:3px">Our Bank Details :</div>' +
    '<div style="color:#003399;font-weight:700;font-size:11px">AXIS BANK, BN Reddy Branch</div>' +
    '<div style="margin-top:2px">A/c. No. : 917020076235758, IFSC Code : UTIB0003061</div>' +
    '<div style="margin-top:8px;font-weight:700">Rupees :</div>' +
    '<div style="margin-top:16px;font-size:9px;color:#555;line-height:1.4"><strong>Terms &amp; Conditions</strong><br>1. Goods once cleared cannot be returned.<br>2. Not responsible for breakage after despatch.<br>3. Subject to R.R. Dist. Jurisdiction</div>' +
    '</div>' +
    '<div style="width:46%;border-left:1px solid #003399">' + totHtml + '</div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-end;padding:10px 12px;border-top:1px solid #003399;font-size:10px;flex-shrink:0">' +
    '<div style="display:flex;gap:12px;align-items:center">' +
    '<span style="color:#CC0000;font-weight:700;font-size:13px">AQUATEX</span>' +
    '<span style="color:#003399;font-weight:700;font-size:13px">TEXMO</span>' +
    '<span style="color:#006600;font-weight:700;font-size:13px">AQUA GROUP</span>' +
    '</div>' +
    '<div style="text-align:right">' +
    '<div style="color:#CC0000;font-size:9.5px;margin-bottom:12px">For SRI VENKATA SURYA ELECTRICAL &amp; MECHANICAL WORKS</div>' +
    '<div style="border-top:1px solid #003399;padding-top:4px">Receiver\'s Signature &nbsp;&nbsp;&nbsp;&nbsp; Authorised Signatory</div>' +
    '</div>' +
    '</div>' +
    '<div style="background:#E8A000;height:6px;flex-shrink:0"></div>' +
    '</div></body></html>';
}
