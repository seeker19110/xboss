"use client";
// Phần dùng chung của trang /finance/cash: khung modal biểu mẫu + ô nhập theo cùng một kiểu.
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";

export const INPUT =
  "mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 h-10 text-base sm:text-sm text-zinc-100 outline-none focus:border-emerald-500";

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs text-zinc-400 ${className}`}>
      {label}
      {children}
    </label>
  );
}

export function FormModal({
  title,
  onClose,
  children,
  error,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  error: string;
  footer: ReactNode;
}) {
  return (
    <Modal onClose={onClose} className="max-w-lg max-h-[90vh] flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <h2 className="font-semibold text-sm flex-1">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Đóng"
          className="w-10 h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-3 overflow-y-auto">
        {children}
        {error && (
          <p role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}
      </div>
      <div className="px-4 py-3 border-t border-zinc-800 flex justify-end gap-2">{footer}</div>
    </Modal>
  );
}

/** Gửi JSON, trả `null` nếu thành công hoặc thông điệp lỗi tiếng Việt. */
export async function guiJson(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return null;
    return (await res.json().catch(() => null))?.error ?? `Lỗi ${res.status}`;
  } catch {
    return "Mất kết nối — kiểm tra mạng rồi thử lại";
  }
}
