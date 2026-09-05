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

// PATCH một nhóm công việc (đổi tên / đổi ngày BĐ-KT). Trước đây `TrackingGrid` gọi thẳng
// `fetch` mà không kiểm `res.ok` cũng không bắt lỗi mạng — audit 2026-09-05.
export async function guiSuaNhom(
  pkgId: number,
  patch: Record<string, string | null>,
): Promise<KetQuaGuiLo> {
  try {
    const res = await fetch(`/api/workpackages/${pkgId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) return { trangThai: "ok" };
    const loi = (await res.json().catch(() => null))?.error;
    return { trangThai: "tuChoi", loi: typeof loi === "string" ? loi : "Không lưu được thay đổi" };
  } catch {
    return { trangThai: "mangLoi" };
  }
}

// Xoá ngày riêng của các task con để chúng kế thừa ngày của nhóm. Trả về số task KHÔNG
// đồng bộ được (0 = trọn vẹn) — lớp gọi tự quyết báo thế nào.
export async function xoaNgayRiengTaskCon(ids: number[]): Promise<number> {
  const kq = await Promise.all(
    ids.map((id) =>
      fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: null, endDate: null }),
      })
        .then((r) => r.ok)
        .catch(() => false),
    ),
  );
  return kq.filter((ok) => !ok).length;
}

// Thông điệp tiếng Việt cho kết quả KHÔNG ok của `guiSuaNhom`: server từ chối thì hiện đúng
// lý do server trả, mất mạng thì nói rõ là mất kết nối (không đổ lỗi cho người dùng).
export function baoLoiSuaNhom(kq: KetQuaGuiLo, macDinh: string): string {
  if (kq.trangThai === "tuChoi") return kq.loi;
  return `Mất kết nối — ${macDinh.toLowerCase()}, thử lại khi có mạng`;
}
