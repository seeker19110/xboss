"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Wrench, ArrowRight } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";

export default function EquipmentRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/site?tab=equipment&sub=equipment");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AppHeader />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <Wrench className="w-10 h-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-zinc-100">
            Đang chuyển tiếp đến Quản Lý Thiết Bị Máy Móc...
          </h2>
          <p className="text-xs text-zinc-400">
            Danh mục thiết bị và kiểm định TT36 đã được hợp nhất tại{" "}
            <b>/site?tab=equipment&sub=equipment</b>.
          </p>
        </div>
        <a
          href="/site?tab=equipment&sub=equipment"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition shadow"
        >
          Truy Cập Ngay <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}
