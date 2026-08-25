"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Blocks,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ClipboardList,
  ImageOff,
  Check,
  X,
} from "lucide-react";
import { Button, ButtonLink, Chip } from "@/app/components/ui";
import type { ChipTone } from "@/app/components/ui/Chip";
import { Skeleton } from "@/app/components/Skeleton";
import { redirectToLogin, fetchMe } from "@/app/lib/me";
import { useBlockProposals } from "../hooks/useBlockProposals";
import type { BlockProposal, BlockProposalKind, BlockProposalStatus } from "../types";

// M100 PR2 (§13) — mục "Thư viện block" của bảng điều khiển plugin: version đang phát hành,
// lịch sử phát hành, nút tải, và form phát hành version mới (Admin/PM).
//
// Phát hành cần 3 tệp: `.dwg` thư viện (máy chủ chỉ lưu, không đọc — M100 §12), bản `.dxf`
// sidecar của chính thư viện đó (máy chủ đối chiếu "block khai trong manifest có thật không"),
// và `manifest.json` (M100 §11). Sai → 422 kèm danh sách lỗi tiếng Việt hiện ngay dưới form.

type TomTatBlockLib = {
  version: string;
  soBlock: number;
  dwgSha256: string;
  nguoiPhatHanh: string | null;
  ngayPhatHanh: string | null;
};

type DuLieuBlockLib = {
  hienHanh: TomTatBlockLib | null;
  lichSu: TomTatBlockLib[];
  choPhatHanh: boolean;
};

type KetQuaKiemDinh = { errors: string[]; warnings: string[] };

function ngay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN");
}

// M103 — nhãn tiếng Việt cho loại block & trạng thái đề xuất.
const NHAN_LOAI: Record<BlockProposalKind, string> = {
  fitting: "Phụ kiện",
  equipment: "Thiết bị",
  titleblock: "Khung tên",
  support: "Giá đỡ",
  sleeve: "Lỗ chờ ống",
};

const NHAN_TRANG_THAI: Record<BlockProposalStatus, { nhan: string; tone: ChipTone }> = {
  pending: { nhan: "Chờ duyệt", tone: "info" },
  approved: { nhan: "Đã duyệt", tone: "success" },
  rejected: { nhan: "Từ chối", tone: "danger" },
  stale: { nhan: "Lỗi thời — cần làm lại", tone: "warning" },
};

