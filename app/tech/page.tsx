"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  Cpu,
  FolderOpen,
  Boxes,
  Camera,
  CalendarRange,
  Wrench,
  ExternalLink,
  Trash2,
  Pencil,
  AlertTriangle,
  HardDrive,
  ShieldCheck,
  Upload,
  Image as ImageIcon,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN } from "@/lib/date";

type TechCategory = "bim" | "schedule" | "camera" | "drone" | "other";
const CATEGORY_LABEL: Record<TechCategory, string> = {
  bim: "BIM",
  schedule: "Phần mềm QLDA",
  camera: "Giám sát (camera)",
  drone: "Giám sát (flycam/drone)",
  other: "Khác",
};

type TechLink = {
  id: number;
  category: TechCategory;
  title: string;
  url: string;
  embed: boolean;
  note: string | null;
  createdByName: string | null;
};

type ProgressAlbum = {
  id: number;
  milestoneLabel: string;
  capturedDate: string | null;
  note: string | null;
  photoCount: number;
};

type AlbumPhoto = {
  id: number;
  originalName: string | null;
  caption: string | null;
  createdAt: string;
};

type SystemStatus = {
  storage: { bytes: number; files: number; warnBytes: number; warn: boolean };
  techLinkCount: number;
  albumCount: number;
  swCacheVersion: string | null;
};

