"use client";
// Trang tra cứu & xuất audit trail toàn hệ (M43 PR2) — chỉ Admin. Đọc bảng audit_log
// ghi tự động bằng trigger Postgres (migrations/0049_audit_log.sql) qua
// GET /api/admin/audit-log, xuất Excel qua GET /api/admin/audit-log/export.
// Tách khỏi /admin (path đó đã dùng cho lịch sử phân công — assignment_log).
import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, History } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton, Skeleton } from "@/app/components/Skeleton";
import { fetchMe, type Me } from "@/app/lib/me";
import { ROLE_LABELS } from "@/lib/roles";
import { AUDIT_ENTITY_TYPES } from "@/lib/audit";

type AuditAction = "INSERT" | "UPDATE" | "DELETE";

type AuditRow = {
  id: number;
  at: string;
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
  entityType: string;
  entityId: number;
  action: AuditAction;
  changes: Record<string, [unknown, unknown]> | Record<string, unknown> | null;
  projectId: number | null;
  requestId: string | null;
};

const PAGE_SIZE = 50;

// Nhãn tiếng Việt cho entity_type (= tên bảng thật) — bám danh mục AUDIT_ENTITY_TYPES.
const ENTITY_LABEL: Record<string, string> = {
  contracts: "Hợp đồng",
  variation_orders: "Phát sinh (VO)",
  payment_certs: "Chứng nhận thanh toán (IPC)",
  invoices: "Hoá đơn",
  cash_transactions: "Giao dịch quỹ tiền mặt",
  advances: "Tạm ứng",
  payroll: "Bảng lương",
  purchase_orders: "Đơn mua hàng (PO)",
  task_documents: "Tài liệu công việc",
  baselines: "Baseline kế hoạch",
  insurance_bonds: "Bảo hiểm & bảo lãnh",
  claims: "Claim / gia hạn EOT",
};

const ACTION_LABEL: Record<AuditAction, string> = {
  INSERT: "Thêm mới",
  UPDATE: "Sửa",
  DELETE: "Xoá",
};

// Màu badge hành động — bám tinh thần lib/status.ts (lookup class tĩnh, không nối chuỗi).
const ACTION_CLS: Record<AuditAction, string> = {
  INSERT: "bg-emerald-900/60 text-emerald-300 border border-emerald-800",
  UPDATE: "bg-amber-900/60 text-amber-300 border border-amber-800",
  DELETE: "bg-red-900/60 text-red-300 border border-red-800",
};

