"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { ErrorState } from "@/app/components/ErrorState";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { Button } from "@/app/components/ui";
import { showToast } from "@/app/components/Toast";
import { fetchMe, invalidateMe, redirectToLogin, type Me } from "@/app/lib/me";
import { formatDateVN } from "@/lib/nen/date";

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

type HealthCheckItem = {
  key: string;
  label: string;
  kind: "api" | "non_api";
  status: "ok" | "warn" | "fail" | "skip";
  detail: string;
};

type HealthCheckReport = {
  checkedAt: string;
  items: HealthCheckItem[];
  failCount: number;
  warnCount: number;
  hasIssues: boolean;
  lastNotifiedAt: string | null;
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

// Danh sách lỗi không phải danh sách rỗng; lần tải mới và unmount huỷ request cũ.
function useList<T>(url: string, key: string, message: string, enabled = true) {
  const [items, setItems] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ id: number; controller: AbortController | null }>({
    id: 0,
    controller: null,
  });
  const mounted = useRef(false);
  const reload = useCallback(async () => {
    if (!mounted.current) return false;
    const id = ++request.current.id;
    request.current.controller?.abort();
    const controller = new AbortController();
    request.current.controller = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!mounted.current || request.current.id !== id || controller.signal.aborted) return false;
      if (response.status === 401) {
        void redirectToLogin();
        return false;
      }
      const body = await response.json().catch(() => null);
      if (!mounted.current || request.current.id !== id || controller.signal.aborted) return false;
      if (!response.ok) {
        setError(typeof body?.error === "string" ? body.error : message);
        return false;
      }
      if (!Array.isArray(body?.[key])) {
        setError(message);
        return false;
      }
      setItems(body[key]);
      return true;
    } catch {
      if (mounted.current && request.current.id === id && !controller.signal.aborted)
        setError(message);
      return false;
    } finally {
      if (mounted.current && request.current.id === id) {
        request.current.controller = null;
        setLoading(false);
      }
    }
  }, [url, key, message]);
  useEffect(() => {
    const active = request.current;
    mounted.current = true;
    if (enabled) void reload();
    return () => {
      mounted.current = false;
      active.id++;
      active.controller?.abort();
      active.controller = null;
    };
  }, [enabled, reload]);
  return { items, loading, error, reload };
}

function LoadNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-900/50 bg-red-950/20 p-3 space-y-2">
      <p className="text-sm text-red-400">{message}</p>
      <Button onClick={onRetry} className="min-h-11" icon={RefreshCw}>
        Thử lại
      </Button>
    </div>
  );
}

