"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Paperclip, FileText, X } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { Skeleton } from "@/app/components/Skeleton";
import { appConfirm } from "@/app/components/dialogs";
import { fetchMe, invalidateMe, redirectToLogin, type Me } from "@/app/lib/me";
import { compressImageToWebp } from "@/app/lib/compressImage";
import { formatDateVN } from "@/lib/nen/date";

type Stage = { id: number; name: string; sortOrder: number; active: boolean; durationDays: number };
type Supplier = { id: number; name: string };
type Front = {
  id: number;
  floorLabel: string;
  stageId: number;
  receivedAt: string | null;
  handedOverAt: string | null;
  plannedReceivedAt: string | null;
  plannedHandedOverAt: string | null;
  note: string | null;
  outgoingSupplierId: number | null;
  incomingSupplierId: number | null;
  transitionStageId: number | null;
  outgoingRepName: string | null;
  incomingRepName: string | null;
  updatedAt: string;
};
type FloorData = { stages: Stage[]; fronts: Front[] };
const LOAD_ERROR = "Không tải được chi tiết mặt bằng. Kiểm tra mạng rồi thử lại.";

type DocKind = "handover" | "completion" | "debris";
const DOC_COLUMNS: DocKind[] = ["handover", "completion", "debris"];
const DOC_KIND_LABEL: Record<string, string> = {
  handover: "Biên bản",
  completion: "Hình ảnh bàn giao",
  debris: "Xà bần - rác tồn đọng",
  other: "Khác",
};