function fmtDt(s: string) {
  const d = new Date(s);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export default function AuditLogPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [entity, setEntity] = useState("");
  const [entityId, setEntityId] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchMe()
      .then((u) => setMe(u))
      .finally(() => setMeLoading(false));
  }, []);

  const buildQuery = useCallback(
    (p: number) => {
      const q = new URLSearchParams();
      if (entity) q.set("entity", entity);
      if (entityId.trim()) q.set("entityId", entityId.trim());
      if (actorId.trim()) q.set("actorId", actorId.trim());
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      q.set("page", String(p));
      return q.toString();
    },
    [entity, entityId, actorId, from, to],
  );

  const load = useCallback(
    (p: number) => {
      setLoading(true);
      setError("");
      fetch(`/api/admin/audit-log?${buildQuery(p)}`)
        .then((r) => {
          if (r.status === 401) {
            window.location.href = "/login";
            return null;
          }
          return r.ok ? r.json() : Promise.reject(r);
        })
        .then((j) => {
          if (!j) return;
          setRows(j.rows ?? []);
          setTotal(j.total ?? 0);
        })
        .catch(() => setError("Không tải được audit trail — kiểm tra mạng rồi thử lại."))
        .finally(() => setLoading(false));
    },
    [buildQuery],
  );

  useEffect(() => {
    if (!me) return;
    setPage(0);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, entity, entityId, actorId, from, to]);

  useEffect(() => {
    if (!me) return;
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportExcel() {
    window.open(`/api/admin/audit-log/export?${buildQuery(0)}`, "_blank");
  }

  if (meLoading) return <PageSkeleton />;

  if (me && me.role !== "admin") {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Audit trail" subtitle="Sổ audit trail toàn hệ" />
        <main className="p-4 sm:p-6">
          <EmptyState
            icon={History}
            title="Không có quyền truy cập"
            message="Chỉ Admin mới xem được audit trail."
          />
        </main>
      </div>
    );
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Audit trail"
        subtitle="Lịch sử thay đổi dữ liệu tài chính/hợp đồng/nghiệm thu — ghi tự động"
        bottomActions={
          <button
            onClick={exportExcel}
            className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
          >
            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Xuất Excel</span>
          </button>
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-zinc-400">
              Thực thể
              <select
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                aria-label="Lọc theo loại thực thể"
                className="mt-1 block w-44 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">Tất cả</option>
                {AUDIT_ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ENTITY_LABEL[t] ?? t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              ID thực thể
              <input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                inputMode="numeric"
                placeholder="vd: 12"
                aria-label="Lọc theo ID thực thể"
                className="mt-1 block w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500"
              />
            </label>
            <label className="text-xs text-zinc-400">
              ID người thực hiện
              <input
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
                inputMode="numeric"
                placeholder="vd: 3"
                aria-label="Lọc theo ID người thực hiện"
                className="mt-1 block w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Từ ngày
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="Từ ngày"
                className="mt-1 block bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Đến ngày
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="Đến ngày"
                className="mt-1 block bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <p className="text-xs text-zinc-400">
            Tổng: <b className="text-zinc-100">{total}</b> bản ghi.
          </p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            title="Có lỗi xảy ra"
            message={error}
            action={
              <button
                onClick={() => load(page)}
                className="text-sm text-emerald-300 hover:text-emerald-200"
              >
                Thử lại
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={History}
            title="Chưa có bản ghi"
            message="Không có audit trail khớp bộ lọc hiện tại."
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Audit trail">
              <table className="w-full text-sm sm:min-w-[860px]">
                <thead className="sticky top-0 bg-zinc-900 z-10">
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3 w-8"></th>
                    <th className="text-left p-3">THỜI GIAN</th>
                    <th className="text-left p-3">NGƯỜI</th>
                    <th className="text-left p-3">THỰC THỂ</th>
                    <th className="text-left p-3">HÀNH ĐỘNG</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isOpen = expanded.has(row.id);
                    return (
                      <Fragment key={row.id}>
                        <tr
                          onClick={() => toggleExpand(row.id)}
                          className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 cursor-pointer"
                        >
                          <td className="p-3">
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                            )}
                          </td>
                          <td className="p-3 whitespace-nowrap text-zinc-300">{fmtDt(row.at)}</td>
                          <td className="p-3">
                            <p className="text-zinc-200">{row.actorName ?? "—"}</p>
                            <p className="text-xs text-zinc-400">
                              {row.actorRole
                                ? ((ROLE_LABELS as Record<string, string>)[row.actorRole] ??
                                  row.actorRole)
                                : "—"}
                            </p>
                          </td>
                          <td className="p-3 font-mono text-xs text-zinc-300">
                            {ENTITY_LABEL[row.entityType] ?? row.entityType} #{row.entityId}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_CLS[row.action]}`}
                            >
                              {ACTION_LABEL[row.action] ?? row.action}
                            </span>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-zinc-950/60">
                            <td colSpan={5} className="p-3">
                              <AuditDiff row={row} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-zinc-400">
              Trang {page + 1} / {totalPages}
            </span>
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 text-sm rounded-lg border border-zinc-700 disabled:opacity-30 hover:bg-zinc-800"
            >
              ← Trước
            </button>
            <button
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 text-sm rounded-lg border border-zinc-700 disabled:opacity-30 hover:bg-zinc-800"
            >
              Sau →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// Bảng con xem diff: UPDATE hiện cột | cũ | mới (highlight khác biệt); INSERT/DELETE
// hiện snapshot JSON gọn.
function AuditDiff({ row }: { row: AuditRow }) {
  if (!row.changes) return <p className="text-xs text-zinc-400">Không có dữ liệu thay đổi.</p>;

  if (row.action === "UPDATE") {
    const entries = Object.entries(row.changes as Record<string, [unknown, unknown]>);
    return (
      <div className="overflow-x-auto">
        <table className="text-xs w-full max-w-2xl">
          <thead>
            <tr className="text-zinc-400 border-b border-zinc-800">
              <th className="text-left py-1 pr-3">Cột</th>
              <th className="text-left py-1 pr-3">Giá trị cũ</th>
              <th className="text-left py-1">Giá trị mới</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([col, pair]) => (
              <tr key={col} className="border-b border-zinc-900 last:border-0">
                <td className="py-1 pr-3 font-mono text-zinc-300">{col}</td>
                <td className="py-1 pr-3 text-red-300">{fmtVal(pair[0])}</td>
                <td className="py-1 text-emerald-300">{fmtVal(pair[1])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all bg-zinc-900 border border-zinc-800 rounded-lg p-3 max-w-2xl">
      {JSON.stringify(row.changes, null, 2)}
    </pre>
  );
}