export default function TechPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [health, setHealth] = useState<HealthCheckReport | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const authRequest = useRef(0);
  const mounted = useRef(false);
  const [tab, setTab] = useState<Tab>("cde");
  const [addLinkOpen, setAddLinkOpen] = useState<TechCategory | null>(null);
  const [editLink, setEditLink] = useState<TechLink | null>(null);
  const [addAlbumOpen, setAddAlbumOpen] = useState(false);
  const [openAlbum, setOpenAlbum] = useState<ProgressAlbum | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm";
  const isAdmin = me?.role === "admin";
  const linkList = useList<TechLink>(
    "/api/tech-links",
    "links",
    "Không tải được danh sách liên kết",
    !!me,
  );
  const albumList = useList<ProgressAlbum>(
    "/api/progress-albums",
    "albums",
    "Không tải được danh sách album",
    !!me,
  );
  const links = linkList.items ?? [];
  const albums = albumList.items ?? [];
  const refreshLinks = linkList.reload;
  const refreshAlbums = albumList.reload;

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

  const loadMe = useCallback(async () => {
    const id = ++authRequest.current;
    setLoading(true);
    setAuthError("");
    const user = await fetchMe();
    if (!mounted.current || id !== authRequest.current) return;
    if (!user) {
      invalidateMe();
      setAuthError("Không tải được thông tin tài khoản. Vui lòng thử lại.");
    } else setMe(user);
    setLoading(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    void loadMe();
    return () => {
      mounted.current = false;
    };
  }, [loadMe]);

  useEffect(() => {
    if (tab !== "he-thong" || !isAdmin) return;
    fetch("/api/tech/system-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setStatus(j))
      .catch(() => setStatus(null));
  }, [tab, isAdmin]);

  async function runHealthCheck() {
    setHealthChecking(true);
    try {
      const res = await fetch("/api/tech/health-check");
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Kiểm tra thất bại", "error");
        return;
      }
      setHealth(await res.json());
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setHealthChecking(false);
    }
  }

  useEffect(() => {
    if (tab !== "he-thong" || !isAdmin) return;
    runHealthCheck();
  }, [tab, isAdmin]);

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
  if (authError)
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Chuyển đổi số & Công nghệ" />
        <main>
          <div role="alert">
            <ErrorState message={authError} onRetry={() => void loadMe()} />
          </div>
        </main>
      </div>
    );

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
        {tab !== "cde" && tab !== "he-thong" && linkList.error && (
          <LoadNotice message={linkList.error} onRetry={() => void refreshLinks()} />
        )}
        {tab !== "cde" && tab !== "he-thong" && linkList.loading && (
          <p role="status" className="text-sm text-zinc-400">
            Đang tải liên kết…
          </p>
        )}
        {tab === "giam-sat" && albumList.error && (
          <LoadNotice message={albumList.error} onRetry={() => void refreshAlbums()} />
        )}
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
              href="/commercial?tab=ipc-payments&sub=proposals"
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

        {tab === "bim" && linkList.items !== null && (
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

        {tab === "phan-mem" && linkList.items !== null && (
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
            {linkList.items !== null && (
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
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Album ảnh mốc tiến độ (drone)
                </h3>
                {canManage && (
                  <button
                    onClick={() => setAddAlbumOpen(true)}
                    className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 rounded-lg text-xs font-semibold text-on-accent"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm album
                  </button>
                )}
              </div>
              {albumList.loading && (
                <p role="status" className="text-sm text-zinc-400">
                  Đang tải album…
                </p>
              )}
              {albumList.items !== null &&
                (albums.length === 0 ? (
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
                        className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2"
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
                ))}
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Kiểm tra trạng thái hoạt động
                </h3>
                <button
                  onClick={runHealthCheck}
                  disabled={healthChecking}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-100"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${healthChecking ? "animate-spin" : ""}`} />
                  {healthChecking ? "Đang kiểm tra…" : "Kiểm tra ngay"}
                </button>
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                Tự động chạy 2 lần/ngày qua cron (xem DEPLOY.md) — gửi email + Telegram cho Admin
                khi phát hiện lỗi hoặc cảnh báo. Bấm “Kiểm tra ngay” để chạy thủ công.
              </p>
              {!health ? (
                <p className="text-sm text-zinc-400">Đang tải…</p>
              ) : (
                <div className="space-y-2">
                  <div
                    className={`text-xs rounded-lg px-3 py-2 border ${
                      health.hasIssues
                        ? "border-amber-800 bg-amber-950/30 text-amber-300"
                        : "border-emerald-800 bg-emerald-950/30 text-emerald-300"
                    }`}
                  >
                    {health.hasIssues
                      ? `Phát hiện ${health.failCount} lỗi, ${health.warnCount} cảnh báo`
                      : "Tất cả tính năng hoạt động bình thường"}{" "}
                    · kiểm tra lúc {new Date(health.checkedAt).toLocaleString("vi-VN")}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {health.items.map((it) => (
                      <div
                        key={it.key}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex items-start gap-2"
                      >
                        {it.status === "ok" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : it.status === "fail" ? (
                          <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            {it.label}
                            <span className="text-[10px] text-zinc-500 font-normal">
                              ({it.kind === "api" ? "API" : "không dùng API"})
                            </span>
                          </p>
                          <p className="text-xs text-zinc-400">{it.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 rounded-lg text-xs font-semibold text-on-accent"
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
          className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
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
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const canSubmit = milestoneLabel.trim().length > 0;

  function close() {
    if (!pending.current) onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !canSubmit) return;
    pending.current = true;
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
      if (!mounted.current) return;
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (mounted.current) setErr(body?.error ?? "Không tạo được album");
        return;
      }
      onSaved();
    } catch {
      if (mounted.current) setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <Modal onClose={close} className="max-w-md">
      <form className="p-5" onSubmit={submit}>
        <fieldset disabled={saving} aria-busy={saving} className="min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Thêm album mốc tiến độ</h2>
            <Button
              onClick={close}
              aria-label="Đóng"
              disabled={saving}
              variant="ghost"
              size="icon"
              className="min-w-11 min-h-11"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <label className="text-xs text-zinc-400 block">
            Tên mốc
            <input
              value={milestoneLabel}
              onChange={(e) => setMilestoneLabel(e.target.value)}
              placeholder="VD: Hoàn thiện tầng 10 — 07/2026"
              className="mt-1 w-full min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
            />
          </label>

          <label className="text-xs text-zinc-400 block">
            Ngày chụp
            <input
              type="date"
              value={capturedDate}
              onChange={(e) => setCapturedDate(e.target.value)}
              className="mt-1 w-full min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
            />
          </label>

          <label className="text-xs text-zinc-400 block">
            Ghi chú
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
            />
          </label>

          {err && (
            <p role="alert" className="text-sm text-red-400">
              {err}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={saving || !canSubmit}
            className="w-full min-h-11 justify-center"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </Button>
        </fieldset>
      </form>
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
  const photoList = useList<AlbumPhoto>(
    `/api/progress-albums/${album.id}/photos`,
    "photos",
    "Không tải được ảnh album. Vui lòng thử lại.",
  );
  const photos = photoList.items ?? [];
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");
  const [uploadAccepted, setUploadAccepted] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busy = uploading || deleting;
  function close() {
    if (!pending.current) onClose();
  }

  async function upload(file: File) {
    if (pending.current) return;
    pending.current = true;
    setUploading(true);
    setErr("");
    setUploadAccepted(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/progress-albums/${album.id}/photos`, {
        method: "POST",
        body: form,
      });
      if (!mounted.current) return;
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (mounted.current) setErr(body?.error ?? "Upload thất bại");
        return;
      }
      setUploadAccepted(true);
      const refreshed = await photoList.reload();
      if (!mounted.current) return;
      if (refreshed) setUploadAccepted(false);
      onChanged();
    } catch {
      if (mounted.current) setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      pending.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  async function removePhoto(id: number) {
    if (pending.current) return;
    pending.current = true;
    setErr("");
    try {
      if (!(await appConfirm("Xoá ảnh này?", { danger: true })) || !mounted.current) return;
      setDeleting(true);
      const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (!mounted.current) return;
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (mounted.current) setErr(body?.error ?? "Xoá thất bại");
        return;
      }
      await photoList.reload();
      if (mounted.current) onChanged();
    } catch {
      if (mounted.current) setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      pending.current = false;
      if (mounted.current) setDeleting(false);
    }
  }

  return (
    <Modal onClose={close} className="max-w-2xl">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{album.milestoneLabel}</h2>
            {album.capturedDate && (
              <p className="text-xs text-zinc-500">{formatDateVN(album.capturedDate)}</p>
            )}
          </div>
          <Button
            onClick={close}
            aria-label="Đóng"
            disabled={busy}
            variant="ghost"
            size="icon"
            className="min-w-11 min-h-11"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {canManage && (
          <label className="inline-flex items-center gap-2 min-h-11 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit focus-within:ring-2 focus-within:ring-emerald-500">
            <Upload className="w-4 h-4" />
            {uploading ? "Đang tải lên…" : "Thêm ảnh"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {err && (
          <p role="alert" className="text-sm text-red-400">
            {err}
          </p>
        )}
        {photoList.error && (
          <LoadNotice
            message={photoList.error}
            onRetry={() => {
              void photoList.reload().then((ok) => {
                if (ok && mounted.current) setUploadAccepted(false);
              });
            }}
          />
        )}
        {uploadAccepted && photoList.error && (
          <p className="text-sm text-zinc-300">
            Ảnh đã tải lên; hãy thử lại để cập nhật danh sách.
          </p>
        )}

        {photoList.loading && (
          <p role="status" className="text-sm text-zinc-400">
            Đang tải ảnh…
          </p>
        )}
        {photoList.items !== null &&
          (photos.length === 0 ? (
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
                      disabled={busy}
                      aria-label="Xoá ảnh"
                      className="absolute top-1 right-1 min-w-11 min-h-11 inline-flex items-center justify-center bg-zinc-950/80 text-zinc-300 hover:text-rose-400 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 disabled:opacity-50 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
      </div>
    </Modal>
  );
}
