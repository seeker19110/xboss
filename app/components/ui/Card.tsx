import type { ComponentPropsWithoutRef, ReactNode } from "react";

// Mặt thẻ dùng chung — chuẩn hoá 3 kiểu nền/độ bo/độ dày viền đang bị chép tay khác nhau
// ở mỗi trang (rounded-xl/2xl, bg-zinc-900 vs bg-zinc-950/80 vs .bento-card). Quy ước:
// - `raised`  : thẻ nội dung chính, nổi trên nền trang (bg-zinc-900)
// - `sunken`  : thẻ phụ/lồng trong thẻ khác, chìm hơn nền trang (bg-zinc-950/70)
// Bo góc thống nhất `rounded-xl` cho thẻ; `rounded-lg` chỉ dành cho control (nút/input).
export type CardTone = "raised" | "sunken";
export type CardPad = "none" | "sm" | "md" | "lg";

const TONE: Record<CardTone, string> = {
  raised: "bg-zinc-900 border-zinc-800",
  sunken: "bg-zinc-950/70 border-zinc-800",
};

const PAD: Record<CardPad, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

type Common = {
  tone?: CardTone;
  pad?: CardPad;
  /** Thêm hiệu ứng hover/nhấn — dùng cho thẻ bấm được (link hoặc button). */
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
};

export function cardClass({ tone = "raised", pad = "md", interactive, className = "" }: Common) {
  return [
    "rounded-xl border transition",
    TONE[tone],
    PAD[pad],
    interactive
      ? "hover:border-zinc-700 hover:bg-zinc-900/90 interactive-press cursor-pointer"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function Card({
  tone,
  pad,
  interactive,
  className,
  children,
  ...rest
}: Common & Omit<ComponentPropsWithoutRef<"div">, "className" | "children">) {
  return (
    <div className={cardClass({ tone, pad, interactive, className })} {...rest}>
      {children}
    </div>
  );
}

/** Thẻ điều hướng — cùng mặt thẻ nhưng là link thật, luôn có hiệu ứng hover. */
export function CardLink({
  tone,
  pad,
  className,
  children,
  ...rest
}: Common & Omit<ComponentPropsWithoutRef<"a">, "className" | "children">) {
  return (
    <a className={cardClass({ tone, pad, interactive: true, className })} {...rest}>
      {children}
    </a>
  );
}
