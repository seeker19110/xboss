"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  ShieldCheck,
  Wrench,
  BookOpen,
  Trash2,
  Pencil,
  AlertTriangle,
  Upload,
  Paperclip,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN, todayISO } from "@/lib/date";

// ===== Kiểu dữ liệu (client) — mirror lib/warranty.ts =====

type WarrantyItemStatus = "active" | "expired";
const WARRANTY_STATUS_LABEL: Record<WarrantyItemStatus, string> = {
  active: "Còn bảo hành",
  expired: "Đã hết bảo hành",
};
const WARRANTY_STATUS_BADGE: Record<WarrantyItemStatus, string> = {
  active: "bg-emerald-900/40 text-emerald-300",
  expired: "bg-zinc-800 text-zinc-400",
};

type WarrantyItem = {
  id: number;
  title: string;
  disciplineId: number | null;
  disciplineName: string | null;
  handoverItemId: number | null;
  handoverItemTitle: string | null;
  warrantyFrom: string | null;
  warrantyMonths: number | null;
  guaranteeId: number | null;
  guaranteeTitle: string | null;
  status: WarrantyItemStatus;
  note: string | null;
};

// Hạn bảo hành = warranty_from + warranty_months, tính client-side (mirror
// lib/warranty.ts warrantyExpiry — không import trực tiếp vì lib/warranty.ts kéo theo
// lib/db, không dùng được ở client component).
function warrantyExpiryClient(item: {
  warrantyFrom: string | null;
  warrantyMonths: number | null;
}): string | null {
  if (!item.warrantyFrom || item.warrantyMonths == null) return null;
  const [y, m, d] = item.warrantyFrom.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + item.warrantyMonths, d));
  return dt.toISOString().slice(0, 10);
}

type ClaimSeverity = "low" | "medium" | "high";
const CLAIM_SEVERITY_LABEL: Record<ClaimSeverity, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};
const CLAIM_SEVERITY_BADGE: Record<ClaimSeverity, string> = {
  low: "bg-zinc-800 text-zinc-400",
  medium: "bg-amber-900/40 text-amber-300",
  high: "bg-rose-900/40 text-rose-300",
};

type ClaimStatus = "open" | "handling" | "closed";
const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  open: "Mới tiếp nhận",
  handling: "Đang xử lý",
  closed: "Đã đóng",
};
const CLAIM_STATUS_BADGE: Record<ClaimStatus, string> = {
  open: "bg-rose-900/40 text-rose-300",
  handling: "bg-amber-900/40 text-amber-300",
  closed: "bg-emerald-900/40 text-emerald-300",
};

type Claim = {
  id: number;
  warrantyItemId: number | null;
  warrantyItemTitle: string | null;
  code: string | null;
  reportedDate: string | null;
  description: string;
  severity: ClaimSeverity | null;
  status: ClaimStatus;
  dueDate: string | null;
  resolution: string | null;
  closedDate: string | null;
  assignee: number | null;
  assigneeName: string | null;
};

type OmDoc = {
  id: number;
  title: string;
  disciplineId: number | null;
  disciplineName: string | null;
  fileName: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploaderName: string | null;
  createdAt: string;
};

type Discipline = { id: number; code: string; name: string };
type GuaranteeOption = { id: number; title: string };

type Tab = "warranty" | "claims" | "om";
const TABS: { key: Tab; label: string; icon: typeof ShieldCheck }[] = [
  { key: "warranty", label: "Bảo hành", icon: ShieldCheck },
  { key: "claims", label: "Claim", icon: Wrench },
  { key: "om", label: "O&M", icon: BookOpen },
];

