import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Nút dùng chung — gom về một chỗ các biến thể đang bị chép tay rải rác khắp trang
// (bg-emerald-700 hover:bg-emerald-600…, bg-zinc-800 hover:bg-zinc-700…). Mọi màu đều
// dùng token tự đảo theo theme; nền màu đặc ghép chữ `text-on-accent` (xem globals.css).
//
// Nút nền màu đặc ĐẬM DẦN khi rê chuột (-700 → -800), không sáng dần như mẫu cũ: nền
// nhạt hơn kéo tương phản với chữ trắng xuống 3,3-3,7:1 ngay lúc rê chuột (mẫu cũ
// `hover:bg-emerald-600` = 3,65:1). Cổng CI `npm run check:mau-accent` canh luật này.
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "warning";
export type ButtonSize = "sm" | "md" | "icon";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-700 hover:bg-emerald-800 text-on-accent font-semibold border border-transparent",
  secondary:
    "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 hover:border-zinc-600 font-medium",
  ghost:
    "bg-transparent hover:bg-zinc-900/70 text-zinc-400 hover:text-zinc-100 border border-transparent font-medium",
  danger: "bg-red-700 hover:bg-red-800 text-on-accent font-semibold border border-transparent",
  warning:
    "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium",
};

// Vùng chạm ≥40px ở mọi cỡ (mobile công trường) — `sm` chỉ giảm bề ngang/cỡ chữ.
const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-10 px-2.5 gap-1.5 text-xs rounded-lg",
  md: "min-h-10 px-3.5 gap-2 text-sm rounded-lg",
  icon: "min-w-10 min-h-10 justify-center rounded-lg",
};

const BASE =
  "inline-flex items-center justify-center whitespace-nowrap transition interactive-press disabled:opacity-40 disabled:pointer-events-none";

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** Ẩn nhãn dưới breakpoint `sm` (thanh công cụ chật trên mobile) — vẫn giữ aria-label. */
  labelOnDesktopOnly?: boolean;
  children?: ReactNode;
  className?: string;
};

export function buttonClass({
  variant = "secondary",
  size = "md",
  className = "",
}: Pick<Common, "variant" | "size" | "className">) {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`;
}

function Inner({ icon: Icon, children, labelOnDesktopOnly, size }: Common) {
  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <>
      {Icon && <Icon className={`${iconSize} shrink-0`} strokeWidth={1.75} aria-hidden="true" />}
      {children != null && (
        <span className={labelOnDesktopOnly ? "hidden sm:inline" : undefined}>{children}</span>
      )}
    </>
  );
}

export default function Button({
  variant,
  size = "md",
  icon,
  labelOnDesktopOnly,
  children,
  className,
  ...rest
}: Common & Omit<ComponentPropsWithoutRef<"button">, "children" | "className">) {
  return (
    <button type="button" className={buttonClass({ variant, size, className })} {...rest}>
      <Inner icon={icon} size={size} labelOnDesktopOnly={labelOnDesktopOnly}>
        {children}
      </Inner>
    </button>
  );
}

/** Cùng hình thức với Button nhưng là link điều hướng thật (`<a href>`). */
export function ButtonLink({
  variant,
  size = "md",
  icon,
  labelOnDesktopOnly,
  children,
  className,
  ...rest
}: Common & Omit<ComponentPropsWithoutRef<"a">, "children" | "className">) {
  return (
    <a className={buttonClass({ variant, size, className })} {...rest}>
      <Inner icon={icon} size={size} labelOnDesktopOnly={labelOnDesktopOnly}>
        {children}
      </Inner>
    </a>
  );
}
