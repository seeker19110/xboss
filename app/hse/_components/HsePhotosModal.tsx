"use client";
// Gallery ảnh của 1 ghi nhận HSE: xem (phóng to), thêm ảnh, xoá. Trước đây ảnh chỉ upload
// được lúc tạo ghi nhận (AddHseModal) mà không có chỗ nào xem lại — backend
// GET /api/hse/:id/photos + GET/DELETE /api/hse-photos/:id đã có sẵn, modal này nối UI vào.
// Bố cục bám PhotosModal của lưới tracking (app/tracking/[sheet]/modals/PhotosModal.tsx).
import { useCallback, useEffect, useState } from "react";
import { Camera, Trash2, Upload, X } from "lucide-react";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { taiJson, taiJsonMoi } from "@/app/lib/taiDuLieu";
import type { Me } from "@/app/lib/me";
import { formatDateTimeVN } from "@/lib/nen/date";

type HsePhoto = {
  id: number;
  mime: string;
  createdAt: string;
  uploadedBy: number | null;
  uploaderName: string | null;
};

export function HsePhotosModal({
  recordId,
  title,
  me,
  onClose,
  onChanged,
}: {
  recordId: number;
  title: string;
  me: Me | null;
  onClose: () => void;
  /** Gọi sau khi thêm/xoá ảnh để trang cập nhật số ảnh trên nút. */
  onChanged: () => void;
}) {
  const [photos, setPhotos] = useState<HsePhoto[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<HsePhoto | null>(null);

  // Cùng luật quyền với route: upload = mọi vai trò trừ cdt/viewer/bch; xoá = người upload
  // hoặc CAN.manageHse (admin/pm/engineer). API vẫn là ranh giới thật, đây chỉ ẩn nút.
  const canUpload = me != null && me.role !== "cdt" && me.role !== "viewer" && me.role !== "bch";
  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const canDelete = (p: HsePhoto) => me != null && (p.uploadedBy === me.id || canManage);

  // fresh = tải lại ngay sau khi tự thêm/xoá ảnh → bỏ qua cache SW (xem taiJsonMoi).
  const load = useCallback(
    async (fresh = false) => {
      const url = `/api/hse/${recordId}/photos`;
      const kq = await (fresh ? taiJsonMoi : taiJson)<{ photos?: HsePhoto[] }>(url);
      if (!kq.ok) {
        setLoi(kq.loi);
        return;
      }
      setLoi(null);
      setPhotos(kq.data.photos ?? []);
    },
    [recordId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/hse/${recordId}/photos`, { method: "POST", body: form }).catch(
      () => null,
    );
    setUploading(false);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      showToast(j?.error ?? "Tải ảnh lên thất bại", "error");
      return;
    }
    await load(true);
    onChanged();
  }

  async function remove(p: HsePhoto) {
    if (!(await appConfirm("Xoá ảnh này?", { danger: true, confirmLabel: "Xoá ảnh" }))) return;
    const res = await fetch(`/api/hse-photos/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      showToast(j?.error ?? "Không xoá được ảnh", "error");
      return;
    }
    if (viewer?.id === p.id) setViewer(null);
    await load(true);
    onChanged();
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl max-h-[85vh] flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <Camera className="w-4 h-4 text-sky-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm truncate">Ảnh hiện trường</h3>
          <p className="text-xs text-zinc-500 truncate" title={title}>
            {photos?.length ?? 0} ảnh · {title}
          </p>
        </div>
        {canUpload && (
          <label className="shrink-0 flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-on-accent px-3 h-10 rounded-lg text-xs font-semibold cursor-pointer focus-within:ring-2 focus-within:ring-emerald-400">
            <Upload className="w-3.5 h-3.5" /> {uploading ? "Đang tải lên..." : "Thêm ảnh"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <button
          aria-label="Đóng"
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-auto p-4">
        {loi && <p className="text-sm text-red-400 mb-3">{loi}</p>}
        {photos === null && !loi && <p className="text-sm text-zinc-500">Đang tải...</p>}
        {photos?.length === 0 && (
          <p className="text-sm text-zinc-500">
            Chưa có ảnh nào. Chụp ảnh hiện trường làm bằng chứng cho ghi nhận HSE.
          </p>
        )}
        {!!photos?.length && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((p) => (
              <div
                key={p.id}
                className="bg-zinc-950/70 border border-zinc-800 rounded-lg overflow-hidden group"
              >
                <button
                  type="button"
                  onClick={() => setViewer(p)}
                  aria-label={`Phóng to ảnh #${p.id}`}
                  className="block w-full cursor-zoom-in"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/hse-photos/${p.id}`}
                    alt={`Ảnh HSE #${p.id}`}
                    className="w-full h-32 object-cover"
                    loading="lazy"
                  />
                </button>
                <div className="px-2 py-1.5 flex items-center gap-1">
                  <p className="text-[10px] text-zinc-500 truncate flex-1 min-w-0">
                    {p.uploaderName ?? "—"} · {formatDateTimeVN(p.createdAt)}
                  </p>
                  {canDelete(p) && (
                    <button
                      onClick={() => void remove(p)}
                      aria-label="Xoá ảnh"
                      title="Xoá ảnh"
                      className="text-zinc-500 hover:text-red-400 shrink-0 w-10 h-10 -my-1.5 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition"
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
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "var(--overlay-scrim)" }}
          role="dialog"
          aria-label="Xem ảnh HSE"
          onClick={(e) => {
            e.stopPropagation();
            setViewer(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/hse-photos/${viewer.id}`}
            alt={`Ảnh HSE #${viewer.id}`}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </Modal>
  );
}
