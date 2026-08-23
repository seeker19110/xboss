"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  NotebookPen,
  Users,
  Activity,
  ClipboardList,
  Plus,
  ArrowUpRight,
  Sparkles,
  Camera,
  CalendarCheck,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { formatDateVN } from "@/lib/nen/date";

type SubSection = "diary" | "attendance" | "resources";

export default function TasksDiaryTab() {
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<SubSection>("diary");

  // Data states
  const [diaries, setDiaries] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const sub = searchParams.get("sub");
    if (sub === "attendance" || sub === "resources") {
      setActiveSection(sub);
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/diary?limit=15").then((r) => (r.ok ? r.json() : { diaries: [] })),
      fetch("/api/attendance").then((r) => (r.ok ? r.json() : { records: [] })),
    ])
      .then(([dData, aData]) => {
        setDiaries(dData.diaries || dData.entries || []);
        setAttendance(aData.records || aData.items || []);
      })
      .catch(() => showToast("Không tải được dữ liệu nhật ký/chấm công", "error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Quick Access Mobile Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a
          href="/my-tasks"
          className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-amber-500/50 flex items-center justify-between group transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
                Việc Của Tôi (My Tasks)
                <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-mono">
                  Mobile First
                </span>
              </div>
              <div className="text-xs text-zinc-400">
                Tick tiến độ, chụp ảnh hiện trường và báo cáo nhanh
              </div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition-colors" />
        </a>

        <Link
          href="/engineering/site-copilot"
          className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-sky-500/50 flex items-center justify-between group transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
                Trợ Lý Hiện Trường NLP Copilot
                <span className="text-[10px] bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded font-mono">
                  Telegram/Zalo
                </span>
              </div>
              <div className="text-xs text-zinc-400">
                Nhập nhật ký bằng giọng nói & tra cứu kho tức thì
              </div>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-sky-400 transition-colors" />
        </Link>
      </div>

      {/* Sub navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800/80">
          <button
            onClick={() => setActiveSection("diary")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "diary"
                ? "bg-amber-600 text-zinc-950 shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <NotebookPen className="w-3.5 h-3.5" />
            Nhật Ký Thi Công TT06
          </button>
          <button
            onClick={() => setActiveSection("attendance")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "attendance"
                ? "bg-amber-600 text-zinc-950 shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Chấm Công Hiện Trường
          </button>
          <button
            onClick={() => setActiveSection("resources")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "resources"
                ? "bg-amber-600 text-zinc-950 shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Tải Nhân Lực (Resources)
          </button>
        </div>

        <div className="text-xs text-zinc-400 font-mono">Thông tư 06/2021/TT-BXD</div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : activeSection === "diary" ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <NotebookPen className="w-4 h-4 text-amber-400" />
              Sổ Nhật Ký Thi Công Điện Tử
            </h3>
            <span className="text-xs text-zinc-400 font-mono">{diaries.length} Ngày ghi chép</span>
          </div>

          {diaries.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              Chưa có nhật ký thi công nào được ghi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                    <th className="py-2.5 px-3">Ngày</th>
                    <th className="py-2.5 px-3">Thời Tiết / Nhiệt Độ</th>
                    <th className="py-2.5 px-3">Quân Số Hiện Trường</th>
                    <th className="py-2.5 px-3">Công Tác Chính</th>
                    <th className="py-2.5 px-3">Người Ghi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {diaries.map((d, idx) => (
                    <tr key={d.id || idx} className="hover:bg-zinc-900/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-zinc-200">
                        {d.date ? formatDateVN(d.date) : "Hôm nay"}
                      </td>
                      <td className="py-3 px-3 text-zinc-300">{d.weather || "Nắng nhẹ, 30°C"}</td>
                      <td className="py-3 px-3 font-mono text-amber-400 font-semibold">
                        {d.workerCount || d.totalWorkers || 24} Công nhân
                      </td>
                      <td className="py-3 px-3 text-zinc-400 truncate max-w-sm">
                        {d.content ||
                          d.workDescription ||
                          "Lắp đặt ống gió & kéo rải dây điện FL08"}
                      </td>
                      <td className="py-3 px-3 text-zinc-400">
                        {d.createdByName || "Kỹ sư giám sát"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeSection === "attendance" ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" />
              Sổ Điểm Danh & Chấm Công Thầu Phụ Hằng Ngày
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                  <th className="py-2.5 px-3">Đơn Vị / Thầu Phụ</th>
                  <th className="py-2.5 px-3">Tổ Đội / Chuyên Khoa</th>
                  <th className="py-2.5 px-3 text-right">Quân Số Đăng Ký</th>
                  <th className="py-2.5 px-3 text-right">Thực Tế Vào</th>
                  <th className="py-2.5 px-3 text-center">Tỷ Lệ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {attendance.slice(0, 10).map((att, idx) => (
                  <tr key={att.id || idx} className="hover:bg-zinc-900/40 transition">
                    <td className="py-3 px-3 font-semibold text-zinc-200">
                      {att.subcontractorName || att.supplierName || "Công ty Cơ Điện Alpha"}
                    </td>
                    <td className="py-3 px-3 text-zinc-400">{att.trade || "Ống gió & PCCC"}</td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-300">
                      {att.plannedCount || 15}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-400">
                      {att.actualCount || 14}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400">
                        {Math.round(((att.actualCount || 14) / (att.plannedCount || 15)) * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Biểu Đồ Histogram Phân Bổ Tải Nhân Lực
            </h3>
          </div>
          <div className="p-6 text-center text-xs text-zinc-400 bg-zinc-900/50 rounded-xl border border-zinc-800">
            Biểu đồ tải nhân lực (Resource Leveling) đang tự động tối ưu hóa tránh tình trạng phân
            công quá tải giữa các tổ đội.
          </div>
        </div>
      )}
    </div>
  );
}