type Tab = "cde" | "bim" | "giam-sat" | "phan-mem" | "he-thong";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export default function TechPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [links, setLinks] = useState<TechLink[]>([]);
  const [albums, setAlbums] = useState<ProgressAlbum[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("cde");
  const [addLinkOpen, setAddLinkOpen] = useState<TechCategory | null>(null);
  const [editLink, setEditLink] = useState<TechLink | null>(null);
  const [addAlbumOpen, setAddAlbumOpen] = useState(false);
  const [openAlbum, setOpenAlbum] = useState<ProgressAlbum | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm";
  const isAdmin = me?.role === "admin";

  const TABS: { key: Tab; label: string; icon: typeof Cpu }[] = useMemo(() => {
    const base: { key: Tab; label: string; icon: typeof Cpu }[] = [
      { key: "cde", label: "CDE", icon: FolderOpen },
      { key: "bim", label: "BIM", icon: Boxes },
      { key: "giam-sat", label: "Giám sát", icon: Camera },
      { key: "phan-mem", label: "Phần mềm", icon: CalendarRange },
    ];
    if (isAdmin) base.push({ key: "he-thong", label: "Hệ thống", icon: ShieldCheck });
    return base;
  }, [isAdmin]);

  function loadLinks() {
    return fetch("/api/tech-links").then((r) => (r.ok ? r.json() : null));
  }
  function loadAlbums() {
    return fetch("/api/progress-albums").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    fetchMe().then((meData) => {
      if (!meData) return;
      setMe(meData);
      Promise.all([loadLinks(), loadAlbums()])
        .then(([linksRes, albumsRes]) => {
          setLinks(linksRes?.links ?? []);
          setAlbums(albumsRes?.albums ?? []);
        })
        .finally(() => setLoading(false));
    });
  }, []);

  useEffect(() => {
    if (tab !== "he-thong" || !isAdmin) return;
    fetch("/api/tech/system-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setStatus(j))
      .catch(() => setStatus(null));
  }, [tab, isAdmin]);

  async function refreshLinks() {
    const res = await loadLinks();
    setLinks(res?.links ?? []);
  }
  async function refreshAlbums() {
    const res = await loadAlbums();
    setAlbums(res?.albums ?? []);
  }

  async function deleteLink(id: number) {
    if (!(await appConfirm("Xoá link này? Không thể hoàn tác.", { danger: true }))) return;
    const res = await fetch(`/api/tech-links/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refreshLinks();
  }

  async function deleteAlbum(id: number) {
    if (!(await appConfirm("Xoá album này và toàn bộ ảnh? Không thể hoàn tác.", { danger: true })))
      return;
    const res = await fetch(`/api/progress-albums/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refreshAlbums();
  }

  if (loading) return <PageSkeleton />;

  const bimLinks = links.filter((l) => l.category === "bim");
  const scheduleLinks = links.filter((l) => l.category === "schedule");
  const cameraLinks = links.filter((l) => l.category === "camera");
  const droneLinks = links.filter((l) => l.category === "drone");

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Chuyển đổi số & Công nghệ"
        subtitle="CDE, BIM, giám sát bằng công nghệ, phần mềm QLDA & trạng thái hệ thống"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Nhóm chuyển đổi số & công nghệ"
        >
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
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "cde" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <a
              href="/documents"
              className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center gap-3 transition"
            >
              <FolderOpen className="w-8 h-8 text-sky-400 shrink-0" />
              <div>
                <p className="font-semibold">Hồ sơ dự án (CDE)</p>
                <p className="text-xs text-zinc-400">
                  Môi trường dữ liệu chung — quản lý tài liệu điện tử, phân quyền, luồng duyệt
                </p>
              </div>
            </a>
            <a
              href="/proposals"
              className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center gap-3 transition"
            >
              <ShieldCheck className="w-8 h-8 text-emerald-400 shrink-0" />
              <div>
                <p className="font-semibold">Đề xuất & duyệt</p>
                <p className="text-xs text-zinc-400">Register luồng duyệt tài liệu/đề xuất</p>
              </div>
            </a>
          </div>
        )}

        {tab === "bim" && (
          <TechLinkSection
            category="bim"
            links={bimLinks}
            canManage={canManage}
            onAdd={() => setAddLinkOpen("bim")}
            onEdit={setEditLink}
            onDelete={deleteLink}
            emptyMessage="Chưa có link BIM viewer — bấm “Thêm link” để nhúng/mở mô hình BIM."
            showIframe
          />
        )}

        {tab === "phan-mem" && (
          <TechLinkSection
            category="schedule"
            links={scheduleLinks}
            canManage={canManage}
            onAdd={() => setAddLinkOpen("schedule")}
            onEdit={setEditLink}
            onDelete={deleteLink}
            emptyMessage="Chưa có link phần mềm QLDA — bấm “Thêm link” để thêm P6/MS Project/app."
          />
        )}

        {tab === "giam-sat" && (
          <div className="space-y-6">
            <TechLinkSection
              category="camera"
              links={[...cameraLinks, ...droneLinks]}
              canManage={canManage}
              onAdd={() => setAddLinkOpen("camera")}
              onEdit={setEditLink}
              onDelete={deleteLink}
              emptyMessage="Chưa có link camera/flycam — bấm “Thêm link” để thêm."
              title="Camera & flycam trực tuyến"
            />

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Album ảnh mốc tiến độ (drone)
                </h3>
                {canManage && (
                  <button
                    onClick={() => setAddAlbumOpen(true)}
                    className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm album
                  </button>
                )}
              </div>
              {albums.length === 0 ? (
                <EmptyState
                  icon={ImageIcon}
                  title="Chưa có album"
                  message="Bấm “Thêm album” để tạo mốc tiến độ đầu tiên."
                  compact
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {albums.map((a) => (
                    <div
                      key={a.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium truncate max-w-[180px]">{a.milestoneLabel}</p>
                          <p className="text-xs text-zinc-500">
                            {a.capturedDate ? formatDateVN(a.capturedDate) : "Chưa có ngày"} ·{" "}
                            {a.photoCount} ảnh
                          </p>
                        </div>
                        {canManage && (
                          <button
                            onClick={() => deleteAlbum(a.id)}
                            aria-label="Xoá album"
                            className="text-zinc-500 hover:text-rose-400 shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => setOpenAlbum(a)}
                        className="w-full text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg py-1.5"
                      >
                        Xem ảnh
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "he-thong" && isAdmin && (
          <div className="space-y-3">
            {!status ? (
              <p className="text-sm text-zinc-400">Đang tải trạng thái hệ thống…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="w-4 h-4 text-sky-400" />
                    <p className="font-semibold text-sm">Dung lượng lưu trữ (data/uploads)</p>
                  </div>
                  <p className="text-2xl font-bold">{formatBytes(status.storage.bytes)}</p>
                  <p className="text-xs text-zinc-400">{status.storage.files} file</p>
                  {status.storage.warn && (
                    <p className="text-xs text-amber-400 flex items-center gap-1 mt-2">
                      <AlertTriangle className="w-3.5 h-3.5" /> Đã vượt ngưỡng cảnh báo (
                      {formatBytes(status.storage.warnBytes)})
                    </p>
                  )}
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="w-4 h-4 text-violet-400" />
                    <p className="font-semibold text-sm">Trạng thái ứng dụng</p>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Phiên bản cache PWA:{" "}
                    <span className="text-zinc-200">{status.swCacheVersion ?? "—"}</span>
                  </p>
                  <p className="text-xs text-zinc-400">
                    Link công nghệ: <span className="text-zinc-200">{status.techLinkCount}</span>
                  </p>
                  <p className="text-xs text-zinc-400">
                    Album ảnh mốc tiến độ:{" "}
                    <span className="text-zinc-200">{status.albumCount}</span>
                  </p>
                </div>
              </div>
            )}
            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" /> Sao lưu định kỳ dữ liệu (Postgres) + thư mục
              data/uploads/ nên được thiết lập ở tầng hạ tầng VPS — xem DEPLOY.md.
            </p>
          </div>
        )}
      </main>

      {(addLinkOpen || editLink) && (
        <TechLinkModal
          category={addLinkOpen ?? editLink!.category}
          link={editLink}
          onClose={() => {
            setAddLinkOpen(null);
            setEditLink(null);
          }}
          onSaved={() => {
            setAddLinkOpen(null);
            setEditLink(null);
            refreshLinks();
          }}
        />
      )}

      {addAlbumOpen && (
        <AlbumModal
          onClose={() => setAddAlbumOpen(false)}
          onSaved={() => {
            setAddAlbumOpen(false);
            refreshAlbums();
          }}
        />
      )}

      {openAlbum && (
        <AlbumGalleryModal
          album={openAlbum}
          canManage={canManage}
          onClose={() => setOpenAlbum(null)}
          onChanged={refreshAlbums}
        />
      )}
    </div>
  );
}

function TechLinkSection({
  category,
  links,
  canManage,
  onAdd,
  onEdit,
  onDelete,
  emptyMessage,
  title,
  showIframe = false,
}: {
  category: TechCategory;
  links: TechLink[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (l: TechLink) => void;
  onDelete: (id: number) => void;
  emptyMessage: string;
  title?: string;
  showIframe?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{title ?? CATEGORY_LABEL[category]}</h3>
        {canManage && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded-lg text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm link
          </button>
        )}
      </div>
      {links.length === 0 ? (
        <EmptyState icon={Boxes} title="Chưa có link" message={emptyMessage} compact />
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <div key={l.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{l.title}</p>
                  <p className="text-xs text-zinc-500 truncate">{l.url}</p>
                  {l.note && <p className="text-xs text-zinc-500 mt-1">{l.note}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Mở ${l.title} trong tab mới`}
                    className="text-sky-400 hover:text-sky-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  {canManage && (
                    <>
                      <button
                        onClick={() => onEdit(l)}
                        aria-label="Sửa link"
                        className="text-zinc-400 hover:text-white"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(l.id)}
                        aria-label="Xoá link"
                        className="text-zinc-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {showIframe && l.embed && (
                <div className="mt-3 rounded-lg overflow-hidden border border-zinc-800">
                  <iframe
                    src={l.url}
                    title={l.title}
                    className="w-full h-80 bg-zinc-950"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                    loading="lazy"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TechLinkModal({
  category,
  link,
  onClose,
  onSaved,
}: {
  category: TechCategory;
  link: TechLink | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(link?.title ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [embed, setEmbed] = useState(link?.embed ?? false);
  const [note, setNote] = useState(link?.note ?? "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = title.trim().length > 0 && url.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const payload = {
        category,
        title: title.trim(),
        url: url.trim(),
        embed,
        note: note.trim() || null,
      };
      const res = await fetch(link ? `/api/tech-links/${link.id}` : "/api/tech-links", {
        method: link ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không lưu được link");
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
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {link ? "Sửa link" : `Thêm link — ${CATEGORY_LABEL[category]}`}
          </h2>
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
          URL (https://…)
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={embed} onChange={(e) => setEmbed(e.target.checked)} />
          Nhúng iframe trực tiếp trong trang (chỉ hoạt động với domain được whitelist)
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

function AlbumModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [milestoneLabel, setMilestoneLabel] = useState("");
  const [capturedDate, setCapturedDate] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = milestoneLabel.trim().length > 0;

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/progress-albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestoneLabel: milestoneLabel.trim(),
          capturedDate: capturedDate || null,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Không tạo được album");
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
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm album mốc tiến độ</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tên mốc
          <input
            value={milestoneLabel}
            onChange={(e) => setMilestoneLabel(e.target.value)}
            placeholder="VD: Hoàn thiện tầng 10 — 07/2026"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Ngày chụp
          <input
            type="date"
            value={capturedDate}
            onChange={(e) => setCapturedDate(e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
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

function AlbumGalleryModal({
  album,
  canManage,
  onClose,
  onChanged,
}: {
  album: ProgressAlbum;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  function load() {
    return fetch(`/api/progress-albums/${album.id}/photos`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setPhotos(j?.photos ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album.id]);

  async function upload(file: File) {
    setUploading(true);
    setErr("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/progress-albums/${album.id}/photos`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setErr((await res.json().catch(() => null))?.error ?? "Upload thất bại");
        return;
      }
      await load();
      onChanged();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(id: number) {
    if (!(await appConfirm("Xoá ảnh này?", { danger: true }))) return;
    const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    await load();
    onChanged();
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{album.milestoneLabel}</h2>
            {album.capturedDate && (
              <p className="text-xs text-zinc-500">{formatDateVN(album.capturedDate)}</p>
            )}
          </div>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {canManage && (
          <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit">
            <Upload className="w-4 h-4" />
            {uploading ? "Đang tải lên…" : "Thêm ảnh"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {err && <p className="text-sm text-rose-300">{err}</p>}

        {loading ? (
          <p className="text-sm text-zinc-400">Đang tải ảnh…</p>
        ) : photos.length === 0 ? (
          <EmptyState icon={ImageIcon} message="Album chưa có ảnh nào." compact />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative group">
                {/* Ảnh động qua route /api/photos/:id (kiểm quyền server) — grid đơn giản, không lightbox. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photos/${p.id}`}
                  alt={p.caption ?? p.originalName ?? "Ảnh album"}
                  loading="lazy"
                  className="w-full h-28 object-cover rounded-lg border border-zinc-800"
                />
                {canManage && (
                  <button
                    onClick={() => removePhoto(p.id)}
                    aria-label="Xoá ảnh"
                    className="absolute top-1 right-1 bg-zinc-950/80 text-zinc-300 hover:text-rose-400 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
