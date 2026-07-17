"use client";
// Trang admin quản lý danh mục mềm (M52 PR1 — code_lists). Đọc/ghi qua
// GET/POST/PATCH/DELETE /api/admin/code-lists (lib/code-lists.ts, chỉ chạy server).
// Chỉ Admin thao tác; sắp thứ tự bằng nút ↑/↓ (không thêm thư viện kéo–thả mới).
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X, ArrowUp, ArrowDown, ListTree } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

// Các domain danh mục đã biết (hiện chỉ delay_reason được seed — xem lib/delay.ts).
const DOMAINS: { key: string; label: string }[] = [
  { key: "delay_reason", label: "Nguyên nhân trễ" },
];

type CodeListRow = {
  id: number;
  domain: string;
  code: string;
  label: string;
  sort: number;
  active: boolean;
  meta: Record<string, unknown>;
};

export default function CodeListsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [domain, setDomain] = useState<string>(DOMAINS[0].key);
  const [items, setItems] = useState<CodeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const isAdmin = me?.role === "admin";

  const load = useCallback((d: string) => {
    setLoading(true);
    return fetch(`/api/admin/code-lists?domain=${encodeURIComponent(d)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setItems(j?.items ?? []))
      .catch(() => showToast("Không tải được danh mục", "error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMe()
      .then((u) => setMe(u))
      .finally(() => setMeLoading(false));
  }, []);

  useEffect(() => {
    if (!me || !isAdmin) return;
    load(domain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, domain]);

  async function toggleActive(row: CodeListRow) {
    const res = await fetch("/api/admin/code-lists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, active: !row.active }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    load(domain);
  }

  // Đổi chỗ 2 mục kề nhau bằng cách hoán đổi giá trị sort của chúng.
  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    const res = await Promise.all([
      fetch("/api/admin/code-lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, sort: b.sort }),
      }),
      fetch("/api/admin/code-lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, sort: a.sort }),
      }),
    ]);
    if (res.some((r) => !r.ok)) {
      showToast("Sắp thứ tự thất bại", "error");
    }
    load(domain);
  }

  async function removeItem(row: CodeListRow) {
    if (!(await appConfirm(`Xoá mã "${row.label}" (${row.code})?`, { danger: true }))) return;
    const res = await fetch(`/api/admin/code-lists?id=${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Xoá thất bại", "error");
      return;
    }
    showToast("Đã xoá", "success");
    load(domain);
  }

  if (meLoading) return <PageSkeleton />;

  if (me && !isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Danh mục mềm" subtitle="Cấu hình danh mục enum-mềm" />
        <main className="p-4 sm:p-6">
          <EmptyState
            icon={ListTree}
            title="Không có quyền truy cập"
            message="Chỉ Admin mới quản lý được danh mục mềm."
          />
        </main>
      </div>
    );
  }

  const domainLabel = DOMAINS.find((d) => d.key === domain)?.label ?? domain;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Danh mục mềm"
        subtitle="Cấu hình các danh mục enum-mềm (nguyên nhân trễ…) — thay vì sửa code + deploy"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm text-zinc-400 flex items-center gap-2">
            Danh mục
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white"
            >
              {DOMAINS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm mã
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-xl h-12"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ListTree}
            title="Chưa có mã nào"
            message={`Danh mục "${domainLabel}" chưa có mục nào — bấm "Thêm mã".`}
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 border-b border-zinc-800">
                  <th className="text-left px-4 py-2.5 w-24">Thứ tự</th>
                  <th className="text-left px-4 py-2.5">Mã</th>
                  <th className="text-left px-4 py-2.5">Nhãn hiển thị</th>
                  <th className="text-left px-4 py-2.5 w-24">Trạng thái</th>
                  <th className="text-left px-4 py-2.5 w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {items.map((row, i) => (
                  <tr key={row.id} className={row.active ? "" : "opacity-50"}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          aria-label="Lên"
                          className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => move(i, 1)}
                          disabled={i === items.length - 1}
                          aria-label="Xuống"
                          className="p-1 rounded hover:bg-zinc-800 disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{row.code}</td>
                    <td className="px-4 py-2.5 text-zinc-200">{row.label}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => toggleActive(row)}
                        className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                          row.active
                            ? "bg-emerald-950 text-emerald-300"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {row.active ? "Đang bật" : "Đã tắt"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => removeItem(row)}
                        className="flex items-center gap-1 text-rose-300 hover:text-rose-200 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Xoá
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {adding && (
        <AddItemModal
          domain={domain}
          nextSort={items.length ? Math.max(...items.map((r) => r.sort)) + 1 : 0}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load(domain);
          }}
        />
      )}
    </div>
  );
}

// ── Modal thêm mã mới cho 1 domain ─────────────────────────────────────────────
function AddItemModal({
  domain,
  nextSort,
  onClose,
  onSaved,
}: {
  domain: string;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!code.trim() || !label.trim()) {
      showToast("Nhập mã và nhãn hiển thị", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/code-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, code: code.trim(), label: label.trim(), sort: nextSort }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        showToast(j?.error ?? "Lưu thất bại", "error");
        return;
      }
      showToast("Đã thêm mã", "success");
      onSaved();
    } catch {
      showToast("Mất kết nối — không lưu được", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm mã mới</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Mã (slug, không dấu — định danh tham chiếu, không đổi sau khi tạo)
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="vd: thieu_vat_tu"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Nhãn hiển thị
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="vd: Thiếu vật tư"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Thêm mã"}
        </button>
      </div>
    </Modal>
  );
}
