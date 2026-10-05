// Singleton cache phía client — chỉ fetch /api/auth/me 1 lần mỗi lần load trang.
// Các component trên cùng trang gọi fetchMe() đồng thời đều nhận cùng 1 Promise.
import { clearServiceWorkerCache } from "@/app/lib/serviceWorkerCache";

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

export function lockPrivatePageUntilCachePurged(): () => Promise<void> {
  const overlay = document.createElement("section");
  overlay.className =
    "fixed inset-0 z-[99999] grid content-center gap-4 overflow-auto bg-background p-6 text-foreground";
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-live", "assertive");
  overlay.tabIndex = -1;

  const heading = document.createElement("h1");
  heading.className = "text-xl font-semibold";
  heading.textContent = "Phiên đăng nhập đã hết hạn";
  const message = document.createElement("p");
  message.className = "max-w-prose";
  message.textContent = "Đã khóa nội dung riêng tư. Đang xác nhận dọn bộ nhớ đệm XBoss…";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className =
    "min-h-11 w-fit rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-on-accent hover:bg-emerald-800 focus-visible:outline";
  retry.textContent = "Thử dọn bộ nhớ đệm lại";
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

  overlay.append(heading, message, retry);
  for (const child of Array.from(document.body.children)) {
    if (child === overlay) continue;
    if (child instanceof HTMLElement) child.inert = true;
    child.setAttribute("aria-hidden", "true");
  }
  document.body.append(overlay);
  overlay.focus();
  return retryPurge;
}

// Khóa dữ liệu đang hiển thị và xác nhận purge cache trước khi về login. Queue không rõ owner
// được giữ nguyên/cách ly; không xóa khi session hết hạn hoặc đổi tài khoản.
export async function redirectToLogin() {
  if (_authRedirectStarted) return;
  _authRedirectStarted = true;
  // Khóa view đồng bộ ngay khi nhận 401; không để nội dung riêng tư hiện trong lúc
  // chờ IndexedDB hoặc service worker ACK.
  const retryPurge = lockPrivatePageUntilCachePurged();
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
