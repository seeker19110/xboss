"use client";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { findDashboardById, canSeeNavItem, type DashNode } from "@/app/lib/dashboardTree";
import { useEffect, useState } from "react";
import { fetchMe, type Me } from "@/app/lib/me";

// Trang hub khuôn chung cho dashboard nhóm (M21 PR2 — xem docs/nang-cap/M21-appshell-ia.md).
// Route /hub/[id] (app/hub/[id]/page.tsx) render component này cho MỌI dashboard nhóm
// trong DASHBOARD_TREE (không tạo trang riêng từng nhóm) — 1 khuôn dùng chung, cây mở
// rộng thêm nhóm thì hub tự có theo, không cần sửa gì ở đây. Luôn render grid children
// mặc định — không có ngoại lệ mặt tiền riêng (đã bỏ mặt tiền `dash.tien-do` cũ khi node
// đó bị flatten thành các hệ đang thi công, xem `dashboardTree.ts`).

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

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title={dashboard.label} subtitle={cluster.label} />
      <main className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
          <Icon className="w-6 h-6 text-emerald-400 shrink-0" strokeWidth={1.75} />
          <h1 className="text-lg font-bold">{dashboard.label}</h1>
        </div>

        {children.length === 0 ? (
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
