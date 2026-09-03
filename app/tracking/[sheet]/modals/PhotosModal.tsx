"use client";
// Tách nguyên văn khỏi TrackingGrid.tsx (M121 PR1) — không đổi một dòng hành vi nào,
// chỉ đưa 4 modal ra khỏi file 2424 dòng để mỗi file làm đúng một việc.
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Trash2, Upload, WifiOff, X } from "lucide-react";
import { Modal, appConfirm, appPrompt } from "@/app/components/dialogs";
import { enqueuePhoto, offlineQueue } from "@/app/components/offlineQueue";
import { showToast } from "@/app/components/Toast";
import { fetchMe } from "@/app/lib/me";
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
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);
  const [viewer, setViewer] = useState<Photo | null>(null);
  // Ảnh chụp offline đang chờ gửi — hiển thị cùng lưới ảnh thật với badge "Chờ gửi".
  const [pendingPhotos, setPendingPhotos] = useState<
    { id: number; caption: string; size: number; queuedAt: number; tries: number }[]
  >([]);
  const urlMapRef = useRef<Map<number, string>>(new Map());

  const load = useCallback(() => {
    fetch(`/api/tasks/${task.id}/photos`)
      .then((r) => r.json())
      .then((j) => setPhotos(j.photos ?? []));
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
    load();
  }, [load]);
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
      showToast("Đã xếp vào hàng đợi offline — tự gửi khi có mạng");
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
        <Camera className="w-4 h-4 text-sky-400" />
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">Ảnh hiện trường — {task.name}</h3>
          <p className="text-xs text-zinc-500 font-mono">
            {task.code} · {photos?.length ?? 0} ảnh
          </p>
        </div>
        <label className="ml-auto shrink-0 flex items-center gap-1.5 bg-sky-900 hover:bg-sky-800 border border-sky-800 text-sky-200 px-3 py-1.5 rounded-lg text-xs cursor-pointer">
          <Upload className="w-3.5 h-3.5" /> {uploading ? "Đang tải lên..." : "Thêm ảnh"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </label>
        <button onClick={onClose} className="text-zinc-400 hover:text-white shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-auto p-4">
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        {photos === null && <p className="text-sm text-zinc-500">Đang tải...</p>}
        {photos?.length === 0 && pendingPhotos.length === 0 && (
          <p className="text-sm text-zinc-500">
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
                    <p className="text-[10px] text-zinc-500 truncate">
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photos/${p.id}`}
                  alt={p.caption ?? p.originalName ?? `Ảnh #${p.id}`}
                  className="w-full h-32 object-cover cursor-zoom-in"
                  loading="lazy"
                  onClick={() => setViewer(p)}
                />
                <div className="px-2 py-1.5 flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    {p.caption && (
                      <p className="text-xs truncate" title={p.caption}>
                        {p.caption}
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-500 truncate">
                      {p.uploaderName ?? "—"} · {formatDateTimeVN(p.createdAt)}
                    </p>
                  </div>
                  {canDelete(p) && (
                    <button
                      onClick={() => remove(p)}
                      title="Xoá ảnh"
                      className="text-zinc-600 hover:text-red-400 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition"
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
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            setViewer(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photos/${viewer.id}`}
            alt={viewer.caption ?? ""}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </Modal>
  );
}
