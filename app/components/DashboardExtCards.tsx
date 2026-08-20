"use client";
import Link from "next/link";
import { ShieldAlert, FilePlus2, MapPinned, Inbox } from "lucide-react";
import EditableText from "@/app/components/EditableText";
import { systemColorClasses } from "@/lib/systemColors";

export type QualityBlock = {
  ncrOpen: number;
  ncrOverdue: number;
  ncrClosed30d: number;
  inspectionPassRate: number | null;
};
export type VoBlock = { draft: number; submitted: number; approved: number; rejected: number };
export type WorkfrontBlock = { waitingFloors: number; cumulativeWaitDays: number };
export type ApprovalsBlock = { pendingProposals: number; pendingPurchaseRequests: number };
export type SystemCrossRow = {
  code: string;
  name: string;
  color: string | null;
  progressPct: number;
  delayedCount: number;
  ncrOpen: number;
};

function fmtVND(n: number) {
  if (!n) return "0 đ";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

export default function DashboardExtCards({
  quality,
  vo,
  workfront,
  bySystem,
  approvals,
}: {
  quality: QualityBlock;
  vo: VoBlock | null;
  workfront: WorkfrontBlock | null;
  bySystem: SystemCrossRow[];
  approvals?: ApprovalsBlock | null;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {approvals != null && (
          <a
            href="/proposals"
            className="bento-card p-4 flex flex-col justify-between hover:border-amber-700/60 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
                <Inbox className="w-4 h-4 text-amber-400" /> Chờ duyệt của tôi
              </span>
              {approvals.pendingProposals + approvals.pendingPurchaseRequests > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 live-pulse" />
              )}
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold font-mono tabular-nums text-zinc-100 group-hover:text-amber-300 transition-colors">
                {approvals.pendingProposals + approvals.pendingPurchaseRequests}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                {approvals.pendingProposals} đề xuất · {approvals.pendingPurchaseRequests} mua vật
                tư
              </p>
            </div>
          </a>
        )}

        <a
          href="/quality"
          className="bento-card p-4 flex flex-col justify-between hover:border-rose-700/60 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-400" /> NCR chất lượng
            </span>
            {quality.ncrOverdue > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800/60">
                {quality.ncrOverdue} quá hạn
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold font-mono tabular-nums text-zinc-100 group-hover:text-rose-300 transition-colors">
              {quality.ncrOpen}
              <span className="text-xs font-normal text-zinc-500 ml-1.5">phiếu mở</span>
            </p>
            <p className="text-[11px] text-zinc-400 mt-1">
              Đã đóng 30 ngày: {quality.ncrClosed30d}
              {quality.inspectionPassRate !== null &&
                ` · Đạt ${Math.round(quality.inspectionPassRate)}%`}
            </p>
          </div>
        </a>

        {vo != null && (
          <a
            href="/variations"
            className="bento-card p-4 flex flex-col justify-between hover:border-sky-700/60 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
                <FilePlus2 className="w-4 h-4 text-sky-400" /> VO phát sinh
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold font-mono tabular-nums text-zinc-100 group-hover:text-sky-300 transition-colors">
                {fmtVND(vo.submitted)}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                {vo.draft} nháp · {vo.approved} đã duyệt
              </p>
            </div>
          </a>
        )}

        {workfront != null && (
          <Link
            href="/work-fronts"
            className="bento-card p-4 flex flex-col justify-between hover:border-emerald-700/60 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
                <MapPinned className="w-4 h-4 text-emerald-400" /> Mặt bằng thi công
              </span>
              {workfront.waitingFloors > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                  {workfront.waitingFloors} tầng chờ
                </span>
              )}
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold font-mono tabular-nums text-zinc-100 group-hover:text-emerald-300 transition-colors">
                {workfront.waitingFloors}
                <span className="text-xs font-normal text-zinc-500 ml-1.5">tầng chưa nhận</span>
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                {workfront.cumulativeWaitDays} ngày chờ luỹ kế
              </p>
            </div>
          </Link>
        )}
      </div>

      {bySystem.length > 0 && (
        <div className="bento-card overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              <EditableText tkey="dashboard.byDiscipline.title">So sánh chéo hệ</EditableText>
            </h2>
            <span className="text-xs text-zinc-500">{bySystem.length} phân hệ</span>
          </div>
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Bảng so sánh chéo hệ"
          >
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                  <th className="text-left p-3">HỆ</th>
                  <th className="text-left p-3">% TIẾN ĐỘ</th>
                  <th className="text-right p-3">TẦNG TRỄ</th>
                  <th className="text-right p-3">NCR MỞ</th>
                </tr>
              </thead>
              <tbody>
                {bySystem.map((d) => {
                  const c = systemColorClasses(d.color);
                  return (
                    <tr
                      key={d.code}
                      className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="p-3">
                        <span className="inline-flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                          <span className="font-medium">{d.name}</span>
                        </span>
                      </td>
                      <td className="p-3 min-w-[120px]">
                        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full ${c.dot}`}
                            style={{ width: `${Math.min(100, Math.round(d.progressPct))}%` }}
                          />
                        </div>
                        <p className={`text-xs font-semibold mt-1 tabular-nums ${c.text}`}>
                          {Math.round(d.progressPct)}%
                        </p>
                      </td>
                      <td
                        className={`p-3 text-right tabular-nums ${d.delayedCount > 0 ? "text-rose-400 font-semibold" : "text-zinc-400"}`}
                      >
                        {d.delayedCount > 0 ? `${d.delayedCount} tầng` : "—"}
                      </td>
                      <td
                        className={`p-3 text-right tabular-nums ${d.ncrOpen > 0 ? "text-amber-400 font-semibold" : "text-zinc-400"}`}
                      >
                        {d.ncrOpen > 0 ? d.ncrOpen : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
