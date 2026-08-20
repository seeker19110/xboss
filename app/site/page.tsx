"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import {
  HardHat,
  ClipboardList,
  CheckSquare,
  LandPlot,
  ShieldAlert,
  Wrench,
  CarFront,
  Users,
  NotebookPen,
  Camera,
  AlertTriangle,
  FileCheck2,
  Activity,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";

export default function SiteCommandHubPage() {
  return (
    <Suspense fallback={<SiteSkeleton />}>
      <SiteCommandContent />
    </Suspense>
  );
}

function SiteSkeleton() {
  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <Skeleton className="h-12 w-64 rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}

function SiteCommandContent() {
  const [stats, setStats] = useState<HubStat[]>([
    {
      label: "Việc Chờ Xử Lý",
      value: "14 Task",
      change: "Hạn hôm nay: 3",
      isPositive: false,
      icon: ClipboardList,
    },
    {
      label: "Nghiệm Thu Chờ Duyệt",
      value: "6 Phiếu",
      change: "2 BBNT e-Sign",
      isPositive: true,
      icon: CheckSquare,
    },
    {
      label: "Mặt Bằng Đang Thi Công",
      value: "8 Sàn",
      change: "FL06 - FL13",
      isPositive: true,
      icon: LandPlot,
    },
    {
      label: "Chỉ Số An Toàn HSE",
      value: "96/100",
      change: "0 Tai nạn",
      isPositive: true,
      icon: ShieldCheck,
    },
  ]);

  // Tab 1: Tasks & Daily Diary TT06
  const tasksDiaryTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Task Dispatcher & Attendance */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Tác Nghiệp Cá Nhân
            </h3>
            <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              Mobile-First
            </span>
          </div>

          <div className="space-y-2">
            <a
              href="/my-tasks"
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 transition-all text-xs group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-zinc-100">Việc Của Tôi (My Tasks)</div>
                  <div className="text-[11px] text-zinc-400">
                    Tick tiến độ & tải ảnh hiện trường
                  </div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition-colors" />
            </a>

            <a
              href="/attendance"
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 transition-all text-xs group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-zinc-100">Chấm Công Hiện Trường</div>
                  <div className="text-[11px] text-zinc-400">Ghi nhận quân số thầu phụ/kỹ sư</div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-sky-400 transition-colors" />
            </a>

            <a
              href="/resources"
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 transition-all text-xs group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-zinc-100">Tài Nguyên & Tải Nhân Lực</div>
                  <div className="text-[11px] text-zinc-400">Histogram tải & chống gán chồng</div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
            </a>
          </div>
        </div>

        {/* Daily Diary Thông tư 06/2021/TT-BXD */}
        <div className="lg:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <NotebookPen className="w-4 h-4 text-amber-400" />
                Nhật Ký Thi Công Điện Tử (Thông Tư 06/2021/TT-BXD)
              </h3>
              <span className="text-[11px] font-mono text-zinc-400">
                Hôm nay: {new Date().toLocaleDateString("vi-VN")}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Ghi nhật ký thời tiết, nhân lực, thiết bị, tình hình thi công và các ý kiến xử lý kỹ
              thuật của TVGS/Chủ đầu tư. Hỗ trợ ghi âm chuyển giọng nói thành văn bản (Voice
              Copilot) và ký số biên bản nhật ký.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <a
              href="/diary"
              className="p-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow"
            >
              <NotebookPen className="w-4 h-4" /> Mở Sổ Nhật Ký Thi Công
            </a>
            <a
              href="/engineering/site-copilot"
              className="p-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4 text-amber-400" /> Ghi Nhật Ký Bằng Giọng Nói (NLP)
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 2: Approvals & QA/QC Hold-Points
  const approvalsQcTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-emerald-400" />
              Nghiệm Thu Tiến Độ & Điểm Dừng Kỹ Thuật (Hold-Points Matrix)
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Quy trình nghiệm thu 2 bước, quản lý phiếu không phù hợp (NCR) và kiểm chứng thực địa
              không sai sót.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/approvals"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <CheckSquare className="w-3.5 h-3.5" /> Phê Duyệt Nghiệm Thu
            </a>
            <a
              href="/quality"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              Phiếu NCR & QA/QC
            </a>
          </div>
        </div>

        {/* Hold Point Stages */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-amber-400 font-bold">
              Giai Đoạn 1 — Lắp Đặt
            </span>
            <h4 className="text-xs font-semibold text-zinc-200">Kiểm Tra Kích Thước & Cao Độ</h4>
            <p className="text-[11px] text-zinc-400">So khớp Shopdrawing & cao độ hành lang</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-sky-400 font-bold">
              Giai Đoạn 2 — Thử Áp / Đo Đạc
            </span>
            <h4 className="text-xs font-semibold text-zinc-200">Thử Áp Thủy Lực & Rò Rỉ Khói</h4>
            <p className="text-[11px] text-zinc-400">Giữ áp 1.5x áp lực làm việc trong 24h</p>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold">
              Giai Đoạn 3 — Ký Số BBNT
            </span>
            <h4 className="text-xs font-semibold text-zinc-200">Nghiệm Thu Đưa Vào Sử Dụng</h4>
            <p className="text-[11px] text-zinc-400">Ký số 3 bên theo Nghị định 06/2021/NĐ-CP</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 3: Work-Fronts & Floor Coordination
  const workFrontsTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <LandPlot className="w-4 h-4 text-amber-400" />
              Điều Phối Mặt Bằng Thi Công & Giải Phóng Phân Khu (Work-Fronts)
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Kiểm soát giao diện bàn giao mặt bằng giữa Kết Cấu - Xây Tô - Cơ Điện MEPF.
            </p>
          </div>
          <Link
            href="/work-fronts"
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-1.5 shadow"
          >
            <LandPlot className="w-3.5 h-3.5" /> Quản Lý Toàn Bộ Mặt Bằng
          </Link>
        </div>

        {/* Floor Breakdown Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 pt-2">
          {["FL06", "FL07", "FL08", "FL09", "FL10", "FL11"].map((floor, idx) => (
            <Link
              key={floor}
              href={`/work-fronts/${floor}`}
              className={`p-3 rounded-xl text-center border transition-all text-xs font-medium ${
                idx === 2
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm"
                  : "bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <div className="font-bold font-mono">{floor}</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">85% Hoàn thành</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );

  // Tab 4: HSE Safety Sentinel
  const hseSafetyTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              HSE AI Computer Vision & Vi Phạm An Toàn (QCVN 18:2021)
            </h3>
            <span className="text-[11px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
              AI Sentinel
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Camera AI tự động quét ảnh chụp hiện trường phát hiện không đội mũ bảo hộ, thiếu áo phản
            quang, không đeo dây an toàn khi làm việc trên cao và mép sàn thiếu lan can chắn.
          </p>
          <div className="pt-2">
            <a
              href="/engineering/hse-vision"
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              Mở HSE AI Vision Cockpit (M87)
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Nhật Ký Sự Cố & Ma Trận Rủi Ro Công Trường
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">Risk Register</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Theo dõi phân cấp rủi ro (Nghiêm trọng, Trung bình, Thấp), phân công biện pháp giảm
            thiểu và tự động sinh phiếu xử phạt vi phạm an toàn lao động đối với nhà thầu phụ.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <a
              href="/hse"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Hồ Sơ An Toàn HSE
            </a>
            <a
              href="/risks"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Ma Trận Rủi Ro
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 5: Equipment & Vehicles
  const equipmentVehiclesTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400" />
              Quản Lý Máy Móc & Kiểm Định An Toàn (Thông Tư 36/2019/TT-BLĐTBXH)
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Kiểm soát danh mục thiết bị yêu cầu nghiêm ngặt về an toàn lao động, theo dõi hạn kiểm
              định và xe ra vào.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/equipment"
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <Wrench className="w-3.5 h-3.5" /> Danh Mục Thiết Bị
            </a>
            <a
              href="/vehicles"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <CarFront className="w-3.5 h-3.5" /> Xe Ra Vào Công Trường
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  const tabs: HubTab[] = [
    {
      id: "tasks-diary",
      label: "Việc & Nhật Ký TT06",
      icon: ClipboardList,
      badge: 14,
      description:
        "Danh sách việc cần làm cá nhân, chấm công hiện trường và sổ nhật ký thi công điện tử Thông tư 06.",
      content: tasksDiaryTab,
    },
    {
      id: "approvals-qc",
      label: "Nghiệm Thu & QA/QC",
      icon: CheckSquare,
      badge: 6,
      description:
        "Nghiệm thu 2 bước, kiểm soát điểm dừng Hold-Points và quản lý phiếu NCR không phù hợp.",
      content: approvalsQcTab,
    },
    {
      id: "work-fronts",
      label: "Mặt Bằng & Phân Khu",
      icon: LandPlot,
      badge: "8 Sàn",
      description: "Điều phối giao diện thi công theo tầng/zone và theo dõi giải phóng mặt bằng.",
      content: workFrontsTab,
    },
    {
      id: "hse-safety",
      label: "An Toàn HSE & AI Vision",
      icon: ShieldAlert,
      badge: "96/100",
      description:
        "Giám sát an toàn QCVN 18, AI Camera Vision nhận diện vi phạm PPE và quản trị rủi ro.",
      content: hseSafetyTab,
    },
    {
      id: "equipment",
      label: "Thiết Bị & Phương Tiện",
      icon: Wrench,
      badge: "TT 36",
      description: "Quản lý kiểm định máy móc nghiêm ngặt và nhật trình xe ra vào công trường.",
      content: equipmentVehiclesTab,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Chỉ Huy Tác Nghiệp Hiện Trường"
      subtitle="Phân hệ hợp nhất 14 công cụ Việc của tôi, Nhật ký TT06, Nghiệm thu, Mặt bằng, HSE và Thiết bị máy móc"
      icon={HardHat}
      badge="Site Commander"
      tabs={tabs}
      defaultTab="tasks-diary"
      stats={stats}
    />
  );
}
