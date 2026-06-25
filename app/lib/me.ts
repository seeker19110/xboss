// Singleton cache phía client — chỉ fetch /api/auth/me 1 lần mỗi lần load trang.
// Các component trên cùng trang gọi fetchMe() đồng thời đều nhận cùng 1 Promise.
export type Me = { id: number; name: string; email: string; role: string };

let _promise: Promise<Me | null> | null = null;

export function fetchMe(): Promise<Me | null> {
  if (!_promise) {
    _promise = fetch('/api/auth/me')
      .then(r => {
        if (r.status === 401) { window.location.href = '/login'; return null; }
        return r.ok ? r.json().then((j: { user: Me }) => j.user) : null;
      })
      .catch(() => null);
  }
  return _promise;
}

/** Gọi sau logout để request tiếp theo fetch lại. */
export function invalidateMe() { _promise = null; }
