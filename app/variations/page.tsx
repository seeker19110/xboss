"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, ArrowRight } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";

export default function VariationsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/commercial?tab=vo-variations");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AppHeader />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
          <FilePlus2 className="w-10 h-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-zinc-100">
            Đang chuyển tiếp đến Sổ Phát Sinh & Bù Giá VO...
          </h2>
          <p className="text-xs text-zinc-400">
            Thay đổi thiết kế và phát sinh hợp đồng đã được hợp nhất tại{" "}
            <b>/commercial?tab=vo-variations</b>.
          </p>
        </div>
        <a
          href="/commercial?tab=vo-variations"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition shadow"
        >
          Truy Cập Ngay <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}
