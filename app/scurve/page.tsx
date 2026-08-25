"use client";
// Trang /scurve — đã GỘP vào tab "Đường Cong S-Curve & EVM" của hub /schedule (cùng một
// component `SCurveChart`, cùng bộ lọc hệ; trang này chỉ là vỏ 29 dòng bọc lại nó).
// Giữ route để chuyển hướng cho liên kết/bookmark cũ, mang theo `?system=` nếu có.
// Audit 2026-08-25 §3.4 — cùng khuôn đã dùng cho /notifications ở PR #390.
import { useEffect } from "react";
import { PageSkeleton } from "@/app/components/Skeleton";

export default function ScurveRedirectPage() {
  useEffect(() => {
    const system = new URLSearchParams(window.location.search).get("system");
    const qs = system ? `&system=${encodeURIComponent(system)}` : "";
    window.location.replace(`/schedule?tab=scurve${qs}`);
  }, []);

  return <PageSkeleton />;
}
