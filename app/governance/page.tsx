"use client";
import { Suspense, useState } from "react";
import {
  Settings,
  Landmark,
  PackageCheck,
  FolderOpen,
  Mail,
  MessagesSquare,
  Leaf,
  Users,
  ShieldCheck,
  KeyRound,
  History,
  Workflow,
  BellRing,
  SlidersHorizontal,
  ToggleRight,
  Upload,
  Cpu,
  ArrowUpRight,
  Activity,
} from "lucide-react";
import HubShell, { type HubTab, type HubStat } from "@/app/components/HubShell";
import { Skeleton } from "@/app/components/Skeleton";

export default function GovernanceHubPage() {
  return (
    <Suspense fallback={<GovernanceSkeleton />}>
      <GovernanceContent />
    </Suspense>
  );
}

function GovernanceSkeleton() {
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

function GovernanceContent() {
  const [stats, setStats] = useState<HubStat[]>([
    {
      label: "Điều Kiện Khởi Công",
      value: "8/8 Tiêu Chí",
      change: "Đạt chuẩn Đ107",
      isPositive: true,
      icon: Landmark,
    },
    {
      label: "Hồ Sơ CDE Lưu Trữ",
      value: "486 Tài liệu",
      change: "Phiên bản mới nhất",
      isPositive: true,
      icon: FolderOpen,
    },
    {
      label: "Tài Khoản Đang Hoạt Động",
      value: "24 Thành viên",
      change: "7 Vai trò RBAC",
      isPositive: true,
      icon: Users,
    },
    {
      label: "Nhật Ký Kiểm Toán",
      value: "1,840 Records",
      change: "Immutable Audit",
      isPositive: true,
      icon: History,
    },
  ]);

  // Tab 1: Project Lifecycle (Kickoff & Handover)
  const lifecycleTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Khởi Đầu Dự Án
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Điều 107
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Kiểm tra 8 điều kiện khởi công theo Luật Xây dựng (Mặt bằng, Giấy phép XD, BPTC, Hợp
            đồng, Nhân sự, An toàn, ĐTM, PCCC).
          </p>
          <div className="pt-2">
            <a
              href="/kickoff"
              className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors flex items-center justify-between group"
            >
              <span>Kiểm Soát Khởi Công (M23)</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Nghiệm Thu Bàn Giao
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Điều 24 NĐ 06
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Quản lý danh mục hồ sơ hoàn thành công trình đưa vào sử dụng, chạy thử liên động
            PCCC/BMS và bàn giao số COBie LOD 500.
          </p>
          <div className="pt-2">
            <a
              href="/handover"
              className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors flex items-center justify-between group"
            >
              <span>Bàn Giao & Kết Thúc (M29)</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Bảo Hành Công Trình
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">24 Tháng</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Theo dõi thời hạn bảo hành công trình, tiếp nhận yêu cầu sửa chữa sự cố sau bàn giao và
            giải tỏa tiền giữ lại bảo hành.
          </p>
          <div className="pt-2">
            <a
              href="/warranty"
              className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors flex items-center justify-between group"
            >
              <span>Bảo Hành & Bảo Trì (M30)</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 2: CDE Documents, Meetings & Correspondences
  const cdeTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-amber-400" />
              Môi Trường Dữ Liệu Dùng Chung (CDE) & Hồ Sơ Dự Án
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Kho lưu trữ tài liệu dùng chung, quản lý luồng công văn đi/đến và biên bản họp giao
              ban công trường.
            </p>
          </div>
          <a
            href="/documents"
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors inline-flex items-center gap-1.5 shadow"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Mở Kho Hồ Sơ CDE
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <a
            href="/correspondences"
            className="p-4 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-sky-400" />
                <span className="font-semibold text-zinc-100">Quản Lý Công Văn Đi / Đến</span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400" />
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">
              Sổ theo dõi công văn chính thức giữa Nhà thầu, TVGS, Chủ đầu tư và các cơ quan quản
              lý.
            </p>
          </a>

          <a
            href="/meetings"
            className="p-4 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <MessagesSquare className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-zinc-100">Biên Bản Cuộc Họp Giao Ban</span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400" />
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">
              Ghi nhận kết luận cuộc họp tuần, danh sách đầu việc cần hành động và người chịu trách
              nhiệm.
            </p>
          </a>
        </div>
      </div>
    </div>
  );

  // Tab 3: Environmental Compliance
  const environmentTab = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Leaf className="w-4 h-4 text-emerald-400" />
              Môi Trường & Giấy Phép Xây Dựng
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              ĐTM / PCCC
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Theo dõi đánh giá tác động môi trường, giấy phép xả thải, nghiệm thu PCCC và hệ thống
            cảnh báo sớm 30 ngày trước khi giấy phép hoặc chứng thư bảo lãnh hết hiệu lực.
          </p>
          <div className="pt-2">
            <a
              href="/environment"
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors inline-flex items-center gap-2 shadow"
            >
              Hồ Sơ Môi Trường (M25)
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              Quan Hệ Cộng Đồng & Quan Trắc Môi Trường
            </h3>
            <span className="text-[11px] font-mono text-zinc-400">Monitoring</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Nhật trình quan trắc bụi, tiếng ồn, độ rung công trình lân cận và xử lý phản ánh của
            cộng đồng dân cư khu vực dự án.
          </p>
          <div className="pt-2">
            <a
              href="/monitoring"
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs transition-colors inline-flex items-center gap-2"
            >
              Nhật Ký Quan Trắc (M26)
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  // Tab 4: Organization & RBAC Permissions
  const orgRbacTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              Cơ Cấu Tổ Chức, Nhân Sự & Ma Trận Phân Quyền 7 Vai Trò
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Sơ đồ tổ chức ban chỉ huy, danh bạ nhân sự và ma trận phân quyền RBAC chuẩn mực.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/users"
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
            >
              <Users className="w-3.5 h-3.5" /> Quản Lý Tài Khoản
            </a>
            <a
              href="/admin/permissions"
              className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" /> Ma Trận Quyền
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <a
            href="/org"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Sơ Đồ Tổ Chức</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Ban Chỉ Huy Dự Án</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
          <a
            href="/personnel"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Danh Bạ Nhân Sự</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Hồ Sơ Kỹ Sư & Thầu Phụ</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
          <a
            href="/admin"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Phân Công Nhiệm Vụ</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Gán Trách Nhiệm Task</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
        </div>
      </div>
    </div>
  );

  // Tab 5: System Administration & Audit Log
  const systemAdminTab = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-400" />
              Cấu Hình Hệ Thống & Nhật Ký Kiểm Toán (Audit Trail)
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Trung tâm kiểm soát toàn bộ tham số cấu hình luồng duyệt, ngưỡng cảnh báo, danh mục
              mềm và cờ tính năng.
            </p>
          </div>
          <a
            href="/admin/audit-log"
            className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs border border-zinc-700 transition-colors inline-flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5 text-amber-400" /> Sổ Nhật Ký Audit
          </a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <a
            href="/admin/approval-flows"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Cấu Hình Duyệt</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Approval Engine</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
          <a
            href="/admin/alert-rules"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Ngưỡng Cảnh Báo</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Alert Rules</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
          <a
            href="/admin/features"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Cờ Tính Năng</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Feature Flags</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
          <a
            href="/import"
            className="p-3.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs block group"
          >
            <div className="text-zinc-400">Nhập Dữ Liệu</div>
            <div className="font-bold text-zinc-100 mt-1 flex items-center justify-between">
              <span>Import Excel Gốc</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400" />
            </div>
          </a>
        </div>
      </div>
    </div>
  );

  const tabs: HubTab[] = [
    {
      id: "lifecycle",
      label: "Khởi Động & Bàn Giao",
      icon: Landmark,
      badge: "Đ107 / Đ24",
      description:
        "Điều kiện khởi công Điều 107, hồ sơ nghiệm thu bàn giao Điều 24 và bảo hành công trình.",
      content: lifecycleTab,
    },
    {
      id: "cde-meetings",
      label: "Hồ Sơ CDE & Công Văn",
      icon: FolderOpen,
      badge: "486 Docs",
      description:
        "Kho dữ liệu CDE, quản lý công văn đi/đến và biên bản cuộc họp giao ban công trường.",
      content: cdeTab,
    },
    {
      id: "environment",
      label: "Môi Trường & Giấy Phép",
      icon: Leaf,
      badge: "ĐTM / PCCC",
      description: "ĐTM, nhật trình quan trắc môi trường và cảnh báo thời hạn giấy phép 30 ngày.",
      content: environmentTab,
    },
    {
      id: "org-rbac",
      label: "Nhân Sự & Phân Quyền",
      icon: Users,
      badge: "7 Roles",
      description:
        "Sơ đồ cơ cấu tổ chức, danh bạ nhân sự và ma trận phân quyền 7 vai trò chuẩn mực.",
      content: orgRbacTab,
    },
    {
      id: "admin-system",
      label: "Cấu Hình & Audit Log",
      icon: Settings,
      badge: "Admin",
      description:
        "Cấu hình luồng duyệt, ngưỡng cảnh báo, danh mục mềm và nhật ký kiểm toán bất biến.",
      content: systemAdminTab,
    },
  ];

  return (
    <HubShell
      title="Trung Tâm Quản Trị Dự Án, Bàn Giao & Cấu Hình"
      subtitle="Phân hệ hợp nhất 22 công cụ Khởi động Đ107, Bàn giao Đ24, Hồ sơ CDE, Nhân sự & Cấu hình Admin"
      icon={Settings}
      badge="Project Governance"
      tabs={tabs}
      defaultTab="lifecycle"
      stats={stats}
    />
  );
}
