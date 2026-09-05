"use client";

// Lớp tải dữ liệu dùng chung cho các trang client — thay cho mẫu
// `fetch(url).then((r) => (r.ok ? r.json() : null))` rải khắp repo.
//
// Vì sao cần (nợ kỹ thuật ghi ở đợt audit 2026-09-05): mẫu cũ không có `.catch` và biến MỌI
// lỗi thành `null`, nên trang render đúng như lúc "chưa có dữ liệu". Ngoài công trường,
// mất sóng hoặc API 500 hiện ra thành "Chưa có bản ghi nào" — kỹ sư tưởng chưa ai nhập và
// nhập lại, hoặc bỏ qua một sự cố có thật. Lỗi phải nói là lỗi, kèm đường thử lại.

import { redirectToLogin } from "@/app/lib/me";

export type KetQuaTai<T> =
  | { ok: true; data: T }
  /** Server trả lỗi (4xx/5xx) — `loi` là thông điệp tiếng Việt server trả nếu có. */
  | { ok: false; loi: string; mangLoi: false }
  /** Mất mạng / fetch ném lỗi — phân biệt để UI nói đúng "kiểm tra kết nối". */
  | { ok: false; loi: string; mangLoi: true };

/**
 * Tải JSON và trả về kết quả PHÂN BIỆT ĐƯỢC lỗi với dữ liệu rỗng.
 * 401 tự điều hướng về /login (giống quy ước sẵn có của các trang) và trả `ok: false`.
 */
export async function taiJson<T>(url: string, init?: RequestInit): Promise<KetQuaTai<T>> {
  try {
    const res = await fetch(url, init);
    if (res.status === 401) {
      // Dùng lại redirectToLogin của app/lib/me: nó còn dọn hàng đợi offline + cache SW
      // của người dùng cũ trước khi chuyển trang (thiết bị dùng chung ngoài công trường).
      await redirectToLogin();
      return { ok: false, loi: "Phiên đăng nhập đã hết hạn", mangLoi: false };
    }
    if (!res.ok) {
      const loi = (await res.json().catch(() => null))?.error;
      return {
        ok: false,
        loi: typeof loi === "string" ? loi : `Không tải được dữ liệu (lỗi ${res.status})`,
        mangLoi: false,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, loi: "Mất kết nối — kiểm tra mạng rồi thử lại", mangLoi: true };
  }
}
