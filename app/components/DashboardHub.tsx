"use client";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { findDashboardById, canSeeNavItem, type DashNode } from "@/app/lib/dashboardTree";
import { useEffect, useState } from "react";
import { fetchMe, type Me } from "@/app/lib/me";
import {
  FileText,
  AlertTriangle,
  CalendarRange,
  GanttChartSquare,
  CalendarClock,
  TrendingUp,
} from "lucide-react";
import { systemColorClasses } from "@/lib/systemColors";

// Trang hub khuôn chung cho dashboard nhóm (M21 PR2 — xem docs/nang-cap/M21-appshell-ia.md).
// Route /hub/[id] (app/hub/[id]/page.tsx) render component này cho MỌI dashboard nhóm
// trong DASHBOARD_TREE (không tạo trang riêng từng nhóm) — 1 khuôn dùng chung, cây mở
// rộng thêm nhóm thì hub tự có theo, không cần sửa gì ở đây.
//
// Ngoại lệ duy nhất: `dash.tien-do` (M36) có mặt tiền riêng theo mockup — 3 khối
// "Kế hoạch & Báo cáo tổng thể" / "Tiến độ theo hệ" / "Kiểm soát" — xem
// `TienDoHubSections` bên dưới. Mọi dashboard khác giữ nguyên grid children mặc định.

type SystemOption = {
  id: number;
  code: string;
  name: string;
  color: string | null;
  sheetCount: number;
  avgProgress: number;
  delayed: number;
};

function ChildCard({ child }: { child: DashNode }) {
  const Icon = child.icon;
  if (!child.href) {
    return (
      <span
        aria-disabled="true"
        title={`${child.label} — sắp có`}
        className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-zinc-500 select-none"
      >
        <Icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
        <span className="flex-1 text-sm font-medium truncate">{child.label}</span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 shrink-0">
          Sắp có
        </span>
      </span>
    );
  }
  return (
    <a
      href={child.href}
      className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition"
    >
      <Icon className="w-5 h-5 shrink-0 text-emerald-400" strokeWidth={1.75} />
      <span className="flex-1 text-sm font-medium truncate">{child.label}</span>
    </a>
  );
}

// Hàng "5 nút nhỏ" theo hệ — Timeline · Gantt · Lookahead · Báo cáo · S-Curve, đều kèm `?system=`.
function SystemViews({ code }: { code: string }) {
  const q = `?system=${encodeURIComponent(code)}`;
  const views = [
    { href: `/timeline${q}`, label: "Timeline" },
    { href: `/gantt${q}`, label: "Gantt" },
    { href: `/lookahead${q}`, label: "Lookahead" },
    { href: `/report${q}`, label: "Báo cáo" },
    { href: `/scurve${q}`, label: "S-Curve" },
  ];
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
      {views.map((v) => (
        <a
          key={v.href}
          href={v.href}
          className="shrink-0 min-h-10 flex items-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full px-3 text-xs text-zinc-300 transition"
        >
          {v.label}
        </a>
      ))}
    </div>
  );
}

function SystemRow({ d }: { d: SystemOption }) {
  const c = systemColorClasses(d.color);
  const pct = Math.round((d.avgProgress ?? 0) * 100);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} aria-hidden="true" />
        <a href={`/system/${d.code}`} className={`text-sm font-semibold hover:underline ${c.text}`}>
          {d.name}
        </a>
        <span className="ml-auto text-xs text-zinc-400 shrink-0">
          {pct}% {d.delayed > 0 ? `· ${d.delayed} trễ` : ""}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full ${c.dot}`} style={{ width: `${pct}%` }} />
      </div>
      <SystemViews code={d.code} />
    </div>
  );
}

// Khối 1 "Kế hoạch & Báo cáo tổng thể" — view chung KHÔNG lọc theo hệ. Trước đây lấy từ
// `dashboard.children` (node dash.tien-do), nhưng từ khi sidebar đổi children của node đó
// sang 6 hệ đang thi công (mỗi hệ 1 trang /progress/[system]), 2 việc này tách nhau — hub giữ
// literal riêng để không mất view chung khi sidebar đổi.
const GENERAL_VIEWS: DashNode[] = [
  { href: "/timeline", label: "Timeline", icon: CalendarRange },
  { href: "/gantt", label: "Gantt", icon: GanttChartSquare },
  { href: "/lookahead", label: "Lookahead", icon: CalendarClock },
  { href: "/scurve", label: "S-Curve", icon: TrendingUp },
];
const CONTROL_CARD: DashNode = {
  href: "/schedule-control",
  label: "Đường găng & Chậm tiến độ",
  icon: AlertTriangle,
};

// Mặt tiền riêng của dashboard "Tiến độ" (M36) — 3 khối theo mockup.
function TienDoHubSections() {
  const [systems, setSystems] = useState<SystemOption[]>([]);

  useEffect(() => {
    fetch("/api/systems")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSystems(j?.systems ?? []))
      .catch(() => {});
  }, []);

  // /report không phải children thật của node dash.tien-do (thuộc dash.bao-cao) — tạo
  // literal DashNode để đưa vào ChildCard, không sửa dashboardTree.ts thêm lần nữa.
  const reportCard: DashNode = {
    href: "/report",
    label: "Báo cáo ngày/tuần/tháng",
    icon: FileText,
  };

  return (
    <>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">Kế hoạch & Báo cáo tổng thể</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GENERAL_VIEWS.map((child) => (
            <ChildCard key={child.href} child={child} />
          ))}
          <ChildCard child={reportCard} />
        </div>
      </section>

      {systems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300">Tiến độ theo hệ</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {systems.map((d) => (
              <SystemRow key={d.code} d={d} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">Kiểm soát</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ChildCard child={CONTROL_CARD} />
        </div>
      </section>
    </>
  );
}

export default function DashboardHub({ dashId }: { dashId: string }) {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetchMe().then(setMe);
  }, []);

  const found = findDashboardById(dashId);

  if (!found) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Không tìm thấy dashboard" />
        <main className="p-4 sm:p-6">
          <EmptyState message={`Không tìm thấy dashboard "${dashId}".`} />
        </main>
      </div>
    );
  }

  const { cluster, dashboard } = found;
  const Icon = dashboard.icon;
  const children = (dashboard.children ?? []).filter((c) => canSeeNavItem(c, me?.role));
  const isTienDo = dashboard.id === "dash.tien-do";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title={dashboard.label} subtitle={cluster.label} />
      <main className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
          <Icon className="w-6 h-6 text-emerald-400 shrink-0" strokeWidth={1.75} />
          <h1 className="text-lg font-bold">{dashboard.label}</h1>
        </div>

        {isTienDo ? (
          <TienDoHubSections />
        ) : children.length === 0 ? (
          <EmptyState message="Chưa có mục nào trong dashboard này." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map((child) => (
              <ChildCard key={child.href ?? child.label} child={child} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
