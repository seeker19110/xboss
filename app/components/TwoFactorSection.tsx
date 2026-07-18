"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Download, Loader2 } from "lucide-react";

// Khối "Xác thực 2 lớp" trên /account (M56 PR1). Không render QR ảnh (chờ lib QR thuần
// dùng chung với M58) — hiển thị secret Base32 để nhập tay vào Google Authenticator/Authy
// (mọi app xác thực chuẩn TOTP đều hỗ trợ nhập tay, không bắt buộc quét QR).
function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

// onConfirmed: gọi sau khi bật 2FA thành công (M56 PR2 — trang /account dùng để bỏ banner
// "bắt buộc bật 2FA" + hiện lại toàn trang mà không cần reload).
export default function TwoFactorSection({ onConfirmed }: { onConfirmed?: () => void } = {}) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Luồng bật: setup → hiện secret + recovery codes → nhập mã xác nhận.
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [confirmCode, setConfirmCode] = useState("");

  // Luồng tắt: cần mật khẩu + mã.
  const [showDisable, setShowDisable] = useState(false);
  const [disablePw, setDisablePw] = useState("");
  const [disableCode, setDisableCode] = useState("");

  function refreshStatus() {
    setLoading(true);
    fetch("/api/auth/totp")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j) => setEnabled(!!j.enabled))
      .finally(() => setLoading(false));
  }

  useEffect(refreshStatus, []);

  async function startSetup() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/auth/totp/setup", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error ?? "Không tạo được mã 2FA");
    setSetupSecret(secretFromUri(j.otpauthUri));
    setRecoveryCodes(j.recoveryCodes ?? []);
  }

  async function confirmSetup() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/auth/totp/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: confirmCode }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error ?? "Mã không đúng");
    setSetupSecret(null);
    setRecoveryCodes(null);
    setConfirmCode("");
    refreshStatus();
    onConfirmed?.();
  }

  function downloadRecoveryCodes() {
    if (!recoveryCodes) return;
    const blob = new Blob([recoveryCodes.join("\n") + "\n"], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "xboss-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function disableTotp() {
    setError("");
    setBusy(true);
    const res = await fetch("/api/auth/totp", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: disablePw, code: disableCode }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error ?? "Không tắt được 2FA");
    setShowDisable(false);
    setDisablePw("");
    setDisableCode("");
    refreshStatus();
  }

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-sm text-zinc-400">
        Đang tải trạng thái 2FA...
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        {enabled ? (
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <ShieldOff className="w-4 h-4 text-zinc-500 shrink-0" />
        )}
        <p className="font-medium text-sm">Xác thực 2 lớp (TOTP)</p>
      </div>
      <p className="text-xs text-zinc-400">
        {enabled
          ? "Đã bật — mỗi lần đăng nhập cần nhập thêm mã từ ứng dụng xác thực."
          : "Chưa bật — thêm lớp bảo vệ bằng Google Authenticator/Authy."}
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {enabled && !showDisable && (
        <button
          onClick={() => setShowDisable(true)}
          className="text-xs px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-red-400 transition"
        >
          Tắt xác thực 2 lớp
        </button>
      )}

      {enabled && showDisable && (
        <div className="space-y-2 border-t border-zinc-800 pt-3">
          <input
            type="password"
            placeholder="Mật khẩu hiện tại"
            value={disablePw}
            onChange={(e) => setDisablePw(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <input
            type="text"
            placeholder="Mã TOTP hoặc recovery code"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <div className="flex gap-2">
            <button
              disabled={busy || !disablePw || !disableCode}
              onClick={disableTotp}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-red-900/50 hover:bg-red-900 text-red-300 disabled:opacity-50 transition"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />} Xác nhận tắt
            </button>
            <button
              onClick={() => setShowDisable(false)}
              className="text-xs px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
            >
              Huỷ
            </button>
          </div>
        </div>
      )}

      {!enabled && !setupSecret && (
        <button
          disabled={busy}
          onClick={startSetup}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-on-accent disabled:opacity-50 transition"
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />} Bật xác thực 2 lớp
        </button>
      )}

      {setupSecret && (
        <div className="space-y-3 border-t border-zinc-800 pt-3">
          <div>
            <p className="text-xs text-zinc-400 mb-1">
              Nhập mã sau vào Google Authenticator/Authy (thêm tài khoản thủ công):
            </p>
            <p className="font-mono text-sm bg-zinc-800 rounded-lg px-3 py-2 break-all select-all">
              {setupSecret}
            </p>
          </div>

          {recoveryCodes && (
            <div>
              <p className="text-xs text-zinc-400 mb-1">
                8 mã dự phòng — lưu lại, chỉ hiện đúng 1 lần (dùng khi mất điện thoại):
              </p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-xs bg-zinc-800 rounded-lg p-3">
                {recoveryCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <button
                onClick={downloadRecoveryCodes}
                className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
              >
                <Download className="w-3 h-3" /> Tải file .txt
              </button>
            </div>
          )}

          <div>
            <p className="text-xs text-zinc-400 mb-1">
              Nhập mã 6 số hiện trên app để xác nhận bật:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600"
              />
              <button
                disabled={busy || confirmCode.length !== 6}
                onClick={confirmSetup}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-on-accent disabled:opacity-50 transition"
              >
                {busy && <Loader2 className="w-3 h-3 animate-spin" />} Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
