// Singleton cache phía client — chỉ fetch /api/auth/me 1 lần mỗi lần load trang.
// Các component trên cùng trang gọi fetchMe() đồng thời đều nhận cùng 1 Promise.
import { clearOfflineQueue } from "@/app/components/offlineQueue";

export type Me = { id: number; name: string; email: string; role: string };

let _promise: Promise<Me | null> | null = null;

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

// Dọn dữ liệu của phiên cũ (cache API trong service worker + hàng đợi tick offline) rồi
// chuyển về /login. Dùng ở MỌI nơi phát hiện 401 (không chỉ nút "Đăng xuất") — nếu không,
// trên tablet dùng chung, phiên hết hạn/đóng tab mà không bấm đăng xuất sẽ để lại dữ liệu
// (thông báo, task, dashboard...) của người trước trong cache cho người đăng nhập sau thấy.
export async function redirectToLogin() {
  await clearOfflineQueue();
  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller
  ) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" });
  }
  window.location.href = "/login";
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
