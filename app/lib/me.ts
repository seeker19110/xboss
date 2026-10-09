// Singleton cache phía client — chỉ fetch /api/auth/me 1 lần mỗi lần load trang.
// Các component trên cùng trang gọi fetchMe() đồng thời đều nhận cùng 1 Promise.
import { clearServiceWorkerCache } from "@/app/lib/serviceWorkerCache";
import { ghiNhanRangBuoc, phatDoiNguCanh } from "@/app/lib/contextEpoch";

export type Me = { id: number; name: string; email: string; role: string };

let _promise: Promise<Me | null> | null = null;
let _authRedirectStarted = false;

export function fetchMe(): Promise<Me | null> {
  if (!_promise) {
    _promise = fetch("/api/auth/me")
      .then(async (r) => {
        if (r.status === 401) {
          redirectToLogin();
          return null;
        }
        const j = await r.json().catch(() => null);
        // M56 PR2: tài khoản bị bắt buộc bật 2FA nhưng chưa bật — proxy trả 403 kèm
        // code "2fa_required" cho mọi API ngoài /api/auth/*. Điều hướng sang trang bật 2FA
        // thay vì đăng xuất (phiên vẫn hợp lệ). VẪN trả `user` thật (không phải null) —
        // redirectTo2faSetup() có guard chống lặp khi đã ở /account?require2fa=1, nên trang
        // đó phải nhận được user thật để render (banner + khối 2FA), không phải màn trắng.
        // S05: actor đổi so với lần trước trên trình duyệt này (kể cả vào qua SSO/OIDC, không đi
        // qua preflight purge của trang đăng nhập) → khoá các tab khác + dọn cache SW riêng tư
        // TRƯỚC khi trả user cho trang. Dọn lỗi → khoá trang này (fail-closed).
        if (r.ok && ghiNhanRangBuoc(j?.binding)) {
          phatDoiNguCanh("actor");
          try {
            await clearServiceWorkerCache();
          } catch {
            lockPrivatePageUntilCachePurged();
            return null;
          }
        }
        if (j?.code === "2fa_required") {
          redirectTo2faSetup();
          return j.user as Me;
        }
        return r.ok && j ? (j.user as Me) : null;
      })
      .catch(() => null);
  }
  return _promise;
}

/** Gọi sau logout để request tiếp theo fetch lại. */
export function invalidateMe() {
  _promise = null;
}

type LopKhoa = { tieuDe: string; thongDiep: string; nhanNut: string };
type LopKhoaDaMo = {
  overlay: HTMLElement;
  message: HTMLParagraphElement;
  retry: HTMLButtonElement;
};

/** Đánh dấu mọi lớp khoá toàn trang — không bao giờ có 2 lớp chồng nhau. */
const DAU_LOP_KHOA = "data-xboss-lop-khoa";
let _soLopKhoa = 0;

/**
 * Phủ lớp khoá toàn trang dạng hộp thoại cảnh báo modal (role=alertdialog, aria-modal, tiêu đề/
 * mô tả gắn qua aria-labelledby/aria-describedby); nội dung phía sau inert + aria-hidden; focus
 * vào nút hành động. Lớp khoá cũ (nếu có) bị gỡ trước — lớp mới thay thế, không chồng/không đặt
 * inert lên lớp khoá khác.
 */
function phuLopKhoa(noiDung: LopKhoa): LopKhoaDaMo {
  for (const cu of Array.from(document.querySelectorAll(`[${DAU_LOP_KHOA}]`))) cu.remove();
  const so = ++_soLopKhoa;
  const overlay = document.createElement("section");
  overlay.className =
    "fixed inset-0 z-[99999] grid content-center gap-4 overflow-auto bg-background p-6 text-foreground";
  overlay.setAttribute(DAU_LOP_KHOA, "1");
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", `xboss-lop-khoa-tieu-de-${so}`);
  overlay.setAttribute("aria-describedby", `xboss-lop-khoa-mo-ta-${so}`);

  const heading = document.createElement("h1");
  heading.id = `xboss-lop-khoa-tieu-de-${so}`;
  heading.className = "text-xl font-semibold";
  heading.textContent = noiDung.tieuDe;
  const message = document.createElement("p");
  message.id = `xboss-lop-khoa-mo-ta-${so}`;
  message.className = "max-w-prose";
  message.textContent = noiDung.thongDiep;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className =
    "min-h-11 w-fit rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-on-accent hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2";
  retry.textContent = noiDung.nhanNut;

  overlay.append(heading, message, retry);
  for (const child of Array.from(document.body.children)) {
    if (child === overlay || child.hasAttribute(DAU_LOP_KHOA)) continue;
    if (child instanceof HTMLElement) child.inert = true;
    child.setAttribute("aria-hidden", "true");
  }
  document.body.append(overlay);
  retry.focus();
  return { overlay, message, retry };
}

