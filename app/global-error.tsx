"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Bọc toàn bộ layout gốc — bắt lỗi render mà app/error.tsx (chỉ bọc trong <body>) không
// bắt được. Gửi lên Sentry (no-op nếu thiếu DSN) rồi hiện màn hình lỗi tối giản tiếng Việt.
export default function GlobalError({
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
    <html lang="vi">
      <body className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">Đã xảy ra lỗi</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Có sự cố ngoài dự kiến. Lỗi đã được ghi nhận, vui lòng thử lại.
          </p>
          <button
            onClick={reset}
            className="mt-4 rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
          >
            Thử lại
          </button>
        </div>
      </body>
    </html>
  );
}
