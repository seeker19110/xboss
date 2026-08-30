"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileUp,
  Loader2,
  Route,
  Ruler,
  Save,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UserPen,
  X,
} from "lucide-react";
import { Button, Card, Chip, Section } from "@/app/components/ui";
import { Skeleton } from "@/app/components/Skeleton";

// M117 PR3 — màn duyệt "Sơ Đồ Nguyên Lý": nạp DXF schematic, xem đồ thị kết nối do tầng 1 (luật)
// + tầng 2 (AI, nếu bật) dựng, sửa tay từng nút/cạnh rồi "Chốt Graph" cho plugin
// `XBOSS_TUYEN_GOIY` (PR4) tải xuống sinh tuyến tim gợi ý.
//
// Bám khuôn `NapLoBlockPanel.tsx` (M108): nạp tệp → bảng duyệt → hành động chốt. Khác biệt:
// PATCH `/api/engineering/cad/schematic/:id` (đã chốt ở PR2) CHỈ nhận sửa `kind`/`systemId`/`tag`
// của nút và `size` của cạnh — KHÔNG có API nối lại `from`/`to` (đổi hướng/nối cạnh), nên màn duyệt
// này không có control đổi kết nối; muốn nối lại nhánh đứt phải sửa tệp DXF gốc và nạp lại.
// Không có route GET liệt kê nhiều graph của dự án (PR2 chỉ có GET theo id) — panel giữ đúng
// graph vừa nạp/tra trong phiên; muốn xem lại graph cũ thì gõ id vào ô "Tra graph theo mã".

type LoaiNut = "thiet_bi" | "nut_re" | "dau_ho";
type NguonQuyetDinh = "luat" | "ngu_nghia" | "hinh_anh" | "nguoi_sua" | "chua_quyet";
type LoaiBlock = "fitting" | "equipment" | "titleblock" | "support" | "sleeve" | "annotation";

const LOAI_KHOI: { ma: LoaiBlock; nhan: string }[] = [
  { ma: "fitting", nhan: "Phụ kiện" },
  { ma: "equipment", nhan: "Thiết bị" },
  { ma: "support", nhan: "Giá đỡ" },
  { ma: "sleeve", nhan: "Lỗ chờ ống" },
  { ma: "titleblock", nhan: "Khung tên" },
  { ma: "annotation", nhan: "Chú thích" },
];

const NHAN_LOAI_NUT: Record<LoaiNut, string> = {
  thiet_bi: "Thiết bị",
  nut_re: "Điểm rẽ nhánh",
  dau_ho: "Đầu hở",
};

/** Nhãn nguồn quyết định — không truyền tải thông tin chỉ bằng màu (icon + chữ riêng, ADR-0010). */
const NGUON: Record<NguonQuyetDinh, { nhan: string; icon: typeof Ruler; mau: string }> = {
  luat: { nhan: "Luật", icon: Ruler, mau: "text-emerald-300" },
  ngu_nghia: { nhan: "AI · ngữ nghĩa", icon: Sparkles, mau: "text-sky-300" },
  hinh_anh: { nhan: "AI · hình", icon: ScanSearch, mau: "text-violet-300" },
  nguoi_sua: { nhan: "Người sửa", icon: UserPen, mau: "text-amber-300" },
  chua_quyet: { nhan: "Chưa rõ", icon: AlertTriangle, mau: "text-zinc-400" },
};

type NutSchematic = {
  id: string;
  loai: LoaiNut;
  kind: LoaiBlock | null;
  blockName: string | null;
  tag: string | null;
  systemId: string | null;
  x: number;
  y: number;
  nguon: NguonQuyetDinh;
  doTinCay: number | null;
  lyDo: string;
  canNguoiXem?: boolean;
};

type CanhSchematic = {
  id: string;
  from: string;
  to: string;
  size: string | null;
  nguon: NguonQuyetDinh;
  doTinCay: number | null;
  thieu: ("size" | "noi")[];
  diem: Array<[number, number]>;
  lyDo: string;
  canNguoiXem?: boolean;
};

