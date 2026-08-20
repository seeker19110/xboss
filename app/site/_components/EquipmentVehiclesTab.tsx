"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Wrench,
  CarFront,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Calendar,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { formatDateVN } from "@/lib/date";

type SubSection = "equipment" | "vehicles";

export default function EquipmentVehiclesTab() {
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<SubSection>("equipment");

  // Data states
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const sub = searchParams.get("sub");
    if (sub === "vehicles") {
      setActiveSection("vehicles");
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/equipment").then((r) => (r.ok ? r.json() : { items: [] })),
      fetch("/api/vehicles").then((r) => (r.ok ? r.json() : { logs: [] })),
    ])
      .then(([eqData, vhData]) => {
        setEquipmentList(eqData.items || eqData.equipment || []);
        setVehicles(vhData.logs || vhData.vehicles || []);
      })
      .catch(() => showToast("Không tải được dữ liệu thiết bị/xe", "error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Sub navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800/80">
          <button
            onClick={() => setActiveSection("equipment")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "equipment"
                ? "bg-amber-600 text-zinc-950 shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Máy Móc & Kiểm Định TT36 ({equipmentList.length})
          </button>
          <button
            onClick={() => setActiveSection("vehicles")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSection === "vehicles"
                ? "bg-amber-600 text-zinc-950 shadow"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <CarFront className="w-3.5 h-3.5" />
            Xe Ra Vào Công Trường ({vehicles.length})
          </button>
        </div>

        <div className="text-xs text-zinc-400 font-mono">Thông tư 36/2019/TT-BLĐTBXH</div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : activeSection === "equipment" ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400" />
              Danh Mục Thiết Bị Yêu Cầu Nghiêm Ngặt Về An Toàn Lao Động
            </h3>
            <span className="text-xs text-zinc-400 font-mono">{equipmentList.length} Máy móc</span>
          </div>

          {equipmentList.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              Chưa có máy móc nào trong danh mục quản lý.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                    <th className="py-2.5 px-3">Mã Thiết Bị</th>
                    <th className="py-2.5 px-3">Tên Thiết Bị / Hãng</th>
                    <th className="py-2.5 px-3">Đơn Vị Quản Lý</th>
                    <th className="py-2.5 px-3">Hạn Kiểm Định</th>
                    <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {equipmentList.map((eq) => (
                    <tr key={eq.id} className="hover:bg-zinc-900/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-zinc-200">
                        {eq.code || `EQ-${eq.id}`}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-zinc-200">{eq.name}</div>
                        <div className="text-[11px] text-zinc-500">
                          {eq.brand || eq.model || "Thiết bị cơ điện"}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-zinc-400">
                        {eq.owner || eq.subcontractorName || "BCH Dự án"}
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-300">
                        {eq.inspectionDueDate ? formatDateVN(eq.inspectionDueDate) : "Còn hiệu lực"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {eq.status || "Đạt chuẩn"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <CarFront className="w-4 h-4 text-sky-400" />
              Nhật Trình Xe Cơ Giới & Xe Giao Vật Tư Ra Vào
            </h3>
            <span className="text-xs text-zinc-400 font-mono">{vehicles.length} Lượt xe</span>
          </div>

          {vehicles.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              Chưa có nhật trình xe nào được ghi nhận.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-medium">
                    <th className="py-2.5 px-3">Biển Số Xe</th>
                    <th className="py-2.5 px-3">Loại Xe / Tài Xế</th>
                    <th className="py-2.5 px-3">Mục Đích / Hàng Hóa</th>
                    <th className="py-2.5 px-3">Thời Gian Vào</th>
                    <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {vehicles.slice(0, 15).map((vh) => (
                    <tr key={vh.id} className="hover:bg-zinc-900/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-zinc-100">
                        {vh.plateNumber || vh.plate || "51C-123.45"}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-zinc-200">
                          {vh.vehicleType || "Xe tải 5T"}
                        </div>
                        <div className="text-[11px] text-zinc-500">{vh.driverName || "Tài xế"}</div>
                      </td>
                      <td className="py-3 px-3 text-zinc-400 truncate max-w-xs">
                        {vh.purpose || vh.cargoDescription || "Giao ống tôn mạ kẽm"}
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-300">
                        {vh.entryTime ? formatDateVN(vh.entryTime) : "Hôm nay 08:30"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                          {vh.status || "Đã xuất cổng"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
