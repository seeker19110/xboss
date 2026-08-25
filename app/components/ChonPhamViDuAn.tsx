"use client";

import type { Dispatch, SetStateAction } from "react";

export type ProjectOpt = { id: number; name: string };

/**
 * Bộ chọn "Phạm vi áp dụng": mọi dự án hoặc một dự án cụ thể.
 *
 * Trước đây khối này chép giống hệt nhau ở `app/admin/alert-rules/page.tsx` và
 * `app/admin/approval-flows/page.tsx` (37 dòng markup y nguyên).
 */
export default function ChonPhamViDuAn({
  scope,
  setScope,
  projectId,
  setProjectId,
  projects,
}: {
  scope: "all" | "project";
  setScope: Dispatch<SetStateAction<"all" | "project">>;
  /** Id dự án dạng chuỗi (giá trị của <select>); rỗng = chưa chọn. */
  projectId: string;
  setProjectId: Dispatch<SetStateAction<string>>;
  projects: ProjectOpt[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-400">Phạm vi áp dụng</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={scope === "all"}
            onChange={() => setScope("all")}
            className="accent-emerald-500"
          />
          Mọi dự án
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={scope === "project"}
            onChange={() => setScope("project")}
            className="accent-emerald-500"
          />
          Dự án cụ thể
        </label>
      </div>
      {scope === "project" && (
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Chọn dự án áp dụng"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">— Chọn dự án —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
