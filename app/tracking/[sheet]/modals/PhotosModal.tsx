"use client";
// Gallery ảnh task được tách khỏi TrackingGrid.tsx (M121 PR1).
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, Trash2, Upload, WifiOff, X } from "lucide-react";
import { Modal, appConfirm, appPrompt } from "@/app/components/dialogs";
import { enqueuePhoto, offlineQueue } from "@/app/components/offlineQueue";
import { showToast } from "@/app/components/Toast";
import { fetchMe, redirectToLogin } from "@/app/lib/me";
import { Button } from "@/app/components/ui";
import { formatDateTimeVN } from "@/lib/nen/date";
import type { GridTask } from "../types";

type Photo = {
  id: number;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  createdAt: string;
  uploadedBy: number | null;
  uploaderName: string | null;
};

// Nén ảnh về ~20% dung lượng: scale max 1920px + JPEG quality 0.45 ≈ 15-25% kích thước gốc.
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1920;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          resolve(
            blob
              ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" })
              : file,
          );
        },
        "image/jpeg",
        0.45,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

// Gallery ảnh hiện trường của task: xem, upload (chụp từ mobile), xoá.
export function PhotosModal({ task, onClose }: { task: GridTask; onClose: () => void }) {
  const [result, setResult] = useState<{ taskId: number; photos: Photo[] } | null>(null);
  const photos = result?.taskId === task.id ? result.photos : null;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [viewer, setViewer] = useState<Photo | null>(null);
  // Ảnh chụp offline đang chờ gửi — hiển thị cùng lưới ảnh thật với badge "Chờ gửi".
  const [pendingPhotos, setPendingPhotos] = useState<
    { id: string; caption: string; size: number; queuedAt: number; tries: number }[]
  >([]);
  const urlMapRef = useRef<Map<string, string>>(new Map());
  const mounted = useRef(false);
  const request = useRef({ id: 0, taskId: task.id, controller: null as AbortController | null });

  const load = useCallback(async () => {
    if (!mounted.current || request.current.taskId !== task.id) return;
    const id = ++request.current.id;
    request.current.controller?.abort();
    const controller = new AbortController();
    request.current.controller = controller;
    const current = () =>
      mounted.current && request.current.id === id && !controller.signal.aborted;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/tasks/${task.id}/photos`, { signal: controller.signal });
      if (!current()) return;
      if (response.status === 401) {
        void redirectToLogin();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!current()) return;
      if (!response.ok) {
        setLoadError(
          typeof body?.error === "string" && body.error.trim()
            ? body.error
            : "Không tải được ảnh hiện trường. Kiểm tra kết nối rồi thử lại.",
        );
        return;
      }
      if (!Array.isArray(body?.photos)) {
        setLoadError("Dữ liệu ảnh chưa hợp lệ. Vui lòng thử lại.");
        return;
      }
      setResult({ taskId: task.id, photos: body.photos });
    } catch {
      if (current()) setLoadError("Không tải được ảnh hiện trường. Kiểm tra kết nối rồi thử lại.");
    } finally {
      if (mounted.current && request.current.id === id) {
        request.current.controller = null;
        setLoading(false);
      }
    }
  }, [task.id]);

  // Đọc lại danh sách ảnh chờ gửi của task + dựng/thu hồi object URL preview.
  const refreshPending = useCallback(async () => {
    const list = await offlineQueue.getQueuedPhotos(task.id);
    const map = urlMapRef.current;
    const liveIds = new Set(list.map((p) => p.id));
    for (const [id, url] of map) {
      if (!liveIds.has(id)) {
        URL.revokeObjectURL(url);
        map.delete(id);
      }
    }
    for (const p of list) {
      if (!map.has(p.id)) {
        const blob = await offlineQueue.getQueuedPhotoBlob(p.id);
        if (blob) map.set(p.id, URL.createObjectURL(blob));
      }
    }
    setPendingPhotos(list);
  }, [task.id]);

  useEffect(() => {
    const active = request.current;
    mounted.current = true;
    active.taskId = task.id;
    setViewer(null);
    void load();
    return () => {
      mounted.current = false;
      active.id++;
      active.controller?.abort();
    };
  }, [load, task.id]);
  useEffect(() => {
    refreshPending();
    // Hàng đợi vừa gửi hết → nạp lại ảnh thật từ server + xoá mục chờ.
    const off = offlineQueue.onFlushed(() => {
      load();
      refreshPending();
    });
    const map = urlMapRef.current;
    return () => {
      off();
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, [load, refreshPending]);
  useEffect(() => {
    fetchMe().then((user) => user && setMe({ id: user.id, role: user.role }));
  }, []);

  async function upload(rawFile: File) {
    setUploading(true);
    setError("");
    // Nén ảnh về ~20% dung lượng gốc trước khi upload
    const file = await compressImage(rawFile);
    const caption =
      (await appPrompt("Ghi chú cho ảnh (tuỳ chọn)", "", {
        placeholder: "VD: đã lắp xong nhánh trục 24F",
      })) ?? "";
    const trimmed = caption.trim();

    // Xếp ảnh vào hàng đợi offline (tự nén lại + tự gửi khi có mạng).
    const queue = async (): Promise<boolean> => {
      const r = await enqueuePhoto({
        taskId: task.id,
        blob: file,
        caption: trimmed || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      showToast("Đã lưu ảnh trên thiết bị (chưa lên máy chủ) — tự gửi khi có mạng");
      await refreshPending();
      return true;
    };

    if (!navigator.onLine) {
      await queue();
      setUploading(false);
      return;
    }

    const fd = new FormData();
    fd.append("file", file);
    if (trimmed) fd.append("caption", trimmed);
    let res: Response;
    try {
      res = await fetch(`/api/tasks/${task.id}/photos`, { method: "POST", body: fd });
    } catch {
      // Mất mạng giữa chừng → fallback xếp hàng đợi như nhánh offline.
      await queue();
      setUploading(false);
      return;
    }
    if (!res.ok) {
      // Lỗi nghiệp vụ thật (quyền/định dạng) — báo lỗi, KHÔNG xếp hàng đợi.
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Upload thất bại");
    }
    setUploading(false);
    load();
    refreshPending();
  }

  async function remove(p: Photo) {
    if (!(await appConfirm("Xoá ảnh này?", { danger: true, confirmLabel: "Xoá ảnh" }))) return;
    const res = await fetch(`/api/photos/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Không xoá được");
      return;
    }
    load();
  }

  const canDelete = (p: Photo) =>
    me && (p.uploadedBy === me.id || me.role === "admin" || me.role === "pm");

  return (
    <Modal onClose={onClose} className="max-w-2xl max-h-[85vh] flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <Camera className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm truncate">Ảnh hiện trường — {task.name}</h3>
          <p className="text-xs text-zinc-400 font-mono break-words">
            {task.code} · {photos ? `${photos.length} ảnh` : "Chưa tải số ảnh"}
          </p>
        </div>
        <label className="ml-auto shrink-0 min-h-11 flex items-center gap-1.5 bg-sky-900 hover:bg-sky-800 border border-sky-800 text-sky-200 px-3 py-1.5 rounded-lg text-xs cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500 focus-within:ring-offset-2 focus-within:ring-offset-zinc-900">
          <Upload className="w-3.5 h-3.5" /> {uploading ? "Đang tải lên..." : "Thêm ảnh"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          aria-label="Đóng"
          onClick={onClose}
          className="min-h-11 min-w-11 inline-flex items-center justify-center text-zinc-400 hover:text-white shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-auto p-4">
        {error && (
          <p role="alert" className="text-sm text-red-400 mb-3">
            {error}
          </p>
        )}
        {loadError && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-red-800 bg-zinc-900 p-3 space-y-2"
          >
            <p className="text-sm text-red-400">{loadError}</p>
            <Button
              icon={RefreshCw}
              disabled={loading}
              onClick={() => void load()}
              className="min-h-11"
            >
              Thử lại
            </Button>
          </div>
        )}
        {loading && (
          <p role="status" className="text-sm text-zinc-400 mb-3">
            Đang tải ảnh…
          </p>
        )}
        {!loading && !loadError && photos?.length === 0 && pendingPhotos.length === 0 && (
          <p className="text-sm text-zinc-400">
            Chưa có ảnh nào. Chụp ảnh hiện trường làm bằng chứng thi công/nghiệm thu.
          </p>
        )}
        {(!!photos?.length || pendingPhotos.length > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {pendingPhotos.map((p) => {
              const url = urlMapRef.current.get(p.id);
              return (
                <div
                  key={`pending-${p.id}`}
                  className="relative bg-zinc-950/60 border border-amber-800/60 rounded-lg overflow-hidden"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={p.caption || "Ảnh chờ gửi"}
                      className="w-full h-32 object-cover opacity-80"
                    />
                  ) : (
                    <div className="w-full h-32 bg-zinc-900" />
                  )}
                  <span className="absolute top-1 left-1 flex items-center gap-1 bg-amber-900/90 text-amber-200 text-[10px] px-1.5 py-0.5 rounded">
                    <WifiOff className="w-3 h-3" /> Chờ gửi
                  </span>
                  <div className="px-2 py-1.5">
                    {p.caption && (
                      <p className="text-xs truncate" title={p.caption}>
                        {p.caption}
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-400 truncate">
                      Chưa gửi · {formatDateTimeVN(new Date(p.queuedAt).toISOString())}
                    </p>
                  </div>
                </div>
              );
            })}
            {photos?.map((p) => (
              <div
                key={p.id}
                className="bg-zinc-950/60 border border-zinc-800 rounded-lg overflow-hidden group"
              >
                <button
                  type="button"
                  aria-label={`Xem ảnh: ${p.caption ?? p.originalName ?? `Ảnh #${p.id}`}`}
                  className="block w-full min-h-11 cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-500"
                  onClick={() => setViewer(p)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/photos/${p.id}`}
                    alt={p.caption ?? p.originalName ?? `Ảnh #${p.id}`}
                    className="w-full h-32 object-cover"
                    loading="lazy"
                  />
                </button>
                <div className="px-2 py-1.5 flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    {p.caption && (
                      <p className="text-xs truncate" title={p.caption}>
                        {p.caption}
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-400 truncate">
                      {p.uploaderName ?? "—"} · {formatDateTimeVN(p.createdAt)}
                    </p>
                  </div>
                  {canDelete(p) && (
                    <button
                      onClick={() => remove(p)}
                      title="Xoá ảnh"
                      aria-label="Xoá ảnh"
                      className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-400 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {viewer && (
        <Modal
          onClose={() => setViewer(null)}
          ariaLabel={`Xem ảnh: ${viewer.caption ?? viewer.originalName ?? `Ảnh #${viewer.id}`}`}
          className="max-w-5xl p-4"
          zIndex="z-[60]"
        >
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Đóng ảnh"
              onClick={() => setViewer(null)}
              className="min-w-11 min-h-11"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photos/${viewer.id}`}
            alt={viewer.caption ?? viewer.originalName ?? `Ảnh #${viewer.id}`}
            className="max-w-full max-h-[70vh] mx-auto object-contain rounded-lg"
          />
        </Modal>
      )}
    </Modal>
  );
}
