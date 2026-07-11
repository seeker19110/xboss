"use client";
import { ShieldAlert, FilePlus2, MapPinned, Inbox } from "lucide-react";
import EditableText from "@/app/components/EditableText";

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
      <div className="flex flex-wrap gap-3">
        {approvals != null &&
          approvals.pendingProposals + approvals.pendingPurchaseRequests > 0 && (
            <a
              href="/proposals"
              className="flex-1 min-w-[140px] bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-600 transition"
            >
              <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
                <Inbox className="w-3.5 h-3.5" /> Chờ duyệt của tôi
              </p>
              <p className="text-lg font-semibold mt-1 text-amber-300">
                {approvals.pendingProposals + approvals.pendingPurchaseRequests}
                <span className="ml-1.5 text-xs font-medium text-zinc-400">
                  ({approvals.pendingProposals} đề xuất · {approvals.pendingPurchaseRequests} mua
                  vật tư)
                </span>
              </p>
            </a>
          )}
        <a
          href="/quality"
          className="flex-1 min-w-[140px] bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-600 transition"
        >
          <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> NCR mở
          </p>
          <p className="text-lg font-semibold mt-1">
            {quality.ncrOpen}
            {quality.ncrOverdue > 0 && (
              <span className="ml-1.5 text-xs font-medium text-rose-300">
                ({quality.ncrOverdue} quá hạn)
              </span>
            )}
          </p>
        </a>
        {vo != null && (
          <a
            href="/variations"
            className="flex-1 min-w-[140px] bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-600 transition"
          >
            <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
              <FilePlus2 className="w-3.5 h-3.5" /> VO chờ duyệt
            </p>
            <p className="text-lg font-semibold mt-1">{fmtVND(vo.submitted)}</p>
          </a>
        )}
        {workfront != null && workfront.waitingFloors > 0 && (
          <a
            href="/work-fronts"
            className="flex-1 min-w-[140px] bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-600 transition"
          >
            <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
              <MapPinned className="w-3.5 h-3.5" /> Tầng chờ mặt bằng
            </p>
            <p className="text-lg font-semibold mt-1 text-amber-300">
              {workfront.waitingFloors}
              <span className="ml-1.5 text-xs font-medium text-zinc-400">
                ({workfront.cumulativeWaitDays} ngày chờ luỹ kế)
              </span>
            </p>
          </a>
        )}
      </div>

      {bySystem.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 pt-4 pb-1">
            <h2 className="text-sm font-semibold text-zinc-200">
              <EditableText tkey="dashboard.byDiscipline.title">So sánh chéo hệ</EditableText>
            </h2>
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
                  <th className="text-right p-3">TRỄ</th>
                  <th className="text-right p-3">NCR MỞ</th>
                </tr>
              </thead>
              <tbody>
                {bySystem.map((d) => (
                  <tr key={d.code} className="border-b border-zinc-800/60 last:border-0">
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full bg-${d.color ?? "zinc"}-400`} />
                        {d.name}
                      </span>
                    </td>
                    <td className="p-3 min-w-[120px]">
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full bg-${d.color ?? "zinc"}-400`}
                          style={{ width: `${Math.min(100, Math.round(d.progressPct))}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">{Math.round(d.progressPct)}%</p>
                    </td>
                    <td
                      className={`p-3 text-right ${d.delayedCount > 0 ? "text-rose-300 font-medium" : "text-zinc-300"}`}
                    >
                      {d.delayedCount}
                    </td>
                    <td
                      className={`p-3 text-right ${d.ncrOpen > 0 ? "text-amber-300 font-medium" : "text-zinc-300"}`}
                    >
                      {d.ncrOpen}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
