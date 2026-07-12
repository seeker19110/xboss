"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Paperclip, FileText, X } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { appConfirm } from "@/app/components/dialogs";
import { fetchMe, type Me } from "@/app/lib/me";
import { compressImageToWebp } from "@/app/lib/compressImage";
import { formatDateVN } from "@/lib/date";

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
  const [stages, setStages] = useState<Stage[]>([]);
  const [fronts, setFronts] = useState<Front[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";

  function load() {
    return fetch(`/api/floor-stage-fronts?floor=${encodeURIComponent(floor)}`).then((r) =>
      r.ok ? r.json() : null,
    );
  }

  useEffect(() => {
    Promise.all([fetchMe(), load(), fetch("/api/suppliers").then((r) => (r.ok ? r.json() : null))])
      .then(([meData, data, supplierData]) => {
        if (!meData) return;
        setMe(meData);
        setStages(data?.stages ?? []);
        setFronts(data?.fronts ?? []);
        setSuppliers(supplierData?.suppliers ?? []);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  async function refresh() {
    const data = await load();
    setStages(data?.stages ?? []);
    setFronts(data?.fronts ?? []);
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title={`Mặt bằng tầng ${floor}`}
        subtitle="Tiến độ bàn giao theo công tác thi công"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <Link
          href="/work-fronts"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách tầng
        </Link>

        {stages.length === 0 ? (
          <p className="text-sm text-zinc-400">Chưa có công tác nào.</p>
        ) : (
          <div className="space-y-3">
            {stages.map((stage, i) => {
              const front = fronts.find((f) => f.stageId === stage.id) ?? null;
              return (
                <StageCard
                  key={stage.id}
                  index={i}
                  isFirstStage={i === 0}
                  floor={floor}
                  stage={stage}
                  stages={stages}
                  suppliers={suppliers}
                  front={front}
                  canManage={canManage}
                  onSaved={refresh}
                />
              );
            })}
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
  front: Front | null;
  canManage: boolean;
  onSaved: () => void;
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
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploadingKind, setUploadingKind] = useState<DocKind | null>(null);

  // Giữ đồng bộ khi refresh() nạp lại dữ liệu mới từ server sau khi lưu.
  useEffect(() => {
    setReceivedAt(front?.receivedAt ?? "");
    setHandedOverAt(front?.handedOverAt ?? "");
    setPlannedReceivedAt(front?.plannedReceivedAt ?? "");
    setNote(front?.note ?? "");
    setOutgoingSupplierId(front?.outgoingSupplierId ? String(front.outgoingSupplierId) : "");
    setIncomingSupplierId(front?.incomingSupplierId ? String(front.incomingSupplierId) : "");
    setTransitionStageId(front?.transitionStageId ? String(front.transitionStageId) : "");
    setOutgoingRepName(front?.outgoingRepName ?? "");
    setIncomingRepName(front?.incomingRepName ?? "");
  }, [
    front?.receivedAt,
    front?.handedOverAt,
    front?.plannedReceivedAt,
    front?.note,
    front?.outgoingSupplierId,
    front?.incomingSupplierId,
    front?.transitionStageId,
    front?.outgoingRepName,
    front?.incomingRepName,
  ]);

  function loadDocs() {
    if (!front) return;
    fetch(`/api/floor-stage-fronts/${front.id}/documents`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDocs(j?.documents ?? []));
  }

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front?.id]);

  async function save() {
    setBusy(true);
    const res = await fetch("/api/floor-stage-fronts", {
      method: "PUT",
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
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Lưu thất bại", "error");
      return;
    }
    onSaved();
  }

  async function uploadDoc(f: File, kind: DocKind) {
    if (!front) return;
    setUploadingKind(kind);
    try {
      const compressed = await compressImageToWebp(f);
      const form = new FormData();
      form.append("file", compressed);
      form.append("kind", kind);
      const res = await fetch(`/api/floor-stage-fronts/${front.id}/documents`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Upload thất bại", "error");
        return;
      }
      loadDocs();
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setUploadingKind(null);
    }
  }

  async function deleteDoc(id: number) {
    const ok = await appConfirm("Xoá file này?", { danger: true });
    if (!ok) return;
    const res = await fetch(`/api/floor-stage-front-documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    loadDocs();
  }

  const outgoingSupplierName = suppliers.find((s) => s.id === front?.outgoingSupplierId)?.name;
  const incomingSupplierName = suppliers.find((s) => s.id === front?.incomingSupplierId)?.name;
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
        <div className="grid sm:grid-cols-2 gap-3">
          {isFirstStage && (
            <label className="text-xs text-zinc-400 block sm:col-span-2">
              Ngày bắt đầu kế hoạch
              <input
                type="date"
                value={plannedReceivedAt}
                onChange={(e) => setPlannedReceivedAt(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
          )}
          <label className="text-xs text-zinc-400 block">
            Ngày nhận thực tế
            <input
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 block">
            Ngày bàn giao thực tế
            <input
              type="date"
              value={handedOverAt}
              onChange={(e) => setHandedOverAt(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>

          <div className="sm:col-span-2 grid grid-cols-3 gap-3">
            <label className="text-xs text-zinc-400 block">
              Nhà thầu bàn giao
              <select
                value={outgoingSupplierId}
                onChange={(e) => setOutgoingSupplierId(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white"
              >
                <option value="">— Chọn —</option>
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
                onChange={(e) => setTransitionStageId(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white"
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
                onChange={(e) => setIncomingSupplierId(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white"
              >
                <option value="">— Chọn —</option>
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
                onChange={(e) => setOutgoingRepName(e.target.value)}
                placeholder="Tên đại diện"
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400 block">
              Đại diện bên nhận bàn giao
              <input
                type="text"
                value={incomingRepName}
                onChange={(e) => setIncomingRepName(e.target.value)}
                placeholder="Tên đại diện"
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          <label className="text-xs text-zinc-400 block sm:col-span-2">
            Ghi chú
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={1}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              onClick={save}
              disabled={busy}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold px-4 py-2 rounded-lg text-sm"
            >
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
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

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Biên bản / ảnh hoàn thiện / bàn giao
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {DOC_COLUMNS.map((k) => (
            <DocColumn
              key={k}
              label={DOC_KIND_LABEL[k]}
              items={docs.filter((d) => d.docKind === k)}
              canManage={canManage}
              uploading={uploadingKind === k}
              onUpload={(f) => uploadDoc(f, k)}
              onDelete={deleteDoc}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function DocColumn({
  label,
  items,
  canManage,
  uploading,
  onUpload,
  onDelete,
}: {
  label: string;
  items: Doc[];
  canManage: boolean;
  uploading: boolean;
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
                    onClick={() => onDelete(d.id)}
                    aria-label="Xoá file"
                    className="absolute top-1 right-1 bg-zinc-950/80 hover:bg-red-500/80 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-zinc-600">Chưa có file.</p>
      )}

      {canManage && (
        <label className="flex items-center justify-center gap-1.5 text-xs text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-2 py-1.5 rounded-md">
          <Paperclip className="w-3.5 h-3.5" />
          {uploading ? "Đang tải…" : "Thêm"}
          <input
            type="file"
            accept="application/pdf,image/*"
            capture="environment"
            className="hidden"
            disabled={uploading}
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
