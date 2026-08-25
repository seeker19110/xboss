"use client";

import { useCallback, useState } from "react";
import { redirectToLogin } from "@/app/lib/me";
import type { BlockProposal } from "../types";

// M103 — Đề xuất block vào thư viện từ AutoCAD (hàng chờ + duyệt). Admin/PM thấy toàn bộ đề
// xuất pending để duyệt/từ chối; engineer chỉ thấy đề xuất của chính mình (server tự lọc theo
// vai trò — xem docs/nang-cap/M103-de-xuat-block-thu-vien.md §3).
export function useBlockProposals() {
  const [deXuat, setDeXuat] = useState<BlockProposal[] | null>(null);
  const [loiDeXuat, setLoiDeXuat] = useState<string | null>(null);
  const [dangXuLyId, setDangXuLyId] = useState<number | null>(null);
  const [laNguoiDuyet, setLaNguoiDuyet] = useState(false);
  // M104 — quyền thêm block THẲNG từ web (admin/pm/engineer). Mặc định false: vai trò không có
  // quyền bị route trả 403 nên cờ không bao giờ bật, panel tự ẩn nút.
  const [duocThemTrucTiep, setDuocThemTrucTiep] = useState(false);

  const taiDeXuat = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/cad/block-proposals");
      if (res.status === 401) return redirectToLogin();
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLoiDeXuat((data && data.error) || "Không tải được danh sách đề xuất block.");
        setDuocThemTrucTiep(false);
        return;
      }
      setLoiDeXuat(null);
      setDeXuat(Array.isArray(data?.deXuat) ? (data.deXuat as BlockProposal[]) : []);
      setLaNguoiDuyet(Boolean(data?.laNguoiDuyet));
      setDuocThemTrucTiep(Boolean(data?.duocThemTrucTiep));
    } catch {
      setLoiDeXuat("Lỗi mạng — không tải được danh sách đề xuất block.");
    }
  }, []);

  const duyet = useCallback(
    async (id: number): Promise<{ ok: boolean; error?: string; version?: string }> => {
      setDangXuLyId(id);
      try {
        const res = await fetch(`/api/engineering/cad/block-proposals/${id}/approve`, {
          method: "POST",
        });
        if (res.status === 401) {
          redirectToLogin();
          return { ok: false };
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const thongDiep =
            res.status === 409
              ? data.error ||
                "Thư viện block đã có version mới hơn kể từ khi đề xuất được gửi — đề xuất đã lỗi thời (stale), người đề xuất cần chạy lại lệnh XBOSS_VE_DEXUAT."
              : data.error || "Duyệt đề xuất thất bại.";
          await taiDeXuat();
          return { ok: false, error: thongDiep };
        }
        await taiDeXuat();
        return { ok: true, version: data.version ?? data.publishedVersion };
      } catch {
        return { ok: false, error: "Lỗi mạng — không duyệt được đề xuất." };
      } finally {
        setDangXuLyId(null);
      }
    },
    [taiDeXuat],
  );

  const tuChoi = useCallback(
    async (id: number, reason: string): Promise<{ ok: boolean; error?: string }> => {
      setDangXuLyId(id);
      try {
        const res = await fetch(`/api/engineering/cad/block-proposals/${id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        if (res.status === 401) {
          redirectToLogin();
          return { ok: false };
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { ok: false, error: data.error || "Từ chối đề xuất thất bại." };
        }
        await taiDeXuat();
        return { ok: true };
      } catch {
        return { ok: false, error: "Lỗi mạng — không từ chối được đề xuất." };
      } finally {
        setDangXuLyId(null);
      }
    },
    [taiDeXuat],
  );

  /**
   * M104 — thêm một block vào thư viện THẲNG từ web (không qua hàng chờ): gửi .dwg + .dxf + meta
   * JSON. 422 trả danh sách lỗi kiểm định, 409 trả một thông điệp (trùng tên / chưa có thư viện).
   */
  const themBlockTrucTiep = useCallback(
    async (
      form: FormData,
    ): Promise<{ ok: boolean; version?: string; error?: string; errors?: string[] }> => {
      try {
        const res = await fetch("/api/engineering/cad/block-lib/blocks", {
          method: "POST",
          body: form,
        });
        if (res.status === 401) {
          redirectToLogin();
          return { ok: false };
        }
        const data = await res.json().catch(() => ({}));
        if (res.status === 422 && Array.isArray(data.errors)) {
          return { ok: false, errors: data.errors as string[] };
        }
        if (!res.ok) {
          return { ok: false, error: data.error || "Thêm block vào thư viện thất bại." };
        }
        return { ok: true, version: data.version as string };
      } catch {
        return { ok: false, error: "Lỗi mạng — không gửi được tệp lên máy chủ." };
      }
    },
    [],
  );

  return {
    deXuat,
    laNguoiDuyet,
    duocThemTrucTiep,
    loiDeXuat,
    dangXuLyId,
    taiDeXuat,
    duyet,
    tuChoi,
    themBlockTrucTiep,
  };
}
