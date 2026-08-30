"use client";

import { useState, useEffect, useCallback } from "react";
import {
  QrCode,
  Camera,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Truck,
  Package,
  Plus,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
  Barcode,
  Search,
} from "lucide-react";

function generateMaterialQrCodeClient(params: {
  projectId: number;
  itemCode: string;
  batchNo: string;
  tagType?: string;
  quantity?: number;
}): string {
  const { projectId, itemCode, batchNo, tagType = "material_unit", quantity = 1 } = params;
  const rawBody = `XB-MAT|v1|P${projectId}|${itemCode}|B${batchNo}|T${tagType}|Q${quantity}`;
  return `${rawBody}|CHK00000000`;
}

function parseMaterialQrCodeClient(qrString: string) {
  if (!qrString || !qrString.startsWith("XB-MAT|")) return null;
  const parts = qrString.split("|");
  if (parts.length < 7) return null;
  return {
    version: parts[1],
    projectId: Number(parts[2].replace(/^P/, "")),
    itemCode: parts[3],
    batchNo: parts[4].replace(/^B/, ""),
    tagType: parts[5].replace(/^T/, ""),
    quantity: Number(parts[6].replace(/^Q/, "")),
  };
}

interface Shipment {
  id: string;
  shipmentCode: string;
  doNumber: string;
  poNumber: string;
  supplierName: string;
  status: string;
  totalItemsCount: number;
  receivedItemsCount: number;
  manifestPayload: any[];
}

