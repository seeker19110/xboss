"use client";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { laHrefNoiBoMem, phaiTaiLaiCung } from "@/app/lib/dieuHuong";

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & { href: string };

/**
 * Link nội bộ (FE-1): đi qua router của Next khi an toàn, ngược lại giữ hành vi thẻ <a> cũ (tải lại
 * cứng) — quy tắc trong app/lib/dieuHuong.ts. `prefetch={false}`: sidebar có cả trăm mục, không
 * bắn request prefetch RSC cho từng mục trên điện thoại.
 */
export default function LinkNoiBo({ href, onClick, ...rest }: Props) {
  if (!laHrefNoiBoMem(href) || rest.target || rest.download != null) {
    return <a {...rest} href={href} onClick={onClick} />;
  }
  return (
    <Link
      {...rest}
      href={href}
      prefetch={false}
      onClick={(e) => {
        onClick?.(e);
        // Nhấp kèm phím (mở tab mới…) hay nơi gọi đã chặn: để next/link + trình duyệt tự xử lý.
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        )
          return;
        if (phaiTaiLaiCung(href, window.location)) {
          e.preventDefault();
          window.location.assign(href);
        }
      }}
    />
  );
}
