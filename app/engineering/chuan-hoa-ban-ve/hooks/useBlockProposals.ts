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

  const taiDeXuat = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/cad/block-proposals");
      if (res.status === 401) return redirectToLogin();
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLoiDeXuat((data && data.error) || "Không tải được danh sách đề xuất block.");
        return;
      }
      setLoiDeXuat(null);
      const items: BlockProposal[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : [];
      setDeXuat(items);
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

  return { deXuat, loiDeXuat, dangXuLyId, taiDeXuat, duyet, tuChoi };
}
