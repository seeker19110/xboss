"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Layers,
  Ruler,
  ScanSearch,
  ImageOff,
  Sparkles,
  UserPen,
  X,
} from "lucide-react";
import { Button, Card, Chip, Section } from "@/app/components/ui";
import type { BlockProposalKind } from "../types";

// M108 §6.2 + §6.3 — nạp MỘT LÔ block từ tệp tổng hợp, rồi duyệt theo lô.
//
// Khác form "Thêm Block Từ Web" (M104) ngay bên cạnh: ở đó người dùng có 1 block và tự khai mọi
// thứ, block vào thư viện ngay. Ở đây tệp có hàng chục/hàng trăm block, máy đề xuất phân loại,
// và LUÔN dừng ở bảng duyệt — không block nào vào thư viện mà không qua mắt người.

const LOAI: { ma: BlockProposalKind; nhan: string }[] = [
  { ma: "fitting", nhan: "Phụ kiện" },
  { ma: "equipment", nhan: "Thiết bị" },
  { ma: "support", nhan: "Giá đỡ" },
  { ma: "sleeve", nhan: "Lỗ chờ ống" },
  { ma: "titleblock", nhan: "Khung tên" },
];

/** Loại được đếm khối lượng → bắt buộc trỏ tới một hạng mục bóc tách (cùng luật M103 §2). */
const LOAI_DEM_KHOI_LUONG: BlockProposalKind[] = ["fitting", "equipment", "support", "sleeve"];

type NguonQuyetDinh = "luat" | "ngu_nghia" | "hinh_anh" | "nguoi_sua" | "chua_quyet";

/**
 * Nhãn nguồn quyết định. **Không truyền tải thông tin chỉ bằng màu** — mỗi nguồn có icon + chữ
 * riêng, để người mù màu và bản in đen trắng vẫn phân biệt được (ADR-0010 / a11y).
 */
const NGUON: Record<NguonQuyetDinh, { nhan: string; icon: typeof Ruler; mau: string }> = {
  luat: { nhan: "Luật", icon: Ruler, mau: "text-emerald-300" },
  ngu_nghia: { nhan: "AI · tên", icon: Sparkles, mau: "text-sky-300" },
  hinh_anh: { nhan: "AI · hình", icon: ScanSearch, mau: "text-violet-300" },
  nguoi_sua: { nhan: "Người sửa", icon: UserPen, mau: "text-amber-300" },
  chua_quyet: { nhan: "Chưa rõ", icon: AlertTriangle, mau: "text-zinc-400" },
};

type DongLo = {
  id: number;
  blockName: string;
  kind: BlockProposalKind | null;
  systemId: string | null;
  takeoffItemId: string | null;
  paperSize: string | null;
  attributes: string[];
  previewSvg: string | null;
  nguonQuyetDinh: NguonQuyetDinh;
  doTinCay: number | null;
  lyDo: string | null;
  chon: boolean;
};

type ChiTietLo = {
  lo: { id: number; status: string; baseLibVersion: string; aiEnabled: boolean };
  dong: DongLo[];
  nguongChonSan: number;
};