type GraphSchematic = {
  version: number;
  nodes: NutSchematic[];
  edges: CanhSchematic[];
  thongKe: {
    tongNut: number;
    tongCanh: number;
    thietBi: number;
    nutRe: number;
    dauHo: number;
    nutChuaQuyet: number;
    canhChuaQuyet: number;
    canhCoSize: number;
  };
  canhBao: string[];
  goiYNoi?: { tu: string; den: string; doTinCay: number; lyDo: string }[];
};

type BanGhi = {
  id: number;
  projectId: number;
  systemId: string;
  filePath: string;
  graph: GraphSchematic;
  trangThai: "nhap" | "da_duyet";
  duyetBoi: number | null;
  duyetLuc: string | null;
  createdBy: number;
  createdAt: string;
};

const O_NHAP =
  "w-full min-h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100";

/** Chuẩn hoá toạ độ schematic (đơn vị bản vẽ, gốc tuỳ ý) sang khung nhìn SVG 720x420, lật trục Y. */
function dungKhungNhinSvg(graph: GraphSchematic): {
  viewBox: string;
  chieuNut: (x: number, y: number) => [number, number];
} {
  const W = 720;
  const H = 420;
  const PAD = 24;
  const diems: Array<[number, number]> = [
    ...graph.nodes.map((n): [number, number] => [n.x, n.y]),
    ...graph.edges.flatMap((e) => e.diem),
  ];
  if (diems.length === 0) {
    return { viewBox: `0 0 ${W} ${H}`, chieuNut: (x, y) => [x, y] };
  }
  const minX = Math.min(...diems.map((p) => p[0]));
  const maxX = Math.max(...diems.map((p) => p[0]));
  const minY = Math.min(...diems.map((p) => p[1]));
  const maxY = Math.max(...diems.map((p) => p[1]));
  const rongX = maxX - minX || 1;
  const rongY = maxY - minY || 1;
  const scale = Math.min((W - 2 * PAD) / rongX, (H - 2 * PAD) / rongY);
  return {
    viewBox: `0 0 ${W} ${H}`,
    chieuNut: (x, y) => [
      PAD + (x - minX) * scale,
      H - PAD - (y - minY) * scale, // DXF Y hướng lên, SVG Y hướng xuống
    ],
  };
}

const MAU_NUT: Record<LoaiNut, string> = {
  thiet_bi: "fill-sky-400",
  nut_re: "fill-amber-400",
  dau_ho: "fill-rose-400",
};

function SoHoaSvg({ graph }: { graph: GraphSchematic }) {
  const { viewBox, chieuNut } = dungKhungNhinSvg(graph);
  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label="Sơ hoạ đồ thị kết nối từ toạ độ schematic"
      className="w-full h-auto rounded-lg bg-zinc-950 border border-zinc-800"
    >
      {graph.edges.map((e) => {
        const points = e.diem.map(([x, y]) => chieuNut(x, y).join(",")).join(" ");
        return (
          <polyline
            key={e.id}
            points={points}
            fill="none"
            className={e.thieu.length > 0 ? "stroke-amber-500/70" : "stroke-zinc-500"}
            strokeWidth={1.5}
            strokeDasharray={e.thieu.length > 0 ? "4 2" : undefined}
          />
        );
      })}
      {graph.nodes.map((n) => {
        const [cx, cy] = chieuNut(n.x, n.y);
        return (
          <g key={n.id}>
            <circle cx={cx} cy={cy} r={n.loai === "thiet_bi" ? 5 : 3} className={MAU_NUT[n.loai]} />
            <title>
              {n.id} — {NHAN_LOAI_NUT[n.loai]}
              {n.tag ? ` (${n.tag})` : ""}
            </title>
          </g>
        );
      })}
      {/* Chú giải màu nút — không chỉ dựa vào màu (ADR-0010) */}
      <text x={4} y={12} className="fill-zinc-500 text-[8px]">
        ● thiết bị · ● rẽ nhánh · ● đầu hở ({graph.nodes.length} nút, {graph.edges.length} cạnh)
      </text>
    </svg>
  );
}