export default function QrLogisticsTab() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Generator State
  const [genForm, setGenForm] = useState({
    itemCode: "VALVE-DN100-PN16",
    batchNo: "LOT-2026-08",
    tagType: "material_unit" as const,
    quantity: 10,
  });
  const [generatedQr, setGeneratedQr] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Scanner State
  const [scanInput, setScanInput] = useState<string>("");
  const [scannedLogs, setScannedLogs] = useState<
    Array<{ qrCode: string; time: string; itemCode: string; qty: number }>
  >([]);
  const [scanning, setScanning] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<any>(null);

  const fetchShipments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/engineering/logistics/shipments");
      if (res.ok) {
        const d = await res.json();
        setShipments(d.data || []);
        if (d.data?.length > 0 && !selectedShipmentId) {
          setSelectedShipmentId(d.data[0].id);
        }
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [selectedShipmentId]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  const handleGenerate = () => {
    const code = generateMaterialQrCodeClient({
      projectId: 1,
      itemCode: genForm.itemCode,
      batchNo: genForm.batchNo,
      tagType: genForm.tagType,
      quantity: genForm.quantity,
    });
    setGeneratedQr(code);
    setScanInput(code);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedQr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;

    setScanning(true);
    try {
      const selected = shipments.find((s) => s.id === selectedShipmentId);
      const res = await fetch("/api/engineering/logistics/scan-receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrCode: scanInput.trim(),
          manifest: selected?.manifestPayload || [],
          locationNote: "Kho Hiện Trường Tầng 1",
        }),
      });

      if (res.ok) {
        const d = await res.json();
        const parsed = parseMaterialQrCodeClient(scanInput.trim());
        setScannedLogs((prev) => [
          {
            qrCode: scanInput.trim(),
            time: new Date().toLocaleTimeString("vi-VN"),
            itemCode: parsed?.itemCode || "VẬT TƯ",
            qty: parsed?.quantity || 1,
          },
          ...prev,
        ]);
        if (d.data?.reconciliation) {
          setReconcileResult(d.data.reconciliation);
        }
      }
    } catch {
      // Ignore
    } finally {
      setScanning(false);
    }
  };

  const handleCreateSampleShipment = async () => {
    const manifest = [
      {
        itemCode: "VALVE-DN100-PN16",
        itemName: "Van Cổng DN100 PN16",
        orderedQty: 20,
        deliveredQty: 20,
        unit: "cái",
      },
      {
        itemCode: "DUCT-SPOOL-08A",
        itemName: "Phân Đoạn Ống Gió 600x400",
        orderedQty: 15,
        deliveredQty: 15,
        unit: "spool",
      },
      {
        itemCode: "SPRINKLER-K80",
        itemName: "Đầu Phun Sprinkler K=80",
        orderedQty: 100,
        deliveredQty: 100,
        unit: "bộ",
      },
    ];

    try {
      const res = await fetch("/api/engineering/logistics/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentCode: "SHP-2026-08-01",
          doNumber: "DO-HG-8842",
          poNumber: "PO-MEP-0125",
          supplierName: "Công ty Thiết Bị Cơ Điện Hoàng Gia",
          manifest,
        }),
      });
      if (res.ok) {
        await fetchShipments();
      }
    } catch {
      // Ignore
    }
  };

  const selectedShipment = shipments.find((s) => s.id === selectedShipmentId);

  return (
    <div className="space-y-6">
      {/* Thẻ điều khiển Lô Hàng & Đối Soát Giao Nhận */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-300">Lô hàng đang tiếp nhận:</span>
            <select
              value={selectedShipmentId}
              onChange={(e) => setSelectedShipmentId(e.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
            >
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shipmentCode} ({s.supplierName} - PO: {s.poNumber})
                </option>
              ))}
              {shipments.length === 0 && <option value="">-- Chưa có lô hàng --</option>}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {shipments.length === 0 && (
              <button
                onClick={handleCreateSampleShipment}
                className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-on-accent-dark hover:bg-amber-700 shadow"
              >
                <Plus size={14} /> Tạo Lô Hàng Mẫu
              </button>
            )}
            <button
              onClick={fetchShipments}
              className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Làm mới
            </button>
          </div>
        </div>

        {selectedShipment && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-zinc-800/80 pt-3 text-xs">
            <div>
              <span className="text-zinc-500 block">Số Đơn Hàng PO:</span>
              <span className="font-mono font-medium text-amber-400">
                {selectedShipment.poNumber}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Phiếu Giao Hàng DO:</span>
              <span className="font-mono font-medium text-zinc-200">
                {selectedShipment.doNumber}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Nhà Cung Cấp:</span>
              <span className="font-medium text-zinc-200">{selectedShipment.supplierName}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Trạng Thái:</span>
              <span className="inline-block rounded bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-400 border border-emerald-500/20">
                {selectedShipment.status}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KHU VỰC 1: Quét Mã QR Nhận Hàng & Đối Soát GRN */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                <Camera className="text-emerald-400" size={16} />
                Quét QR Nhận Hàng & Khớp 3 Chiều (3-Way Match)
              </h3>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/20">
                Auto-GRN
              </span>
            </div>

            <form onSubmit={handleScanSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Mã QR hoặc Barcode quét được từ Kiện Hàng:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Quét mã QR (vd: XB-MAT|v1|P1|VALVE-DN100-PN16|...)"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-2.5 pl-3 pr-24 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={scanning || !scanInput.trim()}
                    className="absolute right-1.5 top-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-on-accent-dark transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {scanning ? "Đang xử lý..." : "Xác Nhận"}
                  </button>
                </div>
              </div>
            </form>

            {/* Kết Quả Đối Soát Thời Gian Thực */}
            {reconcileResult && (
              <div
                className={`rounded-xl border p-4 text-xs space-y-2 ${
                  reconcileResult.isFullyReceived
                    ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                    : "border-amber-500/30 bg-amber-950/20 text-amber-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5">
                    {reconcileResult.isFullyReceived ? (
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    ) : (
                      <AlertTriangle size={16} className="text-amber-400" />
                    )}
                    {reconcileResult.isFullyReceived
                      ? "Đã giao đủ 100% theo Manifest"
                      : "Phát hiện sai lệch / Chưa giao đủ"}
                  </span>
                  <span className="font-mono bg-zinc-900/80 px-2 py-0.5 rounded text-zinc-200 border border-zinc-700">
                    {reconcileResult.grnNumber}
                  </span>
                </div>

                {reconcileResult.missingItems?.length > 0 && (
                  <div className="pt-2 border-t border-amber-500/20">
                    <span className="font-semibold block mb-1">Vật tư còn thiếu:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-zinc-300">
                      {reconcileResult.missingItems.map((m: any, idx: number) => (
                        <li key={idx}>
                          {m.itemCode}: Thiếu <b className="text-rose-400">{m.missingQty}</b> (Đã
                          nhận {m.scannedQty}/{m.manifestQty})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Nhật Ký Quét Cổng Công Trường */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-400 mb-2">Nhật Ký Quét Tại Cổng:</h4>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {scannedLogs.map((log, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Barcode size={14} className="text-emerald-400" />
                      <span className="font-mono font-medium text-zinc-200">{log.itemCode}</span>
                      <span className="text-zinc-500">SL: {log.qty}</span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">{log.time}</span>
                  </div>
                ))}
                {scannedLogs.length === 0 && (
                  <p className="text-center text-xs text-zinc-500 py-4">Chưa có lượt quét nào.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* KHU VỰC 2: Trình Sinh Mã QR Logistics Chuẩn Hoá */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                <QrCode className="text-amber-400" size={16} />
                Sinh Mã QR Tem Dán Vật Tư & Pallet (M78)
              </h3>
              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono text-amber-400 border border-amber-500/20">
                Tamper-Proof
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Mã Vật Tư / Spool:</label>
                <input
                  type="text"
                  value={genForm.itemCode}
                  onChange={(e) => setGenForm({ ...genForm, itemCode: e.target.value })}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Mã Lô / Heat No:</label>
                <input
                  type="text"
                  value={genForm.batchNo}
                  onChange={(e) => setGenForm({ ...genForm, batchNo: e.target.value })}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Loại Tem:</label>
                <select
                  value={genForm.tagType}
                  onChange={(e) => setGenForm({ ...genForm, tagType: e.target.value as any })}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-zinc-200 focus:outline-none"
                >
                  <option value="material_unit">Đơn vị Vật tư</option>
                  <option value="spool_assembly">Cụm Spool Prefab</option>
                  <option value="pallet_bundle">Pallet / Kiện Hàng</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Số Lượng / Kiện:</label>
                <input
                  type="number"
                  value={genForm.quantity}
                  onChange={(e) => setGenForm({ ...genForm, quantity: Number(e.target.value) })}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-zinc-200 focus:outline-none font-mono"
                />
              </div>
            </div>

            <button
              onClick={handleGenerate}
              className="w-full rounded-xl bg-amber-600 py-2 text-xs font-semibold text-on-accent-dark transition hover:bg-amber-500 shadow"
            >
              Sinh Chuỗi QR Payload & Mã Băm Bảo Mật
            </button>

            {generatedQr && (
              <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 text-xs">
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="font-semibold text-zinc-300">Chuỗi QR Chuẩn Hoá:</span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "Đã sao chép" : "Sao chép"}
                  </button>
                </div>
                <p className="font-mono text-zinc-300 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 break-all select-all">
                  {generatedQr}
                </p>
                <p className="text-[11px] text-zinc-500">
                  Đã tự động điền vào ô Quét để bạn có thể bấm <b>Xác Nhận</b> thử nghiệm đối soát
                  ngay lập tức!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