// Nhúng SVG qua thẻ <img src="data:..."> (KHÔNG dangerouslySetInnerHTML) — trình duyệt không thực
// thi script/handler bên trong SVG khi tải theo đường này. Bám đúng cách `ThuVienBlockPanel` đã
// chọn: ảnh xem trước dựng từ bản vẽ do người ngoài nộp, không được tin.
function anhXemTruoc(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const O_NHAP =
  "w-full min-h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100";

export default function NapLoBlockPanel() {
  const [mo, setMo] = useState(false);
  const [dxf, setDxf] = useState<File | null>(null);
  const [dangKeo, setDangKeo] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string[]>([]);
  const [boQua, setBoQua] = useState<{ blockName: string; lyDo: string }[]>([]);
  const [lyDoAiTat, setLyDoAiTat] = useState<string | null>(null);
  const [chiTiet, setChiTiet] = useState<ChiTietLo | null>(null);
  const [thanhCong, setThanhCong] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const taiLo = useCallback(async (loId: number) => {
    const res = await fetch(`/api/engineering/cad/block-proposals/batch/${loId}`);
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res.ok) setChiTiet((await res.json()) as ChiTietLo);
  }, []);

  async function guiTep() {
    if (!dxf) return;
    setDangGui(true);
    setLoi([]);
    setThanhCong(null);
    try {
      const form = new FormData();
      form.append("dxf", dxf);
      const res = await fetch("/api/engineering/cad/block-proposals/batch", {
        method: "POST",
        body: form,
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = (await res.json()) as {
        loId?: number;
        boQua?: { blockName: string; lyDo: string }[];
        lyDoAiKhongChay?: string | null;
        error?: string;
        errors?: string[];
      };
      if (!res.ok) {
        setLoi(data.errors ?? [data.error ?? "Nạp lô không thành công"]);
        return;
      }
      setBoQua(data.boQua ?? []);
      setLyDoAiTat(data.lyDoAiKhongChay ?? null);
      if (data.loId) await taiLo(data.loId);
    } finally {
      setDangGui(false);
    }
  }

  function suaDong(id: number, thayDoi: Partial<DongLo>) {
    setChiTiet((c) =>
      c
        ? {
            ...c,
            dong: c.dong.map((d) =>
              d.id === id ? { ...d, ...thayDoi, nguonQuyetDinh: "nguoi_sua", doTinCay: null } : d,
            ),
          }
        : c,
    );
  }

  function datChon(id: number, chon: boolean) {
    setChiTiet((c) =>
      c ? { ...c, dong: c.dong.map((d) => (d.id === id ? { ...d, chon } : d)) } : c,
    );
  }

  async function duyet() {
    if (!chiTiet) return;
    setDangGui(true);
    setLoi([]);
    try {
      const res = await fetch(
        `/api/engineering/cad/block-proposals/batch/${chiTiet.lo.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dong: chiTiet.dong.map((d) => ({
              id: d.id,
              kind: d.kind,
              systemId: d.systemId,
              takeoffItemId: d.takeoffItemId,
              paperSize: d.paperSize,
              chon: d.chon,
            })),
          }),
        },
      );
      const data = (await res.json()) as {
        version?: string;
        soBlockThem?: number;
        error?: string;
        errors?: string[];
      };
      if (!res.ok) {
        setLoi(data.errors ?? [data.error ?? "Duyệt lô không thành công"]);
        return;
      }
      setThanhCong(`Đã phát hành thư viện ${data.version} — thêm ${data.soBlockThem ?? 0} block.`);
      setChiTiet(null);
      setDxf(null);
    } finally {
      setDangGui(false);
    }
  }

  const soChon = chiTiet?.dong.filter((d) => d.chon).length ?? 0;
  const soChuaRo = chiTiet?.dong.filter((d) => d.chon && !d.kind).length ?? 0;

  return (
    <Section
      title="Nạp Block Hàng Loạt"
      icon={Layers}
      description="Đưa một tệp DWG/DXF tổng hợp chứa nhiều block — hệ thống tự đề xuất phân loại, bạn duyệt theo lô."
      actions={
        !mo ? (
          <Button size="sm" onClick={() => setMo(true)}>
            <FileUp className="w-4 h-4" aria-hidden="true" />
            Nạp Tệp Tổng Hợp
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setMo(false);
              setChiTiet(null);
              setDxf(null);
              setLoi([]);
            }}
          >
            <X className="w-4 h-4" aria-hidden="true" />
            Đóng
          </Button>
        )
      }
    >
      {thanhCong && (
        <Card className="p-3 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-300" aria-hidden="true" />
          <p className="text-xs text-emerald-300">{thanhCong}</p>
        </Card>
      )}

      {mo && !chiTiet && (
        <Card className="p-4 space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDangKeo(true);
            }}
            onDragLeave={() => setDangKeo(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDangKeo(false);
              const f = [...e.dataTransfer.files].find((x) =>
                x.name.toLowerCase().endsWith(".dxf"),
              );
              if (f) setDxf(f);
            }}
            className={`rounded-xl border border-dashed p-6 text-center ${
              dangKeo ? "border-emerald-400 bg-emerald-950/20" : "border-zinc-700"
            }`}
          >
            <FileUp className="w-6 h-6 mx-auto text-zinc-500" aria-hidden="true" />
            <p className="mt-2 text-xs text-zinc-300">
              {dxf ? dxf.name : "Kéo-thả tệp .dxf tổng hợp vào đây"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Máy chủ không chạy AutoCAD nên chỉ đọc được DXF — xuất DXF từ chính tệp chứa các
              block.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".dxf"
              className="sr-only"
              onChange={(e) => setDxf(e.target.files?.[0] ?? null)}
            />
            <Button
              size="sm"
              variant="ghost"
              className="mt-3"
              onClick={() => inputRef.current?.click()}
            >
              Chọn tệp
            </Button>
          </div>
          <Button onClick={guiTep} disabled={!dxf || dangGui}>
            {dangGui ? "Đang đọc và phân loại…" : "Nạp Lô"}
          </Button>
        </Card>
      )}

      {loi.length > 0 && (
        <Card className="p-3 space-y-1">
          {loi.map((l, i) => (
            <p key={i} className="flex items-start gap-2 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              {l}
            </p>
          ))}
        </Card>
      )}

      {chiTiet && (
        <>
          <Card className="p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>Lô #{chiTiet.lo.id}</Chip>
              <Chip>Thư viện nền {chiTiet.lo.baseLibVersion}</Chip>
              <Chip>
                {soChon}/{chiTiet.dong.length} block được chọn
              </Chip>
              {soChuaRo > 0 && (
                <Chip className="text-amber-300">{soChuaRo} dòng chưa khai loại</Chip>
              )}
            </div>
            {lyDoAiTat && (
              <p className="flex items-start gap-2 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                {lyDoAiTat}
              </p>
            )}
            {boQua.length > 0 && (
              <details className="text-xs text-zinc-400">
                <summary className="cursor-pointer">
                  {boQua.length} block bị bỏ qua — xem lý do
                </summary>
                <ul className="mt-2 space-y-1">
                  {boQua.map((b, i) => (
                    <li key={i}>
                      <span className="text-zinc-300">{b.blockName}</span> — {b.lyDo}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          <Card className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-900">
                <tr className="text-left text-zinc-400">
                  <th className="p-2 font-medium">Nạp</th>
                  <th className="p-2 font-medium">Hình</th>
                  <th className="p-2 font-medium">Tên block</th>
                  <th className="p-2 font-medium">Loại</th>
                  <th className="p-2 font-medium">Hệ</th>
                  <th className="p-2 font-medium">Hạng mục bóc tách</th>
                  <th className="p-2 font-medium">Căn cứ</th>
                </tr>
              </thead>
              <tbody>
                {chiTiet.dong.map((d) => {
                  const n = NGUON[d.nguonQuyetDinh];
                  const Icon = n.icon;
                  return (
                    <tr key={d.id} className="border-t border-zinc-800 align-top">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={d.chon}
                          onChange={(e) => datChon(d.id, e.target.checked)}
                          aria-label={`Nạp block ${d.blockName}`}
                          className="w-4 h-4 accent-emerald-600"
                        />
                      </td>
                      <td className="p-2">
                        <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                          {d.previewSvg ? (
                            // eslint-disable-next-line @next/next/no-img-element -- data URL cục bộ, không phải ảnh từ xa
                            <img
                              src={anhXemTruoc(d.previewSvg)}
                              alt={`Xem trước block ${d.blockName}`}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <ImageOff
                              className="w-4 h-4 text-zinc-600"
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <span className="text-zinc-100">{d.blockName}</span>
                        {d.attributes.length > 0 && (
                          <p className="mt-1 text-zinc-500">{d.attributes.join(", ")}</p>
                        )}
                      </td>
                      <td className="p-2">
                        <select
                          value={d.kind ?? ""}
                          onChange={(e) =>
                            suaDong(d.id, {
                              kind: (e.target.value || null) as BlockProposalKind | null,
                            })
                          }
                          aria-label={`Loại của ${d.blockName}`}
                          className={O_NHAP}
                        >
                          <option value="">— chưa khai —</option>
                          {LOAI.map((l) => (
                            <option key={l.ma} value={l.ma}>
                              {l.nhan}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          value={d.systemId ?? ""}
                          onChange={(e) => suaDong(d.id, { systemId: e.target.value || null })}
                          aria-label={`Hệ của ${d.blockName}`}
                          className={O_NHAP}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={d.takeoffItemId ?? ""}
                          onChange={(e) => suaDong(d.id, { takeoffItemId: e.target.value || null })}
                          aria-label={`Hạng mục bóc tách của ${d.blockName}`}
                          className={O_NHAP}
                          placeholder={
                            d.kind && LOAI_DEM_KHOI_LUONG.includes(d.kind) ? "bắt buộc" : "—"
                          }
                        />
                      </td>
                      <td className="p-2">
                        <span className={`flex items-center gap-1 ${n.mau}`}>
                          <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          {n.nhan}
                          {d.doTinCay !== null && (
                            <span className="text-zinc-500">· {Math.round(d.doTinCay * 100)}%</span>
                          )}
                        </span>
                        {d.lyDo && <p className="mt-1 max-w-xs text-zinc-500">{d.lyDo}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button onClick={duyet} disabled={dangGui || soChon === 0 || soChuaRo > 0}>
              {dangGui ? "Đang phát hành…" : `Duyệt & Phát Hành ${soChon} Block`}
            </Button>
            {soChuaRo > 0 && (
              <p className="self-center text-xs text-amber-300">
                Còn {soChuaRo} dòng chưa khai loại — khai nốt hoặc bỏ chọn thì mới phát hành được.
              </p>
            )}
          </div>
        </>
      )}
    </Section>
  );
}
