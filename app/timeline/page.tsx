"use client";
// Trang /timeline — đã GỘP vào tab "Lưới WBS & Kiểm Soát Trễ" của hub /schedule (khối
// "Bản Đồ Tiến Độ Theo Tầng & Hệ" dùng đúng component `ProgressMap`; trang này chỉ là vỏ
// 27 dòng bọc lại nó). Giữ route để chuyển hướng cho liên kết/bookmark cũ, mang theo
// `?system=` nếu có. Audit 2026-08-25 §3.4.
import { useEffect } from "react";
import { PageSkeleton } from "@/app/components/Skeleton";

export default function TimelineRedirectPage() {
  useEffect(() => {
    const system = new URLSearchParams(window.location.search).get("system");
    const qs = system ? `&system=${encodeURIComponent(system)}` : "";
    window.location.replace(`/schedule?tab=wbs${qs}`);
  }, []);

  return <PageSkeleton />;
}
