"use client";
import { useEffect, useMemo, useState } from "react";
import { Network, Plus, Trash2, Save, Users } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

type Crew = {
  id: number;
  name: string;
  systemId: number | null;
  systemName: string | null;
  leaderId: number | null;
  leaderName: string | null;
  memberCount: number;
};

type Personnel = { id: number; fullName: string };

type RaciItem = {
  id: number;
  scope: string;
  roleLabel: string;
  personnelId: number | null;
  personnelName: string | null;
  raci: "R" | "A" | "C" | "I";
};

const RACI_LABEL: Record<RaciItem["raci"], string> = {
  R: "R — Thực hiện",
  A: "A — Chịu trách nhiệm",
  C: "C — Tư vấn",
  I: "I — Được thông báo",
};

export default function OrgPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [raciItems, setRaciItems] = useState<RaciItem[]>([]);
  const [scope, setScope] = useState<string>("");

  const canManage = me?.role === "admin" || me?.role === "pm";

  function loadRaci() {
    return fetch("/api/raci")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRaciItems(j?.items ?? []));
  }

  useEffect(() => {
    Promise.all([
      fetchMe(),
      fetch("/api/crews").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/personnel").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/raci").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([meData, crewsRes, personnelRes, raciRes]) => {
        if (!meData) return;
        setMe(meData);
        setCrews(crewsRes?.crews ?? []);
        setPersonnel(personnelRes?.personnel ?? []);
        const items: RaciItem[] = raciRes?.items ?? [];
        setRaciItems(items);
        if (items.length > 0) setScope(items[0].scope);
      })
      .finally(() => setLoading(false));
  }, []);

  const scopes = useMemo(
    () => Array.from(new Set(raciItems.map((r) => r.scope))).sort(),
    [raciItems],
  );

  const bySystem = useMemo(() => {
    const map = new Map<string, Crew[]>();
    for (const c of crews) {
      const key = c.systemName ?? "Chưa phân hệ";
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [crews]);

  const currentRows = useMemo(() => raciItems.filter((r) => r.scope === scope), [raciItems, scope]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Sơ đồ tổ chức"
        subtitle="Cây tổ chức theo tổ đội/hệ thi công + ma trận RACI"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-6">
        <section aria-label="Sơ đồ tổ chức" className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Network className="w-4 h-4" /> Sơ đồ tổ chức
          </h2>
          {crews.length === 0 ? (
            <EmptyState icon={Users} message="Chưa có tổ đội nào — tạo tổ đội ở trang Nhân sự." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {bySystem.map(([system, list]) => (
                <div key={system} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <p className="text-xs font-semibold text-zinc-400 uppercase mb-2">{system}</p>
                  <ul className="space-y-2">
                    {list.map((c) => (
                      <li key={c.id} className="bg-zinc-800/60 rounded-lg px-3 py-2 text-sm">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-zinc-400">
                          Đội trưởng: {c.leaderName ?? "—"} · {c.memberCount} thành viên
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-label="Ma trận RACI" className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300">Ma trận RACI</h2>
          <RaciEditor
            scopes={scopes}
            scope={scope}
            setScope={setScope}
            rows={currentRows}
            personnel={personnel}
            canManage={!!canManage}
            onSaved={loadRaci}
          />
        </section>
      </main>
    </div>
  );
}

function RaciEditor({
  scopes,
  scope,
  setScope,
  rows,
  personnel,
  canManage,
  onSaved,
}: {
  scopes: string[];
  scope: string;
  setScope: (s: string) => void;
  rows: RaciItem[];
  personnel: Personnel[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<
    { roleLabel: string; personnelId: number | null; raci: RaciItem["raci"] }[]
  >([]);
  const [newScope, setNewScope] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(
      rows.map((r) => ({ roleLabel: r.roleLabel, personnelId: r.personnelId, raci: r.raci })),
    );
  }, [rows]);

  function addRow() {
    setDraft((d) => [...d, { roleLabel: "", personnelId: null, raci: "R" }]);
  }
  function removeRow(i: number) {
    setDraft((d) => d.filter((_, idx) => idx !== i));
  }

  async function save() {
    const targetScope = scope || newScope.trim();
    if (!targetScope) {
      showToast("Nhập tên hạng mục/quy trình trước khi lưu", "error");
      return;
    }
    if (draft.some((r) => !r.roleLabel.trim())) {
      showToast("Mỗi dòng RACI cần có tên vai trò", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/raci", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: targetScope, rows: draft }),
      });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Lưu RACI thất bại", "error");
        return;
      }
      showToast("Đã lưu ma trận RACI", "success");
      setScope(targetScope);
      setNewScope("");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          aria-label="Chọn hạng mục/quy trình"
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">— Hạng mục mới —</option>
          {scopes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {!scope && (
          <input
            value={newScope}
            onChange={(e) => setNewScope(e.target.value)}
            placeholder="Tên hạng mục/quy trình mới"
            aria-label="Tên hạng mục/quy trình mới"
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white flex-1 min-w-[180px]"
          />
        )}
      </div>

      {draft.length === 0 ? (
        <EmptyState compact icon={Network} message="Chưa có dòng RACI cho hạng mục này." />
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng RACI">
          <table className="w-full text-sm sm:min-w-[520px]">
            <thead>
              <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                <th className="text-left p-2">VAI TRÒ</th>
                <th className="text-left p-2">NGƯỜI PHỤ TRÁCH</th>
                <th className="text-left p-2">RACI</th>
                <th className="text-left p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {draft.map((r, i) => (
                <tr key={i} className="border-b border-zinc-800/60 last:border-0">
                  <td className="p-2">
                    <input
                      value={r.roleLabel}
                      onChange={(e) =>
                        setDraft((d) =>
                          d.map((x, idx) => (idx === i ? { ...x, roleLabel: e.target.value } : x)),
                        )
                      }
                      disabled={!canManage}
                      aria-label="Tên vai trò"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                    />
                  </td>
                  <td className="p-2">
                    <select
                      value={r.personnelId ?? ""}
                      onChange={(e) =>
                        setDraft((d) =>
                          d.map((x, idx) =>
                            idx === i
                              ? {
                                  ...x,
                                  personnelId: e.target.value ? Number(e.target.value) : null,
                                }
                              : x,
                          ),
                        )
                      }
                      disabled={!canManage}
                      aria-label="Người phụ trách"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                    >
                      <option value="">— Chưa gán —</option>
                      {personnel.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <select
                      value={r.raci}
                      onChange={(e) =>
                        setDraft((d) =>
                          d.map((x, idx) =>
                            idx === i ? { ...x, raci: e.target.value as RaciItem["raci"] } : x,
                          ),
                        )
                      }
                      disabled={!canManage}
                      aria-label="Giá trị RACI"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white"
                    >
                      {(Object.keys(RACI_LABEL) as RaciItem["raci"][]).map((k) => (
                        <option key={k} value={k}>
                          {RACI_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    {canManage && (
                      <button
                        onClick={() => removeRow(i)}
                        aria-label="Xoá dòng"
                        className="text-zinc-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <div className="flex items-center gap-2">
          <button
            onClick={addRow}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
          >
            <Plus className="w-3 h-3" /> Thêm dòng
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="ml-auto flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-semibold text-on-accent"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? "Đang lưu…" : "Lưu RACI"}
          </button>
        </div>
      )}
    </div>
  );
}
