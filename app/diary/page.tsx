"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, ArrowRight } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";

export default function DiaryRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/site?tab=tasks-diary&sub=diary");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AppHeader />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <NotebookPen className="w-10 h-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-zinc-100">
            Đang chuyển tiếp đến Nhật Ký Thi Công TT06...
          </h2>
          <p className="text-xs text-zinc-400">
            Nhật ký thi công điện tử đã được hợp nhất tại <b>/site?tab=tasks-diary&sub=diary</b>.
          </p>
        </div>
        <a
          href="/site?tab=tasks-diary&sub=diary"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-zinc-950 font-semibold text-xs transition shadow"
        >
          Truy Cập Ngay <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}
