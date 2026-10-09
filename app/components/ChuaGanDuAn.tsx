"use client";
import { FolderX } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { ButtonLink } from "@/app/components/ui";

// Màn thay nội dung trang chính khi user đăng nhập mà không thấy dự án nào (AUDIT-S16 —
// cutover membership): nói rõ lý do thay vì màn trống/số 0. Admin chỉ rơi vào đây khi tổ chức
// chưa có dự án → chỉ đường sang trang quản trị (tạo dự án / gán thành viên).
export default function ChuaGanDuAn({ role }: { role?: string | null }) {
  const laAdmin = role === "admin";
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader />
      <main className="max-w-xl mx-auto px-4">
        <EmptyState
          icon={FolderX}
          title={
            laAdmin
              ? "Tổ chức chưa có dự án nào"
              : "Bạn chưa được gán dự án nào — liên hệ quản trị viên"
          }
          message={
            laAdmin
              ? "Tạo dự án và gán thành viên ở trang quản trị."
              : "Tài khoản của bạn chưa thuộc dự án nào nên chưa có dữ liệu để hiển thị. Nhờ quản trị viên gán bạn vào dự án, rồi tải lại trang."
          }
          action={
            laAdmin ? (
              <ButtonLink href="/admin" variant="primary">
                Mở trang quản trị
              </ButtonLink>
            ) : undefined
          }
        />
      </main>
    </div>
  );
}
