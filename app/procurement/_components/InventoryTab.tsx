"use client";
import { useEffect, useState, useCallback, useRef, useDeferredValue, useMemo } from "react";
import {
  Package,
  Plus,
  Trash2,
  AlertTriangle,
  History,
  X,
  ChevronUp,
  ChevronDown,
  Copy,
  EyeOff,
  Eye,
  ClipboardCopy,
  Pencil,
  Check,
  FileUp,
  Search,
  Building2,
  ShoppingCart,
  ClipboardList,
  BarChart2,
  ArrowDownToLine,
  ArrowUpFromLine,
  PenLine,
  LockOpen,
  Table2,
  RefreshCw,
  QrCode,
} from "lucide-react";
import { fetchMe, redirectToLogin } from "@/app/lib/me";
import EditableText from "@/app/components/EditableText";
import EditModeToggle from "@/app/components/EditModeToggle";
import { Modal, appConfirm, appPrompt } from "@/app/components/dialogs";
import { Skeleton } from "@/app/components/Skeleton";
import SpreadsheetGrid, { type GridColumn, type GridEdit } from "@/app/components/SpreadsheetGrid";
import CustomFieldsSection from "@/app/components/CustomFieldsSection";
import { formatDateTimeVN } from "@/lib/date";

export type Material = {
  id: number;
  sheetTypeId: number | null;
  boqCode: string | null;
  name: string;
  unit: string | null;
  qtyBoq: number;
  qtyPlanned: number;
  qtyUsed: number;
  qtyStock: number;
  minStockLevel: number;
  status: string;
  note: string | null;
  custom: Record<string, unknown>;
  sheetCode: string | null;
};

type Sheet = { id: number; code: string; name: string };

const DVT_OPTIONS = ["Cái", "Mét", "m2", "Ống", "Bộ", "Kg", "Cây", "Cuộn"].map((u) => ({
  value: u,
  label: u,
}));

function budgetStatus(m: Material): "none" | "over" | "within" {
  if ((m.qtyBoq ?? 0) <= 0) return "none";
  return (m.qtyPlanned ?? 0) > (m.qtyBoq ?? 0) ? "over" : "within";
}

const BUDGET_LABEL: Record<"none" | "over" | "within", string> = {
  none: "—",
  over: "Vượt ĐM",
  within: "Trong ĐM",
};

type ColKey =
  | "boqCode"
  | "stt"
  | "name"
  | "unit"
  | "qtyBoq"
  | "qtyPlanned"
  | "qtyStock"
  | "qtyUsed"
  | "diff"
  | "status"
  | "note";

const DEFAULT_LABELS: Record<ColKey, string> = {
  boqCode: "Mã BOQ",
  stt: "STT",
  name: "Mô Tả",
  unit: "ĐVT",
  qtyBoq: "Định mức BOQ",
  qtyPlanned: "Định mức Tháp A",
  qtyStock: "Tồn kho",
  qtyUsed: "Đã xuất",
  diff: "Chênh lệch ĐM",
  status: "Trạng thái",
  note: "Ghi chú",
};

const ALL_COL_KEYS: ColKey[] = [
  "boqCode",
  "stt",
  "name",
  "unit",
  "qtyBoq",
  "qtyPlanned",
  "qtyStock",
  "qtyUsed",
  "diff",
  "status",
  "note",
];

type SyncSummary = {
  pushed: number;
  pulled: number;
  created: number;
  total: number;
  conflicts: { id: number; name: string; winner: "db" | "sheet" }[];
  skipped: { row: number; reason: string }[];
};

