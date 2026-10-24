"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, FileText, Image as ImageIcon, FolderOpen } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { Button } from "@/app/components/ui";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal } from "@/app/components/dialogs";
import { fetchMe, invalidateMe, redirectToLogin, type Me } from "@/app/lib/me";
import { systemColorClasses } from "@/lib/nen/systemColors";

type DocumentSource = "task" | "contract" | "vo" | "drawing" | "project";

const SOURCE_LABEL: Record<DocumentSource, string> = {
  task: "Nghiệm thu",
  contract: "Hợp đồng",
  vo: "Phát sinh",
  drawing: "Bản vẽ",
  project: "Dự án",
};
const SOURCE_BADGE: Record<DocumentSource, string> = {
  task: "bg-emerald-900 text-emerald-200",
  contract: "bg-sky-900 text-sky-200",
  vo: "bg-violet-900 text-violet-200",
  drawing: "bg-amber-900 text-amber-200",
  project: "bg-zinc-800 text-zinc-300",
};

type HubDocument = {
  id: number;
  source: DocumentSource;
  title: string;
  category: string | null;
  systemCode: string | null;
  systemName: string | null;
  systemColor: string | null;
  floorLabel: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  uploaderName: string | null;
  viewUrl: string;
};

type SystemOption = { id: number; code: string; name: string; color: string | null };
type LoadState<T> = { data: T[] | null; loading: boolean; error: string };

function LoadError({
  message,
  retry,
  label,
}: {
  message: string;
  retry: () => void;
  label: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-800 bg-zinc-900 p-3 text-sm"
    >
      <p className="min-w-0 flex-1 text-rose-300">{message}</p>
      <Button onClick={retry} className="min-h-11">
        {label}
      </Button>
    </div>
  );
}

