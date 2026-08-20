"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { QrCode, ArrowRight } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";

export default function QrLogisticsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/procurement?tab=qr-logistics");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AppHeader />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <QrCode className="w-10 h-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-zinc-100">
            Đang chuyển tiếp đến Quét QR Logistics & Nhập Kho GRN...
          </h2>
          <p className="text-xs text-zinc-400">
            Máy quét QR, đối soát 3 bên và cấp phiếu GRN đã được hợp nhất toàn diện tại{" "}
            <b>/procurement?tab=qr-logistics</b>.
          </p>
        </div>
        <a
          href="/procurement?tab=qr-logistics"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-zinc-950 font-semibold text-xs transition shadow"
        >
          Truy Cập Ngay <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}
