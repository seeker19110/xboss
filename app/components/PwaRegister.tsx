'use client';
import { useEffect } from 'react';

// Đăng ký service worker (chỉ production — dev sẽ cache gây khó debug).
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* không hỗ trợ — bỏ qua */ });
  }, []);
  return null;
}