export default function DocumentsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState("");
  const [docs, setDocs] = useState<LoadState<HubDocument>>({
    data: null,
    loading: true,
    error: "",
  });
  const [systemState, setSystemState] = useState<LoadState<SystemOption>>({
    data: null,
    loading: true,
    error: "",
  });
  const mounted = useRef(false);
  const docsRequest = useRef<AbortController | null>(null);
  const systemsRequest = useRef<AbortController | null>(null);
  const meRequest = useRef(0);
  const [systemFilter, setSystemFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<DocumentSource | "">("");
  const [q, setQ] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const canUpload = me?.role === "admin" || me?.role === "pm";
  const items = useMemo(() => docs.data ?? [], [docs.data]);
  const systems = systemState.data ?? [];

  const loadDocs = useCallback(async () => {
    docsRequest.current?.abort();
    const controller = new AbortController();
    docsRequest.current = controller;
    setDocs((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const res = await fetch("/api/documents-hub", { signal: controller.signal });
      if (res.status === 401) {
        void redirectToLogin();
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body?.documents))
        throw new Error(body?.error ?? "Không tải được hồ sơ. Hãy thử lại.");
      if (mounted.current && !controller.signal.aborted && docsRequest.current === controller)
        setDocs({ data: body.documents, loading: false, error: "" });
    } catch (error) {
      if (mounted.current && !controller.signal.aborted && docsRequest.current === controller)
        setDocs((prev) => ({
          ...prev,
          error:
            error instanceof Error && error.name !== "TypeError"
              ? error.message
              : "Mất kết nối — chưa tải được hồ sơ. Hãy thử lại.",
        }));
    } finally {
      if (mounted.current && !controller.signal.aborted && docsRequest.current === controller)
        setDocs((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const loadSystems = useCallback(async () => {
    systemsRequest.current?.abort();
    const controller = new AbortController();
    systemsRequest.current = controller;
    setSystemState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const res = await fetch("/api/systems", { signal: controller.signal });
      if (res.status === 401) {
        void redirectToLogin();
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body?.systems))
        throw new Error(body?.error ?? "Không tải được danh mục hệ. Hãy thử lại.");
      if (mounted.current && !controller.signal.aborted && systemsRequest.current === controller)
        setSystemState({ data: body.systems, loading: false, error: "" });
    } catch (error) {
      if (mounted.current && !controller.signal.aborted && systemsRequest.current === controller)
        setSystemState((prev) => ({
          ...prev,
          error:
            error instanceof Error && error.name !== "TypeError"
              ? error.message
              : "Mất kết nối — chưa tải được danh mục hệ. Hãy thử lại.",
        }));
    } finally {
      if (mounted.current && !controller.signal.aborted && systemsRequest.current === controller)
        setSystemState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const loadMe = useCallback(async (retry = false) => {
    const request = ++meRequest.current;
    if (retry) invalidateMe();
    setMeError("");
    const user = await fetchMe();
    if (!mounted.current || request !== meRequest.current) return;
    setMe(user);
    if (!user) setMeError("Chưa xác minh được quyền tải lên. Hãy thử lại khi có kết nối.");
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadMe();
    void loadDocs();
    void loadSystems();
    return () => {
      mounted.current = false;
      docsRequest.current?.abort();
      systemsRequest.current?.abort();
    };
  }, [loadDocs, loadMe, loadSystems]);

  const floors = useMemo(
    () =>
      Array.from(new Set(items.map((d) => d.floorLabel).filter((f): f is string => !!f))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    return items.filter((d) => {
      if (systemFilter && d.systemCode !== systemFilter) return false;
      if (floorFilter && d.floorLabel !== floorFilter) return false;
      if (sourceFilter && d.source !== sourceFilter) return false;
      if (q.trim() && !d.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });
  }, [items, systemFilter, floorFilter, sourceFilter, q]);

  if (docs.loading && docs.data === null) return <PageSkeleton />;

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
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition shrink-0 text-on-accent shadow-sm h-11"
            >
              <Plus className="w-4 h-4" />{" "}
              <span className="hidden sm:inline">Tải lên hồ sơ dự án</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-6 max-w-screen-2xl mx-auto">
        {meError && (
          <LoadError message={meError} retry={() => void loadMe(true)} label="Thử lại phiên" />
        )}
        {docs.error && (
          <LoadError message={docs.error} retry={() => void loadDocs()} label="Thử lại hồ sơ" />
        )}
        {systemState.error && (
          <LoadError
            message={systemState.error}
            retry={() => void loadSystems()}
            label="Thử lại danh mục hệ"
          />
        )}
        {systemState.loading && (
          <p role="status" className="text-sm text-zinc-400">
            Đang tải danh mục hệ…
          </p>
        )}
        {docs.loading && (
          <p role="status" className="text-sm text-zinc-400">
            Đang cập nhật hồ sơ…
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl flex-wrap"
            role="group"
            aria-label="Lọc theo hệ"
          >
            <button
              onClick={() => setSystemFilter("")}
              className={`min-h-11 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                systemFilter === ""
                  ? "bg-zinc-800 text-white shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Mọi hệ
            </button>
            {systems.map((d) => {
              const c = systemColorClasses(d.color);
              return (
                <button
                  key={d.code}
                  onClick={() => setSystemFilter(systemFilter === d.code ? "" : d.code)}
                  className={`inline-flex items-center gap-1.5 min-h-11 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    systemFilter === d.code
                      ? `${c.border} ${c.text} bg-zinc-800 shadow-xs`
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
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
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-base sm:text-sm text-zinc-100 outline-none focus:border-emerald-500 h-11 transition"
            >
              <option value="">Mọi tầng</option>
              {floors.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
          <div
            className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl flex-wrap"
            role="group"
            aria-label="Lọc theo nguồn"
          >
            {(Object.keys(SOURCE_LABEL) as DocumentSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setSourceFilter(sourceFilter === s ? "" : s)}
                className={`min-h-11 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  sourceFilter === s
                    ? "bg-sky-950/80 border border-sky-700 text-sky-300 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
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
            className="flex-1 min-w-[200px] bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-emerald-500 h-11 transition"
          />
        </div>

        {docs.data !== null &&
          (filtered.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={items.length ? "Không có hồ sơ phù hợp" : "Chưa có hồ sơ nào"}
              message={
                items.length
                  ? "Hãy đổi bộ lọc hoặc từ khóa tìm kiếm."
                  : canUpload
                    ? 'Bấm "Tải lên hồ sơ dự án" để bắt đầu, hoặc tài liệu sẽ hiện ở đây khi các module khác (nghiệm thu, hợp đồng, phát sinh, bản vẽ) có file.'
                    : "Chưa có tài liệu nào."
              }
            />
          ) : (
            <div className="bento-card overflow-hidden">
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
                      const c = systemColorClasses(d.systemColor);
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
                              className="inline-flex min-h-11 items-center break-words text-sky-300 hover:underline [overflow-wrap:anywhere]"
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
                            {d.systemName ? (
                              <span className={`inline-flex items-center gap-1.5 ${c.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                                {d.systemName}
                              </span>
                            ) : (
                              <span className="text-zinc-500">—</span>
                            )}
                            {d.floorLabel && (
                              <span className="text-zinc-400"> · {d.floorLabel}</span>
                            )}
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
          ))}
      </main>

      {uploadOpen && (
        <UploadProjectDocModal
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            void loadDocs();
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
  const pending = useRef(false);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const canSubmit = title.trim() && file;
  const close = () => {
    if (!pending.current) onClose();
  };

  async function submit() {
    if (pending.current || !file || !title.trim()) return;
    pending.current = true;
    setSaving(true);
    setErr("");
    let accepted = false;
    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("category", category.trim());
      form.append("file", file);
      const res = await fetch("/api/project-documents", { method: "POST", body: form });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 401) {
          void redirectToLogin();
          return;
        }
        if (mounted.current) setErr(j?.error ?? "Không tải lên được hồ sơ");
        return;
      }
      accepted = true;
    } catch {
      if (mounted.current) setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
    // POST đã được nhận; việc tải lại danh sách không được gửi lại file.
    if (accepted && mounted.current) onUploaded();
  }

  return (
    <Modal onClose={close} className="max-w-md" ariaLabel="Tải lên hồ sơ dự án">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="p-5 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Tải lên hồ sơ dự án</h2>
          <button
            type="button"
            disabled={saving}
            onClick={close}
            aria-label="Đóng"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <fieldset disabled={saving} className="min-w-0 space-y-3">
          <label className="text-xs text-zinc-400 block">
            Tiêu đề
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm text-zinc-100"
            />
          </label>
          <label className="text-xs text-zinc-400 block">
            Nhãn (tuỳ chọn)
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Pháp lý, Biểu mẫu…"
              className="mt-1 min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm text-zinc-100"
            />
          </label>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              aria-label="Chọn file"
              icon={Plus}
              onClick={() => fileInput.current?.click()}
              className="min-h-11"
            >
              Chọn file
            </Button>
            {file && (
              <span className="min-w-0 text-sm text-zinc-300 [overflow-wrap:anywhere]">
                {file.name}
              </span>
            )}
            <input
              ref={fileInput}
              type="file"
              aria-label="Tệp hồ sơ"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {err && (
            <p role="alert" className="text-sm text-rose-300">
              {err}
            </p>
          )}
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="min-h-11 w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
          >
            {saving ? "Đang tải lên…" : "Tải lên"}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
