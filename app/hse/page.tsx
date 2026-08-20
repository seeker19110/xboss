"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, ArrowRight } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";

export default function HseRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/site?tab=hse-safety");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AppHeader />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
          <ShieldAlert className="w-10 h-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-zinc-100">
            Đang chuyển tiếp đến Giám Sát An Toàn HSE...
          </h2>
          <p className="text-xs text-zinc-400">
            Hồ sơ an toàn QCVN 18 và HSE Vision đã được hợp nhất tại <b>/site?tab=hse-safety</b>.
          </p>
        </div>
        <a
          href="/site?tab=hse-safety"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition shadow"
        >
          Truy Cập Ngay <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}
