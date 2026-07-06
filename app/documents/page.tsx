"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, FileText, Image as ImageIcon, FolderOpen } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal } from "@/app/components/dialogs";
import { fetchMe, type Me } from "@/app/lib/me";
import { disciplineColorClasses } from "@/lib/disciplineColors";

type DocumentSource = "task" | "contract" | "vo" | "drawing" | "project";

const SOURCE_LABEL: Record<DocumentSource, string> = {
  task: "Nghiệm thu",
  contract: "Hợp đồng",
  vo: "Phát sinh",
  drawing: "Bản vẽ",
  project: "Dự án",
};
const SOURCE_BADGE: Record<DocumentSource, string> = {
  task: "bg-emerald-900/40 text-emerald-300",
  contract: "bg-sky-900/40 text-sky-300",
  vo: "bg-violet-900/40 text-violet-300",
  drawing: "bg-amber-900/40 text-amber-300",
  project: "bg-zinc-800 text-zinc-300",
};

type HubDocument = {
  id: number;
  source: DocumentSource;
  title: string;
  category: string | null;
  disciplineCode: string | null;
  disciplineName: string | null;
  disciplineColor: string | null;
  floorLabel: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  uploaderName: string | null;
  viewUrl: string;
};

type Discipline = { id: number; code: string; name: string; color: string | null };

export default function DocumentsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<HubDocument[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [loading, setLoading] = useState(true);
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<DocumentSource | "">("");
  const [q, setQ] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const canUpload = me?.role === "admin" || me?.role === "pm";

  function load() {
    return fetch("/api/documents-hub").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([
      fetchMe(),
      load(),
      fetch("/api/disciplines").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([meData, docs, disc]) => {
        if (!meData) return;
        setMe(meData);
        setItems(docs?.documents ?? []);
        setDisciplines(disc?.disciplines ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const docs = await load();
    setItems(docs?.documents ?? []);
  }

  const floors = useMemo(
    () =>
      Array.from(new Set(items.map((d) => d.floorLabel).filter((f): f is string => !!f))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    return items.filter((d) => {
      if (disciplineFilter && d.disciplineCode !== disciplineFilter) return false;
      if (floorFilter && d.floorLabel !== floorFilter) return false;
      if (sourceFilter && d.source !== sourceFilter) return false;
      if (q.trim() && !d.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });
  }, [items, disciplineFilter, floorFilter, sourceFilter, q]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Hồ sơ dự án"
        subtitle="Kho tài liệu hợp nhất — nghiệm thu, hợp đồng, phát sinh, bản vẽ"
        bottomActions={
          canUpload ? (
            <button
              onClick={() => setUploadOpen(true)}
              aria-label="Tải lên hồ sơ dự án"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <Plus className="w-4 h-4" />{" "}
              <span className="hidden sm:inline">Tải lên hồ sơ dự án</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo hệ">
            <button
              onClick={() => setDisciplineFilter("")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                disciplineFilter === ""
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              Mọi hệ
            </button>
            {disciplines.map((d) => {
              const c = disciplineColorClasses(d.color);
              return (
                <button
                  key={d.code}
                  onClick={() => setDisciplineFilter(disciplineFilter === d.code ? "" : d.code)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                    disciplineFilter === d.code
                      ? `${c.border} ${c.text} bg-zinc-800`
                      : "border-zinc-700 text-zinc-400 hover:text-white"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                  {d.name}
                </button>
              );
            })}
          </div>
          {floors.length > 0 && (
            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              aria-label="Lọc theo tầng"
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">Mọi tầng</option>
              {floors.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo nguồn">
            {(Object.keys(SOURCE_LABEL) as DocumentSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setSourceFilter(sourceFilter === s ? "" : s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  sourceFilter === s
                    ? "bg-sky-900/50 border-sky-700 text-sky-200"
                    : "border-zinc-700 text-zinc-400 hover:text-white"
                }`}
              >
                {SOURCE_LABEL[s]}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên hồ sơ…"
            aria-label="Tìm kiếm hồ sơ"
            className="flex-1 min-w-[160px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-500"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="Chưa có hồ sơ nào"
            message={
              canUpload
                ? 'Bấm "Tải lên hồ sơ dự án" để bắt đầu, hoặc tài liệu sẽ hiện ở đây khi các module khác (nghiệm thu, hợp đồng, phát sinh, bản vẽ) có file.'
                : "Chưa có tài liệu nào."
            }
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Danh sách hồ sơ"
            >
              <table className="w-full text-sm sm:min-w-[820px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3 w-8"></th>
                    <th className="text-left p-3">TÊN HỒ SƠ</th>
                    <th className="text-left p-3">NGUỒN</th>
                    <th className="text-left p-3 hidden sm:table-cell">HỆ / TẦNG</th>
                    <th className="text-left p-3 hidden sm:table-cell">NGƯỜI TẢI LÊN</th>
                    <th className="text-left p-3 hidden sm:table-cell">NGÀY</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const isImage = d.mimeType?.startsWith("image/");
                    const c = disciplineColorClasses(d.disciplineColor);
                    return (
                      <tr
                        key={`${d.source}-${d.id}`}
                        className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40"
                      >
                        <td className="p-3">
                          {isImage ? (
                            <ImageIcon className="w-4 h-4 text-sky-400" aria-hidden="true" />
                          ) : (
                            <FileText className="w-4 h-4 text-zinc-500" aria-hidden="true" />
                          )}
                        </td>
                        <td className="p-3">
                          <a
                            href={d.viewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-300 hover:underline"
                          >
                            {d.title}
                          </a>
                          {d.category && <p className="text-xs text-zinc-500">{d.category}</p>}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SOURCE_BADGE[d.source]}`}
                          >
                            {SOURCE_LABEL[d.source]}
                          </span>
                        </td>
                        <td className="p-3 hidden sm:table-cell text-xs">
                          {d.disciplineName ? (
                            <span className={`inline-flex items-center gap-1.5 ${c.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                              {d.disciplineName}
                            </span>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                          {d.floorLabel && <span className="text-zinc-400"> · {d.floorLabel}</span>}
                        </td>
                        <td className="p-3 hidden sm:table-cell text-xs text-zinc-400">
                          {d.uploaderName ?? "—"}
                        </td>
                        <td className="p-3 hidden sm:table-cell text-xs text-zinc-400">
                          {d.createdAt.slice(0, 10)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {uploadOpen && (
        <UploadProjectDocModal
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function UploadProjectDocModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim() && file;

  async function submit() {
    if (!file) return;
    setSaving(true);
    setErr("");
    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("category", category.trim());
      form.append("file", file);
      const res = await fetch("/api/project-documents", { method: "POST", body: form });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tải lên được hồ sơ");
        return;
      }
      onUploaded();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Tải lên hồ sơ dự án</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tiêu đề
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-400 block">
          Nhãn (tuỳ chọn)
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Pháp lý, Biểu mẫu…"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit">
          <Plus className="w-4 h-4" />
          {file ? file.name : "Chọn file"}
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
          {saving ? "Đang tải lên…" : "Tải lên"}
        </button>
      </div>
    </Modal>
  );
}
