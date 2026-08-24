"use client";

// Trang ghép thiết bị + quản lý token plugin AutoCAD (M99 PR2).
// - Duyệt mã ghép hiện trong AutoCAD (XBOSS_LOGIN) → plugin tự nhận token.
// - Tạo token thủ công (hiện đúng 1 lần) cho máy không tiện ghép.
// - Xem/thu hồi token (Admin thấy toàn org, user thường thấy của mình — AC7).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EngineeringNav from "@/app/components/EngineeringNav";
import { Skeleton } from "@/app/components/Skeleton";
import { KeyRound, MonitorSmartphone, ShieldOff, Copy, CheckCircle2 } from "lucide-react";

type TokenRow = {
  id: number;
  name: string;
  scopes: string;
  userId: number;
  userName: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

function ngay(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN");
}

export default function ThietBiPluginPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [loi, setLoi] = useState("");
  const [thongBao, setThongBao] = useState("");

  const [maGhep, setMaGhep] = useState("");
  const [dangDuyet, setDangDuyet] = useState(false);

  const [tenTokenMoi, setTenTokenMoi] = useState("");
  const [dangTao, setDangTao] = useState(false);
  const [tokenVuaTao, setTokenVuaTao] = useState<string | null>(null);
  const [daChep, setDaChep] = useState(false);

  const taiTokens = useCallback(async () => {
    const res = await fetch("/api/tokens");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setLoi(json.error ?? "Không tải được danh sách token");
      return;
    }
    setTokens(json.tokens);
  }, [router]);

  useEffect(() => {
    taiTokens();
  }, [taiTokens]);

  const duyetMaGhep = async () => {
    setLoi("");
    setThongBao("");
    setDangDuyet(true);
    try {
      const res = await fetch("/api/devices/pair/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceCode: maGhep }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setLoi(json.error ?? "Duyệt mã ghép thất bại");
        return;
      }
      setThongBao(
        `Đã duyệt thiết bị${json.deviceName ? ` "${json.deviceName}"` : ""} — quay lại AutoCAD, plugin sẽ tự nhận token trong vài giây.`,
      );
      setMaGhep("");
      // Token chỉ xuất hiện trong danh sách sau khi plugin poll nhận — tải lại sau chút.
      setTimeout(taiTokens, 5000);
    } finally {
      setDangDuyet(false);
    }
  };

  const taoToken = async () => {
    setLoi("");
    setThongBao("");
    setTokenVuaTao(null);
    setDangTao(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tenTokenMoi }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setLoi(json.error ?? "Tạo token thất bại");
        return;
      }
      setTokenVuaTao(json.token);
      setDaChep(false);
      setTenTokenMoi("");
      taiTokens();
    } finally {
      setDangTao(false);
    }
  };

  const thuHoi = async (id: number) => {
    if (!window.confirm("Thu hồi token này? Plugin đang dùng sẽ nhận 401 và phải ghép lại."))
      return;
    setLoi("");
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setLoi(json.error ?? "Thu hồi thất bại");
      return;
    }
    taiTokens();
  };

  const chepToken = async () => {
    if (!tokenVuaTao) return;
    try {
      await navigator.clipboard.writeText(tokenVuaTao);
      setDaChep(true);
    } catch {
      setLoi("Không chép được vào clipboard — chọn và copy thủ công.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <EngineeringNav />
      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <MonitorSmartphone size={20} className="text-sky-300" />
            Thiết bị plugin AutoCAD
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Ghép plugin XBoss trên máy kỹ sư (lệnh{" "}
            <code className="text-zinc-300">XBOSS_LOGIN</code>) và quản lý/thu hồi token thiết bị.
            Token mang đúng quyền tài khoản của bạn, hạn 90 ngày.
          </p>
        </div>

        {loi && (
          <div className="rounded border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-sm text-rose-300">
            {loi}
          </div>
        )}
        {thongBao && (
          <div className="rounded border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
            {thongBao}
          </div>
        )}

        {/* Duyệt mã ghép từ AutoCAD */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h2 className="font-medium flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-300" /> Duyệt mã ghép từ AutoCAD
          </h2>
          <p className="text-sm text-zinc-400">
            Chạy <code className="text-zinc-300">XBOSS_LOGIN</code> trong AutoCAD, nhập mã 8 ký tự
            plugin hiển thị vào đây rồi bấm duyệt (mã sống 10 phút).
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={maGhep}
              onChange={(e) => setMaGhep(e.target.value.toUpperCase())}
              placeholder="VD: 7KQ2M9XW"
              maxLength={8}
              aria-label="Mã ghép thiết bị"
              className="h-10 w-44 rounded border border-zinc-700 bg-zinc-950 px-3 font-mono tracking-widest uppercase placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
            />
            <button
              onClick={duyetMaGhep}
              disabled={dangDuyet || maGhep.trim().length < 8}
              className="h-10 rounded bg-emerald-400/15 border border-emerald-400/40 px-4 text-sm text-emerald-300 hover:bg-emerald-400/25 disabled:opacity-50"
            >
              {dangDuyet ? "Đang duyệt…" : "Duyệt thiết bị"}
            </button>
          </div>
        </section>

        {/* Tạo token thủ công */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h2 className="font-medium flex items-center gap-2">
            <KeyRound size={16} className="text-amber-300" /> Tạo token thủ công
          </h2>
          <p className="text-sm text-zinc-400">
            Dùng khi không tiện ghép qua mã (dán token thẳng vào plugin). Token chỉ hiện{" "}
            <strong className="text-zinc-200">đúng 1 lần</strong> — chép ngay sau khi tạo.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={tenTokenMoi}
              onChange={(e) => setTenTokenMoi(e.target.value)}
              placeholder="Tên gợi nhớ (VD: Máy trạm KS Hùng)"
              aria-label="Tên token"
              className="h-10 w-64 rounded border border-zinc-700 bg-zinc-950 px-3 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
            />
            <button
              onClick={taoToken}
              disabled={dangTao || !tenTokenMoi.trim()}
              className="h-10 rounded bg-amber-400/15 border border-amber-400/40 px-4 text-sm text-amber-300 hover:bg-amber-400/25 disabled:opacity-50"
            >
              {dangTao ? "Đang tạo…" : "Tạo token"}
            </button>
          </div>
          {tokenVuaTao && (
            <div className="rounded border border-amber-400/40 bg-amber-400/10 p-3 space-y-2">
              <div className="text-sm text-amber-300">Token mới (chỉ hiện lần này):</div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-zinc-950 px-2 py-1 text-xs text-zinc-200">
                  {tokenVuaTao}
                </code>
                <button
                  onClick={chepToken}
                  aria-label="Chép token"
                  className="flex h-9 items-center gap-1 rounded border border-zinc-700 px-3 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  <Copy size={14} /> {daChep ? "Đã chép ✓" : "Chép"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Danh sách token */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h2 className="font-medium">Token đang có</h2>
          {tokens === null ? (
            <Skeleton className="h-24 w-full" />
          ) : tokens.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Chưa có token nào — ghép thiết bị hoặc tạo token ở trên.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-zinc-400">
                    <th className="py-2 pr-3">Tên</th>
                    <th className="py-2 pr-3">Chủ token</th>
                    <th className="py-2 pr-3">Tạo</th>
                    <th className="py-2 pr-3">Hết hạn</th>
                    <th className="py-2 pr-3">Dùng lần cuối</th>
                    <th className="py-2 pr-3">Trạng thái</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-800/60">
                      <td className="py-2 pr-3">{t.name}</td>
                      <td className="py-2 pr-3 text-zinc-400">{t.userName}</td>
                      <td className="py-2 pr-3 text-zinc-400">{ngay(t.createdAt)}</td>
                      <td className="py-2 pr-3 text-zinc-400">{ngay(t.expiresAt)}</td>
                      <td className="py-2 pr-3 text-zinc-400">{ngay(t.lastUsedAt)}</td>
                      <td className="py-2 pr-3">
                        {t.revokedAt ? (
                          <span className="inline-flex items-center gap-1 text-rose-300">
                            <ShieldOff size={13} /> Đã thu hồi
                          </span>
                        ) : (
                          <span className="text-emerald-300">Hoạt động</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {!t.revokedAt && (
                          <button
                            onClick={() => thuHoi(t.id)}
                            className="rounded border border-rose-400/40 px-3 py-1 text-xs text-rose-300 hover:bg-rose-400/10"
                          >
                            Thu hồi
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
