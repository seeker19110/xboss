"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Package, ArrowRight } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";

export default function MaterialsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/procurement?tab=inventory");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AppHeader />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <Package className="w-10 h-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-zinc-100">
            Đang chuyển tiếp đến Trung Tâm Mua Sắm & Kho Vận...
          </h2>
          <p className="text-xs text-zinc-400">
            Quản lý vật tư và định mức đã được hợp nhất toàn diện tại phân hệ <b>/procurement</b>.
          </p>
        </div>
        <a
          href="/procurement?tab=inventory"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition shadow"
        >
          Truy Cập Ngay <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}