/**
 * S05 (A2-FR03): tab KHÁC vừa đổi dự án/đăng xuất/đổi tài khoản. Khoá ngay dữ liệu đang hiển
 * thị (ngữ cảnh cũ) — kết nối SSE/poll đã được đóng trước đó. Chỉ tải lại khi người dùng bấm:
 * tải lại = xác minh online với server theo cookie mới, không tự áp dữ liệu cũ.
 * Đã có lớp khoá (kể cả lớp khoá phiên hết hạn) → giữ nguyên lớp đó, không mở lớp mới.
 */
export function khoaTrangDoiNguCanh(): void {
  if (document.querySelector(`[${DAU_LOP_KHOA}]`)) return;
  const { overlay, retry } = phuLopKhoa({
    tieuDe: "Ngữ cảnh đã thay đổi ở tab khác",
    thongDiep:
      "Dự án hoặc tài khoản vừa đổi ở một tab khác. Dữ liệu trên trang này đã bị khoá để tránh xem hoặc ghi nhầm ngữ cảnh.",
    nhanNut: "Tải lại theo ngữ cảnh mới",
  });
  overlay.setAttribute("data-xboss-ngu-canh-khoa", "1");
  retry.addEventListener("click", () => window.location.reload());
}

/**
 * `lyDo = "logout"` (S08): người dùng tự đăng xuất trên thiết bị này — nói đúng là đăng xuất cục
 * bộ, KHÔNG nói như máy chủ đã thu hồi phiên ở thiết bị khác; thao tác ngoại tuyến chưa gửi vẫn
 * giữ (mã hoá) trên thiết bị cho chính chủ đăng nhập lại.
 */
export function lockPrivatePageUntilCachePurged(lyDo?: "logout"): () => Promise<void> {
  const { message, retry } = phuLopKhoa({
    tieuDe: lyDo === "logout" ? "Đã đăng xuất trên thiết bị này" : "Phiên đăng nhập đã hết hạn",
    thongDiep:
      lyDo === "logout"
        ? "Đã khóa nội dung riêng tư và kho ngoại tuyến. Thao tác chưa gửi vẫn được giữ (mã hoá) trên thiết bị — đăng nhập lại đúng tài khoản để gửi. Đang xác nhận dọn bộ nhớ đệm XBoss…"
        : "Đã khóa nội dung riêng tư. Đang xác nhận dọn bộ nhớ đệm XBoss…",
    nhanNut: "Thử dọn bộ nhớ đệm lại",
  });
  const retryPurge = async () => {
    retry.disabled = true;
    message.textContent = "Đang xác nhận dọn bộ nhớ đệm…";
    try {
      await clearServiceWorkerCache();
      window.location.replace("/login");
    } catch {
      message.textContent =
        "Chưa dọn được bộ nhớ đệm. Nội dung riêng tư vẫn đang bị khóa; hãy kiểm tra kết nối rồi thử lại.";
      retry.disabled = false;
    }
  };
  retry.addEventListener("click", () => void retryPurge());
  return retryPurge;
}

// Khóa dữ liệu đang hiển thị và xác nhận purge cache trước khi về login. Queue không rõ owner
// được giữ nguyên/cách ly; không xóa khi session hết hạn hoặc đổi tài khoản.
export async function redirectToLogin(lyDo?: "logout") {
  if (_authRedirectStarted) return;
  _authRedirectStarted = true;
  // Khóa view đồng bộ ngay khi nhận 401; không để nội dung riêng tư hiện trong lúc
  // chờ IndexedDB hoặc service worker ACK.
  const retryPurge = lockPrivatePageUntilCachePurged(lyDo);
  await retryPurge();
}

// M56 PR2: chuyển tới trang bật 2FA khi tài khoản bị bắt buộc mà chưa bật. KHÁC
// redirectToLogin — KHÔNG xoá cache/hàng đợi offline vì đây vẫn là phiên ĐĂNG NHẬP HỢP LỆ,
// chỉ cần bật 2FA để mở khoá; xoá cache sẽ mất dữ liệu offline vô ích.
// Guard chống lặp vô hạn: trang /account TỰ NÓ cũng gọi fetchMe(), nên nếu đã ở đúng
// /account?require2fa=1 mà vẫn gán lại window.location.href y hệt, trình duyệt vẫn coi là
// điều hướng mới và RELOAD (không có chuyện tự bỏ qua vì "cùng URL") — gây reload liên tục,
// trang bật 2FA chưa kịp render đã bị load lại, user không có cách nào tự mở khoá qua UI.
export function redirectTo2faSetup() {
  const { pathname, search } = window.location;
  if (pathname === "/account" && search.includes("require2fa=1")) return;
  window.location.href = "/account?require2fa=1";
}
