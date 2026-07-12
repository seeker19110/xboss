"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Paperclip } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN } from "@/lib/date";

type Stage = { id: number; name: string; sortOrder: number; active: boolean };
type Front = {
  id: number;
  floorLabel: string;
  stageId: number;
  handedOverAt: string | null;
  note: string | null;
  updatedAt: string;
};

const DOC_KIND_LABEL: Record<string, string> = {
  handover: "Biên bản bàn giao",
  completion: "Ảnh hoàn thiện",
  other: "Khác",
};

export default function FloorStageFrontsPage({ params }: { params: Promise<{ floor: string }> }) {
  const { floor: floorParam } = use(params);
  const floor = decodeURIComponent(floorParam);

  const [me, setMe] = useState<Me | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [fronts, setFronts] = useState<Front[]>([]);
  const [loading, setLoading] = useState(true);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";

  function load() {
    return fetch(`/api/floor-stage-fronts?floor=${encodeURIComponent(floor)}`).then((r) =>
      r.ok ? r.json() : null,
    );
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, data]) => {
        if (!meData) return;
        setMe(meData);
        setStages(data?.stages ?? []);
        setFronts(data?.fronts ?? []);
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
                  floor={floor}
                  stage={stage}
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
  floor,
  stage,
  front,
  canManage,
  onSaved,
}: {
  index: number;
  floor: string;
  stage: Stage;
  front: Front | null;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [handedOverAt, setHandedOverAt] = useState(front?.handedOverAt ?? "");
  const [note, setNote] = useState(front?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [kind, setKind] = useState<"handover" | "completion" | "other">("other");
  const [uploading, setUploading] = useState(false);

  // Giữ đồng bộ khi refresh() nạp lại dữ liệu mới từ server sau khi lưu.
  useEffect(() => {
    setHandedOverAt(front?.handedOverAt ?? "");
    setNote(front?.note ?? "");
  }, [front?.handedOverAt, front?.note]);

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
        handedOverAt: handedOverAt || null,
        note: note.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Lưu thất bại", "error");
      return;
    }
    onSaved();
  }

  async function uploadDoc(f: File) {
    if (!front) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
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
      setUploading(false);
    }
  }

  const docKinds: Array<"handover" | "completion" | "other"> = ["handover", "completion", "other"];
  const docsByKind = docKinds
    .map((k) => ({ kind: k, items: docs.filter((d) => d.docKind === k) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold">
        {index + 1}. {stage.name}
      </h2>

      {canManage ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400 block">
            Ngày bàn giao
            <input
              type="date"
              value={handedOverAt}
              onChange={(e) => setHandedOverAt(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 block">
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
            Ngày bàn giao:{" "}
            {front?.handedOverAt ? (
              formatDateVN(front.handedOverAt)
            ) : (
              <span className="text-zinc-700">— chưa xong</span>
            )}
          </div>
          {front?.note && <div>Ghi chú: {front.note}</div>}
        </dl>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Biên bản / ảnh hoàn thiện / bàn giao
        </h3>
        {docsByKind.length > 0 ? (
          <div className="space-y-2">
            {docsByKind.map((g) => (
              <div key={g.kind}>
                <p className="text-[11px] text-zinc-500 mb-1">{DOC_KIND_LABEL[g.kind]}</p>
                <ul className="space-y-1.5">
                  {g.items.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-sm">
                      <Paperclip className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <a
                        href={`/api/floor-stage-front-documents/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 min-w-0 truncate text-sky-300 hover:underline"
                      >
                        {d.uploaderName ?? "File"} — {d.mime}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Chưa có file nào.</p>
        )}
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-xs text-white"
            >
              <option value="handover">Biên bản bàn giao</option>
              <option value="completion">Ảnh hoàn thiện</option>
              <option value="other">Khác</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg">
              <Paperclip className="w-4 h-4" />
              {uploading ? "Đang tải lên…" : "Tải biên bản/ảnh"}
              <input
                type="file"
                accept="application/pdf,image/*"
                capture="environment"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadDoc(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}
      </section>
    </div>
  );
}
