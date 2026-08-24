"use client";
import { useEffect, useState } from "react";
import AppHeader from "@/app/components/AppHeader";
import SystemFilter from "@/app/components/SystemFilter";
import SCurveChart from "@/app/components/SCurveChart";

// Trang S-Curve riêng (M36 PR2) — bọc SCurveChart (đã có baseline selector + nút chốt
// baseline) + SystemFilter lọc theo hệ, đồng bộ `?system=` lên URL như các trang tiến độ khác.
export default function ScurvePage() {
  const [system, setSystem] = useState("");
  // Chỉ mount SCurveChart SAU khi đã đọc xong `?system=` từ URL — tránh nó fetch lần đầu
  // với system="" rồi lại fetch lại khi state cập nhật (race condition, xem M36).
  const [ready, setReady] = useState(false);

  // Đọc `?system=` lúc mount để link chia sẻ/từ hub trỏ thẳng vào đúng bộ lọc (M36).
  useEffect(() => {
    setSystem(new URLSearchParams(window.location.search).get("system") ?? "");
    setReady(true);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title="S-Curve" back>
        <SystemFilter value={system} onChange={setSystem} />
      </AppHeader>
      <main className="px-3 sm:px-6 py-4 w-full">{ready && <SCurveChart system={system} />}</main>
    </div>
  );
}
