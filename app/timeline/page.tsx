"use client";
import { useEffect, useState } from "react";
import AppHeader from "@/app/components/AppHeader";
import ProgressMap from "@/app/components/ProgressMap";
import HeFilter from "@/app/components/HeFilter";

export default function TimelinePage() {
  const [he, setHe] = useState("");

  // Đọc `?he=` lúc mount để link chia sẻ/từ hub trỏ thẳng vào đúng bộ lọc (M36).
  useEffect(() => {
    setHe(new URLSearchParams(window.location.search).get("he") ?? "");
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="Timeline tầng" back>
        <HeFilter value={he} onChange={setHe} />
      </AppHeader>
      <main className="px-3 sm:px-6 py-4 w-full">
        <ProgressMap he={he} />
      </main>
    </div>
  );
}
