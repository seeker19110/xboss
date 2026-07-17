"use client";
import { useEffect, useState, useCallback, use, useDeferredValue } from "react";
import {
  Pencil,
  X,
  RefreshCw,
  WifiOff,
  CloudUpload,
  Printer,
  Eye,
  EyeOff,
  Trash2,
  Plus,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EditableText from "@/app/components/EditableText";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { PageSkeleton } from "@/app/components/Skeleton";
import { toSlug } from "@/lib/sheets";
import { useEditMode } from "@/app/components/useEditMode";
import EditModeToggle from "@/app/components/EditModeToggle";
import { ROLE_LABELS } from "@/lib/roles";
import { fetchMe } from "@/app/lib/me";
import { sortFloorsDesc } from "@/lib/floors";
import { useTrackingData } from "./useTrackingData";
import { TrackingToolbar } from "./TrackingToolbar";
import { TrackingGrid } from "./TrackingGrid";
import type { UserItem } from "./types";

// Màn hẹp (điện thoại ngoài công trường): 4 cột sticky chiếm 526px sẽ nuốt hết
// viewport — thu lại chỉ giữ cột tên task sticky để vẫn tick checkbox được.
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

export default function TrackingPage({ params }: { params: Promise<{ sheet: string }> }) {
  const { sheet } = use(params);
  const {
    data,
    loading,
    load,
    refreshKey,
    syncToast,
    pendingFronts,
    qcBlocked,
    offlinePending,
    online,
    enqueue,
  } = useTrackingData(sheet);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  // ?floor=4F trên URL (từ heatmap Dashboard) → mở sẵn filter tầng.
  const [floorFilter, setFloorFilter] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("floor") ?? "")
      : "",
  );
  const [statusFilter, setStatusFilter] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [canProgress, setCanProgress] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sheetModal, setSheetModal] = useState<{
    name: string;
    code: string;
    slug: string;
    responsible: string;
    managerId: number | null;
  } | null>(null);
  const [sheetUsers, setSheetUsers] = useState<UserItem[]>([]);
  const [sheetErr, setSheetErr] = useState("");
  const [addPkgModal, setAddPkgModal] = useState<{
    code: string;
    name: string;
    floorLabel: string;
    copyFromId: number | "";
  } | null>(null);
  const [addPkgErr, setAddPkgErr] = useState("");
  const [addPkgSaving, setAddPkgSaving] = useState(false);
  const [printPanel, setPrintPanel] = useState(false);
  const [printTitle, setPrintTitle] = useState("");
  const [hiddenPrintCols, setHiddenPrintCols] = useState<Set<string>>(new Set());
  const [allSheetCols, setAllSheetCols] = useState<string[]>([]);
  const handleColsLoaded = useCallback((cols: string[]) => {
    setAllSheetCols((prev) => {
      const merged = [...new Set([...prev, ...cols])];
      return merged.length !== prev.length ? merged : prev;
    });
  }, []);
  const isMobile = useIsMobile();
  // canProgress = bất kỳ role nào không phải xem thuần (engineer, subcon, pm, admin)
  const { editMode, toggle: toggleEditMode } = useEditMode(canProgress || canEdit);

  // Chọn 1 tầng (dropdown hoặc ?floor= từ link timeline) → tự mở các nhóm thuộc
  // tầng đó thay vì để đóng như mặc định, để không phải bấm mở lại thủ công.
  useEffect(() => {
    if (!floorFilter || !data?.packages) return;
    setExpanded((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of data.packages) {
        if (p.floorLabel === floorFilter && !next[p.id]) {
          next[p.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [floorFilter, data]);

  useEffect(() => {
    fetchMe().then((user) => {
      if (!user) return;
      const role = user.role;
      const editable = role === "admin" || role === "pm";
      setCanEdit(editable);
      setCanProgress(!["bch", "cdt", "viewer"].includes(role ?? ""));
      setIsAdmin(role === "admin");
    });
  }, []);

  // Trước khi in: ghi đè width cột cố định qua JS (!important CSS không override inline style trong Chrome print).
  useEffect(() => {
    const PRINT_WIDTHS: Record<string, string> = {
      "col-boq": "70px",
      "col-stt": "32px",
      "col-name": "190px",
      "col-pct": "26px",
      "col-date": "40px",
      "col-days": "26px",
      "col-dim": "48px",
    };
    const saved = new Map<HTMLElement, string>();
    const before = () => {
      Object.entries(PRINT_WIDTHS).forEach(([cls, w]) => {
        // Chỉ ghi đè col KHÔNG ẩn — col đang ẩn giữ nguyên width:0 từ CSS
        document
          .querySelectorAll<HTMLElement>(`col.${cls}:not(.print-hidden-col)`)
          .forEach((el) => {
            saved.set(el, el.style.width);
            el.style.width = w;
          });
      });
    };
    const after = () => {
      saved.forEach((w, el) => {
        el.style.width = w;
      });
      saved.clear();
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  // Đổi tên / mã / đường dẫn của trang tracking (sheet) — slug đổi thì chuyển sang URL mới.
  async function saveSheet() {
    if (!sheetModal || !data?.sheet.id) return;
    const res = await fetch(`/api/sheets/${data.sheet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: sheetModal.name,
        code: sheetModal.code,
        slug: sheetModal.slug,
        responsible: sheetModal.responsible,
        managerId: sheetModal.managerId,
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setSheetErr(j?.error ?? "Không lưu được");
      return;
    }
    if (j.sheet.slug !== sheet) {
      window.location.href = `/tracking/${j.sheet.slug}`;
      return;
    }
    setSheetModal(null);
    load();
  }

  // Thêm hạng mục (nhóm) mới — tạo trống hoặc sao chép cấu trúc (task + cột checkbox)
  // từ 1 nhóm có sẵn trong cùng trang tracking.
  async function saveAddPkg() {
    if (!addPkgModal || !data?.sheet.id) return;
    const code = addPkgModal.code.trim();
    const name = addPkgModal.name.trim();
    if (!code || !name) {
      setAddPkgErr("Thiếu mã hoặc tên nhóm");
      return;
    }
    setAddPkgSaving(true);
    setAddPkgErr("");
    const floorLabel = addPkgModal.floorLabel.trim();
    const res = addPkgModal.copyFromId
      ? await fetch(`/api/workpackages/${addPkgModal.copyFromId}/copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // floorLabel chỉ gửi khi có nhập — bỏ trống thì giữ nguyên tầng của nhóm gốc
          // (route /copy coi floorLabel=null như chuỗi "null" nếu ép kiểu String()).
          body: JSON.stringify({
            code,
            name,
            afterId: addPkgModal.copyFromId,
            ...(floorLabel ? { floorLabel } : {}),
          }),
        })
      : await fetch(`/api/workpackages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheetTypeId: data.sheet.id,
            code,
            name,
            floorLabel: floorLabel || null,
          }),
        });
    setAddPkgSaving(false);
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setAddPkgErr(j?.error ?? "Không tạo được nhóm");
      return;
    }
    setAddPkgModal(null);
    load();
  }

  async function deleteSheet() {
    if (!data?.sheet.id) return;
    if (
      !(await appConfirm(
        `Xoá trang "${data.sheet.name}" cùng TOÀN BỘ nhóm, task, checkbox và vật tư của nó? Không hoàn tác được.`,
        { danger: true, confirmLabel: "Xoá trang" },
      ))
    )
      return;
    const res = await fetch(`/api/sheets/${data.sheet.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setSheetErr(j?.error ?? "Không xoá được");
      return;
    }
    window.location.href = "/";
  }

  if (loading) return <PageSkeleton />;

  const floors = [
    ...new Set((data?.packages ?? []).map((p) => p.floorLabel).filter((f): f is string => !!f)),
  ].sort(sortFloorsDesc);
  const q = deferredQuery.toLowerCase();
  const packages = (data?.packages ?? []).filter(
    (p) =>
      (!q ||
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.boqCode ?? "").toLowerCase().includes(q)) &&
      (!floorFilter || p.floorLabel === floorFilter) &&
      (!statusFilter || p.status === statusFilter),
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        back
        search={false}
        title={
          <>
            {data?.sheet.name ?? sheet}
            {canEdit && editMode && data?.sheet.id && (
              <button
                onClick={() => {
                  setSheetErr("");
                  setSheetModal({
                    name: data.sheet.name,
                    code: data.sheet.code,
                    slug: data.sheet.slug ?? sheet,
                    responsible: data.sheet.responsible ?? "",
                    managerId: data.sheet.managerId ?? null,
                  });
                  fetch("/api/users")
                    .then((r) => (r.ok ? r.json() : { users: [] }))
                    .then((j) => setSheetUsers(j.users ?? []));
                }}
                title="Đổi tên / đường dẫn trang"
                aria-label="Đổi tên / đường dẫn trang"
                className="text-zinc-600 hover:text-amber-400"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        }
        subtitle={`${data?.sheet.code ?? ""} ${data?.sheet.responsible ? `· ${data.sheet.responsible}` : ""}`}
      >
        <button
          onClick={() => {
            setPrintTitle(
              (prev) =>
                prev ||
                `${data?.sheet.name ?? ""}${data?.sheet.responsible ? " - " + data.sheet.responsible : ""}`,
            );
            setPrintPanel((p) => !p);
          }}
          title="In PDF / Xuất bảng tracking"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        >
          <Printer className="w-4 h-4" /> <span className="hidden sm:inline">In PDF</span>
        </button>
        <EditModeToggle
          canEdit={canProgress || canEdit}
          editMode={editMode}
          onToggle={toggleEditMode}
        />
      </AppHeader>

      {/* Modal thêm hạng mục (nhóm) mới — tạo trống hoặc sao chép cấu trúc từ nhóm có sẵn */}
      {addPkgModal && (
        <Modal onClose={() => setAddPkgModal(null)}>
          <div className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" /> Thêm hạng mục mới
            </h3>
            <label className="block text-xs text-zinc-400 mb-1">Mã nhóm</label>
            <input
              autoFocus
              value={addPkgModal.code}
              onChange={(e) => setAddPkgModal((m) => m && { ...m, code: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-600 font-mono"
            />
            <label className="block text-xs text-zinc-400 mb-1">Tên hạng mục</label>
            <input
              value={addPkgModal.name}
              onChange={(e) => setAddPkgModal((m) => m && { ...m, name: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-600"
            />
            <label className="block text-xs text-zinc-400 mb-1">Tầng (tuỳ chọn)</label>
            <input
              value={addPkgModal.floorLabel}
              onChange={(e) => setAddPkgModal((m) => m && { ...m, floorLabel: e.target.value })}
              placeholder="vd: 4F"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-600"
            />
            <label className="block text-xs text-zinc-400 mb-1">
              Sao chép cấu trúc từ hạng mục có sẵn (tuỳ chọn)
            </label>
            <select
              value={addPkgModal.copyFromId}
              onChange={(e) =>
                setAddPkgModal(
                  (m) => m && { ...m, copyFromId: e.target.value ? Number(e.target.value) : "" },
                )
              }
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-emerald-600"
            >
              <option value="">— Tạo trống, không sao chép —</option>
              {(data?.packages ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name} ({p.tasks.length} task)
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500 mb-3">
              Chọn 1 hạng mục để sao chép toàn bộ task và cột checkbox của nó (trạng thái/tiến độ
              reset về chưa làm). Mã BOQ không được sao chép — mỗi hạng mục phải tự gán mã riêng.
            </p>
            {addPkgErr && <p className="text-xs text-red-400 mb-2">{addPkgErr}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAddPkgModal(null)}
                className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg"
              >
                Huỷ
              </button>
              <button
                onClick={saveAddPkg}
                disabled={!addPkgModal.code.trim() || !addPkgModal.name.trim() || addPkgSaving}
                className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg font-medium text-on-accent"
              >
                {addPkgSaving ? "Đang lưu..." : "Tạo hạng mục"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Panel in PDF (ẩn khi in thật) ── */}
      {printPanel && (
        <div className="no-print px-6 py-4 bg-zinc-900 border-b border-zinc-700 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-zinc-400 shrink-0">Tiêu đề bảng in:</span>
            <input
              value={printTitle}
              onChange={(e) => setPrintTitle(e.target.value)}
              className="flex-1 min-w-60 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:border-emerald-600 font-semibold uppercase"
            />
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium shrink-0 text-on-accent"
            >
              <Printer className="w-4 h-4" /> In / Lưu PDF
            </button>
            <button
              onClick={() => setPrintPanel(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500 shrink-0">Ẩn cột khi in:</span>
            {(["BOQ", "STT", "Công việc", "%", "Ngày BĐ", "Số ngày", "Ngày KT"] as const).map(
              (col) => {
                const hidden = hiddenPrintCols.has(col);
                return (
                  <button
                    key={col}
                    onClick={() =>
                      setHiddenPrintCols((s) => {
                        const n = new Set(s);
                        hidden ? n.delete(col) : n.add(col);
                        return n;
                      })
                    }
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition ${hidden ? "bg-zinc-800 border-zinc-700 text-zinc-500 line-through" : "bg-zinc-700 border-zinc-600 text-zinc-200"}`}
                  >
                    {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {col}
                  </button>
                );
              },
            )}
            {allSheetCols.length > 0 && <span className="text-zinc-700 text-[11px]">|</span>}
            {allSheetCols.map((col) => {
              const hidden = hiddenPrintCols.has(col);
              return (
                <button
                  key={col}
                  onClick={() =>
                    setHiddenPrintCols((s) => {
                      const n = new Set(s);
                      hidden ? n.delete(col) : n.add(col);
                      return n;
                    })
                  }
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition ${hidden ? "bg-zinc-800 border-zinc-700 text-zinc-500 line-through" : "bg-zinc-700 border-zinc-600 text-zinc-200"}`}
                >
                  {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {col}
                </button>
              );
            })}
            {hiddenPrintCols.size > 0 && (
              <button
                onClick={() => setHiddenPrintCols(new Set())}
                className="text-xs text-zinc-500 hover:text-emerald-400"
              >
                Bỏ ẩn tất cả
              </button>
            )}
          </div>
          <p className="text-[11px] text-zinc-600">
            Mở rộng các nhóm cần in trước, sau đó bấm &quot;In / Lưu PDF&quot;. Khổ giấy đề xuất: A3
            ngang.
          </p>
        </div>
      )}

      {/* Tiêu đề chỉ hiện khi in */}
      {printTitle && (
        <div className="hidden print:block w-full bg-[#808080] py-3 text-center">
          <span className="text-white font-bold uppercase tracking-wide text-sm">{printTitle}</span>
        </div>
      )}

      <TrackingToolbar
        query={query}
        onQueryChange={setQuery}
        floorFilter={floorFilter}
        onFloorFilterChange={setFloorFilter}
        floors={floors}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        showAddPkg={!!(canEdit && editMode && data?.sheet.id)}
        onAddPkg={() => {
          setAddPkgErr("");
          setAddPkgModal({ code: "", name: "", floorLabel: "", copyFromId: "" });
        }}
        packagesCount={packages.length}
      />

      <main className="p-4">
        {/* Vùng cuộn ngang chung — tất cả nhóm chia sẻ 1 scrollbar,
            cột căn thẳng nhau khi mở/đóng nhóm */}
        <div className="overflow-x-auto scrollbar-none">
          <div className="space-y-2" style={{ width: "max-content", minWidth: "100%" }}>
            {packages.map((p, pi) => (
              <div
                key={p.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
              >
                <TrackingGrid
                  pkg={p}
                  pkgIdx={pi}
                  pkgCount={packages.length}
                  expanded={!!expanded[p.id]}
                  onToggle={() => setExpanded((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  canEdit={canEdit}
                  editMode={editMode}
                  refreshKey={refreshKey}
                  isMobile={isMobile}
                  onChanged={load}
                  onOfflineTick={enqueue}
                  hiddenPrintCols={hiddenPrintCols}
                  onColsLoaded={handleColsLoaded}
                  sheetCols={allSheetCols}
                  pendingFront={!!p.floorLabel && pendingFronts.has(p.floorLabel)}
                  qcReason={qcBlocked.get(p.id)}
                />
              </div>
            ))}
            {packages.length === 0 && (
              <div className="p-8 text-center text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
                {"Không có dữ liệu. Hãy import file Excel hoặc copy từ trang khác."}
              </div>
            )}
          </div>
        </div>
      </main>

      {syncToast && (
        <div
          className="app-toast-center fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-emerald-900 border border-emerald-700 text-emerald-200 px-4 py-2 rounded-full text-sm shadow-xl"
          style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Dữ liệu vừa được người khác cập nhật —
          đã làm mới
        </div>
      )}

      {(!online || offlinePending > 0) && (
        <div
          className={`app-toast-center fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-sm shadow-xl border ${
            online
              ? "bg-sky-900 border-sky-700 text-sky-200"
              : "bg-amber-900 border-amber-700 text-amber-200"
          }`}
          style={{ bottom: "max(4rem, env(safe-area-inset-bottom, 0px) + 3.5rem)" }}
        >
          {online ? (
            <>
              <CloudUpload className="w-3.5 h-3.5 animate-pulse" /> Đang gửi lại {offlinePending}{" "}
              thay đổi đã lưu offline...
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" /> Mất mạng — thao tác vẫn được lưu
              {offlinePending > 0 ? ` (${offlinePending} chờ gửi)` : ""}, tự đồng bộ khi có mạng
            </>
          )}
        </div>
      )}

      {/* Modal đổi tên / đường dẫn trang */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; color: #000 !important; }
          @page { margin: 8mm; size: A3 landscape; }
          /* Cột ẩn: display:none đồng thời trên col VÀ th/td → layout không lệch vì cả hai phía đều bị loại */
          col.print-hidden-col { display: none !important; }
          th.print-hidden-col, td.print-hidden-col { display: none !important; }
          /* Thu nhỏ cột cố định còn lại khi in A3 ngang (beforeprint JS cũng ghi đè inline style) */
          col.col-boq  { width: 70px  !important; }
          col.col-stt  { width: 32px  !important; }
          col.col-name { width: 190px !important; }
          col.col-pct  { width: 26px  !important; }
          col.col-date { width: 40px  !important; }
          col.col-days { width: 26px  !important; }
          col.col-dim  { width: 48px  !important; }
          table { border-collapse: collapse !important; font-size: 8.5pt !important; }
          th, td { border: 1px solid #ccc !important; background: #fff !important; color: #000 !important; padding: 2px 4px !important; }
          thead th { background: #f0f0f0 !important; font-weight: bold !important; }
          input[type="checkbox"] { width: 12px !important; height: 12px !important; }
          .print-pkg-header td { background: #e8e8e8 !important; font-weight: bold !important; }
          .dim-col-label { writing-mode: horizontal-tb !important; transform: none !important; text-align: center !important; word-break: break-all !important; font-size: 7pt !important; }
        }
      `}</style>

      {sheetModal && (
        <Modal onClose={() => setSheetModal(null)}>
          <div className="p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Pencil className="w-4 h-4 text-amber-400" />{" "}
              <EditableText tkey="tracking.settings.title">Cài đặt trang tracking</EditableText>
            </h3>
            <label className="block text-xs text-zinc-400 mb-1">Tên trang</label>
            <input
              autoFocus
              value={sheetModal.name}
              onChange={(e) => setSheetModal((m) => m && { ...m, name: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-600"
            />
            <label className="block text-xs text-zinc-400 mb-1">
              Mã sheet (hiển thị trên Dashboard/Excel)
            </label>
            <input
              value={sheetModal.code}
              onChange={(e) => setSheetModal((m) => m && { ...m, code: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-600"
            />
            <label className="block text-xs text-zinc-400 mb-1">Đường dẫn</label>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-sm text-zinc-500">/tracking/</span>
              <input
                value={sheetModal.slug}
                onChange={(e) => setSheetModal((m) => m && { ...m, slug: e.target.value })}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 font-mono"
              />
              <button
                onClick={() => setSheetModal((m) => m && { ...m, slug: toSlug(m.name) })}
                title="Sinh lại từ tên"
                className="text-xs text-zinc-500 hover:text-emerald-400 px-1"
              >
                ↻
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mb-3">
              Chỉ dùng chữ thường a-z, số và gạch nối. Đổi đường dẫn sẽ chuyển trang sang URL mới
              (link cũ hết hiệu lực).
            </p>
            <label className="block text-xs text-zinc-400 mb-1">Người phụ trách</label>
            {sheetUsers.length > 0 && (
              <select
                value={sheetModal.managerId ?? ""}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const user = sheetUsers.find((u) => u.id === id);
                  setSheetModal(
                    (m) =>
                      m && { ...m, managerId: id, responsible: user ? user.name : m.responsible },
                  );
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-emerald-600"
              >
                <option value="">— Chọn từ danh sách người dùng —</option>
                {sheetUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
                  </option>
                ))}
              </select>
            )}
            <input
              value={sheetModal.responsible}
              onChange={(e) =>
                setSheetModal((m) => m && { ...m, responsible: e.target.value, managerId: null })
              }
              placeholder="hoặc nhập tên tự do..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-emerald-600"
            />
            {sheetErr && <p className="text-xs text-red-400 mb-2">{sheetErr}</p>}
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={deleteSheet}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-zinc-500 hover:text-red-300 hover:bg-red-950/40 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Xoá trang
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setSheetModal(null)}
                  className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg"
                >
                  Huỷ
                </button>
                <button
                  onClick={saveSheet}
                  disabled={!sheetModal.name.trim() || !sheetModal.code.trim()}
                  className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg font-medium text-on-accent"
                >
                  Lưu
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
