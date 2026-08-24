"use client";
// Thiết bị AutoCAD (M99 PR2) — duyệt mã ghép từ XBOSS_LOGIN + quản lý/thu hồi token thiết bị.
// PR6 sẽ gộp trang này vào bảng điều khiển chuẩn hóa bản vẽ; hiện tách riêng cho gọn diff.
import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, KeyRound, ShieldCheck, ShieldOff, Copy } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

type Token = {
  id: number;
  name: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

function ngay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN");
}

export default function ThietBiCadPage() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [userCode, setUserCode] = useState("");
  const [thongBao, setThongBao] = useState<{ loai: "ok" | "loi"; text: string } | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [keyMoi, setKeyMoi] = useState<string | null>(null);

  const taiTokens = useCallback(async () => {
    const res = await fetch("/api/tokens");
    if (res.status === 401) return redirectToLogin();
    if (res.status === 403) {
      setTokens([]);
      setThongBao({ loai: "loi", text: "Vai trò của bạn không quản lý được thiết bị AutoCAD." });
      return;
    }
    const data = await res.json();
    setTokens(data.tokens ?? []);
  }, []);

  useEffect(() => {
    void taiTokens();
  }, [taiTokens]);

  async function duyet(approve: boolean) {
    if (!userCode.trim()) return;
    setDangGui(true);
    setThongBao(null);
    try {
      const res = await fetch("/api/devices/pair/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: userCode.trim(), approve }),
      });
      if (res.status === 401) return redirectToLogin();
      const data = await res.json();
      if (res.ok) {
        setThongBao({ loai: "ok", text: data.message ?? "Đã xử lý." });
        setUserCode("");
        await taiTokens();
      } else {
        setThongBao({ loai: "loi", text: data.error ?? "Lỗi không xác định" });
      }
    } finally {
      setDangGui(false);
    }
  }

  async function thuHoi(id: number) {
    if (!confirm("Thu hồi token này? Plugin trên thiết bị đó sẽ phải ghép lại.")) return;
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (res.status === 401) return redirectToLogin();
    const data = await res.json();
    setThongBao(res.ok ? { loai: "ok", text: data.message } : { loai: "loi", text: data.error });
    await taiTokens();
  }

  async function taoThuCong() {
    const name = prompt("Tên token (vd: Máy trạm văn phòng):");
    if (!name?.trim()) return;
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.status === 401) return redirectToLogin();
    const data = await res.json();
    if (res.ok) {
      setKeyMoi(data.key);
      await taiTokens();
    } else {
      setThongBao({ loai: "loi", text: data.error ?? "Không tạo được token" });
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title={
          <>
            <MonitorSmartphone className="w-5 h-5" /> Thiết bị AutoCAD
          </>
        }
        search={false}
      />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {tokens === null ? (
          <PageSkeleton />
        ) : (
          <>
            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Duyệt mã ghép từ AutoCAD
              </h2>
              <p className="text-sm text-zinc-400">
                Chạy lệnh <code className="text-zinc-300">XBOSS_LOGIN</code> trong AutoCAD 2026,
                nhập mã hiện trên command line vào đây rồi bấm Duyệt. Token sinh ra mang quyền của
                chính bạn, hạn 90 ngày, thu hồi được bất cứ lúc nào.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={userCode}
                  onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                  placeholder="VD: AB2C-DE3F"
                  aria-label="Mã ghép thiết bị"
                  className="flex-1 min-w-40 rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 font-mono tracking-widest uppercase focus:outline-none focus:border-sky-400"
                  maxLength={9}
                />
                <button
                  onClick={() => void duyet(true)}
                  disabled={dangGui || !userCode.trim()}
                  className="rounded-lg bg-emerald-400 text-zinc-950 font-semibold px-4 py-2 disabled:opacity-40 min-h-10"
                >
                  Duyệt
                </button>
                <button
                  onClick={() => void duyet(false)}
                  disabled={dangGui || !userCode.trim()}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-300 disabled:opacity-40 min-h-10"
                >
                  Từ chối
                </button>
              </div>
              {thongBao && (
                <p
                  role="status"
                  className={`text-sm ${thongBao.loai === "ok" ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {thongBao.text}
                </p>
              )}
            </section>

            {keyMoi && (
              <section className="rounded-xl border border-amber-400/40 bg-zinc-900 p-4 space-y-2">
                <h2 className="font-semibold text-amber-300">
                  Token mới — chỉ hiện ĐÚNG 1 LẦN, sao chép ngay
                </h2>
                <div className="flex gap-2 items-center">
                  <code className="flex-1 break-all text-xs bg-zinc-950 border border-zinc-800 rounded p-2">
                    {keyMoi}
                  </code>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(keyMoi);
                      setThongBao({ loai: "ok", text: "Đã sao chép token." });
                    }}
                    aria-label="Sao chép token"
                    className="rounded-lg border border-zinc-700 p-2 min-h-10 min-w-10"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <button onClick={() => setKeyMoi(null)} className="text-sm text-zinc-400 underline">
                  Đã lưu xong, ẩn token
                </button>
              </section>
            )}

            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-sky-400" /> Token thiết bị của tôi
                </h2>
                <button
                  onClick={() => void taoThuCong()}
                  className="text-sm rounded-lg border border-zinc-700 px-3 py-2 text-zinc-300 min-h-10"
                >
                  + Tạo thủ công
                </button>
              </div>
              {tokens.length === 0 ? (
                <p className="text-sm text-zinc-400">
                  Chưa có thiết bị nào — ghép từ AutoCAD bằng lệnh XBOSS_LOGIN.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-800">
                  {tokens.map((t) => (
                    <li key={t.id} className="py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">
                          {t.name}
                          {t.revokedAt && (
                            <span className="ml-2 text-xs text-rose-400">(đã thu hồi)</span>
                          )}
                        </p>
                        <p className="text-xs text-zinc-400">
                          Tạo {ngay(t.createdAt)} · Dùng lần cuối {ngay(t.lastUsedAt)} · Hết hạn{" "}
                          {ngay(t.expiresAt)}
                        </p>
                      </div>
                      {!t.revokedAt && (
                        <button
                          onClick={() => void thuHoi(t.id)}
                          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-rose-400 flex items-center gap-1 min-h-10"
                        >
                          <ShieldOff className="w-4 h-4" /> Thu hồi
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
