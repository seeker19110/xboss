"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plug,
  Download,
  MonitorSmartphone,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileStack,
} from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

// M99 PR6 — Bảng điều khiển plugin AutoCAD (§13): rule pack đang phát hành (kèm nút tải JSON
// cho XBOSS_RULEPACK), nút tải gói cài plugin, lịch sử bản vẽ plugin đã tải lên + kết quả
// kiểm định phía server, lối sang trang quản lý token/thiết bị.

type RulePackTomTat = {
  version: string;
  soNhomLayer: number;
  soHangMucBocTach: number;
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
};

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
          <button
            onClick={() => void tai()}
            aria-label="Tải lại bảng điều khiển plugin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tải Lại</span>
          </button>
          <Link
            href="/engineering/thiet-bi-cad"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
          >
            <MonitorSmartphone className="w-3.5 h-3.5 text-sky-400" />
            <span>Thiết Bị &amp; Token</span>
          </Link>
        </div>
      </div>

      {loi && (
        <p className="flex items-center gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {loi}
        </p>
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
              <a
                href="/api/engineering/cad/rule-pack"
                download={`xboss-rule-pack-${rulePack.version}.json`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-on-accent-dark font-bold text-xs shadow-sm transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải JSON (cho XBOSS_RULEPACK)</span>
              </a>
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
            <a
              href={pluginUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-on-accent-dark font-bold text-xs shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải Gói Cài Plugin</span>
            </a>
          ) : (
            <p className="text-xs text-zinc-400">
              Quản trị chưa khai đường tải gói cài (biến <code>XBOSS_PLUGIN_URL</code>). Tự dựng gói
              theo hướng dẫn trong <code>plugin-autocad/README.md</code> của mã nguồn.
            </p>
          )}
          <p className="text-[11px] text-zinc-500">
            Plugin chỉ chạy trên AutoCAD 2026 (.NET 8). Lệnh: XBOSS_LOGIN · XBOSS_KIEMTRA ·
            XBOSS_CHUANHOA · XBOSS_BOCKL · XBOSS_UPLOAD · XBOSS_BATCH.
          </p>
        </div>
      </div>

      {/* Lịch sử bản vẽ plugin tải lên */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-zinc-200 uppercase tracking-wide flex items-center gap-2">
          <FileStack className="w-3.5 h-3.5 text-sky-400" />
          Bản Vẽ Plugin Đã Gửi Về &amp; Kết Quả Kiểm Định
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
                  <th className="text-left font-semibold py-2 pr-3">Bản vẽ</th>
                  <th className="text-left font-semibold py-2 pr-3">Rev</th>
                  <th className="text-left font-semibold py-2 pr-3">Ngày gửi</th>
                  <th className="text-left font-semibold py-2 pr-3">Người gửi</th>
                  <th className="text-left font-semibold py-2 pr-3">Rule pack</th>
                  <th className="text-left font-semibold py-2 pr-3">Trạng thái</th>
                  <th className="text-left font-semibold py-2">Kiểm định</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {lichSu.map((r) => (
                  <tr key={r.revisionId} className="border-b border-zinc-900">
                    <td className="py-2 pr-3">
                      <span className="font-mono font-bold text-zinc-100">{r.drawingCode}</span>
                      <span className="text-zinc-500"> — {r.drawingName}</span>
                    </td>
                    <td className="py-2 pr-3 font-mono">{r.rev}</td>
                    <td className="py-2 pr-3">{ngay(r.submittedAt)}</td>
                    <td className="py-2 pr-3">{r.nguoiTaiLen ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono">{r.rulePackVersion ?? "—"}</td>
                    <td className="py-2 pr-3">{NHAN_TRANG_THAI[r.status] ?? r.status}</td>
                    <td className="py-2">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
