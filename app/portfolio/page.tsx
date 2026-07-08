"use client";
// Trang Portfolio (M22 PR2) — tầng cao nhất của IA: thẻ từng dự án + KPI gộp cross-project.
// Bấm 1 dự án = chọn (POST /api/project/select) + vào dashboard dự án đó.
import { useEffect, useState } from "react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { disciplineColorClasses } from "@/lib/disciplineColors";
import { Building2, AlertTriangle } from "lucide-react";

type Project = {
  id: number;
  name: string;
  code: string | null;
  status: string;
  color: string | null;
  totalTasks: number;
  avgProgress: number;
  delayedCount: number;
};

type PortfolioKpi = {
  totalProjects: number;
  byStatus: Record<string, number>;
  totalDelayed: number;
  avgProgress: number;
};

const STATUS_LABEL: Record<string, string> = {
  active: "Đang thi công",
  handover: "Bàn giao",
  closed: "Đã đóng",
};

function KpiTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-4 py-3 min-w-[110px] shrink-0">
      <p className="text-[11px] text-zinc-400">{label}</p>
      <p className={`text-xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function ProjectCard({ project, onSelect }: { project: Project; onSelect: (id: number) => void }) {
  const c = disciplineColorClasses(project.color);
  const pct = Math.round((project.avgProgress ?? 0) * 100);
  return (
    <button
      type="button"
      onClick={() => onSelect(project.id)}
      className="text-left bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} aria-hidden="true" />
          <h3 className="font-semibold text-sm truncate">{project.name}</h3>
        </div>
        <span className={`text-sm font-bold shrink-0 ${c.text}`}>{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full ${c.dot}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
        <span className="px-1.5 py-0.5 rounded bg-zinc-800">
          {STATUS_LABEL[project.status] ?? project.status}
        </span>
        {project.delayedCount > 0 && (
          <span className="flex items-center gap-1 text-rose-300">
            <AlertTriangle className="w-3 h-3" /> {project.delayedCount} việc trễ
          </span>
        )}
        <span className="ml-auto">{project.totalTasks} task</span>
      </div>
    </button>
  );
}

export default function PortfolioPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [kpi, setKpi] = useState<PortfolioKpi | null>(null);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/portfolio/kpi", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([projRes, kpiRes]) => {
      setProjects(projRes?.projects ?? []);
      setKpi(kpiRes ?? null);
    });
  }, []);

  async function selectProject(id: number) {
    setSelecting(true);
    try {
      const res = await fetch("/api/project/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      if (!res.ok) return;
      localStorage.setItem("xboss_project", String(id));
      window.location.href = "/";
    } finally {
      setSelecting(false);
    }
  }

  if (projects === null) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="Portfolio" subtitle="Toàn bộ dự án đang quản lý" />
      <main className="p-4 sm:p-6 space-y-6">
        {kpi && (
          <div
            className="flex gap-3 overflow-x-auto scrollbar-none"
            tabIndex={0}
            role="region"
            aria-label="Chỉ số KPI gộp toàn bộ dự án"
          >
            <KpiTile label="Tổng dự án" value={String(kpi.totalProjects)} accent="text-white" />
            <KpiTile
              label="Đang thi công"
              value={String(kpi.byStatus.active ?? 0)}
              accent="text-emerald-300"
            />
            <KpiTile
              label="Việc trễ"
              value={String(kpi.totalDelayed)}
              accent={kpi.totalDelayed > 0 ? "text-rose-300" : "text-zinc-300"}
            />
            <KpiTile
              label="Tiến độ TB"
              value={`${Math.round(kpi.avgProgress * 100)}%`}
              accent="text-sky-300"
            />
          </div>
        )}

        {projects.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Chưa có dự án nào"
            message="Liên hệ Admin để tạo dự án đầu tiên."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onSelect={selectProject} />
            ))}
          </div>
        )}
        {selecting && <p className="text-sm text-zinc-500">Đang chuyển dự án…</p>}
      </main>
    </div>
  );
}
