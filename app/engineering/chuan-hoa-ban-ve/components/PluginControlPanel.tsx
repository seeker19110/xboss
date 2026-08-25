"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plug,
  Download,
  MonitorSmartphone,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileStack,
  ChevronDown,
  ChevronRight,
  Ruler,
  BookOpen,
} from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { Button, ButtonLink } from "@/app/components/ui";
import { redirectToLogin } from "@/app/lib/me";

// M99 PR6 — Bảng điều khiển plugin AutoCAD (§13): rule pack đang phát hành (kèm nút tải JSON
// cho XBOSS_RULEPACK), nút tải gói cài plugin, lịch sử bản vẽ plugin đã tải lên + kết quả
// kiểm định phía server, lối sang trang quản lý token/thiết bị.

type RulePackTomTat = {
  version: string;
  soNhomLayer: number;
  soHangMucBocTach: number;
};

type TomTatKlBoc = {
  tongDong: number;
  theoHe: { nhan: string; khoiLuong: number }[];
  theoVung: { nhan: string; khoiLuong: number }[];
};

type BuocChuanHoa = {
  buoc: string;
  hangMuc: string;
  truoc: string;
  sau: string;
  soLuong: number;
};

type LuotUpload = {
  revisionId: number;
  drawingCode: string;
  drawingName: string;
  rev: string;
  status: string;
  submittedAt: string | null;
  rulePackVersion: string | null;
  nguoiTaiLen: string | null;
  kiemDinh: { ok: boolean; soLoi: number; soCanhBao: number; canhBao: string[] } | null;
  klBoc: TomTatKlBoc | null;
  buoc: BuocChuanHoa[];
};

/** Biểu đồ thanh ngang tối giản (zinc/emerald, ADR-0009) — không kéo thêm recharts cho một
 * bảng nhỏ trong panel đã có sẵn nhiều biểu đồ nặng hơn ở nơi khác. */
