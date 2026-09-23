"use client";
// Quản lý tổ đội & thành viên — mở từ nút "Tổ đội" trong trang /personnel.
// Mọi vai trò mở được để xem; nút tạo/sửa/xoá tổ đội và thêm/bớt thành viên chỉ
// hiện khi canManage (Admin/PM — khớp CAN.manageHr ở API). Backend: /api/crews,
// /api/crews/:id, /api/crews/:id/members (xem lib/hien-truong/hr.ts).
import { useEffect, useState } from "react";
import { X, Plus, Pencil, Trash2, Users, ArrowLeft } from "lucide-react";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import EmptyState from "@/app/components/EmptyState";

// Type khai lại thuần ở client (không import lib/hien-truong/hr.ts — module đó chạm
// @/lib/db, không được kéo vào bundle client, xem CLAUDE.md ADR-0007).
type CrewRow = {
  id: number;
  name: string;
  systemId: number | null;
  systemName: string | null;
  supplierId: number | null;
  supplierName: string | null;
  leaderId: number | null;
  leaderName: string | null;
  memberCount: number;
};
type Opt = { id: number; name: string };
type PersonOpt = { id: number; fullName: string; code: string | null };

type View = "list" | "form" | "members";

export default function CrewsModal({
  canManage,
  onClose,
  onChanged,
}: {
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [view, setView] = useState<View>("list");
  const [crews, setCrews] = useState<CrewRow[]>([]);
  const [systems, setSystems] = useState<Opt[]>([]);
  const [suppliers, setSuppliers] = useState<Opt[]>([]);
  const [personnel, setPersonnel] = useState<PersonOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CrewRow | null>(null); // null = tạo mới ở view "form"
  const [active, setActive] = useState<CrewRow | null>(null); // tổ đội đang xem thành viên

  async function loadCrews() {
    const res = await fetch("/api/crews").catch(() => null);
    if (!res) {
      setLoadError("Mất kết nối mạng — không tải được danh sách tổ đội");
      return;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setLoadError(j?.error ?? `Lỗi tải danh sách tổ đội (${res.status})`);
      return;
    }
    const j = await res.json().catch(() => null);
    setCrews(j?.crews ?? []);
    setLoadError(null);
  }

  useEffect(() => {
    Promise.all([
      loadCrews(),
      fetch("/api/systems")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setSystems(j?.systems ?? [])),
      fetch("/api/suppliers")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setSuppliers(j?.suppliers ?? [])),
      fetch("/api/personnel")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setPersonnel(j?.personnel ?? [])),
    ]).finally(() => setLoading(false));
  }, []);

  function afterMutate() {
    loadCrews();
    onChanged();
  }

  async function deleteCrew(c: CrewRow) {
    if (!(await appConfirm(`Xoá tổ đội "${c.name}"? Không thể hoàn tác.`, { danger: true })))
      return;
    const res = await fetch(`/api/crews/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    showToast("Đã xoá tổ đội");
    afterMutate();
  }

  const title =
    view === "list"
      ? "Quản lý tổ đội"
      : view === "form"
        ? editing
          ? "Sửa tổ đội"
          : "Thêm tổ đội"
        : `Thành viên · ${active?.name ?? ""}`;

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {view !== "list" && (
              <button
                onClick={() => setView("list")}
                aria-label="Quay lại danh sách tổ đội"
                className="text-zinc-400 hover:text-white shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="font-semibold truncate">{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Đang tải…</p>
        ) : view === "list" ? (
          <CrewList
            crews={crews}
            canManage={canManage}
            loadError={loadError}
            onRetry={loadCrews}
            onAdd={() => {
              setEditing(null);
              setView("form");
            }}
            onEdit={(c) => {
              setEditing(c);
              setView("form");
            }}
            onMembers={(c) => {
              setActive(c);
              setView("members");
            }}
            onDelete={deleteCrew}
          />
        ) : view === "form" ? (
          <CrewForm
            crew={editing}
            systems={systems}
            suppliers={suppliers}
            personnel={personnel}
            onSaved={() => {
              afterMutate();
              setView("list");
            }}
            onCancel={() => setView("list")}
          />
        ) : (
          active && (
            <CrewMembers
              crew={active}
              allPersonnel={personnel}
              canManage={canManage}
              onChanged={afterMutate}
              onCrewUpdated={(c) => setActive(c)}
            />
          )
        )}
      </div>
    </Modal>
  );
}

function CrewList({
  crews,
  canManage,
  loadError,
  onRetry,
  onAdd,
  onEdit,
  onMembers,
  onDelete,
}: {
  crews: CrewRow[];
  canManage: boolean;
  loadError: string | null;
  onRetry: () => void;
  onAdd: () => void;
  onEdit: (c: CrewRow) => void;
  onMembers: (c: CrewRow) => void;
  onDelete: (c: CrewRow) => void;
}) {
  return (
    <div className="space-y-3">
      {canManage && (
        <button
          onClick={onAdd}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 rounded-lg text-sm font-semibold transition text-on-accent min-h-10"
        >
          <Plus className="w-4 h-4" /> Thêm tổ đội
        </button>
      )}

      {loadError ? (
        <p className="text-sm text-rose-300">
          {loadError}{" "}
          <button onClick={onRetry} className="underline hover:text-rose-200">
            Thử lại
          </button>
        </p>
      ) : crews.length === 0 ? (
        <EmptyState
          icon={Users}
          message='Chưa có tổ đội nào. Bấm "Thêm tổ đội" để tạo.'
          compact
        />
      ) : (
        <ul className="space-y-2">
          {crews.map((c) => (
            <li
              key={c.id}
              className="bg-zinc-800/60 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-zinc-400 truncate">
                  {c.systemName ?? "— chưa gán hệ"}
                  {c.leaderName ? ` · Đội trưởng: ${c.leaderName}` : ""} · {c.memberCount} thành
                  viên
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onMembers(c)}
                  aria-label={`Thành viên tổ ${c.name}`}
                  title="Thành viên"
                  className="min-w-10 min-h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700"
                >
                  <Users className="w-4 h-4" />
                </button>
                {canManage && (
                  <>
                    <button
                      onClick={() => onEdit(c)}
                      aria-label={`Sửa tổ ${c.name}`}
                      title="Sửa"
                      className="min-w-10 min-h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(c)}
                      aria-label={`Xoá tổ ${c.name}`}
                      title="Xoá"
                      className="min-w-10 min-h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CrewForm({
  crew,
  systems,
  suppliers,
  personnel,
  onSaved,
  onCancel,
}: {
  crew: CrewRow | null;
  systems: Opt[];
  suppliers: Opt[];
  personnel: PersonOpt[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(crew?.name ?? "");
  const [systemId, setSystemId] = useState<number | "">(crew?.systemId ?? "");
  const [supplierId, setSupplierId] = useState<number | "">(crew?.supplierId ?? "");
  const [leaderId, setLeaderId] = useState<number | "">(crew?.leaderId ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = name.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        name: name.trim(),
        systemId: systemId === "" ? null : systemId,
        supplierId: supplierId === "" ? null : supplierId,
        leaderId: leaderId === "" ? null : leaderId,
      };
      const url = crew ? `/api/crews/${crew.id}` : "/api/crews";
      const res = await fetch(url, {
        method: crew ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được tổ đội");
        return;
      }
      showToast(crew ? "Đã lưu tổ đội" : "Đã tạo tổ đội");
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="text-xs text-zinc-400 block">
        Tên tổ đội
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
        />
      </label>

      <label className="text-xs text-zinc-400 block">
        Hệ thi công
        <select
          value={systemId}
          onChange={(e) => setSystemId(e.target.value ? Number(e.target.value) : "")}
          className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">— Không —</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-zinc-400 block">
        Nhà thầu phụ
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
          className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">— Không —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-zinc-400 block">
        Đội trưởng
        <select
          value={leaderId}
          onChange={(e) => setLeaderId(e.target.value ? Number(e.target.value) : "")}
          className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">— Không —</option>
          {personnel.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
              {p.code ? ` (${p.code})` : ""}
            </option>
          ))}
        </select>
      </label>

      {err && <p className="text-sm text-rose-300">{err}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm min-h-10"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 min-h-10"
        >
          Huỷ
        </button>
      </div>
    </div>
  );
}

function CrewMembers({
  crew,
  allPersonnel,
  canManage,
  onChanged,
  onCrewUpdated,
}: {
  crew: CrewRow;
  allPersonnel: PersonOpt[];
  canManage: boolean;
  onChanged: () => void;
  onCrewUpdated: (c: CrewRow) => void;
}) {
  const [members, setMembers] = useState<PersonOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addId, setAddId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/personnel?crewId=${crew.id}`).catch(() => null);
    if (!res) {
      setLoadError("Mất kết nối mạng — không tải được thành viên");
      return;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setLoadError(j?.error ?? `Lỗi tải thành viên (${res.status})`);
      return;
    }
    const j = await res.json().catch(() => null);
    setMembers(j?.personnel ?? []);
    setLoadError(null);
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crew.id]);

  const memberIds = new Set(members.map((m) => m.id));
  const candidates = allPersonnel.filter((p) => !memberIds.has(p.id));

  async function addMember() {
    if (addId === "") return;
    setBusy(true);
    try {
      const res = await fetch(`/api/crews/${crew.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnelId: addId }),
      });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Không thêm được thành viên", "error");
        return;
      }
      setAddId("");
      await load();
      onCrewUpdated({ ...crew, memberCount: crew.memberCount + 1 });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(p: PersonOpt) {
    if (!(await appConfirm(`Bỏ "${p.fullName}" khỏi tổ đội "${crew.name}"?`, { danger: true })))
      return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/crews/${crew.id}/members?personnelId=${p.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Không bỏ được thành viên", "error");
        return;
      }
      await load();
      onCrewUpdated({ ...crew, memberCount: Math.max(0, crew.memberCount - 1) });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-zinc-500">Đang tải…</p>
      ) : loadError ? (
        <p className="text-sm text-rose-300">{loadError}</p>
      ) : members.length === 0 ? (
        <EmptyState icon={Users} message="Tổ đội chưa có thành viên nào." compact />
      ) : (
        <ul className="space-y-2">
          {members.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-2 text-sm"
            >
              <span className="truncate">
                {p.fullName}
                {p.code ? ` (${p.code})` : ""}
              </span>
              {canManage && (
                <button
                  onClick={() => removeMember(p)}
                  disabled={busy}
                  aria-label={`Bỏ ${p.fullName} khỏi tổ đội`}
                  className="text-zinc-400 hover:text-rose-400 shrink-0 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
          <select
            value={addId}
            onChange={(e) => setAddId(e.target.value ? Number(e.target.value) : "")}
            aria-label="Thêm thành viên"
            className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white min-h-10"
          >
            <option value="">— Chọn nhân sự —</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
                {p.code ? ` (${p.code})` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={addMember}
            disabled={addId === "" || busy}
            className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent font-semibold px-3.5 py-2 rounded-lg text-sm min-h-10 shrink-0"
          >
            Thêm
          </button>
        </div>
      )}
    </div>
  );
}
