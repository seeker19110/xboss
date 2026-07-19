"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

// Error boundary theo route segment (bọc trong <body> của RootLayout, không bọc
// được lỗi ở chính layout gốc — trường hợp đó rơi về app/global-error.tsx).
// Gửi lên Sentry (no-op nếu thiếu DSN) rồi hiện màn hình lỗi tối giản tiếng Việt.
//
// LƯU Ý (nợ kỹ thuật, xem PROGRESS.md): dự án hiện chưa tách nhóm route
// (authed) nên AppHeader/nav của từng trang nằm trong chính component trang đó,
// không nằm trong layout dùng chung — khi lỗi xảy ra, error.tsx thay thế toàn bộ
// nội dung trang nên header/sidebar bị mất theo (giống global-error.tsx). Chấp
// nhận trong đợt này, tái cấu trúc layout để giữ header khi lỗi là việc riêng.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex-1 flex min-h-screen items-center justify-center p-6 text-zinc-100">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">Trang này gặp sự cố</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Có sự cố ngoài dự kiến khi hiển thị trang. Lỗi đã được ghi nhận, vui lòng thử lại.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
          >
            Thử lại
          </button>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Về Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
