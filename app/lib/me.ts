// Singleton cache phía client — chỉ fetch /api/auth/me 1 lần mỗi lần load trang.
// Các component trên cùng trang gọi fetchMe() đồng thời đều nhận cùng 1 Promise.
import { clearOfflineQueue } from "@/app/components/offlineQueue";

export type Me = { id: number; name: string; email: string; role: string };

let _promise: Promise<Me | null> | null = null;

export function fetchMe(): Promise<Me | null> {
  if (!_promise) {
    _promise = fetch("/api/auth/me")
      .then((r) => {
        if (r.status === 401) {
          redirectToLogin();
          return null;
        }
        return r.ok ? r.json().then((j: { user: Me }) => j.user) : null;
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
