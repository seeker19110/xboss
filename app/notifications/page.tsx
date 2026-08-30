"use client";
// Trang /notifications — đã GỘP vào tab "Thông báo" của /my-tasks (cùng nguồn dữ liệu
// /api/notifications/feed + /api/notifications/prefs, trước đây là hai bản sao UI song song).
// Giữ lại route này để chuyển hướng cho liên kết/bookmark cũ.
import { useEffect } from "react";
import { PageSkeleton } from "@/app/components/Skeleton";

export default function NotificationsRedirectPage() {
  useEffect(() => {
    window.location.replace("/my-tasks?tab=notifications");
  }, []);

  return <PageSkeleton />;
}
