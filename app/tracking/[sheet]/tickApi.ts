// Lớp gọi mạng của thao tác tick theo lô (M121) — tách khỏi `TrackingGrid.tsx` để file lưới
// chỉ lo dựng giao diện, và để phần "gửi gì, đọc lỗi ra sao" nằm một chỗ dùng chung cho cả
// tick cả hàng, tick cả vùng lẫn hoàn tác.
//
// KHÔNG hiện toast, KHÔNG chạm React ở đây: lớp gọi tự quyết hiển thị thế nào (toast, rollback,
// xếp hàng đợi offline), vì cùng một kết quả cần cách xử lý khác nhau tuỳ ngữ cảnh.

export type KetQuaGuiLo =
  | { trangThai: "ok" }
  /** Server từ chối (4xx/5xx) — `loi` là thông điệp tiếng Việt server trả, hiện thẳng cho người dùng. */
  | { trangThai: "tuChoi"; loi: string }
  /** Mất mạng — lớp gọi xếp lô vào hàng đợi offline; KHÔNG phải lỗi của người dùng. */
  | { trangThai: "mangLoi" };

// Gửi một lô tick tới `PATCH /api/dimensions/batch` (atomic, gộp recompute 1 lần/task).
export async function guiLoTick(ids: number[], installed: boolean): Promise<KetQuaGuiLo> {
  try {
    const res = await fetch("/api/dimensions/batch", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, installed }),
    });
    if (res.ok) return { trangThai: "ok" };
    const loi = (await res.json().catch(() => null))?.error;
    return { trangThai: "tuChoi", loi: typeof loi === "string" ? loi : "Không cập nhật được" };
  } catch {
    return { trangThai: "mangLoi" };
  }
}

// Đặt ngày cho nhiều task. Một task đi route đơn (không có gì để gộp, giữ đường đang chạy tốt);
// nhiều task đi `PATCH /api/tasks/batch` — MỘT request atomic, thay cho vòng lặp N request để
// lại lô nửa chừng khi lỗi giữa đường.
export async function guiNgayHangLoat(
  ids: number[],
  patch: Record<string, string>,
): Promise<KetQuaGuiLo> {
  try {
    const res =
      ids.length === 1
        ? await fetch(`/api/tasks/${ids[0]}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          })
        : await fetch("/api/tasks/batch", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ updates: ids.map((id) => ({ id, patch })) }),
          });
    if (res.ok) return { trangThai: "ok" };
    const loi = (await res.json().catch(() => null))?.error;
    return { trangThai: "tuChoi", loi: typeof loi === "string" ? loi : "Không lưu được ngày" };
  } catch {
    return { trangThai: "mangLoi" };
  }
}
