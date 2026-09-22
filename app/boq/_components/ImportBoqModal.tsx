"use client";
import { useState } from "react";
import { X, Download } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import { fmtVND, fmtQty, type SystemOption } from "./types";

type BoqImportPreviewRow = {
  rowIndex: number;
  code: string;
  name: string;
  unit: string;
  qtyContract: number;
  unitPrice: number;
  note: string | null;
  action: "add" | "error";
  reason?: string;
};

export default function ImportBoqModal({
  systems,
  onClose,
  onImported,
}: {
  systems: SystemOption[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [systemId, setSystemId] = useState<number | "">("");
  const [preview, setPreview] = useState<BoqImportPreviewRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [skippedTowerBOnly, setSkippedTowerBOnly] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  async function runPreview() {
    if (!file || !systemId) return;
    setBusy(true);
    setErr("");
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("systemId", String(systemId));
      const res = await fetch("/api/boq/import", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không đọc được file");
        return;
      }
      setPreview(j.preview ?? []);
      setWarnings(j.warnings ?? []);
      setSkippedTowerBOnly(j.skippedTowerBOnly ?? 0);
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file || !systemId) return;
    setBusy(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("systemId", String(systemId));
      const res = await fetch("/api/boq/import?commit=1", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Import thất bại");
        return;
      }
      setResult(j);
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setBusy(false);
    }
  }

  const addCount = preview?.filter((r) => r.action === "add").length ?? 0;
  const errorCount = preview?.filter((r) => r.action === "error").length ?? 0;

  return (
    <Modal onClose={onClose} className="max-w-2xl max-h-[85vh] flex flex-col">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <h2 className="font-semibold">Import Excel BOQ</h2>
        <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-3 overflow-auto">
        {result ? (
          <div className="space-y-2">
            <p className="text-sm text-emerald-300">
              ✅ Đã thêm {result.inserted} dòng BOQ
              {result.skipped > 0 && `, bỏ qua ${result.skipped} dòng lỗi`}.
            </p>
            {result.errors.length > 0 && (
              <ul className="text-xs text-rose-300 list-sys pl-4 space-y-0.5">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            <button
              onClick={onImported}
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-on-accent font-semibold py-2 rounded-lg text-sm"
            >
              Xong
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between bg-zinc-800/80 p-3 rounded-lg border border-zinc-700/60">
              <div className="text-xs text-zinc-300 pr-2">
                <p className="font-medium text-white">
                  Biểu mẫu BOQ & Kiểm soát Đặt hàng chuẩn xBOSS
                </p>
                <p className="text-zinc-400 mt-0.5">
                  Bao gồm hướng dẫn 4 nguyên tắc cốt lõi, bảng điều khiển định mức, mẫu trống và một
                  bộ dữ liệu mẫu.
                </p>
              </div>
              <a
                href="/api/boq/template"
                download="MAU-KHOI-LUONG-BOQ.xlsx"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-on-accent rounded-lg text-xs font-semibold shrink-0 transition"
              >
                <Download className="w-4 h-4" />
                Tải file mẫu
              </a>
            </div>

            <p className="text-xs text-zinc-400">
              Hỗ trợ file biểu mẫu chuẩn (tự động nhận diện Mã BOQ duy nhất, KL Hợp đồng, KL Định
              mức bóc tách) hoặc file Bảng khối lượng thanh toán (IPC). Với các dòng chưa có mã, hệ
              thống sẽ tự sinh BOQCODE tuần tự theo hệ đã chọn.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-400 col-span-2">
                File Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setPreview(null);
                  }}
                  className="mt-1 w-full text-sm text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-700 file:text-white file:text-xs"
                />
              </label>
              <label className="text-xs text-zinc-400 col-span-2">
                Hệ (dùng để sinh mã cho các dòng chưa có mã, vd ACMV-0001)
                <select
                  value={systemId}
                  onChange={(e) => {
                    setSystemId(e.target.value ? Number(e.target.value) : "");
                    setPreview(null);
                  }}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="">— Chọn hệ —</option>
                  {systems.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {err && <p className="text-sm text-rose-300">{err}</p>}

            {preview && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">
                  Tìm thấy <span className="text-emerald-300 font-medium">{addCount}</span> dòng sẽ
                  thêm
                  {errorCount > 0 && (
                    <>
                      {" "}
                      · <span className="text-rose-300 font-medium">{errorCount}</span> dòng lỗi (mã
                      trùng)
                    </>
                  )}
                  {skippedTowerBOnly > 0 && (
                    <> · đã bỏ qua {skippedTowerBOnly} dòng chỉ thuộc Tháp B</>
                  )}
                  .
                </p>
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-300">
                    ⚠ {w}
                  </p>
                ))}
                <div className="border border-zinc-800 rounded-lg overflow-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-900">
                      <tr className="text-zinc-400 text-left border-b border-zinc-800">
                        <th className="py-1.5 px-2">Mã</th>
                        <th className="py-1.5 px-2">Tên</th>
                        <th className="py-1.5 px-2 text-right">KL</th>
                        <th className="py-1.5 px-2 text-right">Đơn giá</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 200).map((r) => (
                        <tr
                          key={r.rowIndex}
                          className={`border-b border-zinc-800/50 ${r.action === "error" ? "bg-rose-950/40" : ""}`}
                        >
                          <td className="py-1 px-2 font-mono text-amber-400">{r.code}</td>
                          <td className="py-1 px-2 text-zinc-300 truncate max-w-[240px]">
                            {r.name}
                            {r.action === "error" && (
                              <span className="block text-rose-300">{r.reason}</span>
                            )}
                          </td>
                          <td className="py-1 px-2 text-right text-zinc-300">
                            {fmtQty(r.qtyContract)} {r.unit}
                          </td>
                          <td className="py-1 px-2 text-right text-zinc-300">
                            {fmtVND(r.unitPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.length > 200 && (
                  <p className="text-xs text-zinc-400">
                    … và {preview.length - 200} dòng khác (đã rút gọn xem trước).
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {!preview ? (
                <button
                  onClick={runPreview}
                  disabled={busy || !file || !systemId}
                  className="flex-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white font-semibold py-2 rounded-lg text-sm"
                >
                  {busy ? "Đang phân tích…" : "Xem trước"}
                </button>
              ) : (
                <button
                  onClick={commit}
                  disabled={busy || addCount === 0}
                  className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-on-accent font-semibold py-2 rounded-lg text-sm"
                >
                  {busy ? "Đang ghi…" : `Xác nhận ghi ${addCount} dòng`}
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 border border-zinc-700 hover:border-zinc-500 rounded-lg text-sm text-zinc-400"
              >
                Huỷ
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