export default function FloorStageFrontsPage({ params }: { params: Promise<{ floor: string }> }) {
  const { floor: floorParam } = use(params);
  const floor = decodeURIComponent(floorParam);

  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<FloorData | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [suppliersReady, setSuppliersReady] = useState(false);
  const [suppliersError, setSuppliersError] = useState("");
  const mounted = useRef(false);
  const request = useRef({ id: 0, controller: null as AbortController | null });
  const supplierRequest = useRef({ id: 0, controller: null as AbortController | null });
  const { stages = [], fronts = [] } = data ?? {};

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";

  const refresh = useCallback(async (): Promise<FloorData | null> => {
    const id = ++request.current.id;
    request.current.controller?.abort();
    const controller = new AbortController();
    request.current.controller = controller;
    const current = () =>
      mounted.current && request.current.id === id && !controller.signal.aborted;
    setLoading(true);
    setError("");
    try {
      const mePromise = fetchMe();
      const response = await fetch(`/api/floor-stage-fronts?floor=${encodeURIComponent(floor)}`, {
        signal: controller.signal,
      });
      if (!current()) return null;
      if (response.status === 401) {
        void redirectToLogin();
        return null;
      }
      const body = await response.json().catch(() => null);
      if (!current()) return null;
      if (!response.ok) {
        invalidateMe();
        setError(typeof body?.error === "string" && body.error.trim() ? body.error : LOAD_ERROR);
        return null;
      }
      const meData = await mePromise;
      if (!current()) return null;
      if (!meData || !Array.isArray(body?.stages) || !Array.isArray(body?.fronts)) {
        if (!meData) invalidateMe();
        setError(LOAD_ERROR);
        return null;
      }
      const next: FloorData = { stages: body.stages, fronts: body.fronts };
      setMe(meData);
      setData(next);
      return next;
    } catch {
      if (current()) {
        // fetchMe giữ cả Promise<null>; kể cả hai GET cùng lỗi, retry phải xác minh lại auth.
        invalidateMe();
        setError(LOAD_ERROR);
      }
      return null;
    } finally {
      if (mounted.current && request.current.id === id) {
        request.current.controller = null;
        setLoading(false);
      }
    }
  }, [floor]);

  const loadSuppliers = useCallback(async () => {
    const id = ++supplierRequest.current.id;
    supplierRequest.current.controller?.abort();
    const controller = new AbortController();
    supplierRequest.current.controller = controller;
    const current = () =>
      mounted.current && supplierRequest.current.id === id && !controller.signal.aborted;
    setSuppliersLoading(true);
    setSuppliersError("");
    try {
      const response = await fetch("/api/suppliers", { signal: controller.signal });
      if (!current()) return;
      if (response.status === 401) {
        void redirectToLogin();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!current()) return;
      if (!response.ok || !Array.isArray(body?.suppliers))
        throw new Error("Không tải được nhà thầu.");
      setSuppliers(body.suppliers);
      setSuppliersReady(true);
    } catch {
      if (current())
        setSuppliersError("Không tải được nhà thầu. Các lựa chọn đã lưu được giữ nguyên.");
    } finally {
      if (mounted.current && supplierRequest.current.id === id) {
        supplierRequest.current.controller = null;
        setSuppliersLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const active = request.current;
    const auxiliary = supplierRequest.current;
    mounted.current = true;
    setData(null);
    void refresh();
    void loadSuppliers();
    return () => {
      mounted.current = false;
      active.id++;
      active.controller?.abort();
      auxiliary.id++;
      auxiliary.controller?.abort();
    };
  }, [refresh, loadSuppliers]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title={`Mặt bằng tầng ${floor}`}
        subtitle="Tiến độ bàn giao theo công tác thi công"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <Link
          href="/site?tab=work-fronts"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách tầng
        </Link>

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-zinc-900 p-4 space-y-2">
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
            {data && (
              <p className="text-sm text-zinc-400">
                Đang hiển thị dữ liệu đã tải trước đó; bản nhập của bạn được giữ nguyên.
              </p>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={() => void refresh()}
              className="min-h-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-sm disabled:opacity-50"
            >
              Thử lại
            </button>
          </div>
        )}
        {loading && (
          <div role="status" aria-label="Đang tải chi tiết mặt bằng" className="space-y-2">
            <p className="text-sm text-zinc-400">Đang tải chi tiết mặt bằng…</p>
            {!data && <Skeleton className="h-48 rounded-xl" />}
          </div>
        )}
        {data && stages.length === 0 ? (
          <p className="text-sm text-zinc-400">Chưa có công tác nào.</p>
        ) : data ? (
          <div className="space-y-3">
            {stages.map((stage, i) => {
              const front = fronts.find((f) => f.stageId === stage.id) ?? null;
              return (
                <StageCard
                  key={`${floor}:${stage.id}`}
                  index={i}
                  isFirstStage={i === 0}
                  floor={floor}
                  stage={stage}
                  stages={stages}
                  suppliers={suppliers}
                  suppliersReady={suppliersReady}
                  front={front}
                  canManage={canManage}
                  onSaved={refresh}
                />
              );
            })}
          </div>
        ) : null}
        {suppliersLoading && (
          <p role="status" className="text-sm text-zinc-400">
            Đang tải nhà thầu…
          </p>
        )}
        {suppliersError && (
          <div className="rounded-xl border border-amber-500/40 bg-zinc-900 p-4 space-y-2">
            <p role="alert" className="text-sm text-amber-300">
              {suppliersError}
            </p>
            <button
              type="button"
              disabled={suppliersLoading}
              onClick={() => void loadSuppliers()}
              className="min-h-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-sm disabled:opacity-50"
            >
              Thử lại nhà thầu
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

type Doc = {
  id: number;
  fileName: string;
  mime: string;
  docKind: string;
  createdAt: string;
  uploaderName: string | null;
};

function StageCard({
  index,
  isFirstStage,
  floor,
  stage,
  stages,
  suppliers,
  suppliersReady,
  front,
  canManage,
  onSaved,
}: {
  index: number;
  isFirstStage: boolean;
  floor: string;
  stage: Stage;
  stages: Stage[];
  suppliers: Supplier[];
  suppliersReady: boolean;
  front: Front | null;
  canManage: boolean;
  onSaved: () => Promise<FloorData | null>;
}) {
  const [receivedAt, setReceivedAt] = useState(front?.receivedAt ?? "");
  const [handedOverAt, setHandedOverAt] = useState(front?.handedOverAt ?? "");
  const [plannedReceivedAt, setPlannedReceivedAt] = useState(front?.plannedReceivedAt ?? "");
  const [note, setNote] = useState(front?.note ?? "");
  const [outgoingSupplierId, setOutgoingSupplierId] = useState(
    front?.outgoingSupplierId ? String(front.outgoingSupplierId) : "",
  );
  const [incomingSupplierId, setIncomingSupplierId] = useState(
    front?.incomingSupplierId ? String(front.incomingSupplierId) : "",
  );
  const [transitionStageId, setTransitionStageId] = useState(
    front?.transitionStageId ? String(front.transitionStageId) : "",
  );
  const [outgoingRepName, setOutgoingRepName] = useState(front?.outgoingRepName ?? "");
  const [incomingRepName, setIncomingRepName] = useState(front?.incomingRepName ?? "");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState("");
  const [uploadingKind, setUploadingKind] = useState<DocKind | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const dirty = useRef(false);
  const mounted = useRef(false);
  const saving = useRef(false);
  const saveRequest = useRef<AbortController | null>(null);
  const documentMutation = useRef(false);
  const docRequest = useRef({ id: 0, controller: null as AbortController | null });

  const syncDraft = useCallback((next: Front | null) => {
    setReceivedAt(next?.receivedAt ?? "");
    setHandedOverAt(next?.handedOverAt ?? "");
    setPlannedReceivedAt(next?.plannedReceivedAt ?? "");
    setNote(next?.note ?? "");
    setOutgoingSupplierId(next?.outgoingSupplierId ? String(next.outgoingSupplierId) : "");
    setIncomingSupplierId(next?.incomingSupplierId ? String(next.incomingSupplierId) : "");
    setTransitionStageId(next?.transitionStageId ? String(next.transitionStageId) : "");
    setOutgoingRepName(next?.outgoingRepName ?? "");
    setIncomingRepName(next?.incomingRepName ?? "");
  }, []);

  // Lưu công tác khác có thể đổi ngày kế hoạch cascade; không thay bản nhập chưa lưu.
  useEffect(() => {
    if (!dirty.current) syncDraft(front);
  }, [front, syncDraft]);

  function edit(setter: (value: string) => void, value: string) {
    dirty.current = true;
    setter(value);
  }

  const frontId = front?.id;
  const loadDocs = useCallback(async () => {
    const id = ++docRequest.current.id;
    docRequest.current.controller?.abort();
    if (!frontId) {
      setDocs([]);
      setDocsError("");
      setDocsLoading(false);
      return;
    }
    const controller = new AbortController();
    docRequest.current.controller = controller;
    const current = () =>
      mounted.current && docRequest.current.id === id && !controller.signal.aborted;
    setDocsLoading(true);
    setDocsError("");
    try {
      const response = await fetch(`/api/floor-stage-fronts/${frontId}/documents`, {
        signal: controller.signal,
      });
      if (!current()) return;
      if (response.status === 401) {
        void redirectToLogin();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!current()) return;
      if (!response.ok || !Array.isArray(body?.documents)) {
        setDocsError(
          typeof body?.error === "string" && body.error.trim()
            ? body.error
            : "Không tải được tài liệu. Kiểm tra mạng rồi thử lại.",
        );
        return;
      }
      setDocs(body.documents);
    } catch {
      if (current()) setDocsError("Không tải được tài liệu. Kiểm tra mạng rồi thử lại.");
    } finally {
      if (mounted.current && docRequest.current.id === id) {
        docRequest.current.controller = null;
        setDocsLoading(false);
      }
    }
  }, [frontId]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saveRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    const active = docRequest.current;
    setDocs(null);
    void loadDocs();
    return () => {
      active.id++;
      active.controller?.abort();
    };
  }, [loadDocs]);

  async function save() {
    if (saving.current) return;
    saving.current = true;
    const controller = new AbortController();
    saveRequest.current = controller;
    setBusy(true);
    setSaveError("");
    try {
      const res = await fetch("/api/floor-stage-fronts", {
        method: "PUT",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          floorLabel: floor,
          stageId: stage.id,
          receivedAt: receivedAt || null,
          handedOverAt: handedOverAt || null,
          plannedReceivedAt: isFirstStage ? plannedReceivedAt || null : null,
          note: note.trim() || null,
          outgoingSupplierId: outgoingSupplierId || null,
          incomingSupplierId: incomingSupplierId || null,
          transitionStageId: transitionStageId || null,
          outgoingRepName: outgoingRepName.trim() || null,
          incomingRepName: incomingRepName.trim() || null,
        }),
      });
      if (!mounted.current) return;
      if (res.status === 401) {
        void redirectToLogin();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (mounted.current) setSaveError(body?.error || "Lưu thất bại. Bản nhập được giữ nguyên.");
        return;
      }
      const next = await onSaved();
      if (!mounted.current || !next) return;
      const saved = next.fronts.find((item) => item.stageId === stage.id) ?? null;
      dirty.current = false;
      syncDraft(saved);
    } catch {
      if (mounted.current)
        setSaveError("Mất kết nối — chưa xác nhận lưu công tác. Kiểm tra mạng rồi thử lại.");
    } finally {
      saving.current = false;
      saveRequest.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  async function uploadDoc(f: File, kind: DocKind) {
    if (!front || documentMutation.current) return;
    documentMutation.current = true;
    setUploadingKind(kind);
    setDocsError("");
    try {
      const compressed = await compressImageToWebp(f);
      const form = new FormData();
      form.append("file", compressed);
      form.append("kind", kind);
      const res = await fetch(`/api/floor-stage-fronts/${front.id}/documents`, {
        method: "POST",
        body: form,
      });
      if (!mounted.current) return;
      if (res.status === 401) {
        void redirectToLogin();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (mounted.current) setDocsError(body?.error || "Upload thất bại. Kiểm tra rồi thử lại.");
        return;
      }
      await loadDocs();
    } catch {
      if (mounted.current)
        setDocsError("Mất kết nối — chưa xác nhận tải file. Kiểm tra mạng rồi thử lại.");
    } finally {
      documentMutation.current = false;
      if (mounted.current) setUploadingKind(null);
    }
  }

  async function deleteDoc(id: number) {
    if (documentMutation.current) return;
    documentMutation.current = true;
    try {
      const ok = await appConfirm("Xoá file này?", { danger: true });
      if (!ok || !mounted.current) return;
      setDeletingId(id);
      setDocsError("");
      const res = await fetch(`/api/floor-stage-front-documents/${id}`, { method: "DELETE" });
      if (!mounted.current) return;
      if (res.status === 401) {
        void redirectToLogin();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (mounted.current)
          setDocsError(body?.error || "Xoá thất bại. File đã tải vẫn được giữ trong danh sách.");
        return;
      }
      await loadDocs();
    } catch {
      if (mounted.current)
        setDocsError("Mất kết nối — chưa xác nhận xoá file. Kiểm tra rồi thử lại.");
    } finally {
      documentMutation.current = false;
      if (mounted.current) setDeletingId(null);
    }
  }

  const supplierName = (id: number | null | undefined) =>
    id ? (suppliers.find((s) => s.id === id)?.name ?? `Nhà thầu #${id} (chưa tải tên)`) : undefined;
  const outgoingSupplierName = supplierName(front?.outgoingSupplierId);
  const incomingSupplierName = supplierName(front?.incomingSupplierId);
  const transitionStageName = stages.find((s) => s.id === front?.transitionStageId)?.name;
  const hasHandoverInfo =
    outgoingSupplierName ||
    incomingSupplierName ||
    transitionStageName ||
    front?.outgoingRepName ||
    front?.incomingRepName;

  // Dòng đọc "Kế hoạch: nhận... → bàn giao..." — chỉ hiện khi KHÔNG phải công tác đầu tiên
  // (ngày nhận kế hoạch của công tác đầu do người dùng tự đặt tay ở ô nhập bên dưới) hoặc
  // khi người xem không có quyền sửa (không có ô nhập nào để đọc thay).
  const showPlannedLine =
    (!isFirstStage || !canManage) && (front?.plannedReceivedAt || front?.plannedHandedOverAt);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold">
        {index + 1}. {stage.name}
      </h2>

      {showPlannedLine && (
        <p className="text-xs text-zinc-500">
          Kế hoạch: nhận {formatDateVN(front?.plannedReceivedAt)} → bàn giao{" "}
          {formatDateVN(front?.plannedHandedOverAt)}
        </p>
      )}

      {canManage ? (
        <fieldset disabled={busy} aria-busy={busy} className="grid sm:grid-cols-2 gap-3 min-w-0">
          {isFirstStage && (
            <label className="text-xs text-zinc-400 block sm:col-span-2">
              Ngày bắt đầu kế hoạch
              <input
                type="date"
                value={plannedReceivedAt}
                onChange={(e) => edit(setPlannedReceivedAt, e.target.value)}
                className="mt-1 min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
              />
            </label>
          )}
          <label className="text-xs text-zinc-400 block">
            Ngày nhận thực tế
            <input
              type="date"
              value={receivedAt}
              onChange={(e) => edit(setReceivedAt, e.target.value)}
              className="mt-1 min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 block">
            Ngày bàn giao thực tế
            <input
              type="date"
              value={handedOverAt}
              onChange={(e) => edit(setHandedOverAt, e.target.value)}
              className="mt-1 min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
            />
          </label>

          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-zinc-400 block">
              Nhà thầu bàn giao
              <select
                value={outgoingSupplierId}
                onChange={(e) => edit(setOutgoingSupplierId, e.target.value)}
                disabled={!suppliersReady}
                className="mt-1 min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-base text-white"
              >
                <option value="">— Chọn —</option>
                {outgoingSupplierId &&
                  !suppliers.some((s) => String(s.id) === outgoingSupplierId) && (
                    <option value={outgoingSupplierId}>
                      Nhà thầu #{outgoingSupplierId} (chưa tải tên)
                    </option>
                  )}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400 block">
              Công tác bàn giao chuyển bước
              <select
                value={transitionStageId}
                onChange={(e) => edit(setTransitionStageId, e.target.value)}
                className="mt-1 min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-base text-white"
              >
                <option value="">— Chọn —</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400 block">
              Nhà thầu nhận bàn giao
              <select
                value={incomingSupplierId}
                onChange={(e) => edit(setIncomingSupplierId, e.target.value)}
                disabled={!suppliersReady}
                className="mt-1 min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-base text-white"
              >
                <option value="">— Chọn —</option>
                {incomingSupplierId &&
                  !suppliers.some((s) => String(s.id) === incomingSupplierId) && (
                    <option value={incomingSupplierId}>
                      Nhà thầu #{incomingSupplierId} (chưa tải tên)
                    </option>
                  )}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400 block">
              Đại diện bên bàn giao
              <input
                type="text"
                value={outgoingRepName}
                onChange={(e) => edit(setOutgoingRepName, e.target.value)}
                placeholder="Tên đại diện"
                className="mt-1 min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
              />
            </label>
            <label className="text-xs text-zinc-400 block">
              Đại diện bên nhận bàn giao
              <input
                type="text"
                value={incomingRepName}
                onChange={(e) => edit(setIncomingRepName, e.target.value)}
                placeholder="Tên đại diện"
                className="mt-1 min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
              />
            </label>
          </div>

          <label className="text-xs text-zinc-400 block sm:col-span-2">
            Ghi chú
            <textarea
              value={note}
              onChange={(e) => edit(setNote, e.target.value)}
              rows={1}
              className="mt-1 min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="min-h-11 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent font-semibold px-4 py-2 rounded-lg text-sm"
            >
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </fieldset>
      ) : (
        <dl className="text-sm text-zinc-300 space-y-1">
          <div>
            Ngày nhận:{" "}
            {front?.receivedAt ? (
              formatDateVN(front.receivedAt)
            ) : (
              <span className="text-zinc-700">— chưa xong</span>
            )}
          </div>
          <div>
            Ngày bàn giao:{" "}
            {front?.handedOverAt ? (
              formatDateVN(front.handedOverAt)
            ) : (
              <span className="text-zinc-700">— chưa xong</span>
            )}
          </div>
          {hasHandoverInfo && (
            <div>
              Bàn giao: {outgoingSupplierName ?? "—"}
              {transitionStageName ? ` (${transitionStageName})` : ""} →{" "}
              {incomingSupplierName ?? "—"}
              {(front?.outgoingRepName || front?.incomingRepName) && (
                <>
                  {" "}
                  · Đại diện: {front?.outgoingRepName ?? "—"} / {front?.incomingRepName ?? "—"}
                </>
              )}
            </div>
          )}
          {front?.note && <div>Ghi chú: {front.note}</div>}
        </dl>
      )}

      {saveError && (
        <p role="alert" className="text-sm text-red-300">
          {saveError}
        </p>
      )}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Biên bản / ảnh hoàn thiện / bàn giao
        </h3>
        {docsLoading && (
          <p role="status" className="text-sm text-zinc-400">
            Đang tải tài liệu…
          </p>
        )}
        {docsError && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-300">
              {docsError}
            </p>
            {docs && (
              <p className="text-sm text-zinc-400">
                Đang hiển thị danh sách tài liệu đã tải trước đó.
              </p>
            )}
            <button
              type="button"
              disabled={docsLoading || uploadingKind !== null || deletingId !== null}
              onClick={() => void loadDocs()}
              className="min-h-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-sm disabled:opacity-50"
            >
              Thử lại tài liệu
            </button>
          </div>
        )}
        {docs !== null && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DOC_COLUMNS.map((k) => (
              <DocColumn
                key={k}
                label={DOC_KIND_LABEL[k]}
                items={docs.filter((d) => d.docKind === k)}
                canManage={canManage && !!front}
                uploading={uploadingKind === k}
                mutationPending={uploadingKind !== null || deletingId !== null}
                deletingId={deletingId}
                onUpload={(f) => uploadDoc(f, k)}
                onDelete={deleteDoc}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DocColumn({
  label,
  items,
  canManage,
  uploading,
  mutationPending,
  deletingId,
  onUpload,
  onDelete,
}: {
  label: string;
  items: Doc[];
  canManage: boolean;
  uploading: boolean;
  mutationPending: boolean;
  deletingId: number | null;
  onUpload: (f: File) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-2 space-y-2 min-w-0">
      <p className="text-[11px] font-medium text-zinc-400 truncate">{label}</p>

      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {items.map((d) => {
            const href = `/api/floor-stage-front-documents/${d.id}`;
            const isImg = d.mime.startsWith("image/");
            return (
              <div key={d.id} className="relative group bg-zinc-900 rounded-md overflow-hidden">
                <a href={href} target="_blank" rel="noreferrer" className="block">
                  {isImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={href}
                      alt={d.uploaderName ?? label}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square flex flex-col items-center justify-center gap-1 text-zinc-400">
                      <FileText className="w-6 h-6" />
                      <span className="text-[10px]">PDF</span>
                    </div>
                  )}
                </a>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => onDelete(d.id)}
                    aria-label="Xoá file"
                    disabled={mutationPending}
                    className="absolute top-1 right-1 min-h-11 min-w-11 inline-flex items-center justify-center bg-zinc-950/80 hover:bg-red-500/80 text-white rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 disabled:opacity-50 transition-opacity"
                  >
                    {deletingId === d.id ? (
                      <span className="text-xs">Đang xoá…</span>
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-zinc-400">Chưa có file.</p>
      )}

      {canManage && (
        <label className="flex min-h-11 items-center justify-center gap-1.5 text-xs text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-2 py-1.5 rounded-md focus-within:outline-2 focus-within:outline-emerald-400">
          <Paperclip className="w-3.5 h-3.5" />
          {uploading ? "Đang tải…" : "Thêm"}
          <input
            type="file"
            accept="application/pdf,image/*"
            capture="environment"
            aria-label={`Thêm ${label}`}
            className="sr-only"
            disabled={mutationPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
