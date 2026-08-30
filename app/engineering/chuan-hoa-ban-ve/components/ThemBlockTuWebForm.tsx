"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Upload, X } from "lucide-react";
import { Button } from "@/app/components/ui";
import type { BlockProposalKind } from "../types";

// M104 §3 — form "Thêm Block Từ Web": kéo-thả 2 tệp (.dwg chứa block + .dxf cùng nội dung để máy
// chủ kiểm định và dựng ảnh xem trước) kèm metadata theo đúng luật bắt buộc của M103 §2.
//
// Khác đường đề xuất từ AutoCAD (M103): block vào thư viện NGAY, không qua duyệt — nên form kiểm
// đủ ở client (thiếu trường bắt buộc thì khoá nút) để người dùng không gửi rồi mới nhận 422; máy
// chủ vẫn kiểm lại toàn bộ (API là ranh giới bảo mật duy nhất).

const LOAI: { ma: BlockProposalKind; nhan: string }[] = [
  { ma: "fitting", nhan: "Phụ kiện" },
  { ma: "equipment", nhan: "Thiết bị" },
  { ma: "support", nhan: "Giá đỡ" },
  { ma: "sleeve", nhan: "Lỗ chờ ống" },
  { ma: "titleblock", nhan: "Khung tên" },
];

/** Loại block được đếm khối lượng → bắt buộc trỏ tới một hạng mục bóc tách (M103 §2). */
const LOAI_DEM_KHOI_LUONG: BlockProposalKind[] = ["fitting", "equipment", "support", "sleeve"];

const O_NHAP =
  "w-full min-h-10 px-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600";

function duoiTep(ten: string): string {
  const i = ten.lastIndexOf(".");
  return i < 0 ? "" : ten.slice(i + 1).toLowerCase();
}

function tenGoc(ten: string): string {
  const i = ten.lastIndexOf(".");
  return (i < 0 ? ten : ten.slice(0, i)).toLowerCase();
}

