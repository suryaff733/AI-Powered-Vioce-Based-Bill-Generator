import React, { useState, useRef } from "react";
import { getAutoHsn } from "@/lib/poParser";

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAutofill: (data: any) => void;
}

export default function DocumentUploadModal({
  isOpen,
  onClose,
  onAutofill,
}: DocumentUploadModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedPreview, setExtractedPreview] = useState<any | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    setSelectedFile(file);
    setExtractedPreview(null);
    setStatusMessage("");
    setOcrProgress(0);

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleProcessDocument = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setStatusMessage("Scanning document, performing OCR, and extracting billing fields...");
    setOcrProgress(30);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      setOcrProgress(60);
      const res = await fetch("/api/parse-document", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      setOcrProgress(90);

      if (json && json.success && json.data) {
        if (json.renderedScreenshotDataUrl && !previewUrl) {
          setPreviewUrl(json.renderedScreenshotDataUrl);
        }
        setOcrProgress(100);
        const enrichedData = {
          ...json.data,
          rows: (json.data.rows || []).map((r: any) => ({
            ...r,
            h: r.h && r.h.trim() !== "" ? r.h : getAutoHsn(r.p),
          })),
        };
        setExtractedPreview(enrichedData);
        setStatusMessage("Document parsed successfully! Review the extracted fields below.");
      } else {
        setStatusMessage(json.error || "Failed to extract invoice fields from this document.");
      }
    } catch (err: any) {
      console.error("Document parsing error:", err);
      setStatusMessage("Error processing document: " + (err.message || "Unknown error"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateField = (field: string, val: any) => {
    setExtractedPreview((prev: any) => ({
      ...prev,
      [field]: val,
    }));
  };

  const handleUpdateRow = (index: number, field: string, val: any) => {
    setExtractedPreview((prev: any) => {
      const newRows = [...(prev.rows || [])];
      newRows[index] = { ...newRows[index], [field]: val };
      // Auto-generate HSN/SAC when Particulars description is typed
      if (field === "p" && typeof val === "string" && val.trim().length > 1) {
        if (!newRows[index].h || newRows[index].h.trim() === "" || (newRows[index] as any)._autoHsn) {
          newRows[index].h = getAutoHsn(val);
          (newRows[index] as any)._autoHsn = true;
        }
      } else if (field === "h") {
        (newRows[index] as any)._autoHsn = false;
      }

      if (field === "q" || field === "r") {
        const qNum = parseFloat(String(newRows[index].q || "0").replace(/,/g, "")) || 0;
        const rNum = parseFloat(String(newRows[index].r || "0").replace(/,/g, "")) || 0;
        newRows[index].a = Math.round(qNum * rNum * 100) / 100;
      }
      return { ...prev, rows: newRows };
    });
  };

  const handleAddRow = () => {
    setExtractedPreview((prev: any) => ({
      ...prev,
      rows: [...(prev.rows || []), { p: "", h: "", q: "1", r: "0", a: 0 }],
    }));
  };

  const handleRemoveRow = (index: number) => {
    setExtractedPreview((prev: any) => ({
      ...prev,
      rows: prev.rows.filter((_: any, i: number) => i !== index),
    }));
  };

  const handleConfirmApply = () => {
    if (extractedPreview) {
      onAutofill(extractedPreview);
      onClose();
    }
  };

  const taxableTotal = (extractedPreview?.rows || []).reduce((sum: number, r: any) => {
    const qNum = parseFloat(String(r.q || "0").replace(/,/g, "")) || 0;
    const rNum = parseFloat(String(r.r || "0").replace(/,/g, "")) || 0;
    const a = typeof r.a === "number" && !isNaN(r.a) && r.a > 0 ? r.a : Math.round(qNum * rNum * 100) / 100;
    return sum + (a || 0);
  }, 0);
  const isGst = extractedPreview?.applyGst !== false;
  const gstAmount = isGst ? Math.round(taxableTotal * 0.18 * 100) / 100 : 0;
  const grandTotal = taxableTotal + gstAmount;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)",
          border: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(to right, #f8fafc, #ffffff)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                backgroundColor: "#eff6ff",
                color: "#1d4ed8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                Auto-Fill from PO or Invoice (Image / PDF)
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Scans PO number, Bill to, Place of Supply & Installation, line items, HSN/SAC codes & pricing.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#94a3b8",
              padding: "4px",
              borderRadius: "4px",
            }}
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {/* Dropzone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? "#2563eb" : "#cbd5e1"}`,
              backgroundColor: dragActive ? "#f0f7ff" : "#f8fafc",
              borderRadius: "10px",
              padding: "24px",
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp,image/jpg"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />
            <div
              style={{
                width: "44px",
                height: "44px",
                margin: "0 auto 10px",
                borderRadius: "50%",
                backgroundColor: "#e0e7ff",
                color: "#4338ca",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>
              {selectedFile ? selectedFile.name : "Click to select or drag & drop PO / Invoice"}
            </div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>
              Supports PDF documents, Scanned Copies, PNG, JPG, WEBP
            </div>
            {selectedFile && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "11px",
                  color: "#059669",
                  fontWeight: 600,
                  display: "inline-block",
                  backgroundColor: "#d1fae5",
                  padding: "3px 8px",
                  borderRadius: "12px",
                }}
              >
                ✓ {(selectedFile.size / 1024).toFixed(1)} KB selected
              </div>
            )}
          </div>

          {/* Image Thumbnail Preview if applicable */}
          {previewUrl && (
            <div
              style={{
                marginTop: "14px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                maxHeight: "140px",
                overflow: "hidden",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
                backgroundColor: "#f1f5f9",
              }}
            >
              <img
                src={previewUrl}
                alt="Document Preview"
                style={{ maxHeight: "140px", objectFit: "contain" }}
              />
            </div>
          )}

          {/* Action Trigger Button */}
          {selectedFile && !extractedPreview && (
            <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleProcessDocument}
                disabled={isProcessing}
                style={{
                  padding: "9px 18px",
                  backgroundColor: isProcessing ? "#94a3b8" : "#003399",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: isProcessing ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 2px 4px rgba(0, 51, 153, 0.2)",
                }}
              >
                {isProcessing && (
                  <span
                    style={{
                      width: "14px",
                      height: "14px",
                      border: "2px solid #ffffff",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                      display: "inline-block",
                    }}
                  />
                )}
                <span>{isProcessing ? "Scanning Document Fields..." : "Auto-Fill Fields"}</span>
              </button>
            </div>
          )}

          {/* Progress / Status Bar */}
          {statusMessage && (
            <div
              style={{
                marginTop: "14px",
                padding: "10px 14px",
                borderRadius: "6px",
                fontSize: "12px",
                backgroundColor: extractedPreview ? "#f0fdf4" : isProcessing ? "#eff6ff" : "#fff1f2",
                color: extractedPreview ? "#15803d" : isProcessing ? "#1d4ed8" : "#be123c",
                border: `1px solid ${extractedPreview ? "#bbf7d0" : isProcessing ? "#bfdbfe" : "#fecdd3"
                  }`,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span>{extractedPreview ? "✓" : isProcessing ? "⏳" : "ℹ️"}</span>
                <span style={{ fontWeight: 500 }}>{statusMessage}</span>
              </div>
              {isProcessing && ocrProgress > 0 && (
                <div
                  style={{
                    width: "100%",
                    height: "4px",
                    backgroundColor: "#dbeafe",
                    borderRadius: "2px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${ocrProgress}%`,
                      height: "100%",
                      backgroundColor: "#2563eb",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Extracted Preview & Edit Fields */}
          {extractedPreview && (
            <div
              style={{
                marginTop: "16px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "16px",
                backgroundColor: "#f8fafc",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                  borderBottom: "1px solid #e2e8f0",
                  paddingBottom: "8px",
                  flexWrap: "wrap",
                  gap: "6px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: "#0f172a",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <span>📋</span>
                  <span>Extracted Document Information</span>
                  {extractedPreview.cname && (
                    <span
                      style={{
                        backgroundColor: "#ecfdf5",
                        color: "#065f46",
                        border: "1px solid #a7f3d0",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "none",
                      }}
                    >
                      🏢 {extractedPreview.cname.length > 28 ? extractedPreview.cname.slice(0, 28) + "..." : extractedPreview.cname} Verified
                    </span>
                  )}
                  {extractedPreview.stateName && (
                    <span
                      style={{
                        backgroundColor: "#eff6ff",
                        color: "#1e40af",
                        border: "1px solid #bfdbfe",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "none",
                      }}
                    >
                      📍 {extractedPreview.stateName} {extractedPreview.interstate ? "(IGST)" : "(CGST+SGST)"}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: "11px", color: "#64748b" }}>
                  Verify and adjust any field before applying to invoice
                </span>
              </div>

              {/* Live Totals & Extraction Summary Banner */}
              {extractedPreview.rows && extractedPreview.rows.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginBottom: "14px",
                    padding: "10px 14px",
                    backgroundColor: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "6px",
                    fontSize: "12px",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", color: "#166534" }}>
                    <span><strong>Line Items:</strong> {extractedPreview.rows.length}</span>
                    <span><strong>Subtotal:</strong> ₹{taxableTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    <span><strong>GST (18%):</strong> ₹{gstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    <span><strong>Total:</strong> <strong style={{ color: "#003399", fontSize: "13px" }}>₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></span>
                  </div>
                  <span style={{ fontSize: "11px", color: "#15803d", fontWeight: 700 }}>
                    ✓ Cleanly Scraped & Formatted
                  </span>
                </div>
              )}

              {/* Form Grid for Main Fields */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  fontSize: "12px",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <label style={{ display: "block", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                    P.O. Number
                  </label>
                  <input
                    type="text"
                    value={extractedPreview.po || ""}
                    onChange={(e) => handleUpdateField("po", e.target.value)}
                    placeholder="e.g. 4800193765"
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#003399",
                      backgroundColor: "#ffffff",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                    Bill / Invoice No
                  </label>
                  <input
                    type="text"
                    value={extractedPreview.no || ""}
                    onChange={(e) => handleUpdateField("no", e.target.value)}
                    placeholder="Auto-next"
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      backgroundColor: "#ffffff",
                    }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                    Customer / Buyer Name
                  </label>
                  <input
                    type="text"
                    value={extractedPreview.cname || ""}
                    onChange={(e) => handleUpdateField("cname", e.target.value)}
                    placeholder="e.g. Avenue Supermarts Ltd."
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                      fontWeight: 600,
                      backgroundColor: "#ffffff",
                    }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                    Bill To, Place of Supply & Installation Address
                  </label>
                  <textarea
                    rows={2}
                    value={extractedPreview.caddr || ""}
                    onChange={(e) => handleUpdateField("caddr", e.target.value)}
                    placeholder="Store address, place of supply and installation"
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                      backgroundColor: "#ffffff",
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                    Customer GSTIN
                  </label>
                  <input
                    type="text"
                    value={extractedPreview.cgstin || "36AACCA8432H1ZR"}
                    onChange={(e) => handleUpdateField("cgstin", e.target.value)}
                    placeholder="36AACCA8432H1ZR"
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b21a8",
                      backgroundColor: "#ffffff",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={extractedPreview.date || ""}
                    onChange={(e) => handleUpdateField("date", e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                      backgroundColor: "#ffffff",
                    }}
                  />
                </div>
              </div>

              {/* Line items review table */}
              <div style={{ marginTop: "14px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "6px",
                  }}
                >
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                    Line Items, HSN & Pricing ({extractedPreview.rows ? extractedPreview.rows.length : 0}):
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    style={{
                      padding: "3px 8px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#003399",
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    + Add Item Row
                  </button>
                </div>

                <div
                  style={{
                    maxHeight: "180px",
                    overflowY: "auto",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9", textAlign: "left", color: "#475569" }}>
                        <th style={{ padding: "6px 8px", minWidth: "160px" }}>Item Description</th>
                        <th style={{ padding: "6px 6px", width: "80px" }}>HSN/SAC</th>
                        <th style={{ padding: "6px 6px", width: "50px" }}>Qty</th>
                        <th style={{ padding: "6px 6px", width: "80px" }}>Rate (₹)</th>
                        <th style={{ padding: "6px 8px", width: "85px", textAlign: "right" }}>Amount</th>
                        <th style={{ padding: "6px 4px", width: "30px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractedPreview.rows && extractedPreview.rows.length > 0 ? (
                        extractedPreview.rows.map((row: any, idx: number) => (
                          <tr key={idx} style={{ borderTop: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "4px 8px" }}>
                              <input
                                type="text"
                                value={row.p || ""}
                                onChange={(e) => handleUpdateRow(idx, "p", e.target.value)}
                                placeholder="Particulars"
                                style={{ width: "100%", padding: "3px 6px", fontSize: "11px", border: "1px solid #e2e8f0", borderRadius: "3px" }}
                              />
                            </td>
                            <td style={{ padding: "4px 6px" }}>
                              <input
                                type="text"
                                value={row.h || ""}
                                onChange={(e) => handleUpdateRow(idx, "h", e.target.value)}
                                placeholder="HSN"
                                style={{ width: "100%", padding: "3px 6px", fontSize: "11px", border: "1px solid #e2e8f0", borderRadius: "3px" }}
                              />
                            </td>
                            <td style={{ padding: "4px 6px" }}>
                              <input
                                type="text"
                                value={row.q || ""}
                                onChange={(e) => handleUpdateRow(idx, "q", e.target.value)}
                                placeholder="1"
                                style={{ width: "100%", padding: "3px 6px", fontSize: "11px", border: "1px solid #e2e8f0", borderRadius: "3px" }}
                              />
                            </td>
                            <td style={{ padding: "4px 6px" }}>
                              <input
                                type="text"
                                value={row.r || ""}
                                onChange={(e) => handleUpdateRow(idx, "r", e.target.value)}
                                placeholder="0"
                                style={{ width: "100%", padding: "3px 6px", fontSize: "11px", border: "1px solid #e2e8f0", borderRadius: "3px" }}
                              />
                            </td>
                            <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                              ₹{Number(row.a || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: "4px 4px", textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(idx)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#ef4444",
                                  cursor: "pointer",
                                  fontWeight: 700,
                                }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} style={{ padding: "12px", textAlign: "center", color: "#94a3b8" }}>
                            No line items found. Click "+ Add Item Row" above to enter item details manually.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modal Buttons */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "16px",
                  paddingTop: "12px",
                  borderTop: "1px solid #e2e8f0",
                }}
              >
                <button
                  type="button"
                  onClick={() => setExtractedPreview(null)}
                  style={{
                    padding: "7px 14px",
                    backgroundColor: "#f1f5f9",
                    color: "#475569",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Upload Another File
                </button>
                <button
                  type="button"
                  onClick={handleConfirmApply}
                  style={{
                    padding: "9px 20px",
                    backgroundColor: "#059669",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(5, 150, 105, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>✓</span>
                  <span>Apply & Auto-Fill Invoice {taxableTotal > 0 ? `(₹${grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })})` : ""}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
