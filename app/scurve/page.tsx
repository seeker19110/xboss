"use client";
import { useEffect, useState } from "react";
import AppHeader from "@/app/components/AppHeader";
import HeFilter from "@/app/components/HeFilter";
import SCurveChart from "@/app/components/SCurveChart";

// Trang S-Curve riêng (M36 PR2) — bọc SCurveChart (đã có baseline selector + nút chốt
// baseline) + HeFilter lọc theo hệ, đồng bộ `?he=` lên URL như các trang tiến độ khác.
export default function ScurvePage() {
  const [he, setHe] = useState("");

  // Đọc `?he=` lúc mount để link chia sẻ/từ hub trỏ thẳng vào đúng bộ lọc (M36).
  useEffect(() => {
    setHe(new URLSearchParams(window.location.search).get("he") ?? "");
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="S-Curve" back>
        <HeFilter value={he} onChange={setHe} />
      </AppHeader>
      <main className="px-3 sm:px-6 py-4 w-full">
        <SCurveChart he={he} />
      </main>
    </div>
  );
}