export default function ThemBlockTuWebForm({
  onGui,
  onDong,
}: {
  onGui: (
    form: FormData,
  ) => Promise<{ ok: boolean; version?: string; error?: string; errors?: string[] }>;
  onDong: () => void;
}) {
  const [dwg, setDwg] = useState<File | null>(null);
  const [dxf, setDxf] = useState<File | null>(null);
  const [dangKeo, setDangKeo] = useState(false);
  const [blockName, setBlockName] = useState("");
  const [kind, setKind] = useState<BlockProposalKind>("fitting");
  const [systemId, setSystemId] = useState("");
  const [takeoffItemId, setTakeoffItemId] = useState("");
  const [paperSize, setPaperSize] = useState("");
  const [note, setNote] = useState("");
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string[]>([]);
  const [thanhCong, setThanhCong] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const laKhungTen = kind === "titleblock";
  const canTakeoff = LOAI_DEM_KHOI_LUONG.includes(kind);

  function nhanTep(ds: FileList | File[] | null) {
    if (!ds) return;
    const laTep: string[] = [];
    for (const f of Array.from(ds)) {
      const duoi = duoiTep(f.name);
      if (duoi === "dwg") {
        setDwg(f);
        if (!blockName) setBlockName(f.name.slice(0, f.name.length - 4));
      } else if (duoi === "dxf") {
        setDxf(f);
      } else {
        laTep.push(f.name);
      }
    }
    setLoi(laTep.length > 0 ? [`Chỉ nhận tệp .dwg và .dxf — bỏ qua: ${laTep.join(", ")}`] : []);
  }

  // Hai tệp phải là cùng một bản vẽ xuất ra hai định dạng. Tên gốc lệch nhau chỉ CẢNH BÁO (người
  // dùng có thể đặt tên khác nhau hợp lệ) — máy chủ mới là nơi đối chiếu nội dung thật.
  const canhBaoTenLech =
    dwg && dxf && tenGoc(dwg.name) !== tenGoc(dxf.name)
      ? `Tên gốc hai tệp khác nhau ("${dwg.name}" vs "${dxf.name}") — kiểm lại xem có phải cùng một bản vẽ không.`
      : null;

  const thieu: string[] = [];
  if (!dwg) thieu.push("tệp .dwg");
  if (!dxf) thieu.push("tệp .dxf");
  if (!blockName.trim()) thieu.push("tên block");
  if (!laKhungTen && !systemId.trim()) thieu.push("hệ");
  if (canTakeoff && !takeoffItemId.trim()) thieu.push("hạng mục bóc tách");
  if (laKhungTen && !paperSize.trim()) thieu.push("khổ giấy");
  const duLieuDu = thieu.length === 0;

  async function gui(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!duLieuDu || !dwg || !dxf) return;
    setDangGui(true);
    setLoi([]);
    setThanhCong(null);
    try {
      const fd = new FormData();
      fd.set("dwg", dwg);
      fd.set("dxf", dxf);
      fd.set(
        "meta",
        JSON.stringify({
          blockName: blockName.trim(),
          kind,
          systemId: laKhungTen ? "" : systemId.trim(),
          takeoffItemId: laKhungTen ? "" : takeoffItemId.trim(),
          paperSize: laKhungTen ? paperSize.trim() : "",
          note: note.trim(),
        }),
      );
      const kq = await onGui(fd);
      if (!kq.ok) {
        setLoi(kq.errors ?? [kq.error ?? "Thêm block vào thư viện thất bại."]);
        return;
      }
      setThanhCong(
        `Đã thêm block "${blockName.trim()}" vào thư viện — thư viện lên version ${kq.version ?? "mới"}.`,
      );
      setDwg(null);
      setDxf(null);
      setBlockName("");
      setSystemId("");
      setTakeoffItemId("");
      setPaperSize("");
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setDangGui(false);
    }
  }

  return (
    <form
      onSubmit={gui}
      className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3"
      aria-label="Thêm block vào thư viện từ web"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-zinc-500">
          Block vào thư viện <span className="text-zinc-300">ngay lập tức</span> (không qua duyệt):
          thư viện lên version mới, tệp .dwg của block được lưu riêng bên cạnh tệp nền. Nộp .dwg
          (block vẽ tại gốc toạ độ) và .dxf cùng nội dung để máy chủ kiểm định.
        </p>
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          onClick={onDong}
          aria-label="Đóng form thêm block từ web"
        >
          Đóng
        </Button>
      </div>

      {/* Vùng kéo-thả 2 tệp (bấm để chọn tệp trên điện thoại) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDangKeo(true);
        }}
        onDragLeave={() => setDangKeo(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDangKeo(false);
          nhanTep(e.dataTransfer.files);
        }}
        className={`p-4 rounded-lg border border-dashed text-center space-y-2 transition ${
          dangKeo ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 bg-zinc-900/60"
        }`}
      >
        <FileUp className="w-5 h-5 mx-auto text-zinc-400" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-xs text-zinc-300">Kéo-thả tệp .dwg và .dxf vào đây</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".dwg,.dxf"
          onChange={(e) => nhanTep(e.target.files)}
          aria-label="Chọn tệp .dwg và .dxf của block"
          className="block w-full text-xs text-zinc-400 file:mr-2 file:min-h-10 file:px-3 file:rounded-lg file:border file:border-zinc-700 file:bg-zinc-800 file:text-zinc-100 file:text-xs file:font-semibold hover:file:bg-zinc-700"
        />
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px]">
          <span className={dwg ? "text-emerald-300" : "text-zinc-500"}>
            .dwg: {dwg ? dwg.name : "chưa chọn"}
          </span>
          <span className={dxf ? "text-emerald-300" : "text-zinc-500"}>
            .dxf: {dxf ? dxf.name : "chưa chọn"}
          </span>
        </div>
      </div>

      {canhBaoTenLech && (
        <p className="flex items-start gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          {canhBaoTenLech}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-zinc-300">
          <span className="font-semibold">Tên block trong bản vẽ *</span>
          <input
            type="text"
            value={blockName}
            onChange={(e) => setBlockName(e.target.value)}
            placeholder="XB-TEE-DUCT"
            className={`${O_NHAP} font-mono`}
          />
        </label>
        <label className="space-y-1 text-xs text-zinc-300">
          <span className="font-semibold">Loại block *</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as BlockProposalKind)}
            className={O_NHAP}
          >
            {LOAI.map((l) => (
              <option key={l.ma} value={l.ma}>
                {l.nhan}
              </option>
            ))}
          </select>
        </label>

        {laKhungTen ? (
          <label className="space-y-1 text-xs text-zinc-300">
            <span className="font-semibold">Khổ giấy *</span>
            <input
              type="text"
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value)}
              placeholder="A1"
              className={O_NHAP}
            />
          </label>
        ) : (
          <>
            <label className="space-y-1 text-xs text-zinc-300">
              <span className="font-semibold">Hệ *</span>
              <input
                type="text"
                value={systemId}
                onChange={(e) => setSystemId(e.target.value)}
                placeholder="HVAC"
                className={O_NHAP}
              />
            </label>
            <label className="space-y-1 text-xs text-zinc-300">
              <span className="font-semibold">
                Hạng mục bóc tách {canTakeoff ? "*" : "(tuỳ chọn)"}
              </span>
              <input
                type="text"
                value={takeoffItemId}
                onChange={(e) => setTakeoffItemId(e.target.value)}
                placeholder="duct-fitting"
                className={O_NHAP}
              />
            </label>
          </>
        )}

        <label className="space-y-1 text-xs text-zinc-300 sm:col-span-2">
          <span className="font-semibold">Ghi chú (tuỳ chọn)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tê gió 3 nhánh, vẽ theo catalogue nhà sản xuất"
            className={O_NHAP}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          icon={Upload}
          disabled={dangGui || !duLieuDu}
          aria-label="Thêm block vào thư viện"
        >
          {dangGui ? "Đang kiểm định…" : "Thêm Vào Thư Viện"}
        </Button>
        {!duLieuDu && (
          <span className="text-[11px] text-zinc-500">Còn thiếu: {thieu.join(", ")}.</span>
        )}
      </div>

      {thanhCong && (
        <p className="flex items-start gap-1.5 text-xs text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          {thanhCong}
        </p>
      )}
      {loi.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-red-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Không thêm được block — {loi.length} lỗi:
          </p>
          <ul className="list-disc pl-6 space-y-0.5 text-xs text-red-300">
            {loi.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
