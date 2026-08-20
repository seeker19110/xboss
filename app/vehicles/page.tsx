"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CarFront, ArrowRight } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";

export default function VehiclesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/site?tab=equipment&sub=vehicles");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AppHeader />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
          <CarFront className="w-10 h-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-zinc-100">
            Đang chuyển tiếp đến Nhật Trình Xe Ra Vào...
          </h2>
          <p className="text-xs text-zinc-400">
            Nhật trình xe ra vào công trường đã được hợp nhất tại{" "}
            <b>/site?tab=equipment&sub=vehicles</b>.
          </p>
        </div>
        <a
          href="/site?tab=equipment&sub=vehicles"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition shadow"
        >
          Truy Cập Ngay <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}
