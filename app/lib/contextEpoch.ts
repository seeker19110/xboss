// Đồng bộ ĐỔI NGỮ CẢNH giữa các tab cùng trình duyệt (QUALITY-FINAL-1 S05, A2-FR03, D02).
//
// Cookie dự án/phiên dùng chung cho mọi tab: tab A đổi dự án/đăng xuất/đổi tài khoản thì tab B
// đang hiển thị dữ liệu ngữ cảnh cũ phải KHOÁ ngay, đóng SSE/poll, rồi chỉ tải lại khi người dùng
// xác nhận (tải lại = xác minh online với server). Kênh: BroadcastChannel, dự phòng sự kiện
// `storage` (Safari cũ/thiếu BroadcastChannel). Thông điệp CHỈ mang epoch ngẫu nhiên + lý do —
// không id người dùng/dự án/PII.
//
// Ràng buộc actor: /api/auth/me trả `binding` (HMAC rút gọn, mờ). Trình duyệt nhớ binding lần
// trước; khác đi nghĩa là actor đã đổi (kể cả vào qua SSO/OIDC không qua preflight của trang đăng
// nhập) → tab hiện tại dọn cache SW riêng tư + phát đổi ngữ cảnh cho các tab khác.

import { xoaCacheDuAnKhaKien } from "@/app/lib/duAnKhaKien";

const KENH = "xboss-context";
const KHOA_EPOCH = "xboss_ctx_epoch";
const KHOA_BINDING = "xboss_ctx_binding";

export type LyDoDoiNguCanh = "switch" | "logout" | "actor";
export type ThongDiepNguCanh = { t: "ctx"; e: string; r: LyDoDoiNguCanh };

const LY_DO: readonly string[] = ["switch", "logout", "actor"];

/** Chỉ nhận đúng hình dạng thông điệp (không tin dữ liệu từ kênh dùng chung). */
export function docThongDiepNguCanh(data: unknown): ThongDiepNguCanh | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  if (Object.keys(o).length !== 3 || o.t !== "ctx") return null;
  if (typeof o.e !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(o.e)) return null;
  if (typeof o.r !== "string" || !LY_DO.includes(o.r)) return null;
  return { t: "ctx", e: o.e, r: o.r as LyDoDoiNguCanh };
}

/** Epoch do CHÍNH tab này phát — bỏ qua khi nó vọng lại (storage/BroadcastChannel). */
const epochCuaToi = new Set<string>();

/** Phát "ngữ cảnh đã đổi" tới mọi tab khác. Gọi TRƯỚC khi reload/điều hướng ở tab hiện tại. */
export function phatDoiNguCanh(r: LyDoDoiNguCanh): void {
  xoaCacheDuAnKhaKien(); // danh sách dự án của ngữ cảnh cũ không còn đúng cho tab này
  const e =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  epochCuaToi.add(e);
  const msg: ThongDiepNguCanh = { t: "ctx", e, r };
  try {
    const bc = new BroadcastChannel(KENH);
    bc.postMessage(msg);
    bc.close();
  } catch {
    /* không có BroadcastChannel — dựa vào storage bên dưới */
  }
  try {
    localStorage.setItem(KHOA_EPOCH, JSON.stringify(msg));
  } catch {
    /* private mode — BroadcastChannel vẫn chạy nếu có */
  }
}

/** Nghe đổi ngữ cảnh từ tab KHÁC (mỗi epoch chỉ gọi cb một lần). Trả hàm huỷ đăng ký. */
export function ngheDoiNguCanh(cb: (m: ThongDiepNguCanh) => void): () => void {
  const daXuLy = new Set<string>();
  const nhan = (data: unknown) => {
    const m = docThongDiepNguCanh(data);
    if (!m || epochCuaToi.has(m.e) || daXuLy.has(m.e)) return;
    daXuLy.add(m.e);
    cb(m);
  };
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(KENH);
    bc.onmessage = (ev: MessageEvent) => nhan(ev.data);
  } catch {
    bc = null;
  }
  const onStorage = (ev: StorageEvent) => {
    if (ev.key !== KHOA_EPOCH || !ev.newValue) return;
    try {
      nhan(JSON.parse(ev.newValue));
    } catch {
      /* giá trị hỏng — bỏ qua */
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    bc?.close();
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

// ── Kết nối sống (SSE/poll) — đóng NGAY khi ngữ cảnh đổi, trước khi khoá trang ─────────────

const ketNoiSong = new Set<() => void>();

/** Đăng ký hàm đóng một kết nối sống; trả hàm gỡ đăng ký (gọi khi component unmount). */
export function dangKyKetNoiSong(dong: () => void): () => void {
  ketNoiSong.add(dong);
  return () => {
    ketNoiSong.delete(dong);
  };
}

export function dongMoiKetNoiSong(): void {
  const ds = [...ketNoiSong];
  ketNoiSong.clear();
  for (const dong of ds) {
    try {
      dong();
    } catch {
      /* đóng lỗi vẫn tiếp tục đóng các kết nối khác */
    }
  }
}

/**
 * Ghi nhận binding actor từ /api/auth/me. Trả true khi trình duyệt này ĐÃ thấy một binding khác
 * trước đó (actor đổi). Binding sai định dạng/không đọc được storage → false (không đoán).
 */
export function ghiNhanRangBuoc(binding: unknown): boolean {
  if (typeof binding !== "string" || !/^[0-9a-f]{32}$/.test(binding)) return false;
  try {
    const cu = localStorage.getItem(KHOA_BINDING);
    localStorage.setItem(KHOA_BINDING, binding);
    return cu != null && cu !== binding;
  } catch {
    return false;
  }
}
