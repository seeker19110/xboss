"use client";
import { useEffect } from "react";
import { dongMoiKetNoiSong, ngheDoiNguCanh } from "@/app/lib/contextEpoch";
import { khoaTrangDoiNguCanh } from "@/app/lib/me";

// S05 (A2-FR03): gác ngữ cảnh toàn cục — gắn một lần ở layout gốc. Tab khác đổi dự án/đăng xuất/
// đổi tài khoản → đóng ngay SSE/poll đang mở rồi khoá trang (dữ liệu ngữ cảnh cũ không còn
// được xem/ghi); người dùng bấm tải lại để xác minh online theo ngữ cảnh mới.
export default function NguCanhGuard() {
  useEffect(
    () =>
      ngheDoiNguCanh(() => {
        dongMoiKetNoiSong();
        khoaTrangDoiNguCanh();
      }),
    [],
  );
  return null;
}
