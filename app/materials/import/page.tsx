"use client";
import { useRef, useState, useEffect } from "react";
import {
  Package,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  RotateCcw,
  Layers,
  FileText,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";

type RowResult = {
  row: number;
  code?: string | null;
  name: string;
  unit?: string | null;
  qtyBoq?: number;
  qtyPlanned?: number;
  status: "ok" | "skip" | "error";
  message?: string;
};

type ImportResult = {
  inserted: number;
  updated?: number;
  skipped: number;
  errors: number;
  sheetUsed?: string;
  results: RowResult[];
};

type SystemType = {
  id: number;
  code: string;
  name: string;
  color?: string | null;
};

export default function ImportMaterialsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [excelSheets, setExcelSheets] = useState<string[]>([]);
  const [selectedExcelSheet, setSelectedExcelSheet] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [systemId, setSystemId] = useState("");
  const [systems, setSystems] = useState<SystemType[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/systems")
      .then((r) => r.json())
      .then((d) => {
        const list: SystemType[] = d.systems ?? d ?? [];
        setSystems(list);
        // Đọc query param ?system= hoặc ?systemId= nếu có
        const params = new URLSearchParams(window.location.search);
        const qSystem = params.get("system") || params.get("systemId");
        if (qSystem) {
          const match = list.find((s) => String(s.id) === qSystem || s.code === qSystem);
          if (match) {
            setSystemId(String(match.id));
            return;
          }
        }
        if (list.length > 0) {
          // Ưu tiên chọn hệ HVAC / ACMV mặc định
          const hvac = list.find((s) => s.code === "acmv" || s.code === "hvac") || list[0];
          setSystemId(String(hvac.id));
        }
      })
      .catch(() => {});
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  async function pickFile(f: File) {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setError("Chỉ nhận file Excel (.xlsx / .xls)");
      return;
    }
    setFile(f);
    setError("");
    setResult(null);

    // Đọc danh sách sheet tab trong file Excel
    try {
      const buf = await f.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array", bookSheets: true });
      const sheetList = wb.SheetNames || [];
      setExcelSheets(sheetList);

      // Tự động chọn sheet dữ liệu tối ưu nhất
      const best =
        sheetList.find((s) => s === "Data-BOQ" || s === "Vật tư" || s === "BOQ") ||
        sheetList.find(
          (s) =>
            !s.startsWith("00_") &&
            !s.toLowerCase().includes("hdsd") &&
            !s.toLowerCase().includes("huong_dan") &&
            !s.toLowerCase().includes("dashboard") &&
            !s.toLowerCase().includes("kiem_soat") &&
            !s.toLowerCase().includes("in phieu"),
        ) ||
        sheetList[0] ||
        "";
      setSelectedExcelSheet(best);
    } catch {
      setExcelSheets([]);
      setSelectedExcelSheet("");
    }
  }

  async function doImport() {
    if (!file) return;
    if (!systemId) {
      setError("Vui lòng chọn hệ MEPF trước khi import (hệ nào nhập hệ đó)");
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("systemId", systemId);
      form.append("mode", mode);
      if (selectedExcelSheet) {
        form.append("sheetName", selectedExcelSheet);
      }

      const res = await fetch("/api/materials/import", { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Lỗi không xác định");
        setBusy(false);
        return;
      }
      setResult(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi kết nối máy chủ");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setExcelSheets([]);
    setSelectedExcelSheet("");
    setResult(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  const selectedSystemObj = systems.find((s) => String(s.id) === systemId);
  const errRows = result?.results.filter((r) => r.status === "error") ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        back
        title={
          <>
            <Package className="w-5 h-5 text-emerald-400" /> Import vật tư & BOQ theo Hệ MEPF
          </>
        }
      >
        <a
          href="/api/materials/template"
          download="MAU-KHOI-LUONG-BOQ.xlsx"
          className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white border border-zinc-700 bg-zinc-900 rounded-lg px-3 py-1.5 transition font-medium"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" /> Tải mẫu BOQ chuẩn (.xlsx)
        </a>
      </AppHeader>

      <main className="p-6 max-w-4xl mx-auto space-y-5">
        {/* Hướng dẫn ngắn */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3 text-xs text-emerald-300 leading-relaxed">
          <Layers className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-300 text-sm mb-0.5">
              Quy tắc MEPF: Hệ nào nhập hệ đó (HVAC, Điện, Cấp Thoát Nước, PCCC)
            </p>
            <p>
              Chọn đúng <strong>Hệ thống MEPF</strong> cần nhập và chọn tab Sheet dữ liệu trong file
              Excel. Toàn bộ mã BOQ, khối lượng dự toán và định mức bóc tách sẽ được gán trực tiếp
              vào hệ đã chọn để bảo vệ khối lượng và kiểm soát đặt hàng.
            </p>
          </div>
        </div>

        {/* Khối cấu hình import */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5 shadow-sm">
          {/* 1. Chọn file */}
          <div className="space-y-2">
            <label className="font-semibold text-sm text-zinc-200 block">
              1. Chọn file Excel BOQ / Vật tư
            </label>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition
                ${dragOver ? "border-emerald-500 bg-emerald-950/20" : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/40"}
                ${file ? "border-emerald-700 bg-emerald-950/15" : ""}`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="w-10 h-10 text-emerald-400" />
                  <p className="font-medium text-emerald-300 text-sm">{file.name}</p>
                  <p className="text-xs text-zinc-400">
                    {(file.size / 1024).toFixed(1)} KB — Bấm để chọn file khác
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-400">
                  <Upload className="w-9 h-9 text-zinc-500" />
                  <p className="text-sm">
                    Kéo thả file Excel vào đây hoặc{" "}
                    <span className="text-emerald-400 underline font-medium">chọn từ máy tính</span>
                  </p>
                  <p className="text-xs text-zinc-400">Chấp nhận file định dạng .xlsx, .xls</p>
                </div>
              )}
            </div>
          </div>

          {/* Tab Sheet trong file Excel nếu có nhiều sheet */}
          {excelSheets.length > 1 && (
            <div className="space-y-2 bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" /> Chọn Tab Sheet trong file
                  Excel
                </label>
                <span className="text-[11px] text-zinc-400">
                  {excelSheets.length} sheet tìm thấy
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {excelSheets.map((sName) => (
                  <button
                    key={sName}
                    type="button"
                    onClick={() => setSelectedExcelSheet(sName)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                      selectedExcelSheet === sName
                        ? "bg-emerald-600 border-emerald-500 text-white shadow-sm"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
                    }`}
                  >
                    {sName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Chọn hệ (Bắt buộc) */}
          <div className="space-y-1.5">
            <label
              htmlFor="system-select"
              className="font-semibold text-sm text-zinc-200 flex items-center gap-1"
            >
              2. Chọn Hệ MEPF cần nhập (HVAC, Điện, Cấp Thoát Nước, PCCC...){" "}
              <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-zinc-400">
              Hệ nào nhập hệ đó — tất cả các dòng vật tư trong file sẽ được gán trực tiếp vào hệ
              này.
            </p>
            <select
              id="system-select"
              value={systemId}
              onChange={(e) => setSystemId(e.target.value)}
              aria-label="Chọn hệ MEPF cần nhập vật tư"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
            >
              <option value="">
                -- Vui lòng chọn hệ MEPF (HVAC, Điện, Cấp Thoát Nước, PCCC...) --
              </option>
              {systems.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Chế độ import */}
          <div className="space-y-2">
            <label className="font-semibold text-sm text-zinc-200 block">3. Chế độ import</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  {
                    value: "append",
                    label: "Thêm vào / Cập nhật",
                    desc: "Giữ nguyên vật tư cũ; cập nhật số liệu nếu trùng Mã BOQ, thêm mới nếu chưa có.",
                  },
                  {
                    value: "replace",
                    label: "Thay thế toàn bộ hệ này",
                    desc: "Xoá toàn bộ vật tư của hệ đã chọn trong dự án, sau đó nhập mới lại từ đầu.",
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`text-left rounded-xl border p-3.5 transition
                    ${
                      mode === opt.value
                        ? opt.value === "replace"
                          ? "border-red-500/50 bg-red-500/10 text-red-300"
                          : "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                        : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 text-zinc-400"
                    }`}
                >
                  <p className="font-semibold text-sm">{opt.label}</p>
                  <p className="text-xs mt-1 text-zinc-400">{opt.desc}</p>
                </button>
              ))}
            </div>
            {mode === "replace" && (
              <p className="text-xs text-red-400 flex items-center gap-1.5 mt-1 bg-red-950/30 border border-red-900/50 rounded-lg p-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                Cảnh báo: Chế độ Thay thế sẽ xoá toàn bộ danh mục vật tư hiện tại của hệ &quot;
                {selectedSystemObj?.name ?? systemId}&quot; trước khi import.
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-800 bg-red-950 text-red-200 px-4 py-3 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              {error}
            </div>
          )}

          {/* Các nút hành động */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={doImport}
              disabled={!file || !systemId || busy}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl px-6 py-2.5 text-sm font-semibold transition shadow-md shadow-emerald-950"
            >
              <Upload className="w-4 h-4" />
              {busy ? "Đang xử lý import..." : "Bắt đầu import"}
            </button>
            {(file || result) && (
              <button
                onClick={reset}
                className="flex items-center gap-2 border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-300 hover:text-white transition"
              >
                <RotateCcw className="w-4 h-4" /> Làm lại
              </button>
            )}
          </div>
        </div>

        {/* Kết quả */}
        {result && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
              <p className="font-bold text-sm text-white">
                Kết quả import cho hệ:{" "}
                <span className="text-emerald-400">{selectedSystemObj?.name ?? systemId}</span>
              </p>
              {result.sheetUsed && (
                <span className="text-xs text-zinc-400">
                  Sheet Excel đã đọc: <strong className="text-zinc-200">{result.sheetUsed}</strong>
                </span>
              )}
            </div>

            {/* Tóm tắt số liệu */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-emerald-400">{result.inserted}</p>
                <p className="text-xs text-zinc-300 mt-0.5">Thêm mới</p>
              </div>
              <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{result.updated ?? 0}</p>
                <p className="text-xs text-zinc-300 mt-0.5">Cập nhật</p>
              </div>
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-zinc-400">{result.skipped}</p>
                <p className="text-xs text-zinc-400 mt-0.5">Bỏ qua (dòng trống)</p>
              </div>
              <div
                className={`border rounded-xl p-3 text-center ${result.errors > 0 ? "bg-red-950/30 border-red-800/50" : "bg-zinc-800/50 border-zinc-700"}`}
              >
                <p
                  className={`text-2xl font-bold ${result.errors > 0 ? "text-red-400" : "text-zinc-400"}`}
                >
                  {result.errors}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">Lỗi</p>
              </div>
            </div>

            {(result.inserted > 0 || (result.updated ?? 0) > 0) && (
              <div className="pt-1">
                <a
                  href={`/procurement?tab=inventory&systemId=${systemId}`}
                  className="inline-flex items-center gap-2 bg-emerald-600/20 border border-emerald-700/50 hover:bg-emerald-600/30 text-emerald-300 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition"
                >
                  <ArrowLeft className="w-4 h-4" /> Mở Danh mục vật tư / Bảng định mức hệ này
                </a>
              </div>
            )}

            {/* Chi tiết theo từng hàng */}
            {result.results.length > 0 && (
              <div
                className="overflow-auto max-h-80 rounded-xl border border-zinc-800"
                tabIndex={0}
                role="region"
                aria-label="Chi tiết kết quả import"
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                    <tr>
                      <th className="text-center px-3 py-2.5 w-12">Hàng</th>
                      <th className="text-left px-3 py-2.5 w-28">Mã BOQ</th>
                      <th className="text-left px-3 py-2.5">Mô tả / Tên vật tư</th>
                      <th className="text-center px-3 py-2.5 w-16">ĐVT</th>
                      <th className="text-right px-3 py-2.5 w-20">KL BOQ</th>
                      <th className="text-right px-3 py-2.5 w-24">KL Định mức</th>
                      <th className="text-center px-3 py-2.5 w-24">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {result.results.map((r) => (
                      <tr key={r.row} className="hover:bg-zinc-800/30 transition">
                        <td className="text-center px-3 py-2 text-zinc-400 font-mono">{r.row}</td>
                        <td className="px-3 py-2 text-zinc-300 font-mono">{r.code || "—"}</td>
                        <td className="px-3 py-2 text-zinc-200 font-medium">{r.name}</td>
                        <td className="px-3 py-2 text-center text-zinc-400">{r.unit || "—"}</td>
                        <td className="px-3 py-2 text-right text-zinc-300 font-mono">
                          {r.qtyBoq != null ? r.qtyBoq.toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-400 font-mono">
                          {r.qtyPlanned != null ? r.qtyPlanned.toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.status === "ok" && (
                            <span
                              className={`inline-flex items-center gap-1 font-medium ${
                                r.message === "Cập nhật" ? "text-blue-400" : "text-emerald-400"
                              }`}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              {r.message || "OK"}
                            </span>
                          )}
                          {r.status === "skip" && (
                            <span className="inline-flex items-center gap-1 text-zinc-400">
                              Bỏ qua
                            </span>
                          )}
                          {r.status === "error" && (
                            <span
                              className="inline-flex items-center gap-1 text-red-400 font-medium"
                              title={r.message}
                            >
                              <XCircle className="w-3.5 h-3.5" /> Lỗi
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Lọc nhanh lỗi */}
            {errRows.length > 0 && (
              <div className="rounded-xl border border-red-900 bg-red-950/20 p-4 space-y-2">
                <p className="text-xs font-semibold text-red-400">
                  {errRows.length} hàng bị lỗi — kiểm tra lại trong file:
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {errRows.map((r) => (
                    <p key={r.row} className="text-xs text-red-300 font-mono">
                      Hàng {r.row}: <span className="font-semibold">{r.name}</span> — {r.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
