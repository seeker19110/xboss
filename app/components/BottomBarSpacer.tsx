"use client";
import { useEffect, useState } from "react";

// Chừa chỗ cho thanh cố định dưới đáy của AppHeader — chỉ hiện ở trang chủ (nơi duy nhất
// còn thanh: tìm kiếm + hành động riêng). Trang khác không có thanh nên không chừa chỗ.
export default function BottomBarSpacer() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(window.location.pathname === "/");
  }, []);

  if (!show) return null;
  return <div className="h-14 safe-bottom shrink-0 print:hidden" aria-hidden />;
}