export default function InventoryTab({ onSwitchToOrders }: { onSwitchToOrders?: () => void }) {
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetFilter, setSheetFilter] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [canAdmin, setCanAdmin] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [sheetMode, setSheetMode] = useState(true);
  const [error, setError] = useState("");
  const [historyMat, setHistoryMat] = useState<Material | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncSummary | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(new Set());
  const [colMenu, setColMenu] = useState<ColKey | null>(null);
  const [colLabels, setColLabels] = useState<Record<ColKey, string>>({ ...DEFAULT_LABELS });
  const [editingLabel, setEditingLabel] = useState<ColKey | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (revalidate = false) => {
      setLoading(true);
      const q = sheetFilter ? `?sheetTypeId=${sheetFilter}` : "";
      fetch(`/api/materials${q}`)
        .then(async (r) => {
          if (r.status === 401) {
            await redirectToLogin();
            return;
          }
          if (!r.ok) {
            const j = await r.json().catch(() => null);
            setError(j?.error ?? `Lỗi tải danh sách vật tư (${r.status})`);
            setLoading(false);
            return;
          }
          const j = await r.json().catch(() => ({ materials: [] }));
          setMaterials(j.materials ?? []);
          setError("");
          setLoading(false);
        })
        .catch(() => {
          setError("Mất kết nối mạng — không tải được danh sách vật tư");
          setLoading(false);
        });
    },
    [sheetFilter],
  );

  useEffect(() => {
    Promise.all([fetchMe(), fetch("/api/sheets"), fetch("/api/materials/columns")]).then(
      async ([user, sheetsRes, colsRes]) => {
        if (!user) return;
        const [sheetsJ, colsJ] = await Promise.all([
          sheetsRes.json(),
          colsRes.json().catch(() => ({})),
        ]);
        const r = user.role;
        setRole(r ?? "");
        setUserId(user.id ?? null);
        setCanEdit(r === "admin" || r === "pm" || r === "engineer");
        setCanDelete(r === "admin" || r === "pm");
        setCanAdmin(r === "admin" || r === "pm");
        setSheets(sheetsJ.sheets ?? []);
        if (colsJ.labels && typeof colsJ.labels === "object") {
          setColLabels((prev) => ({ ...prev, ...colsJ.labels }));
        }
      },
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveLabel = async (key: ColKey) => {
    const val = labelDraft.trim();
    if (!val) {
      setEditingLabel(null);
      return;
    }
    const updated = { ...colLabels, [key]: val };
    setColLabels(updated);
    setEditingLabel(null);
    try {
      await fetch("/api/materials/columns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: { [key]: val } }),
      });
    } catch {
      // Ignore
    }
  };

  const removeRows = async (ids: (number | string)[]) => {
    if (!canDelete || !ids.length) return;
    const ok = await appConfirm(
      ids.length === 1
        ? "Xoá vật tư này?"
        : `Xoá ${ids.length} vật tư đã chọn? Hành động không thể hoàn tác.`,
    );
    if (!ok) return;
    for (const rawId of ids) {
      const id = Number(rawId);
      const res = await fetch(`/api/materials/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMaterials((prev) => prev.filter((m) => m.id !== id));
      }
    }
  };

  const addBlankRow = async () => {
    if (!canEdit) return;
    const sheetId = sheetFilter ? Number(sheetFilter) : (sheets[0]?.id ?? null);
    const res = await fetch("/api/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetTypeId: sheetId,
        name: "Vật tư mới",
        unit: "Cái",
        qtyBoq: 0,
        qtyPlanned: 0,
        qtyUsed: 0,
        qtyStock: 0,
      }),
    });
    if (res.ok) {
      load(true);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError("");
    try {
      const res = await fetch("/api/materials/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Lỗi đồng bộ");
      } else {
        setSyncResult(j.summary);
        load(true);
      }
    } catch {
      setError("Mất kết nối mạng — không đồng bộ được");
    } finally {
      setSyncing(false);
    }
  };

  const q = useDeferredValue(search.trim().toLowerCase());
  const filtered = useMemo(() => {
    if (!q) return materials;
    return materials.filter(
      (m) =>
        (m.boqCode && m.boqCode.toLowerCase().includes(q)) ||
        m.name.toLowerCase().includes(q) ||
        (m.unit && m.unit.toLowerCase().includes(q)) ||
        (m.sheetCode && m.sheetCode.toLowerCase().includes(q)),
    );
  }, [materials, q]);

  const idxMap = useMemo(() => {
    const map = new Map<number, number>();
    materials.forEach((m, idx) => map.set(m.id, idx + 1));
    return map;
  }, [materials]);

  const visibleCols = useMemo(() => {
    return ALL_COL_KEYS.filter((k) => !hiddenCols.has(k));
  }, [hiddenCols]);

  const gridColumns = useMemo<GridColumn<Material>[]>(() => {
    const editableBy = (adminOnly: boolean) => (m: Material) =>
      adminOnly ? canAdmin && editMode : canEdit && editMode;

    const defs: Record<ColKey, GridColumn<Material>> = {
      boqCode: {
        key: "boqCode",
        label: colLabels.boqCode,
        width: 100,
        type: "text",
        editable: editableBy(true),
        get: (m) => m.boqCode ?? "",
        toPatch: (raw) => ({ boqCode: raw.trim().toUpperCase() || null }),
      },
      stt: {
        key: "stt",
        label: colLabels.stt,
        width: 60,
        type: "readonly",
        align: "center",
        get: (m) => idxMap.get(m.id) ?? "",
      },
      name: {
        key: "name",
        label: colLabels.name,
        width: 280,
        type: "text",
        editable: editableBy(false),
        get: (m) => m.name,
        toPatch: (raw) => ({ name: raw.trim() }),
      },
      unit: {
        key: "unit",
        label: colLabels.unit,
        width: 80,
        type: "select",
        options: DVT_OPTIONS,
        editable: editableBy(false),
        get: (m) => m.unit ?? "",
        toPatch: (raw) => ({ unit: raw || null }),
      },
      qtyBoq: {
        key: "qtyBoq",
        label: colLabels.qtyBoq,
        width: 120,
        type: "number",
        editable: editableBy(true),
        get: (m) => m.qtyBoq ?? 0,
        toPatch: (raw) => ({ qtyBoq: Number(raw) || 0 }),
      },
      qtyPlanned: {
        key: "qtyPlanned",
        label: colLabels.qtyPlanned,
        width: 130,
        type: "number",
        editable: editableBy(false),
        get: (m) => m.qtyPlanned ?? 0,
        toPatch: (raw) => ({ qtyPlanned: Number(raw) || 0 }),
      },
      qtyStock: {
        key: "qtyStock",
        label: colLabels.qtyStock,
        width: 100,
        type: "number",
        editable: editableBy(false),
        get: (m) => m.qtyStock ?? 0,
        toPatch: (raw) => ({ qtyStock: Number(raw) || 0 }),
      },
      qtyUsed: {
        key: "qtyUsed",
        label: colLabels.qtyUsed,
        width: 100,
        type: "number",
        editable: editableBy(false),
        get: (m) => m.qtyUsed ?? 0,
        toPatch: (raw) => ({ qtyUsed: Number(raw) || 0 }),
      },
      diff: {
        key: "diff",
        label: colLabels.diff,
        width: 100,
        type: "readonly",
        get: (m) => ((m.qtyBoq ?? 0) > 0 ? (m.qtyBoq ?? 0) - (m.qtyPlanned ?? 0) : "—"),
      },
      status: {
        key: "status",
        label: colLabels.status,
        width: 110,
        type: "readonly",
        align: "center",
        get: (m) => BUDGET_LABEL[budgetStatus(m)],
      },
      note: {
        key: "note",
        label: colLabels.note,
        width: 180,
        type: "text",
        editable: editableBy(false),
        get: (m) => m.note ?? "",
        toPatch: (raw) => ({ note: raw.trim() || null }),
      },
    };
    return visibleCols.map((k) => defs[k]);
  }, [visibleCols, colLabels, idxMap, canAdmin, canEdit, editMode]);

  const commitGrid = useCallback(
    async (edits: GridEdit[]) => {
      setError("");
      const res = await fetch("/api/materials/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: edits.map((e) => ({ id: e.rowId, patch: e.patch })) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j.error ?? "Lỗi lưu";
        setError(msg);
        throw new Error(msg);
      }
      load(true);
    },
    [load],
  );

  return (
    <div className="space-y-4">
      {/* Cảnh báo */}
      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/80 text-red-200 px-4 py-2.5 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {(() => {
        const over = materials.filter((m) => m.qtyPlanned > 0 && m.qtyUsed > m.qtyPlanned);
        return (
          over.length > 0 && (
            <div className="rounded-xl border border-red-800 bg-red-950/80 text-red-200 px-4 py-2.5 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <b>{over.length}</b> vật tư vượt định mức:{" "}
                {over
                  .slice(0, 5)
                  .map((m) => m.name)
                  .join(", ")}
                {over.length > 5 ? "…" : ""}
              </span>
            </div>
          )
        );
      })()}

      {(() => {
        const low = materials.filter(
          (m) => m.minStockLevel > 0 && (m.qtyStock ?? 0) < m.minStockLevel,
        );
        return (
          low.length > 0 && (
            <div className="rounded-xl border border-amber-800 bg-amber-950/80 text-amber-200 px-4 py-2.5 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <b>{low.length}</b> vật tư tồn kho dưới mức an toàn:{" "}
                {low
                  .slice(0, 4)
                  .map((m) => m.name)
                  .join(", ")}
                {low.length > 4 ? "…" : ""}
              </span>
            </div>
          )
        );
      })()}

      {/* Thanh công cụ / tìm kiếm / bộ lọc */}
      <div className="flex flex-wrap gap-2.5 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo Mã BOQ, tên vật tư, ĐVT..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition h-10"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={sheetFilter}
            onChange={(e) => setSheetFilter(e.target.value)}
            aria-label="Lọc theo hệ WBS"
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-200 outline-none focus:border-amber-500 h-10"
          >
            <option value="">Tất cả phân hệ WBS</option>
            {sheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <EditModeToggle
              canEdit={canEdit}
              editMode={editMode}
              onToggle={() => setEditMode((v) => !v)}
            />
          )}

          {canEdit && (
            <button
              onClick={() => setSheetMode((v) => !v)}
              title={
                sheetMode
                  ? "Tắt chế độ bảng tính"
                  : "Bật chế độ bảng tính (copy/paste/fill như Excel)"
              }
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition shrink-0 border h-10 ${
                sheetMode
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white"
              }`}
            >
              <Table2 className="w-4 h-4" /> Bảng tính
            </button>
          )}

          {canEdit && (
            <button
              onClick={addBlankRow}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-zinc-950 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition shrink-0 shadow h-10"
            >
              <Plus className="w-4 h-4" /> Thêm Dòng
            </button>
          )}

          {canAdmin && (
            <button
              onClick={runSync}
              disabled={syncing}
              title="Đồng bộ hai chiều với Google Sheets"
              className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition shrink-0 disabled:opacity-50 h-10"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />{" "}
              {syncing ? "Đang đồng bộ…" : "Đồng bộ Sheet"}
            </button>
          )}

          <a
            href="/materials/import"
            className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition shrink-0 h-10"
          >
            <FileUp className="w-4 h-4" /> Import Excel
          </a>
        </div>
      </div>

      {/* Trạng thái kết quả tìm kiếm */}
      {q && (
        <p className="text-xs text-zinc-400">
          Tìm thấy <span className="text-amber-400 font-semibold">{filtered.length}</span> /{" "}
          {materials.length} vật tư
        </p>
      )}

      {/* Lưới dữ liệu */}
      {loading && materials.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-sm">
          <SpreadsheetGrid<Material>
            rows={filtered}
            columns={gridColumns}
            rowKey={(m) => m.id}
            onCommit={commitGrid}
            readOnly={!canEdit}
            editMode={editMode}
            stickyCols={3}
            maxBodyHeight={Math.round(
              typeof window !== "undefined" ? window.innerHeight * 0.65 : 550,
            )}
            onAddRow={canEdit ? addBlankRow : undefined}
            onDeleteRows={canDelete ? removeRows : undefined}
          />
          {filtered.length === 0 && (
            <div className="p-12 text-center text-zinc-400 text-sm space-y-2">
              <Package className="w-8 h-8 text-zinc-600 mx-auto" />
              <p>
                {q
                  ? `Không tìm thấy vật tư nào khớp "${search}"`
                  : "Chưa có vật tư nào trong phân hệ đã chọn."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