function BieuDoThanhNgang({ muc }: { muc: { nhan: string; khoiLuong: number }[] }) {
  if (muc.length === 0) return null;
  const max = Math.max(...muc.map((m) => m.khoiLuong), 1);
  return (
    <div className="space-y-1">
      {muc.map((m) => (
        <div key={m.nhan} className="flex items-center gap-2 text-[11px]">
          <span className="w-32 truncate text-zinc-400" title={m.nhan}>
            {m.nhan}
          </span>
          <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.max((m.khoiLuong / max) * 100, 2)}%` }}
            />
          </div>
          <span className="w-16 text-right font-mono text-zinc-300">
            {m.khoiLuong.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Danh sách bước chuẩn hoá đã chạy, gộp theo tên bước (khớp cách hiện trong AutoCAD —
 * StandardizeReport.ToVietnameseText). Thuần hiển thị, không tải thêm dữ liệu. */
function DanhSachBuocChuanHoa({ buoc }: { buoc: BuocChuanHoa[] }) {
  if (buoc.length === 0) return null;
  const nhomTheoBuoc = new Map<string, BuocChuanHoa[]>();
  for (const b of buoc) {
    const nhom = nhomTheoBuoc.get(b.buoc) ?? [];
    nhom.push(b);
    nhomTheoBuoc.set(b.buoc, nhom);
  }
  return (
    <div className="space-y-2">
      {[...nhomTheoBuoc.entries()].map(([ten, dong]) => (
        <div key={ten} className="space-y-1">
          <div className="text-[11px] font-bold text-zinc-300">{ten}</div>
          <ul className="space-y-0.5">
            {dong.map((b, i) => (
              <li key={i} className="text-[11px] text-zinc-400">
                {b.hangMuc}: {b.truoc} → {b.sau} ({b.soLuong})
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const NHAN_TRANG_THAI: Record<string, string> = {
  submitted: "Chờ duyệt",
  commented: "Có ý kiến",
  approved: "Đã duyệt",
  approved_with_comments: "Duyệt kèm ý kiến",
  rejected: "Từ chối",
  superseded: "Đã thay thế",
};

function ngay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN");
}

export default function PluginControlPanel() {
  const [rulePack, setRulePack] = useState<RulePackTomTat | null>(null);
  const [pluginUrl, setPluginUrl] = useState<string | null>(null);
  const [lichSu, setLichSu] = useState<LuotUpload[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [moRong, setMoRong] = useState<number | null>(null);

  const tai = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/cad/dashboard");
      if (res.status === 401) return redirectToLogin();
      const data = await res.json();
      if (!res.ok) {
        setLoi(data.error || "Không tải được bảng điều khiển plugin.");
        setLichSu([]);
        return;
      }
      setLoi(null);
      setRulePack(data.rulePack ?? null);
      setPluginUrl(data.pluginUrl ?? null);
      setLichSu(data.lichSu ?? []);
    } catch {
      setLoi("Lỗi mạng — không tải được bảng điều khiển plugin.");
      setLichSu([]);
    }
  }, []);

  useEffect(() => {
    void tai();
  }, [tai]);

  return (
    <section className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="space-y-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
            <Plug className="w-4 h-4 text-violet-400" />
            Bảng Điều Khiển Plugin AutoCAD
          </h2>
          <p className="text-xs text-zinc-400">
            Chuẩn hóa và bóc tách khối lượng chạy trong AutoCAD bằng plugin (lệnh XBOSS_*). Trang
            này quản lý bộ quy tắc đang phát hành, gói cài và các bản vẽ plugin đã gửi về.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => void tai()}
            aria-label="Tải lại bảng điều khiển plugin"
          >
            Tải Lại
          </Button>
          <ButtonLink
            href="/engineering/cai-dat-plugin"
            variant="secondary"
            size="sm"
            icon={BookOpen}
            aria-label="Xem hướng dẫn cài đặt plugin AutoCAD"
          >
            Hướng Dẫn Cài Đặt
          </ButtonLink>
          <ButtonLink
            href="/engineering/thiet-bi-cad"
            variant="secondary"
            size="sm"
            icon={MonitorSmartphone}
            aria-label="Quản lý thiết bị và token AutoCAD"
          >
            Thiết Bị &amp; Token
          </ButtonLink>
        </div>
      </div>

      {loi && (
        <div className="flex items-center gap-2 flex-wrap">
          <p className="flex items-center gap-1.5 text-xs text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {loi}
          </p>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void tai()}>
            Thử Lại
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Rule pack đang phát hành */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
          <div className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
            Bộ Quy Tắc Đang Phát Hành
          </div>
          {rulePack ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/30 font-mono font-bold text-violet-300">
                  {rulePack.version}
                </span>
                <span>{rulePack.soNhomLayer} nhóm layer</span>
                <span aria-hidden="true">·</span>
                <span>{rulePack.soHangMucBocTach} hạng mục bóc tách</span>
              </div>
              <ButtonLink
                href="/api/engineering/cad/rule-pack"
                download={`xboss-rule-pack-${rulePack.version}.json`}
                rel="noopener"
                variant="secondary"
                size="sm"
                icon={Download}
                aria-label={`Tải bộ quy tắc JSON phiên bản ${rulePack.version} cho lệnh XBOSS_RULEPACK`}
              >
                Tải JSON (cho XBOSS_RULEPACK)
              </ButtonLink>
              <p className="text-[11px] text-zinc-500">
                Plugin tự cập nhật bộ quy tắc khi chạy XBOSS_LOGIN; tệp JSON chỉ cần khi máy trạm
                không ra được mạng nội bộ.
              </p>
            </>
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </div>

        {/* Gói cài plugin */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
          <div className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
            Gói Cài Plugin (AutoCAD 2026)
          </div>
          {pluginUrl ? (
            <ButtonLink
              href={pluginUrl}
              download
              rel="noopener"
              variant="primary"
              size="sm"
              icon={Download}
              aria-label="Tải gói cài plugin AutoCAD"
            >
              Tải Gói Cài Plugin
            </ButtonLink>
          ) : (
            <p className="text-xs text-zinc-400">
              Quản trị chưa khai đường tải gói cài (biến <code>XBOSS_PLUGIN_URL</code>). Xem{" "}
              <ButtonLink
                href="/engineering/cai-dat-plugin"
                variant="secondary"
                size="sm"
                icon={BookOpen}
                aria-label="Xem hướng dẫn cài đặt plugin AutoCAD"
              >
                Hướng Dẫn Cài Đặt
              </ButtonLink>{" "}
              để biết cách tự dựng gói hoặc hỏi quản trị hệ thống.
            </p>
          )}
          <p className="text-[11px] text-zinc-500">
            Plugin chỉ chạy trên AutoCAD 2026 (.NET 10). Xem{" "}
            <Link
              href="/engineering/cai-dat-plugin"
              className="text-zinc-300 hover:text-zinc-100 underline underline-offset-2"
            >
              bảng lệnh đầy đủ
            </Link>{" "}
            trong trang hướng dẫn cài đặt.
          </p>
        </div>
      </div>

      {/* Lịch sử bản vẽ plugin tải lên */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-zinc-200 uppercase tracking-wide flex items-center gap-2">
            <FileStack className="w-3.5 h-3.5 text-sky-400" />
            Bản Vẽ Plugin Đã Gửi Về &amp; Kết Quả Kiểm Định
          </div>
          {lichSu !== null && lichSu.some((r) => r.klBoc !== null) && (
            <ButtonLink
              href="/api/engineering/cad/takeoff-export"
              download="xboss-kl-boc-gop.xlsx"
              rel="noopener"
              variant="primary"
              size="sm"
              icon={Ruler}
              aria-label="Tải file Excel gộp khối lượng đã bóc từ các bản vẽ plugin"
            >
              Tải Excel Gộp KL Đã Bóc
            </ButtonLink>
          )}
        </div>
        {lichSu === null ? (
          <Skeleton className="h-24 w-full" />
        ) : lichSu.length === 0 ? (
          <p className="text-xs text-zinc-400">
            Chưa có bản vẽ nào gửi từ plugin. Trong AutoCAD chạy XBOSS_UPLOAD sau khi chuẩn hóa.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-zinc-400">
                <tr className="border-b border-zinc-800">
                  <th className="text-left font-semibold py-2 pr-3" />
                  <th className="text-left font-semibold py-2 pr-3">Bản vẽ</th>
                  <th className="text-left font-semibold py-2 pr-3">Rev</th>
                  <th className="text-left font-semibold py-2 pr-3">Ngày gửi</th>
                  <th className="text-left font-semibold py-2 pr-3">Người gửi</th>
                  <th className="text-left font-semibold py-2 pr-3">Rule pack</th>
                  <th className="text-left font-semibold py-2 pr-3">Trạng thái</th>
                  <th className="text-left font-semibold py-2 pr-3">Kiểm định</th>
                  <th className="text-left font-semibold py-2">KL Bóc</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {lichSu.map((r) => {
                  const dangMo = moRong === r.revisionId;
                  const canhBao = r.kiemDinh?.canhBao ?? [];
                  // Chỉ mở rộng được khi có ít nhất một trong: KL bóc, bước chuẩn hoá, cảnh báo.
                  const coTheMoRong = r.klBoc !== null || r.buoc.length > 0 || canhBao.length > 0;
                  return (
                    <Fragment key={r.revisionId}>
                      <tr
                        className={`border-b border-zinc-900 ${coTheMoRong ? "cursor-pointer hover:bg-zinc-800/40" : ""}`}
                        onClick={() => coTheMoRong && setMoRong(dangMo ? null : r.revisionId)}
                      >
                        <td className="py-2 pl-1 text-zinc-500">
                          {coTheMoRong &&
                            (dangMo ? (
                              <ChevronDown className="w-3.5 h-3.5" aria-label="Thu gọn chi tiết" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" aria-label="Xem chi tiết" />
                            ))}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="font-mono font-bold text-zinc-100">{r.drawingCode}</span>
                          <span className="text-zinc-500"> — {r.drawingName}</span>
                        </td>
                        <td className="py-2 pr-3 font-mono">{r.rev}</td>
                        <td className="py-2 pr-3">{ngay(r.submittedAt)}</td>
                        <td className="py-2 pr-3">{r.nguoiTaiLen ?? "—"}</td>
                        <td className="py-2 pr-3 font-mono">{r.rulePackVersion ?? "—"}</td>
                        <td className="py-2 pr-3">{NHAN_TRANG_THAI[r.status] ?? r.status}</td>
                        <td className="py-2 pr-3">
                          {r.kiemDinh === null ? (
                            <span className="text-zinc-500">—</span>
                          ) : r.kiemDinh.ok && r.kiemDinh.soCanhBao === 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              Đạt
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-amber-300"
                              title={r.kiemDinh.canhBao.join(" · ")}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {r.kiemDinh.ok
                                ? `Đạt, ${r.kiemDinh.soCanhBao} cảnh báo`
                                : `${r.kiemDinh.soLoi} lỗi`}
                            </span>
                          )}
                        </td>
                        <td className="py-2">
                          {r.klBoc ? (
                            <span className="text-zinc-400">{r.klBoc.tongDong} dòng</span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      </tr>
                      {dangMo && coTheMoRong && (
                        <tr className="border-b border-zinc-900 bg-zinc-950/60">
                          <td />
                          <td colSpan={8} className="py-3 pr-3 space-y-4">
                            {r.klBoc && (r.klBoc.theoHe.length > 0 || r.klBoc.theoVung.length > 0) && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {r.klBoc.theoHe.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[11px] font-bold text-zinc-400 uppercase">
                                      KL theo hệ
                                    </div>
                                    <BieuDoThanhNgang muc={r.klBoc.theoHe} />
                                  </div>
                                )}
                                {r.klBoc.theoVung.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="text-[11px] font-bold text-zinc-400 uppercase">
                                      KL theo vùng
                                    </div>
                                    <BieuDoThanhNgang muc={r.klBoc.theoVung} />
                                  </div>
                                )}
                              </div>
                            )}
                            {r.buoc.length > 0 && (
                              <div className="space-y-1.5">
                                <div className="text-[11px] font-bold text-zinc-400 uppercase">
                                  Các bước chuẩn hoá
                                </div>
                                <DanhSachBuocChuanHoa buoc={r.buoc} />
                              </div>
                            )}
                            {canhBao.length > 0 && (
                              <div className="space-y-1.5">
                                <div className="text-[11px] font-bold text-amber-300 uppercase flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  Cảnh báo kiểm định
                                </div>
                                <ul className="space-y-0.5">
                                  {canhBao.map((c, i) => (
                                    <li key={i} className="text-[11px] text-amber-200/90">
                                      {c}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