export default function WarrantyPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<WarrantyItem[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [omDocs, setOmDocs] = useState<OmDoc[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [guarantees, setGuarantees] = useState<GuaranteeOption[]>([]);
  const [handoverItems, setHandoverItems] = useState<{ id: number; title: string }[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("warranty");

  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<WarrantyItem | null>(null);
  const [addClaimOpen, setAddClaimOpen] = useState(false);
  const [editClaim, setEditClaim] = useState<Claim | null>(null);
  const [addOmOpen, setAddOmOpen] = useState(false);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";

  function load() {
    return Promise.all([
      fetch("/api/warranty-items").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/warranty-claims").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/om-documents").then((r) => (r.ok ? r.json() : null)),
    ]);
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, [itemsRes, claimsRes, omRes]]) => {
        if (!meData) return;
        setMe(meData);
        setItems(itemsRes?.items ?? []);
        setClaims(claimsRes?.items ?? []);
        setOmDocs(omRes?.items ?? []);
        fetch("/api/disciplines")
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => setDisciplines(j?.disciplines ?? []));
        fetch("/api/handover-items")
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => setHandoverItems(j?.items ?? []));
        fetch("/api/insurance-bonds?kind=bao_lanh_bao_hanh")
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => setGuarantees(j?.items ?? j?.bonds ?? []));
        if (meData.role === "admin" || meData.role === "pm" || meData.role === "engineer") {
          fetch("/api/users")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => setUsers(j?.users ?? []));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const [itemsRes, claimsRes, omRes] = await load();
    setItems(itemsRes?.items ?? []);
    setClaims(claimsRes?.items ?? []);
    setOmDocs(omRes?.items ?? []);
  }

  // KPI strip — tính client-side từ dữ liệu đã tải (đúng quyết định YAGNI của
  // kickoffReadiness/handoverProgress: không thêm route riêng).
  const kpi = useMemo(() => {
    const today = todayISO();
    const limit = new Date(Date.now() + 7 * 3600_000 + 30 * 86400_000).toISOString().slice(0, 10);
    const expiringSoon = items.filter((it) => {
      if (it.status !== "active") return false;
      const expiry = warrantyExpiryClient(it);
      return expiry != null && expiry <= limit;
    });
    const claimsHandling = claims.filter((c) => c.status !== "closed");
    return {
      expiringCount: expiringSoon.length,
      expiringExpired: expiringSoon.filter((it) => {
        const e = warrantyExpiryClient(it);
        return e != null && e < today;
      }).length,
      claimsHandlingCount: claimsHandling.length,
      claimsHigh: claimsHandling.filter((c) => c.severity === "high").length,
    };
  }, [items, claims]);

  async function deleteEntity(url: string, label: string) {
    if (!(await appConfirm(`Xoá ${label} này? Không thể hoàn tác.`, { danger: true }))) return;
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refresh();
  }

  async function cycleClaimStatus(item: Claim) {
    const next: ClaimStatus =
      item.status === "open" ? "handling" : item.status === "handling" ? "closed" : "open";
    const res = await fetch(`/api/warranty-claims/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Cập nhật thất bại", "error");
      return;
    }
    refresh();
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Bảo hành – Bảo trì"
        subtitle="Danh mục hạng mục bảo hành theo hệ, claim lỗi sau bàn giao, thư viện hướng dẫn vận hành & bảo trì (O&M)"
        bottomActions={
          canManage ? (
            <div className="flex items-center gap-2">
              {tab === "warranty" && (
                <button
                  onClick={() => setAddItemOpen(true)}
                  aria-label="Thêm hạng mục bảo hành"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm hạng mục</span>
                </button>
              )}
              {tab === "claims" && (
                <button
                  onClick={() => setAddClaimOpen(true)}
                  aria-label="Thêm claim bảo hành"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
                >
                  <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm claim</span>
                </button>
              )}
              {tab === "om" && (
                <button
                  onClick={() => setAddOmOpen(true)}
                  aria-label="Thêm tài liệu O&M"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm tài liệu</span>
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${kpi.expiringCount > 0 ? "text-amber-400" : ""}`}>
              {kpi.expiringCount}
            </p>
            <p className="text-xs text-zinc-400">
              Sắp hết bảo hành (≤30 ngày){" "}
              {kpi.expiringExpired > 0 && (
                <span className="text-rose-400">({kpi.expiringExpired} đã quá hạn)</span>
              )}
            </p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p
              className={`text-2xl font-bold ${kpi.claimsHandlingCount > 0 ? "text-sky-400" : ""}`}
            >
              {kpi.claimsHandlingCount}
            </p>
            <p className="text-xs text-zinc-400">
              Claim đang xử lý{" "}
              {kpi.claimsHigh > 0 && <span className="text-rose-400">({kpi.claimsHigh} cao)</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Nhóm bảo hành & bảo trì">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 ${
                tab === t.key
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "warranty" && (
          <WarrantyTab
            items={items}
            canManage={canManage}
            onEdit={setEditItem}
            onDelete={(id) => deleteEntity(`/api/warranty-items/${id}`, "hạng mục bảo hành")}
          />
        )}

        {tab === "claims" && (
          <ClaimsTab
            items={claims}
            canManage={canManage}
            onEdit={setEditClaim}
            onDelete={(id) => deleteEntity(`/api/warranty-claims/${id}`, "claim bảo hành")}
            onCycle={cycleClaimStatus}
          />
        )}

        {tab === "om" && (
          <OmTab
            items={omDocs}
            canManage={canManage}
            onDelete={(id) => deleteEntity(`/api/om-documents/${id}`, "tài liệu O&M")}
          />
        )}
      </main>

      {(addItemOpen || editItem) && (
        <WarrantyItemModal
          item={editItem}
          disciplines={disciplines}
          handoverItems={handoverItems}
          guarantees={guarantees}
          onClose={() => {
            setAddItemOpen(false);
            setEditItem(null);
          }}
          onSaved={() => {
            setAddItemOpen(false);
            setEditItem(null);
            refresh();
          }}
        />
      )}

      {(addClaimOpen || editClaim) && (
        <ClaimModal
          item={editClaim}
          warrantyItems={items}
          users={users}
          onClose={() => {
            setAddClaimOpen(false);
            setEditClaim(null);
          }}
          onSaved={() => {
            setAddClaimOpen(false);
            setEditClaim(null);
            refresh();
          }}
        />
      )}

      {addOmOpen && (
        <OmModal
          disciplines={disciplines}
          onClose={() => setAddOmOpen(false)}
          onSaved={() => {
            setAddOmOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ===== Tab Bảo hành =====

function WarrantyTab({
  items,
  canManage,
  onEdit,
  onDelete,
}: {
  items: WarrantyItem[];
  canManage: boolean;
  onEdit: (item: WarrantyItem) => void;
  onDelete: (id: number) => void;
}) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Chưa có hạng mục bảo hành"
        message="Bấm “Thêm hạng mục” để thêm hạng mục cần theo dõi bảo hành."
      />
    );
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Hạng mục bảo hành">
        <table className="w-full text-sm sm:min-w-[820px]">
          <thead>
            <tr className="text-xs text-zinc-400 border-b border-zinc-800">
              <th className="text-left p-3">HẠNG MỤC</th>
              <th className="text-left p-3">HỆ</th>
              <th className="text-left p-3">BẮT ĐẦU</th>
              <th className="text-left p-3">HẠN BẢO HÀNH</th>
              <th className="text-left p-3">BẢO LÃNH</th>
              <th className="text-left p-3">TRẠNG THÁI</th>
              <th className="text-left p-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const expiry = warrantyExpiryClient(it);
              const overdue = it.status === "active" && expiry != null && expiry < todayISO();
              const soon =
                it.status === "active" &&
                !overdue &&
                expiry != null &&
                expiry <=
                  new Date(Date.now() + 7 * 3600_000 + 30 * 86400_000).toISOString().slice(0, 10);
              return (
                <tr key={it.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="p-3">
                    <p className="truncate max-w-[220px]">{it.title}</p>
                    {it.handoverItemTitle && (
                      <p className="text-xs text-zinc-500 truncate max-w-[220px]">
                        Từ bàn giao: {it.handoverItemTitle}
                      </p>
                    )}
                  </td>
                  <td className="p-3 text-xs text-zinc-400">{it.disciplineName ?? "—"}</td>
                  <td className="p-3 text-xs text-zinc-400">
                    {it.warrantyFrom ? formatDateVN(it.warrantyFrom) : "—"}
                  </td>
                  <td className="p-3 text-xs">
                    {expiry ? (
                      <span
                        className={
                          overdue
                            ? "text-rose-400 font-medium"
                            : soon
                              ? "text-amber-400 font-medium"
                              : "text-zinc-400"
                        }
                      >
                        {(overdue || soon) && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                        {formatDateVN(expiry)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-xs text-zinc-400">{it.guaranteeTitle ?? "—"}</td>
                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${WARRANTY_STATUS_BADGE[it.status]}`}
                    >
                      {WARRANTY_STATUS_LABEL[it.status]}
                    </span>
                  </td>
                  <td className="p-3">
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onEdit(it)}
                          aria-label="Sửa hạng mục bảo hành"
                          className="text-zinc-400 hover:text-white"
                          title="Sửa"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(it.id)}
                          aria-label="Xoá hạng mục bảo hành"
                          className="text-zinc-400 hover:text-rose-400"
                          title="Xoá"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Tab Claim =====

function ClaimsTab({
  items,
  canManage,
  onEdit,
  onDelete,
  onCycle,
}: {
  items: Claim[];
  canManage: boolean;
  onEdit: (item: Claim) => void;
  onDelete: (id: number) => void;
  onCycle: (item: Claim) => void;
}) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={Wrench}
        title="Chưa có claim bảo hành"
        message="Bấm “Thêm claim” để ghi nhận lỗi phát sinh sau bàn giao."
      />
    );
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Claim bảo hành">
        <table className="w-full text-sm sm:min-w-[820px]">
          <thead>
            <tr className="text-xs text-zinc-400 border-b border-zinc-800">
              <th className="text-left p-3">MÔ TẢ LỖI</th>
              <th className="text-left p-3">HẠNG MỤC</th>
              <th className="text-left p-3">MỨC ĐỘ</th>
              <th className="text-left p-3">HẠN XỬ LÝ</th>
              <th className="text-left p-3">NGƯỜI PHỤ TRÁCH</th>
              <th className="text-left p-3">TRẠNG THÁI</th>
              <th className="text-left p-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const overdue = c.status !== "closed" && c.dueDate != null && c.dueDate < todayISO();
              return (
                <tr key={c.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="p-3">
                    <p className="truncate max-w-[240px]">{c.description}</p>
                    {c.code && <p className="text-xs text-zinc-500">{c.code}</p>}
                  </td>
                  <td className="p-3 text-xs text-zinc-400">{c.warrantyItemTitle ?? "—"}</td>
                  <td className="p-3">
                    {c.severity ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CLAIM_SEVERITY_BADGE[c.severity]}`}
                      >
                        {CLAIM_SEVERITY_LABEL[c.severity]}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {c.dueDate ? (
                      <span className={overdue ? "text-rose-400 font-medium" : "text-zinc-400"}>
                        {overdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                        {formatDateVN(c.dueDate)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-xs text-zinc-400">{c.assigneeName ?? "—"}</td>
                  <td className="p-3">
                    <button
                      onClick={() => canManage && onCycle(c)}
                      disabled={!canManage}
                      aria-label={`Đổi trạng thái, hiện tại: ${CLAIM_STATUS_LABEL[c.status]}`}
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CLAIM_STATUS_BADGE[c.status]} ${
                        canManage ? "cursor-pointer hover:opacity-80" : "cursor-default"
                      }`}
                    >
                      {CLAIM_STATUS_LABEL[c.status]}
                    </button>
                  </td>
                  <td className="p-3">
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onEdit(c)}
                          aria-label="Sửa claim bảo hành"
                          className="text-zinc-400 hover:text-white"
                          title="Sửa"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(c.id)}
                          aria-label="Xoá claim bảo hành"
                          className="text-zinc-400 hover:text-rose-400"
                          title="Xoá"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Tab O&M =====

function OmTab({
  items,
  canManage,
  onDelete,
}: {
  items: OmDoc[];
  canManage: boolean;
  onDelete: (id: number) => void;
}) {
  if (items.length === 0)
    return (
      <EmptyState
        icon={BookOpen}
        title="Chưa có tài liệu O&M"
        message="Bấm “Thêm tài liệu” để upload hướng dẫn vận hành & bảo trì."
      />
    );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((d) => (
        <div key={d.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{d.title}</p>
              <p className="text-xs text-zinc-500">
                {d.disciplineName ? `${d.disciplineName} · ` : ""}
                {d.uploaderName ?? "—"} · {formatDateVN(d.createdAt.slice(0, 10))}
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => onDelete(d.id)}
                aria-label="Xoá tài liệu O&M"
                className="text-zinc-400 hover:text-rose-400 shrink-0"
                title="Xoá"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <a
            href={`/api/om-documents/${d.id}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs"
          >
            <Paperclip className="w-3.5 h-3.5" /> Xem tài liệu
          </a>
        </div>
      ))}
    </div>
  );
}

// ===== Modal Hạng mục bảo hành =====

function WarrantyItemModal({
  item,
  disciplines,
  handoverItems,
  guarantees,
  onClose,
  onSaved,
}: {
  item: WarrantyItem | null;
  disciplines: Discipline[];
  handoverItems: { id: number; title: string }[];
  guarantees: GuaranteeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [disciplineId, setDisciplineId] = useState<number | "">(item?.disciplineId ?? "");
  const [handoverItemId, setHandoverItemId] = useState<number | "">(item?.handoverItemId ?? "");
  const [warrantyFrom, setWarrantyFrom] = useState(item?.warrantyFrom ?? "");
  const [warrantyMonths, setWarrantyMonths] = useState(
    item?.warrantyMonths != null ? String(item.warrantyMonths) : "",
  );
  const [guaranteeId, setGuaranteeId] = useState<number | "">(item?.guaranteeId ?? "");
  const [status, setStatus] = useState<WarrantyItemStatus>(item?.status ?? "active");
  const [note, setNote] = useState(item?.note ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        title: title.trim(),
        disciplineId: disciplineId === "" ? null : disciplineId,
        handoverItemId: handoverItemId === "" ? null : handoverItemId,
        warrantyFrom: warrantyFrom || null,
        warrantyMonths: warrantyMonths === "" ? null : Number(warrantyMonths),
        guaranteeId: guaranteeId === "" ? null : guaranteeId,
        status,
        note: note.trim() || null,
      };
      const url = item ? `/api/warranty-items/${item.id}` : "/api/warranty-items";
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được hạng mục bảo hành");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {item ? "Sửa hạng mục bảo hành" : "Thêm hạng mục bảo hành"}
          </h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tên hạng mục
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Hệ
            <select
              value={disciplineId}
              onChange={(e) => setDisciplineId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa gán —</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Hạng mục bàn giao (tuỳ chọn)
            <select
              value={handoverItemId}
              onChange={(e) => setHandoverItemId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Không gắn —</option>
              {handoverItems.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày bắt đầu bảo hành
            <input
              type="date"
              value={warrantyFrom}
              onChange={(e) => setWarrantyFrom(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Số tháng bảo hành
            <input
              type="number"
              min={0}
              value={warrantyMonths}
              onChange={(e) => setWarrantyMonths(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Bảo lãnh bảo hành (tuỳ chọn)
          <select
            value={guaranteeId}
            onChange={(e) => setGuaranteeId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">— Không gắn —</option>
            {guarantees.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-400 block">
          Trạng thái
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as WarrantyItemStatus)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            {(Object.keys(WARRANTY_STATUS_LABEL) as WarrantyItemStatus[]).map((s) => (
              <option key={s} value={s}>
                {WARRANTY_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-400 block">
          Ghi chú
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

// ===== Modal Claim =====

function ClaimModal({
  item,
  warrantyItems,
  users,
  onClose,
  onSaved,
}: {
  item: Claim | null;
  warrantyItems: WarrantyItem[];
  users: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [warrantyItemId, setWarrantyItemId] = useState<number | "">(item?.warrantyItemId ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [reportedDate, setReportedDate] = useState(item?.reportedDate ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [severity, setSeverity] = useState<ClaimSeverity | "">(item?.severity ?? "");
  const [status, setStatus] = useState<ClaimStatus>(item?.status ?? "open");
  const [dueDate, setDueDate] = useState(item?.dueDate ?? "");
  const [resolution, setResolution] = useState(item?.resolution ?? "");
  const [assignee, setAssignee] = useState<number | "">(item?.assignee ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = description.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        warrantyItemId: warrantyItemId === "" ? null : warrantyItemId,
        code: code.trim() || null,
        reportedDate: reportedDate || null,
        description: description.trim(),
        severity: severity || null,
        status,
        dueDate: dueDate || null,
        resolution: resolution.trim() || null,
        assignee: assignee === "" ? null : assignee,
      };
      const url = item ? `/api/warranty-claims/${item.id}` : "/api/warranty-claims";
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được claim bảo hành");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{item ? "Sửa claim bảo hành" : "Thêm claim bảo hành"}</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Mô tả lỗi
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Hạng mục bảo hành (tuỳ chọn)
          <select
            value={warrantyItemId}
            onChange={(e) => setWarrantyItemId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">— Không gắn hạng mục —</option>
            {warrantyItems.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Mã (tuỳ chọn)
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Ngày báo lỗi
            <input
              type="date"
              value={reportedDate}
              onChange={(e) => setReportedDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Mức độ
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as ClaimSeverity | "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa xác định —</option>
              {(Object.keys(CLAIM_SEVERITY_LABEL) as ClaimSeverity[]).map((s) => (
                <option key={s} value={s}>
                  {CLAIM_SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Hạn xử lý
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Trạng thái
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ClaimStatus)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(CLAIM_STATUS_LABEL) as ClaimStatus[]).map((s) => (
                <option key={s} value={s}>
                  {CLAIM_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Người phụ trách
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa gán —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Hướng xử lý (tuỳ chọn)
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={2}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}

// ===== Modal O&M (upload) =====

function OmModal({
  disciplines,
  onClose,
  onSaved,
}: {
  disciplines: Discipline[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [disciplineId, setDisciplineId] = useState<number | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0 && file != null;

  async function submit() {
    if (!file) return;
    setSaving(true);
    setErr("");
    try {
      const form = new FormData();
      form.append("title", title.trim());
      if (disciplineId !== "") form.append("disciplineId", String(disciplineId));
      form.append("file", file);
      const res = await fetch("/api/om-documents", { method: "POST", body: form });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không upload được tài liệu");
        return;
      }
      onSaved();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm tài liệu O&M</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tên tài liệu
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Hệ (tuỳ chọn)
          <select
            value={disciplineId}
            onChange={(e) => setDisciplineId(e.target.value ? Number(e.target.value) : "")}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">— Chưa gán —</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit">
          <Upload className="w-4 h-4" />
          {file ? file.name : "Chọn tài liệu (PDF/ảnh)"}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </Modal>
  );
}
