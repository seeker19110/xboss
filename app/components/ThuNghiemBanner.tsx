"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Nhãn cảnh báo cho các trang thuộc module đánh dấu `thuNghiem` trong registry
 * (`lib/nen/modules.ts`) — vượt cổng roadmap (ENG-0 #10) hoặc chưa từng chạy được/mô
 * phỏng rõ rệt (W1). Mặc định các module này TẮT cho mọi dự án (`isModuleEnabled`); khi
 * Admin bật thủ công qua `/admin/features`, người dùng vẫn cần biết đây là tính năng
 * chưa kiểm chứng trên dữ liệu thật để không dựa vào số liệu/luồng nghiệp vụ nơi đây.
 *
 * Đặt tĩnh ở đầu trang (không phụ thuộc trạng thái cờ) vì các trang này chưa có gate
 * truy cập theo module ở tầng trang — hiển thị cảnh báo mọi lúc là an toàn hơn im lặng.
 */
export default function ThuNghiemBanner() {
  return (
    <div
      role="note"
      className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-800 bg-amber-950 px-3.5 py-2.5 text-sm text-amber-300"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
      <span>
        <strong className="font-semibold">Thử nghiệm</strong> — module này chưa kiểm chứng trên dữ
        liệu thật, tắt mặc định cho mọi dự án. Không dùng số liệu/kết quả ở đây làm căn cứ nghiệp vụ
        chính thức.
      </span>
    </div>
  );
}
