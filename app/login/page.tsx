"use client";
import { useEffect, useState } from "react";
import { LogIn, KeyRound } from "lucide-react";
import ThemeToggle from "@/app/components/ThemeToggle";
import { clearOfflineQueue } from "@/app/components/offlineQueue";

const DEMO = [
  { role: "Admin", email: "admin@xboss.vn", pw: "admin123" },
  { role: "PM", email: "pm@xboss.vn", pw: "pm123" },
  { role: "Engineer", email: "engineer@xboss.vn", pw: "eng123" },
  { role: "Sub-con", email: "subcon@xboss.vn", pw: "sub123" },
];

// Thông điệp tiếng Việt cho các mã lỗi ?error=oidc_* mà callback trả về.
const OIDC_ERRORS: Record<string, string> = {
  oidc_expired: "Phiên đăng nhập SSO đã hết hạn — vui lòng thử lại.",
  oidc_rate: "Thử SSO quá nhiều lần — vui lòng chờ ít phút rồi thử lại.",
  oidc_failed: "Đăng nhập SSO thất bại — vui lòng thử lại hoặc dùng mật khẩu.",
  oidc_noemail: "Tài khoản SSO không trả về email — không thể đăng nhập.",
};

export default function LoginPage() {
  const [email, setEmail] = useState("admin@xboss.vn");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState<string | null>(null);
  // Bước 2 (M56 PR1): server trả { need2fa: true, pending } thay vì set cookie ngay.
  const [pending, setPending] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [ssoEnabled, setSsoEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/project")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setProjectName(j?.name ?? null));
    fetch("/api/auth/oidc/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSsoEnabled(!!j?.enabled));
    // Hiển thị lỗi SSO trả về qua ?error=oidc_* (callback không lộ chi tiết, chỉ mã cố định).
    const code = new URLSearchParams(window.location.search).get("error");
    if (code && OIDC_ERRORS[code]) setError(OIDC_ERRORS[code]);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.need2fa) {
      setPending(j.pending);
      setBusy(false);
      return;
    }
    if (res.ok) {
      await onLoginOk();
    } else {
      setError(j.error ?? "Đăng nhập thất bại");
      setBusy(false);
    }
  }

  async function onLoginOk() {
    // Đăng nhập mới trên thiết bị dùng chung: dọn cache API + hàng đợi tick offline còn sót
    // lại từ phiên trước (có thể của người khác) để không lẫn dữ liệu giữa 2 người dùng.
    await clearOfflineQueue();
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" });
    }
    // M58 PR1: quay lại đúng đích sau khi quét QR gặp 401 (?next=/r/<kind>/<id>) — chỉ chấp
    // nhận đường dẫn nội bộ tuyệt đối (bắt đầu "/" và không phải "//..." — chặn open redirect
    // dạng protocol-relative URL), không tin giá trị lạ.
    const next = new URLSearchParams(window.location.search).get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    window.location.href = safeNext;
  }

  async function submit2fa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pending, code: totpCode }),
    });
    if (res.ok) {
      await onLoginOk();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Mã không đúng");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 text-2xl shadow-inner mb-3">
            🏗️
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">XBoss Platform</h1>
          <p className="text-xs text-zinc-400 mt-1 font-medium">
            {projectName ?? "Quản lý tiến độ thi công MEP"}
          </p>
        </div>

        {pending ? (
          <form
            onSubmit={submit2fa}
            className="bg-zinc-900 border border-zinc-800/90 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div>
              <label
                htmlFor="login-totp"
                className="text-xs font-medium text-zinc-300 block mb-1.5"
              >
                Mã xác thực 2 lớp (TOTP / Recovery Code)
              </label>
              <input
                id="login-totp"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                autoFocus
                required
                placeholder="6 chữ số hoặc mã 10 ký tự"
                className="w-full bg-zinc-800/90 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm font-mono outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>
            {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
            <button
              disabled={busy}
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 py-3 rounded-xl font-semibold text-sm transition text-white min-h-[44px] shadow-sm"
            >
              <LogIn className="w-4 h-4" /> {busy ? "Đang xác thực..." : "Xác nhận & Đăng nhập"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setTotpCode("");
                setError("");
              }}
              className="w-full text-xs text-zinc-400 hover:text-zinc-200 transition py-1 text-center"
            >
              ← Quay lại đăng nhập
            </button>
          </form>
        ) : (
          <form
            onSubmit={submit}
            className="bg-zinc-900 border border-zinc-800/90 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div>
              <label
                htmlFor="login-email"
                className="text-xs font-medium text-zinc-300 block mb-1.5"
              >
                Email đăng nhập
              </label>
              <input
                id="login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                className="w-full bg-zinc-800/90 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition text-zinc-100"
              />
            </div>
            <div>
              <label
                htmlFor="login-password"
                className="text-xs font-medium text-zinc-300 block mb-1.5"
              >
                Mật khẩu
              </label>
              <input
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                className="w-full bg-zinc-800/90 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition text-zinc-100"
              />
            </div>
            {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
            <button
              disabled={busy}
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 py-3 rounded-xl font-semibold text-sm transition text-white min-h-[44px] shadow-sm"
            >
              <LogIn className="w-4 h-4" /> {busy ? "Đang đăng nhập..." : "Đăng nhập hệ thống"}
            </button>
          </form>
        )}
        {!pending && ssoEnabled && (
          <div className="mt-5">
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="h-px flex-1 bg-zinc-800" />
              hoặc
              <span className="h-px flex-1 bg-zinc-800" />
            </div>
            <a
              href="/api/auth/oidc/login"
              className="mt-4 w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 py-2.5 rounded-xl font-medium text-sm transition text-sky-400 min-h-[44px]"
            >
              <KeyRound className="w-4 h-4" /> Đăng nhập bằng SSO công ty
            </a>
          </div>
        )}
        {!pending && process.env.NODE_ENV === "development" && (
          <div className="mt-6 text-xs text-zinc-400">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Tài khoản demo (bấm để điền nhanh):
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.pw);
                  }}
                  className="text-left bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 hover:border-emerald-600 hover:bg-zinc-850 transition"
                >
                  <span className="font-semibold text-emerald-400 text-xs block">{d.role}</span>
                  <span className="text-[11px] text-zinc-400 truncate block mt-0.5">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
