"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Nhãn cảnh báo cho các trang thuộc module đánh dấu `thuNghiem` trong registry
 * (`lib/nen/modules.ts`) — vượt cổng roadmap (ENG-0 #10) hoặc chưa từng chạy được/mô
 * phỏng rõ rệt (W1). Mặc định các module này TẮT cho mọi dự án (`isModuleEnabled`); khi
 * Admin bật thủ công qua `/admin/features`, người dùng vẫn cần biết đây là tính năng
 * chưa kiểm chứng trên dữ liệu thật để không dựa vào số liệu/luồng nghiệp vụ nơi đây.
 *
 * `moduleKey` khớp key trong `lib/nen/modules.ts` — dùng đọc trạng thái BẬT/TẮT thật qua
 * `/api/feature-flags` (cùng nguồn `AppHeader` dùng để ẩn nav) để nói đúng tình trạng:
 * - Chưa tải xong/không xác định được dự án → thông điệp tĩnh trung lập (không đoán).
 * - TẮT (mặc định) → nói rõ đang tắt; hầu hết API tương ứng đã chặn 404 ở tầng route
 *   (xem `assertModuleEnabled` trong các route con của module này).
 * - BẬT thủ công → cảnh báo dữ liệu/luồng nghiệp vụ chưa kiểm chứng.
 */
export default function ThuNghiemBanner({ moduleKey }: { moduleKey: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/feature-flags?_=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.flags && moduleKey in data.flags) setEnabled(Boolean(data.flags[moduleKey]));
      })
      .catch(() => {});
  }, [moduleKey]);

  const message =
    enabled === false ? (
      <>
        <strong className="font-semibold">Đang TẮT</strong> cho dự án này — đây là module thử nghiệm
        chưa kiểm chứng trên dữ liệu thật. Liên hệ Admin (mục &quot;Cờ tính năng&quot;) để bật thủ
        công nếu thật sự cần dùng.
      </>
    ) : enabled === true ? (
      <>
        <strong className="font-semibold">Thử nghiệm — đang BẬT thủ công.</strong> Module chưa kiểm
        chứng trên dữ liệu thật; không dùng số liệu/kết quả ở đây làm căn cứ nghiệp vụ chính thức.
      </>
    ) : (
      <>
        <strong className="font-semibold">Thử nghiệm</strong> — module này chưa kiểm chứng trên dữ
        liệu thật, tắt mặc định cho mọi dự án. Không dùng số liệu/kết quả ở đây làm căn cứ nghiệp vụ
        chính thức.
      </>
    );

  return (
    <div
      role="note"
      className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3.5 py-2.5 text-sm text-amber-300"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
