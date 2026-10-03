"use client";
import { Lock, LockOpen } from "lucide-react";

interface Props {
  canEdit: boolean;
  editMode: boolean;
  onToggle: () => void;
  className?: string;
}

export default function EditModeToggle({ canEdit, editMode, onToggle, className = "" }: Props) {
  if (!canEdit) return null;

  return (
    <button
      onClick={onToggle}
      title={editMode ? "Đang chỉnh sửa — bấm để khoá lại" : "Bấm để mở khoá chỉnh sửa"}
      // Nhãn chữ ẩn trên điện thoại (nút nằm ở topbar chật) — tên truy cập vẫn mở đầu bằng
      // đúng chữ hiển thị trên desktop (WCAG 2.5.3) và aria-pressed báo trạng thái bật/tắt.
      aria-label={editMode ? "Đang sửa — bấm để khoá lại" : "Chỉ xem — bấm để mở khoá chỉnh sửa"}
      aria-pressed={editMode}
      className={`flex items-center justify-center gap-1.5 min-h-10 min-w-10 px-2.5 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${
        editMode
          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
          : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-zinc-200 hover:bg-zinc-700"
      } ${className}`}
    >
      {editMode ? (
        <>
          <LockOpen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Đang sửa</span>
        </>
      ) : (
        <>
          <Lock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Chỉ xem</span>
        </>
      )}
    </button>
  );
}
