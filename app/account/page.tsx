"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  User,
  ShieldCheck,
  Users,
  KeyRound,
  LogOut,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";
import { fetchMe, invalidateMe, redirectToLogin } from "@/app/lib/me";
import { ROLE_LABELS } from "@/lib/roles";
import TwoFactorSection from "@/app/components/TwoFactorSection";

type Me = { id: number; name: string; email: string; role: string };
const ROLE_LABEL: Record<string, string> = ROLE_LABELS;

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  // M56 PR2: vào trang qua ?require2fa=1 (do redirectTo2faSetup) — tài khoản bị bắt buộc bật
  // 2FA. Ẩn phần khác, chỉ để lại khối 2FA + đăng xuất, cho tới khi bật xong (state cục bộ,
  // không cần reload — TwoFactorSection.onConfirmed set lại false).
  const [require2fa, setRequire2fa] = useState(false);

  useEffect(() => {
    setRequire2fa(new URLSearchParams(window.location.search).get("require2fa") === "1");
    fetchMe().then((u) => {
      setMe(u);
      setLoading(false);
    });
  }, []);

  async function logout() {
    invalidateMe();
    await fetch("/api/auth/logout", { method: "POST" });
    redirectToLogin();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader
          title={
            <>
              <User className="w-5 h-5" /> Tài khoản
            </>
          }
          search={false}
        />
        <main className="max-w-md mx-auto px-4 py-6">
          <PageSkeleton />
        </main>
      </div>
    );
  }

  if (!me) return null;

  const links = [
    me.role === "admin" || me.role === "pm"
      ? { href: "/admin", label: "Quản trị", icon: ShieldCheck, color: "text-emerald-400" }
      : null,
    me.role === "admin"
      ? { href: "/users", label: "Quản lý người dùng", icon: Users, color: "text-emerald-400" }
      : null,
    { href: "/password", label: "Đổi mật khẩu", icon: KeyRound, color: "text-amber-400" },
  ].filter(
    (l): l is { href: string; label: string; icon: typeof ShieldCheck; color: string } =>
      l !== null,
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title={
          <>
            <User className="w-5 h-5" /> Tài khoản
          </>
        }
        search={false}
      />

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        {require2fa && (
          <div className="bg-amber-950/60 border border-amber-800/70 rounded-xl p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-100">
              Bạn cần bật xác thực 2 lớp để tiếp tục sử dụng hệ thống.
            </p>
          </div>
        )}

        {!require2fa && (
          <div className="bento-card p-5 flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-xl font-bold text-emerald-300 shrink-0 shadow-inner">
              {me.name.trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-base text-zinc-100 truncate">{me.name}</p>
              <p className="text-xs text-zinc-400 truncate mt-0.5">{me.email}</p>
              <div className="mt-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 text-emerald-400 border border-zinc-700/60">
                  {ROLE_LABEL[me.role] ?? me.role}
                </span>
              </div>
            </div>
          </div>
        )}

        <TwoFactorSection onConfirmed={() => setRequire2fa(false)} />

        {require2fa ? (
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-400 bento-card hover:bg-zinc-850 active:scale-[0.99] transition text-left min-h-[44px]"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="flex-1">Đăng xuất</span>
          </button>
        ) : (
          <div className="bento-card divide-y divide-zinc-800/80 overflow-hidden">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center gap-3.5 px-4 py-3.5 text-sm hover:bg-zinc-850 active:scale-[0.99] transition group"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-800/80 flex items-center justify-center shrink-0 group-hover:bg-zinc-750 transition-colors">
                  <l.icon className={`w-4 h-4 shrink-0 ${l.color}`} />
                </div>
                <span className="flex-1 font-medium text-zinc-200 group-hover:text-white transition-colors">
                  {l.label}
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
              </Link>
            ))}
            <button
              onClick={logout}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 text-sm font-medium text-red-400 hover:bg-red-950/20 active:scale-[0.99] transition text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-red-950/40 flex items-center justify-center shrink-0 text-red-400 group-hover:bg-red-900/50 transition-colors">
                <LogOut className="w-4 h-4 shrink-0" />
              </div>
              <span className="flex-1 font-medium">Đăng xuất</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
