"use client";
// Trang admin ma trận cờ tính năng (M52 PR4 — feature_flags, xem
// docs/nang-cap/M52-mo-rong-cau-hinh.md mục PR4). Đọc/ghi qua GET/PATCH
// /api/admin/feature-flags (lib/feature-flags.ts, chỉ chạy server).
import { useCallback, useEffect, useState } from "react";
import { ToggleLeft, ToggleRight, SlidersHorizontal } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

type ModuleOpt = { key: string; label: string };
type ProjectFlags = { projectId: number; projectName: string; flags: Record<string, boolean> };

export default function FeatureFlagsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [modules, setModules] = useState<ModuleOpt[]>([]);
  const [projects, setProjects] = useState<ProjectFlags[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const isAdmin = me?.role === "admin";
  const canView = me?.role === "admin" || me?.role === "pm";

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/admin/feature-flags")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        setModules(j?.modules ?? []);
        setProjects(j?.projects ?? []);
      })
      .catch(() => showToast("Không tải được cấu hình tính năng", "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMe()
      .then((u) => setMe(u))
      .finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!me || !canView) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function toggle(moduleKey: string, projectId: number, enabled: boolean) {
    const cellKey = `${moduleKey}:${projectId}`;
    setSaving(cellKey);
    // Cập nhật lạc quan — trả về nếu lỗi.
    setProjects((prev) =>
      prev.map((p) =>
        p.projectId === projectId ? { ...p, flags: { ...p.flags, [moduleKey]: enabled } } : p,
      ),
    );
    const res = await fetch("/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleKey, projectId, enabled }),
    });
    setSaving(null);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Lưu thất bại", "error");
      load();
      return;
    }
  }

  if (meLoading) return <PageSkeleton />;

  if (me && !canView) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Cờ tính năng" subtitle="Bật/tắt module theo dự án" />
        <main className="p-4 sm:p-6">
          <EmptyState
            icon={SlidersHorizontal}
            title="Không có quyền truy cập"
            message="Chỉ Admin/PM mới xem được cấu hình tính năng."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Cờ tính năng"
        subtitle="Bật/tắt từng module theo dự án — không cấu hình = module bật (mặc định)"
      />

      <main className="p-4 sm:p-6 pb-24">
        {loading ? (
          <div className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-xl h-64" />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="Chưa có dự án nào"
            message="Tạo dự án trước khi cấu hình cờ tính năng."
          />
        ) : (
          <div className="overflow-x-auto bg-zinc-900 border border-zinc-800 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-800">
                  <th className="text-left py-2 px-3 sticky left-0 bg-zinc-900">Module</th>
                  {projects.map((p) => (
                    <th key={p.projectId} className="text-center py-2 px-3 whitespace-nowrap">
                      {p.projectName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.key} className="border-b border-zinc-900 last:border-0">
                    <td className="py-2 px-3 sticky left-0 bg-zinc-900 font-medium text-zinc-200 whitespace-nowrap">
                      {m.label}
                      <span className="block text-[11px] text-zinc-500 font-mono">{m.key}</span>
                    </td>
                    {projects.map((p) => {
                      const enabled = p.flags[m.key] ?? true;
                      const cellKey = `${m.key}:${p.projectId}`;
                      return (
                        <td key={p.projectId} className="text-center py-2 px-3">
                          <button
                            onClick={() => isAdmin && toggle(m.key, p.projectId, !enabled)}
                            disabled={!isAdmin || saving === cellKey}
                            title={
                              isAdmin
                                ? enabled
                                  ? "Bấm để tắt module này cho dự án"
                                  : "Bấm để bật module này cho dự án"
                                : "Chỉ Admin sửa được"
                            }
                            className={`inline-flex items-center justify-center disabled:opacity-50 ${isAdmin ? "cursor-pointer" : "cursor-default"}`}
                          >
                            {enabled ? (
                              <ToggleRight className="w-8 h-8 text-emerald-400" />
                            ) : (
                              <ToggleLeft className="w-8 h-8 text-zinc-600" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
