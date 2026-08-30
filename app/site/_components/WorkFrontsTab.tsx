"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  LandPlot,
  Layers,
  Building2,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";

const DEFAULT_FLOORS = [
  {
    floor: "B2",
    name: "Tầng Hầm B2",
    progress: 95,
    status: "completed",
    system: "Bơm & Xử Lý Nước",
  },
  {
    floor: "B1",
    name: "Tầng Hầm B1",
    progress: 90,
    status: "completed",
    system: "Trạm Biến Áp & Chiller",
  },
  {
    floor: "FL01",
    name: "Tầng 1 Sảnh Chính",
    progress: 85,
    status: "active",
    system: "HVAC & Chiếu Sáng",
  },
  {
    floor: "FL06",
    name: "Tầng 6 Căn Hộ",
    progress: 80,
    status: "active",
    system: "Cơ Điện Trục Đứng",
  },
  {
    floor: "FL07",
    name: "Tầng 7 Căn Hộ",
    progress: 75,
    status: "active",
    system: "Ống Gió & Cấp Thoát Nước",
  },
  { floor: "FL08", name: "Tầng 8 Căn Hộ", progress: 70, status: "active", system: "Điện & PCCC" },
  {
    floor: "FL09",
    name: "Tầng 9 Căn Hộ",
    progress: 60,
    status: "active",
    system: "Lắp Đặt Ống Gió",
  },
  {
    floor: "FL10",
    name: "Tầng 10 Căn Hộ",
    progress: 45,
    status: "pending",
    system: "Chờ Bàn Giao Xây Tô",
  },
];

export default function WorkFrontsTab() {
  const [workFronts, setWorkFronts] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/work-fronts")
      .then((r) => (r.ok ? r.json() : { fronts: [] }))
      .then((data) => setWorkFronts(data.fronts?.length ? data.fronts : DEFAULT_FLOORS))
      .catch(() => setWorkFronts(DEFAULT_FLOORS))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Floor Overview Grid */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <LandPlot className="w-4 h-4 text-amber-400" />
              Điều Phối Mặt Bằng Thi Công & Giải Phóng Phân Khu (Work-Fronts)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Kiểm soát giao diện bàn giao mặt bằng giữa Kết Cấu - Xây Tô - Cơ Điện MEPF theo từng
              sàn/zone
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {workFronts.map((wf, idx) => (
            <div
              key={wf.floor || idx}
              className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-2 hover:border-amber-500/40 transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-sm text-zinc-100">{wf.floor}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    wf.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : wf.status === "active"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {wf.status === "completed"
                    ? "Đã Bàn Giao"
                    : wf.status === "active"
                      ? "Đang Thi Công"
                      : "Chờ Bàn Giao"}
                </span>
              </div>

              <div className="text-xs text-zinc-300 font-medium">{wf.name}</div>
              <div className="text-[11px] text-zinc-500">{wf.system}</div>

              <div className="pt-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-1">
                  <span>Tiến độ hoàn thành:</span>
                  <span className="font-bold text-zinc-200">{wf.progress}%</span>
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${wf.progress >= 90 ? "bg-emerald-500" : "bg-amber-500"}`}
                    style={{ width: `${wf.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