// Nhúng SVG qua thẻ <img src="data:..."> (không dùng dangerouslySetInnerHTML) — trình duyệt
// không thực thi script/handler bên trong SVG khi tải theo đường này, an toàn dù nội dung do
// người đề xuất tạo ra từ bản vẽ của họ.
function anhXemTruoc(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function BlockProposalRow({
  item,
  coQuyenDuyet,
  dangXuLy,
  onDuyet,
  onTuChoi,
}: {
  item: BlockProposal;
  coQuyenDuyet: boolean;
  dangXuLy: boolean;
  onDuyet: (item: BlockProposal) => void;
  onTuChoi: (item: BlockProposal) => void;
}) {
  const trangThai = NHAN_TRANG_THAI[item.status];
  return (
    <li className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row gap-3">
      <div className="shrink-0 w-16 h-16 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
        {item.preview_svg ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL cục bộ, không phải ảnh từ xa
          <img
            src={anhXemTruoc(item.preview_svg)}
            alt={`Xem trước block ${item.block_name}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <ImageOff className="w-6 h-6 text-zinc-600" strokeWidth={1.5} aria-hidden="true" />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-bold text-sm text-zinc-100 truncate">
            {item.block_name}
          </span>
          <Chip tone="accent">{NHAN_LOAI[item.kind]}</Chip>
          <Chip tone={trangThai.tone}>{trangThai.nhan}</Chip>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
          {item.system_id && <span>Hệ: {item.system_id}</span>}
          {item.takeoff_item_id && <span>Hạng mục bóc tách: {item.takeoff_item_id}</span>}
          {item.paper_size && <span>Khổ giấy: {item.paper_size}</span>}
          <span>Base version: {item.base_lib_version}</span>
        </div>
        {item.note && <p className="text-xs text-zinc-400">{item.note}</p>}
        <p className="text-[11px] text-zinc-500">
          Đề xuất bởi <span className="text-zinc-300">{item.proposed_by_name}</span> —{" "}
          {ngay(item.created_at)}
        </p>
        {item.status === "rejected" && item.reject_reason && (
          <p className="text-xs text-red-300">Lý do từ chối: {item.reject_reason}</p>
        )}
        {item.status === "approved" && (
          <p className="text-xs text-emerald-300">
            Đã phát hành version {item.published_version ?? "—"}
            {item.decided_by_name ? ` — duyệt bởi ${item.decided_by_name}` : ""}
          </p>
        )}
      </div>

      {coQuyenDuyet && item.status === "pending" && (
        <div className="flex sm:flex-col gap-2 shrink-0">
          <Button
            size="sm"
            variant="primary"
            icon={Check}
            disabled={dangXuLy}
            onClick={() => onDuyet(item)}
            aria-label={`Duyệt và phát hành block ${item.block_name}`}
          >
            Duyệt & Phát Hành
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon={X}
            disabled={dangXuLy}
            onClick={() => onTuChoi(item)}
            aria-label={`Từ chối đề xuất block ${item.block_name}`}
          >
            Từ Chối
          </Button>
        </div>
      )}
    </li>
  );
}

export default function ThuVienBlockPanel() {
  const [duLieu, setDuLieu] = useState<DuLieuBlockLib | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [kiemDinh, setKiemDinh] = useState<KetQuaKiemDinh | null>(null);
  const [thanhCong, setThanhCong] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // M103 — Đề xuất block chờ duyệt: chỉ Admin/PM thấy nút Duyệt/Từ chối.
  const [coQuyenDuyet, setCoQuyenDuyet] = useState(false);
  const [loiHanhDongDeXuat, setLoiHanhDongDeXuat] = useState<string | null>(null);
  const { deXuat, loiDeXuat, dangXuLyId, taiDeXuat, duyet, tuChoi } = useBlockProposals();

  const tai = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/cad/dashboard");
      if (res.status === 401) return redirectToLogin();
      const data = await res.json();
      if (!res.ok) {
        setLoi(data.error || "Không tải được thư viện block.");
        return;
      }
      setLoi(null);
      setDuLieu(data.blockLib ?? { hienHanh: null, lichSu: [], choPhatHanh: false });
    } catch {
      setLoi("Lỗi mạng — không tải được thư viện block.");
    }
  }, []);

  useEffect(() => {
    void tai();
    void taiDeXuat();
    void fetchMe().then((me) => setCoQuyenDuyet(me?.role === "admin" || me?.role === "pm"));
  }, [tai, taiDeXuat]);

  async function xuLyDuyet(item: BlockProposal) {
    setLoiHanhDongDeXuat(null);
    if (
      !window.confirm(
        `Duyệt và phát hành block "${item.block_name}"? Thư viện block hiện hành sẽ có version mới ngay lập tức (không thể hoàn tác).`,
      )
    ) {
      return;
    }
    const kq = await duyet(item.id);
    if (!kq.ok) {
      setLoiHanhDongDeXuat(kq.error ?? "Duyệt đề xuất thất bại.");
      return;
    }
    // Sau duyệt: refresh mục "Version Đang Phát Hành" để phản ánh version mới ngay.
    await tai();
  }

  async function xuLyTuChoi(item: BlockProposal) {
    setLoiHanhDongDeXuat(null);
    const ly_do = window.prompt(`Nhập lý do từ chối đề xuất "${item.block_name}":`, "");
    if (ly_do === null) return; // huỷ
    const lyDo = ly_do.trim();
    if (!lyDo) {
      setLoiHanhDongDeXuat("Phải nhập lý do từ chối.");
      return;
    }
    const kq = await tuChoi(item.id, lyDo);
    if (!kq.ok) {
      setLoiHanhDongDeXuat(kq.error ?? "Từ chối đề xuất thất bại.");
    }
  }

  async function phatHanh(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDangGui(true);
    setKiemDinh(null);
    setThanhCong(null);
    try {
      const res = await fetch("/api/engineering/cad/block-lib", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      if (res.status === 401) return redirectToLogin();
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && data.kiemDinh) {
        setKiemDinh({ errors: data.kiemDinh.errors ?? [], warnings: data.kiemDinh.warnings ?? [] });
        return;
      }
      if (!res.ok) {
        setKiemDinh({ errors: [data.error || "Phát hành thất bại."], warnings: [] });
        return;
      }
      setKiemDinh({ errors: [], warnings: data.kiemDinh?.warnings ?? [] });
      setThanhCong(
        data.idempotent
          ? `Version ${data.version} đã có sẵn với đúng nội dung này — không tạo bản đôi.`
          : `Đã phát hành thư viện block version ${data.version}.`,
      );
      formRef.current?.reset();
      await tai();
    } catch {
      setKiemDinh({ errors: ["Lỗi mạng — không gửi được tệp lên máy chủ."], warnings: [] });
    } finally {
      setDangGui(false);
    }
  }

  return (
    <section className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="space-y-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
            <Blocks className="w-4 h-4 text-violet-400" strokeWidth={1.75} />
            Thư Viện Block Chuẩn (Bộ Lệnh Vẽ XBOSS_VE_*)
          </h2>
          <p className="text-xs text-zinc-400">
            Thư viện block dùng chung toàn công ty, có version — plugin tự tải khi chạy XBOSS_LOGIN
            và kiểm hash trước khi nhập định nghĩa block vào bản vẽ.
          </p>
        </div>
        <Button
          size="sm"
          icon={RefreshCw}
          onClick={() => void tai()}
          aria-label="Tải lại thư viện block"
        >
          Tải Lại
        </Button>
      </div>

      {loi && (
        <p className="flex items-center gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {loi}
        </p>
      )}

      {duLieu === null ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Version đang phát hành */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
              Version Đang Phát Hành
            </div>
            {duLieu.hienHanh ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span className="px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 font-mono font-bold text-violet-300">
                    {duLieu.hienHanh.version}
                  </span>
                  <span>{duLieu.hienHanh.soBlock} block</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {ngay(duLieu.hienHanh.ngayPhatHanh)} — {duLieu.hienHanh.nguoiPhatHanh ?? "—"}
                  </span>
                </div>
                {/* Gắn `v=<version>` vào link tải: service worker cache API GET theo kiểu
                    stale-while-revalidate, URL khác nhau theo version thì không đời nào phục vụ
                    nhầm tệp của bản phát hành cũ. */}
                <div className="flex flex-wrap gap-2">
                  <ButtonLink
                    size="sm"
                    variant="primary"
                    icon={Download}
                    href={`/api/engineering/cad/block-lib?v=${encodeURIComponent(duLieu.hienHanh.version)}`}
                    download={`xboss-block-lib-${duLieu.hienHanh.version}.dwg`}
                  >
                    Tải Tệp .DWG
                  </ButtonLink>
                  <ButtonLink
                    size="sm"
                    icon={Download}
                    href={`/api/engineering/cad/block-lib?manifest=1&v=${encodeURIComponent(duLieu.hienHanh.version)}`}
                    download={`xboss-block-lib-${duLieu.hienHanh.version}.json`}
                  >
                    Tải Manifest
                  </ButtonLink>
                </div>
                <p className="text-[11px] text-zinc-500 font-mono break-all">
                  sha256 {duLieu.hienHanh.dwgSha256.slice(0, 24)}…
                </p>
              </>
            ) : (
              <p className="text-xs text-zinc-400">
                Chưa phát hành thư viện nào. Lệnh XBOSS_VE_PHUKIEN / XBOSS_VE_THIETBI sẽ từ chối
                chạy cho tới khi có thư viện; XBOSS_VE (vẽ tuyến) vẫn dùng được vì chỉ cần rule
                pack.
              </p>
            )}
          </div>

          {/* Lịch sử phát hành */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
              Lịch Sử Phát Hành
            </div>
            {duLieu.lichSu.length === 0 ? (
              <p className="text-xs text-zinc-400">Chưa có bản phát hành nào.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-zinc-400">
                    <tr className="border-b border-zinc-800">
                      <th className="text-left font-semibold py-2 pr-3">Version</th>
                      <th className="text-left font-semibold py-2 pr-3">Số block</th>
                      <th className="text-left font-semibold py-2 pr-3">Ngày</th>
                      <th className="text-left font-semibold py-2">Người phát hành</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {duLieu.lichSu.map((r) => (
                      <tr key={r.version} className="border-b border-zinc-900">
                        <td className="py-2 pr-3 font-mono font-bold text-zinc-100">{r.version}</td>
                        <td className="py-2 pr-3">{r.soBlock}</td>
                        <td className="py-2 pr-3">{ngay(r.ngayPhatHanh)}</td>
                        <td className="py-2">{r.nguoiPhatHanh ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Form phát hành — chỉ Admin/PM (máy chủ vẫn kiểm lại quyền ở POST) */}
      {duLieu?.choPhatHanh && (
        <form
          ref={formRef}
          onSubmit={phatHanh}
          className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3"
        >
          <div className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
            Phát Hành Version Mới
          </div>
          <p className="text-[11px] text-zinc-500">
            Thư viện là append-only: mỗi lần sửa block phải tăng <code>version</code> trong
            manifest. Nộp đủ 3 tệp — bản DXF sidecar để máy chủ đối chiếu block khai trong manifest
            có thật hay không (máy chủ không đọc tệp DWG).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1 text-xs text-zinc-300">
              <span className="font-semibold">Tệp thư viện (.dwg)</span>
              <input
                type="file"
                name="dwg"
                required
                accept=".dwg"
                className="block w-full text-xs text-zinc-400 file:mr-2 file:min-h-10 file:px-3 file:rounded-lg file:border file:border-zinc-700 file:bg-zinc-800 file:text-zinc-100 file:text-xs file:font-semibold hover:file:bg-zinc-700"
              />
            </label>
            <label className="space-y-1 text-xs text-zinc-300">
              <span className="font-semibold">Bản DXF sidecar (.dxf)</span>
              <input
                type="file"
                name="dxf"
                required
                accept=".dxf"
                className="block w-full text-xs text-zinc-400 file:mr-2 file:min-h-10 file:px-3 file:rounded-lg file:border file:border-zinc-700 file:bg-zinc-800 file:text-zinc-100 file:text-xs file:font-semibold hover:file:bg-zinc-700"
              />
            </label>
            <label className="space-y-1 text-xs text-zinc-300">
              <span className="font-semibold">Manifest (.json)</span>
              <input
                type="file"
                name="manifest"
                required
                accept=".json,application/json"
                className="block w-full text-xs text-zinc-400 file:mr-2 file:min-h-10 file:px-3 file:rounded-lg file:border file:border-zinc-700 file:bg-zinc-800 file:text-zinc-100 file:text-xs file:font-semibold hover:file:bg-zinc-700"
              />
            </label>
          </div>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            icon={Upload}
            disabled={dangGui}
            aria-label="Phát hành thư viện block version mới"
          >
            {dangGui ? "Đang kiểm định…" : "Phát Hành"}
          </Button>

          {thanhCong && (
            <p className="flex items-start gap-1.5 text-xs text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              {thanhCong}
            </p>
          )}
          {kiemDinh && kiemDinh.errors.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-red-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Không phát hành được — {kiemDinh.errors.length} lỗi:
              </p>
              <ul className="list-disc pl-6 space-y-0.5 text-xs text-red-300">
                {kiemDinh.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {kiemDinh && kiemDinh.warnings.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {kiemDinh.warnings.length} cảnh báo (không chặn phát hành):
              </p>
              <ul className="list-disc pl-6 space-y-0.5 text-xs text-amber-300">
                {kiemDinh.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </form>
      )}

      {/* ═══ M103 — Đề xuất block vào thư viện từ AutoCAD (hàng chờ + duyệt) ═══ */}
      <div className="pt-4 border-t border-zinc-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-200 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-sky-400" strokeWidth={1.75} />
            Đề Xuất Chờ Duyệt ({deXuat ? deXuat.filter((d) => d.status === "pending").length : 0})
          </h3>
          <Button
            size="sm"
            icon={RefreshCw}
            onClick={() => void taiDeXuat()}
            aria-label="Tải lại danh sách đề xuất block"
          >
            Tải Lại
          </Button>
        </div>

        <p className="text-xs text-zinc-400">
          {coQuyenDuyet
            ? "Đề xuất block gửi từ lệnh XBOSS_VE_DEXUAT trong AutoCAD — duyệt sẽ phát hành ngay version mới của thư viện, không sửa được sau khi duyệt."
            : "Đề xuất block bạn đã gửi từ lệnh XBOSS_VE_DEXUAT trong AutoCAD, kèm trạng thái duyệt."}
        </p>

        {loiDeXuat && (
          <p className="flex items-center gap-1.5 text-xs text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {loiDeXuat}
          </p>
        )}
        {loiHanhDongDeXuat && (
          <p className="flex items-center gap-1.5 text-xs text-red-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {loiHanhDongDeXuat}
          </p>
        )}

        {deXuat === null ? (
          <Skeleton className="h-20 w-full" />
        ) : deXuat.length === 0 ? (
          <p className="text-xs text-zinc-400">
            {coQuyenDuyet
              ? "Chưa có đề xuất block nào chờ duyệt."
              : "Bạn chưa gửi đề xuất block nào."}
          </p>
        ) : (
          <ul className="space-y-2">
            {deXuat.map((dx) => (
              <BlockProposalRow
                key={dx.id}
                item={dx}
                coQuyenDuyet={coQuyenDuyet}
                dangXuLy={dangXuLyId === dx.id}
                onDuyet={xuLyDuyet}
                onTuChoi={xuLyTuChoi}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
