"use client";
import { useEffect, useState } from "react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { disciplineColorClasses } from "@/lib/disciplineColors";
import type { ProjectListItem, PortfolioKpi } from "@/lib/projects";

const STATUS_LABEL: Record<string, string> = {
  active: "Đang thi công",
  handover: "Đã bàn giao",
  closed: "Đã đóng",
};
const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-950/60 text-emerald-300 border-emerald-800",
  handover: "bg-sky-950/60 text-sky-300 border-sky-800",
  closed: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
      <p className="text-[11px] text-zinc-400">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

async function selectProject(id: number) {
  await fetch("/api/project/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: id }),
  });
  try {
    localStorage.setItem("xboss_project", String(id));
  } catch {
    /* private mode */
  }
  window.location.href = "/";
}

function ProjectCard({ project }: { project: ProjectListItem }) {
  const c = disciplineColorClasses(project.color);
  const pct = Math.round(project.progressPercent * 100);
  return (
    <button
      type="button"
      onClick={() => selectProject(project.id)}
      className="text-left bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition"
    >
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} aria-hidden="true" />
        <h3 className="font-semibold text-sm truncate flex-1">{project.name}</h3>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${STATUS_BADGE[project.status]}`}
        >
          {STATUS_LABEL[project.status]}
        </span>
      </div>
      {project.code && <p className="mt-1 text-xs text-zinc-500">{project.code}</p>}
      <div className="mt-3 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full ${c.dot}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="tabular-nums text-zinc-300 font-medium">{pct}% tiến độ</span>
        {project.delayedCount > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800">
            {project.delayedCount} việc trễ
          </span>
        )}
      </div>
    </button>
  );
}

export default function PortfolioPage() {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [kpi, setKpi] = useState<PortfolioKpi | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setProjects(d?.projects ?? []));
    fetch("/api/portfolio/kpi")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setKpi(d ?? null));
  }, []);

  if (projects === null) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="Portfolio" subtitle="Tổng quan tất cả dự án" />
      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-5 space-y-6">
        {kpi && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiTile label="Số dự án" value={String(kpi.totalProjects)} />
            <KpiTile label="Đang thi công" value={String(kpi.activeCount)} />
            <KpiTile label="Tiến độ TB" value={`${Math.round(kpi.avgProgress * 100)}%`} />
            <KpiTile label="Tổng việc trễ" value={String(kpi.totalDelayed)} />
          </div>
        )}

        {projects.length === 0 ? (
          <EmptyState
            title="Chưa có dự án nào"
            message="Bạn chưa được gán vào dự án nào, hoặc hệ thống chưa có dự án. Liên hệ Admin để được gán."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
