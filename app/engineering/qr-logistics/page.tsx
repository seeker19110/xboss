"use client";

import { useState, useEffect, useCallback } from "react";
import AppHeader from "@/app/components/AppHeader";
import EngineeringNav from "@/app/components/EngineeringNav";
import { Skeleton } from "@/app/components/Skeleton";
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

export default function QrLogisticsPage() {
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
    setScanInput(code); // Điền luôn vào ô quét để tiện test
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <EngineeringNav />

        {/* Tiêu đề */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Smart Materials QR Logistics & Barcode Scanner (M78)
            </h1>
            <p className="text-xs text-zinc-400">
              Quản lý chuỗi cung ứng vật tư, tự động sinh mã QR định danh, quét Barcode nhận hàng &
              Đối soát 3 bên (GRN)
            </p>
          </div>

          <div className="flex gap-2">
            {shipments.length === 0 && (
              <button
                onClick={handleCreateSampleShipment}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
              >
                <Plus size={14} /> + Tạo Lô Hàng Giao Nhận Mẫu
              </button>
            )}
          </div>
        </div>

        {/* Lựa chọn Lô Hàng & Đối Soát Giao Nhận */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-300">Lô hàng:</span>
              <select
                value={selectedShipmentId}
                onChange={(e) => setSelectedShipmentId(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 focus:outline-none"
              >
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.shipmentCode}] DO: {s.doNumber} | PO: {s.poNumber} ({s.supplierName})
                  </option>
                ))}
              </select>
            </div>

            {selectedShipment && (
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-zinc-500">Tổng kiện hàng:</span>{" "}
                  <span className="font-bold text-violet-400">
                    {selectedShipment.totalItemsCount} đơn vị
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Đã quét nhận:</span>{" "}
                  <span className="font-bold text-emerald-400">
                    {scannedLogs.reduce((s, l) => s + l.qty, 0)} đơn vị
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Cột Trái: Trình Tạo Mã QR & In Nhãn Định Danh */}
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-violet-400">
                <QrCode size={16} />
                <h3 className="text-xs font-semibold">Tạo Mã QR Định Danh Vật Tư / Spool</h3>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] text-zinc-500">Mã vật tư / Spool</label>
                  <input
                    type="text"
                    value={genForm.itemCode}
                    onChange={(e) => setGenForm((p) => ({ ...p, itemCode: e.target.value }))}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-zinc-500">Số lô sản xuất (Batch No)</label>
                  <input
                    type="text"
                    value={genForm.batchNo}
                    onChange={(e) => setGenForm((p) => ({ ...p, batchNo: e.target.value }))}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-zinc-500">Loại thẻ QR</label>
                  <select
                    value={genForm.tagType}
                    onChange={(e) => setGenForm((p) => ({ ...p, tagType: e.target.value as any }))}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="material_unit">Vật tư đơn lẻ</option>
                    <option value="spool_bundle">Bó Spool ống</option>
                    <option value="equipment_asset">Thiết bị cơ điện</option>
                    <option value="delivery_order">Phiếu giao hàng DO</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-zinc-500">Số lượng</label>
                  <input
                    type="number"
                    value={genForm.quantity}
                    onChange={(e) =>
                      setGenForm((p) => ({ ...p, quantity: Number(e.target.value) }))
                    }
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200"
                  />
                </div>
              </div>

              <button
                onClick={handleGenerate}
                className="w-full rounded-lg bg-violet-600 py-2 text-xs font-medium text-white hover:bg-violet-500"
              >
                Sinh Chuỗi Mã QR Chuẩn Hoá
              </button>

              {/* QR Label Card Preview */}
              {generatedQr && (
                <div className="mt-3 rounded-lg border border-violet-700/60 bg-zinc-900 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-violet-300">
                      Nhãn QR Code Định Danh
                    </span>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200"
                    >
                      {copied ? (
                        <Check size={11} className="text-emerald-400" />
                      ) : (
                        <Copy size={11} />
                      )}
                      {copied ? "Đã copy" : "Copy chuỗi QR"}
                    </button>
                  </div>
                  <p className="break-all font-mono text-[11px] text-emerald-400 bg-zinc-950 p-2 rounded border border-zinc-800">
                    {generatedQr}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Cột Phải: Trình Giả Lập Quét Barcode & Đối Soát GRN */}
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Camera size={16} />
                <h3 className="text-xs font-semibold">Máy Quét Barcode & Camera PWA Nhận Hàng</h3>
              </div>

              {/* Viewfinder Mockup */}
              <div className="flex h-36 flex-col items-center justify-center rounded-lg border-2 border-dashed border-emerald-600/60 bg-emerald-950/10 p-4 text-center">
                <Barcode size={36} className="mb-2 text-emerald-400 animate-pulse" />
                <p className="text-xs text-zinc-300">Hướng camera về phía mã QR trên kiện hàng</p>
                <p className="text-[10px] text-zinc-500">Hỗ trợ nhận diện mã QR tiêu chuẩn XBoss</p>
              </div>

              <form onSubmit={handleScanSubmit} className="space-y-2">
                <label className="text-[10px] text-zinc-500">Chuỗi mã QR đã quét:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Quét hoặc dán chuỗi XB-MAT|..."
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs text-zinc-200"
                  />
                  <button
                    type="submit"
                    disabled={scanning}
                    className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {scanning ? "Đang nhận..." : "Nhận Hàng"}
                  </button>
                </div>
              </form>

              {/* Kết Quả Biên Bản Nhập Kho (GRN) */}
              {reconcileResult && (
                <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/20 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-300">
                      Biên Bản GRN: {reconcileResult.grnNumber}
                    </span>
                    <span className="rounded bg-emerald-900/80 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                      {reconcileResult.isFullyReceived ? "100% KHỚP" : "ĐANG ĐỐI SOÁT"}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-300">{reconcileResult.inspectionSummary}</p>
                </div>
              )}

              {/* Lịch Sử Các Thẻ Đã Quét */}
              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <span className="text-[11px] font-semibold text-zinc-400">
                  Lịch sử quét mã hôm nay ({scannedLogs.length} kiện)
                </span>
                <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                  {scannedLogs.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 border border-zinc-800"
                    >
                      <span className="font-semibold text-emerald-400">
                        {l.itemCode} (x{l.qty})
                      </span>
                      <span className="text-[10px] text-zinc-500">{l.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