export default function SchematicGraphPanel() {
  const [mo, setMo] = useState(false);
  const [dxf, setDxf] = useState<File | null>(null);
  const [dangKeo, setDangKeo] = useState(false);
  const [he, setHe] = useState("");
  const [danhSachHe, setDanhSachHe] = useState<string[] | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState<string[]>([]);
  const [lyDoAiTat, setLyDoAiTat] = useState<string | null>(null);
  const [ban, setBan] = useState<BanGhi | null>(null);
  const [thanhCong, setThanhCong] = useState<string | null>(null);
  const [traTheoId, setTraTheoId] = useState("");
  // Tập id nút/cạnh người dùng đã sửa tay trong phiên hiện tại — chỉ những dòng này mới gửi lên
  // PATCH khi "Lưu thay đổi"/"Chốt graph" (server ghi đè đúng phần này, giữ nguyên phần còn lại).
  const [nutDaSua, setNutDaSua] = useState<Set<string>>(new Set());
  const [canhDaSua, setCanhDaSua] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const taiDanhSachHe = useCallback(async () => {
    if (danhSachHe) return;
    const res = await fetch("/api/engineering/cad/rule-pack");
    if (!res.ok) return;
    const data = (await res.json()) as { drawTools?: { systems?: { id: string }[] } };
    setDanhSachHe((data.drawTools?.systems ?? []).map((s) => s.id));
  }, [danhSachHe]);

  function moForm() {
    setMo(true);
    void taiDanhSachHe();
  }

  async function guiTep() {
    if (!dxf || !he) return;
    setDangGui(true);
    setLoi([]);
    setThanhCong(null);
    try {
      const form = new FormData();
      form.append("dxf", dxf);
      form.append("system", he);
      const res = await fetch("/api/engineering/cad/schematic", { method: "POST", body: form });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = (await res.json()) as Partial<BanGhi> & {
        aiDaChay?: boolean;
        lyDoAiKhongChay?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setLoi([data.error ?? "Nạp sơ đồ nguyên lý không thành công"]);
        return;
      }
      setLyDoAiTat(data.lyDoAiKhongChay ?? null);
      setBan({
        id: data.id!,
        projectId: data.projectId!,
        systemId: data.systemId!,
        filePath: "",
        graph: data.graph!,
        trangThai: "nhap",
        duyetBoi: null,
        duyetLuc: null,
        createdBy: 0,
        createdAt: "",
      });
      setNutDaSua(new Set());
      setCanhDaSua(new Set());
      setDxf(null);
    } finally {
      setDangGui(false);
    }
  }

  async function traGraph() {
    const id = Number(traTheoId);
    if (!Number.isInteger(id) || id <= 0) return;
    setDangTai(true);
    setLoi([]);
    setThanhCong(null);
    try {
      const res = await fetch(`/api/engineering/cad/schematic/${id}`);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = (await res.json()) as BanGhi & { error?: string };
      if (!res.ok) {
        setLoi([data.error ?? "Không tra được sơ đồ nguyên lý"]);
        return;
      }
      setBan(data);
      setNutDaSua(new Set());
      setCanhDaSua(new Set());
      setLyDoAiTat(null);
    } finally {
      setDangTai(false);
    }
  }

  function suaNut(id: string, thayDoi: Partial<NutSchematic>) {
    setBan((b) =>
      b
        ? {
            ...b,
            graph: {
              ...b.graph,
              nodes: b.graph.nodes.map((n) =>
                n.id === id ? { ...n, ...thayDoi, nguon: "nguoi_sua", doTinCay: null } : n,
              ),
            },
          }
        : b,
    );
    setNutDaSua((s) => new Set(s).add(id));
  }

  function suaCanh(id: string, thayDoi: Partial<CanhSchematic>) {
    setBan((b) =>
      b
        ? {
            ...b,
            graph: {
              ...b.graph,
              edges: b.graph.edges.map((e) =>
                e.id === id ? { ...e, ...thayDoi, nguon: "nguoi_sua", doTinCay: null } : e,
              ),
            },
          }
        : b,
    );
    setCanhDaSua((s) => new Set(s).add(id));
  }

  async function guiPatch(duyet: boolean) {
    if (!ban) return;
    setDangGui(true);
    setLoi([]);
    try {
      const sua = {
        nodes: ban.graph.nodes
          .filter((n) => nutDaSua.has(n.id))
          .map((n) => ({ id: n.id, kind: n.kind, systemId: n.systemId, tag: n.tag })),
        edges: ban.graph.edges
          .filter((e) => canhDaSua.has(e.id))
          .map((e) => ({ id: e.id, size: e.size })),
      };
      const res = await fetch(`/api/engineering/cad/schematic/${ban.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sua, duyet }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = (await res.json()) as BanGhi & { soPhanTuDoi?: number; error?: string };
      if (!res.ok) {
        setLoi([
          data.error ?? (duyet ? "Chốt graph không thành công" : "Lưu thay đổi không thành công"),
        ]);
        return;
      }
      setBan(data);
      setNutDaSua(new Set());
      setCanhDaSua(new Set());
      setThanhCong(
        duyet
          ? `Đã chốt graph #${data.id} — plugin XBOSS_TUYEN_GOIY tải được từ đây.`
          : `Đã lưu ${data.soPhanTuDoi ?? 0} thay đổi.`,
      );
    } finally {
      setDangGui(false);
    }
  }

  const coThayDoiChuaLuu = nutDaSua.size > 0 || canhDaSua.size > 0;
  const conChuaQuyet = ban ? ban.graph.thongKe.nutChuaQuyet + ban.graph.thongKe.canhChuaQuyet : 0;

  return (
    <Section
      title="Sơ Đồ Nguyên Lý (AI Đọc Schematic)"
      icon={Route}
      description="M117 — nạp DXF sơ đồ nguyên lý, AI dựng đồ thị kết nối (nguồn → trục → nhánh → thiết bị), bạn duyệt/sửa rồi chốt cho plugin sinh tuyến tim gợi ý."
      actions={
        !mo ? (
          <Button size="sm" onClick={moForm}>
            <FileUp className="w-4 h-4" aria-hidden="true" />
            Nạp Sơ Đồ Nguyên Lý
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setMo(false);
              setBan(null);
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

      {mo && !ban && (
        <div className="space-y-3">
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
                {dxf ? dxf.name : "Kéo-thả tệp .dxf sơ đồ nguyên lý vào đây"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Chỉ nhận DXF (M117 §5 non-goal: chưa đọc được PDF/ảnh scan) — xuất DXF từ bản vẽ
                schematic gốc.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".dxf"
                aria-label="Chọn tệp DXF sơ đồ nguyên lý"
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

            <div>
              <label htmlFor="he-schematic" className="block text-xs text-zinc-300 mb-1">
                Hệ của sơ đồ nguyên lý (bắt buộc)
              </label>
              {danhSachHe === null ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <select
                  id="he-schematic"
                  value={he}
                  onChange={(e) => setHe(e.target.value)}
                  className={O_NHAP}
                >
                  <option value="">— chọn hệ —</option>
                  {danhSachHe.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <Button onClick={guiTep} disabled={!dxf || !he || dangGui}>
              {dangGui ? "Đang đọc và dựng đồ thị…" : "Nạp Sơ Đồ Nguyên Lý"}
            </Button>
          </Card>

          <Card className="p-3 space-y-2">
            <label htmlFor="tra-graph-id" className="block text-xs text-zinc-300">
              Hoặc tra một sơ đồ đã nạp trước đó theo mã (chưa có danh sách liệt kê trên web)
            </label>
            <div className="flex gap-2">
              <input
                id="tra-graph-id"
                value={traTheoId}
                onChange={(e) => setTraTheoId(e.target.value)}
                placeholder="vd: 12"
                className={`${O_NHAP} max-w-[10rem]`}
                inputMode="numeric"
              />
              <Button size="sm" variant="ghost" onClick={traGraph} disabled={!traTheoId || dangTai}>
                <Eye className="w-4 h-4" aria-hidden="true" />
                {dangTai ? "Đang tra…" : "Xem"}
              </Button>
            </div>
          </Card>
        </div>
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

      {ban && (
        <>
          <Card className="p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>Graph #{ban.id}</Chip>
              <Chip>Hệ {ban.systemId}</Chip>
              <Chip tone={ban.trangThai === "da_duyet" ? "success" : "warning"} icon={ShieldCheck}>
                {ban.trangThai === "da_duyet" ? "Đã chốt" : "Nháp — chưa chốt"}
              </Chip>
              <Chip>
                {ban.graph.thongKe.tongNut} nút · {ban.graph.thongKe.tongCanh} cạnh
              </Chip>
              {conChuaQuyet > 0 && (
                <Chip tone="warning">{conChuaQuyet} phần tử chưa rõ — cần duyệt</Chip>
              )}
            </div>
            {lyDoAiTat && (
              <p className="flex items-start gap-2 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                {lyDoAiTat}
              </p>
            )}
            {ban.graph.canhBao.length > 0 && (
              <details className="text-xs text-zinc-400">
                <summary className="cursor-pointer">
                  {ban.graph.canhBao.length} cảnh báo từ tầng đọc luật — xem chi tiết
                </summary>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  {ban.graph.canhBao.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          <Card className="p-3">
            <SoHoaSvg graph={ban.graph} />
          </Card>

          <Card className="overflow-x-auto">
            <p className="p-2 text-xs font-semibold text-zinc-300 uppercase tracking-wide">Nút</p>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-900">
                <tr className="text-left text-zinc-400">
                  <th className="p-2 font-medium">Id</th>
                  <th className="p-2 font-medium">Vai trò</th>
                  <th className="p-2 font-medium">Block / Tag</th>
                  <th className="p-2 font-medium">Loại</th>
                  <th className="p-2 font-medium">Hệ</th>
                  <th className="p-2 font-medium">Căn cứ</th>
                </tr>
              </thead>
              <tbody>
                {ban.graph.nodes.map((n) => {
                  const nguon = NGUON[n.nguon];
                  const Icon = nguon.icon;
                  const suaDuoc = n.loai === "thiet_bi" && ban.trangThai !== "da_duyet";
                  return (
                    <tr key={n.id} className="border-t border-zinc-800 align-top">
                      <td className="p-2 font-mono text-zinc-300">{n.id}</td>
                      <td className="p-2">
                        {NHAN_LOAI_NUT[n.loai]}
                        {n.canNguoiXem && (
                          <span className="ml-1 inline-flex items-center gap-1 text-amber-300">
                            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                            cần xem lại
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <span className="text-zinc-100">{n.blockName ?? "—"}</span>
                        {suaDuoc ? (
                          <input
                            value={n.tag ?? ""}
                            onChange={(e) => suaNut(n.id, { tag: e.target.value || null })}
                            aria-label={`Tag của nút ${n.id}`}
                            className={`${O_NHAP} mt-1`}
                            placeholder="mã hiệu thiết bị"
                          />
                        ) : (
                          n.tag && <p className="mt-1 text-zinc-500">{n.tag}</p>
                        )}
                      </td>
                      <td className="p-2">
                        {suaDuoc ? (
                          <select
                            value={n.kind ?? ""}
                            onChange={(e) =>
                              suaNut(n.id, { kind: (e.target.value || null) as LoaiBlock | null })
                            }
                            aria-label={`Loại block của nút ${n.id}`}
                            className={O_NHAP}
                          >
                            <option value="">— chưa rõ —</option>
                            {LOAI_KHOI.map((l) => (
                              <option key={l.ma} value={l.ma}>
                                {l.nhan}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-zinc-400">
                            {LOAI_KHOI.find((l) => l.ma === n.kind)?.nhan ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {suaDuoc ? (
                          <input
                            value={n.systemId ?? ""}
                            onChange={(e) => suaNut(n.id, { systemId: e.target.value || null })}
                            aria-label={`Hệ của nút ${n.id}`}
                            className={O_NHAP}
                          />
                        ) : (
                          <span className="text-zinc-400">{n.systemId ?? "—"}</span>
                        )}
                      </td>
                      <td className="p-2">
                        <span className={`flex items-center gap-1 ${nguon.mau}`}>
                          <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          {nguon.nhan}
                          {n.doTinCay !== null && (
                            <span className="text-zinc-500">· {Math.round(n.doTinCay * 100)}%</span>
                          )}
                        </span>
                        {n.lyDo && <p className="mt-1 max-w-xs text-zinc-500">{n.lyDo}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto">
            <p className="p-2 text-xs font-semibold text-zinc-300 uppercase tracking-wide">Cạnh</p>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-900">
                <tr className="text-left text-zinc-400">
                  <th className="p-2 font-medium">Id</th>
                  <th className="p-2 font-medium">Nối</th>
                  <th className="p-2 font-medium">Kích thước</th>
                  <th className="p-2 font-medium">Thiếu</th>
                  <th className="p-2 font-medium">Căn cứ</th>
                </tr>
              </thead>
              <tbody>
                {ban.graph.edges.map((e) => {
                  const nguon = NGUON[e.nguon];
                  const Icon = nguon.icon;
                  const suaDuoc = ban.trangThai !== "da_duyet";
                  return (
                    <tr key={e.id} className="border-t border-zinc-800 align-top">
                      <td className="p-2 font-mono text-zinc-300">{e.id}</td>
                      <td className="p-2 font-mono text-zinc-400">
                        {e.from} → {e.to}
                      </td>
                      <td className="p-2">
                        {suaDuoc ? (
                          <input
                            value={e.size ?? ""}
                            onChange={(ev) => suaCanh(e.id, { size: ev.target.value || null })}
                            aria-label={`Kích thước cạnh ${e.id}`}
                            className={O_NHAP}
                            placeholder="600x300 / DN100 / Ø32"
                          />
                        ) : (
                          <span className="text-zinc-400">{e.size ?? "—"}</span>
                        )}
                      </td>
                      <td className="p-2">
                        {e.thieu.length === 0 ? (
                          <span className="text-zinc-600">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {e.thieu.map((t) => (
                              <Chip key={t} tone="warning">
                                {t === "size" ? "thiếu size" : "nhánh đứt"}
                              </Chip>
                            ))}
                          </div>
                        )}
                        {e.canNguoiXem && (
                          <span className="mt-1 flex items-center gap-1 text-amber-300">
                            <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                            cần xem lại
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <span className={`flex items-center gap-1 ${nguon.mau}`}>
                          <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          {nguon.nhan}
                          {e.doTinCay !== null && (
                            <span className="text-zinc-500">· {Math.round(e.doTinCay * 100)}%</span>
                          )}
                        </span>
                        {e.lyDo && <p className="mt-1 max-w-xs text-zinc-500">{e.lyDo}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {ban.trangThai === "da_duyet" ? (
            <Card className="p-3 flex items-start gap-2">
              <ShieldCheck
                className="w-4 h-4 shrink-0 mt-0.5 text-emerald-300"
                aria-hidden="true"
              />
              <p className="text-xs text-emerald-300">
                Graph đã chốt — không sửa được nữa, plugin XBOSS_TUYEN_GOIY dùng đúng bản này.
              </p>
            </Card>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => guiPatch(false)}
                disabled={dangGui || !coThayDoiChuaLuu}
              >
                {dangGui ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="w-4 h-4" aria-hidden="true" />
                )}
                Lưu Thay Đổi
              </Button>
              <Button onClick={() => guiPatch(true)} disabled={dangGui}>
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                {dangGui ? "Đang chốt…" : "Chốt Graph"}
              </Button>
              {conChuaQuyet > 0 && (
                <p className="text-xs text-amber-300">
                  Còn {conChuaQuyet} phần tử chưa rõ — vẫn chốt được, nhưng plugin sẽ thiếu phần đó
                  khi sinh tuyến gợi ý. Nên sửa trước nếu có thể.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
