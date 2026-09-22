"use client";
import { useEffect, useState } from "react";

// Màn hẹp (< md) hay không — dùng để quyết định CÓ truyền `bottomActions` cho `AppHeader`
// hay không. `AppHeader` tự ẩn thanh đáy dưới `md` KHI trang không truyền `bottomActions`,
// nên truyền cả ở desktop sẽ để lại một thanh trống dính đáy.
// (M127 — tách từ `app/page.tsx` để hai chế độ trang chủ dùng chung.)
export function useIsCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return compact;
}
