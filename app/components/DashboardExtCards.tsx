"use client";
import { ShieldAlert, FilePlus2, MapPinned, Inbox } from "lucide-react";
import EditableText from "@/app/components/EditableText";
import { Card, Chip, StatCard } from "@/app/components/ui";
import { systemColorClasses } from "@/lib/nen/systemColors";

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
          <StatCard
            href="/commercial?tab=ipc-payments&sub=proposals"
            icon={Inbox}
            label="Chờ duyệt của tôi"
            tone="warning"
            value={approvals.pendingProposals + approvals.pendingPurchaseRequests}
            hint={`${approvals.pendingProposals} đề xuất · ${approvals.pendingPurchaseRequests} mua vật tư`}
            badge={
              approvals.pendingProposals + approvals.pendingPurchaseRequests > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 live-pulse" />
              )
            }
          />
        )}

        <StatCard
          href="/site?tab=approvals-qc&sub=ncr"
          icon={ShieldAlert}
          label="NCR chất lượng"
          tone="danger"
          value={quality.ncrOpen}
          unit="phiếu mở"
          hint={`Đã đóng 30 ngày: ${quality.ncrClosed30d}${
            quality.inspectionPassRate !== null
              ? ` · Đạt ${Math.round(quality.inspectionPassRate)}%`
              : ""
          }`}
          badge={
            quality.ncrOverdue > 0 && (
              <Chip tone="danger">{quality.ncrOverdue} quá hạn</Chip>
            )
          }
        />

        {vo != null && (
          <StatCard
            href="/commercial?tab=vo-variations"
            icon={FilePlus2}
            label="VO phát sinh"
            tone="info"
            value={fmtVND(vo.submitted)}
            hint={`${vo.draft} nháp · ${vo.approved} đã duyệt`}
          />
        )}

        {workfront != null && (
          <StatCard
            href="/site?tab=work-fronts"
            icon={MapPinned}
            label="Mặt bằng thi công"
            tone="success"
            value={workfront.waitingFloors}
            unit="tầng chưa nhận"
            hint={`${workfront.cumulativeWaitDays} ngày chờ luỹ kế`}
            badge={
              workfront.waitingFloors > 0 && (
                <Chip tone="warning">{workfront.waitingFloors} tầng chờ</Chip>
              )
            }
          />
        )}
      </div>

      {bySystem.length > 0 && (
        <Card pad="none" className="overflow-hidden">
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
        </Card>
      )}
    </div>
  );
}
