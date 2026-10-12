import { phatDoiNguCanh } from "@/app/lib/contextEpoch";
import { clearServiceWorkerCache } from "@/app/lib/serviceWorkerCache";
import { docIdDuAn } from "@/lib/nen/link-tracking";

// Thủ tục ĐỔI DỰ ÁN dùng chung (M132 — tách từ ProjectSwitcher): server kiểm quyền + đặt cookie, rồi
// phát đổi ngữ cảnh cho tab khác (S05) và bỏ cache đọc API của dự án cũ trong SW (S08). Nơi gọi tự
// tải lại/điều hướng SAU khi hàm trả ok — mọi phần server-scoped đọc lại đúng dự án mới.
// `status` (HTTP) để nơi gọi xử lý riêng 401/403 2FA; 0 = lỗi mạng.
export type KetQuaChuyenDuAn =
  { ok: true } | { ok: false; loi: string; status: number; code?: string };

/** Dự án đang chọn theo cookie `xboss_project` (không httpOnly — chỉ là lựa chọn UI). */
export function duAnDangChon(): number | null {
  const m = document.cookie.match(/(?:^|; )xboss_project=([^;]+)/);
  return docIdDuAn(m ? m[1] : null);
}

export async function chuyenDuAn(projectId: number): Promise<KetQuaChuyenDuAn> {
  let res: Response;
  try {
    res = await fetch("/api/project/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
  } catch {
    return { ok: false, loi: "Mất kết nối — chưa chuyển được dự án", status: 0 };
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    return {
      ok: false,
      loi: j?.error ?? "Không chuyển được dự án — vui lòng thử lại",
      status: res.status,
      code: j?.code,
    };
  }
  try {
    localStorage.setItem("xboss_project", String(projectId));
  } catch {
    /* private mode */
  }
  phatDoiNguCanh("switch");
  // Chờ ACK tối đa 3s; lỗi vẫn an toàn vì cache gắn nhãn phiên vault của tab — tải lại là phiên mới.
  await clearServiceWorkerCache().catch(() => undefined);
  return { ok: true };
}

export type KetQuaKiemDuAn =
  { ok: true; conXem: boolean } | { ok: false; loi: string; status: number; code?: string };

/**
 * Dự án `projectId` còn nằm trong danh sách user được xem không (GET /api/projects). Dùng khi link
 * `?project=` TRÙNG cookie: cookie có thể trỏ dự án user đã bị gỡ — server khi đó lặng lẽ rơi về dự
 * án khả kiến đầu tiên, nên không được tin cookie mà dựng lưới cùng slug của dự án khác.
 */
export async function kiemDuAnConXem(projectId: number): Promise<KetQuaKiemDuAn> {
  let res: Response;
  try {
    res = await fetch("/api/projects");
  } catch {
    return { ok: false, loi: "Mất kết nối — chưa kiểm được dự án", status: 0 };
  }
  const j = (await res.json().catch(() => null)) as {
    projects?: { id: number }[];
    error?: string;
    code?: string;
  } | null;
  if (!res.ok || !Array.isArray(j?.projects))
    return {
      ok: false,
      loi: j?.error ?? "Không kiểm được dự án — vui lòng thử lại",
      status: res.status,
      code: j?.code,
    };
  return { ok: true, conXem: j.projects.some((p) => p.id === projectId) };
}
