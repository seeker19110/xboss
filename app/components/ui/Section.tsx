import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Khối nội dung có tiêu đề — chuẩn hoá nhịp tiêu đề của trang. Trước đây mỗi khối tự viết
// một kiểu (text-xs uppercase / text-base semibold + icon / chỉ <h2> trơn) nên trang dài
// đọc rối, mắt không bám được thứ bậc. Quy ước duy nhất từ nay:
//   nhãn nhỏ IN HOA + icon tuỳ chọn ở trái, mô tả 1 dòng bên dưới, hành động ở phải.
export default function Section({
  title,
  icon: Icon,
  description,
  actions,
  id,
  className = "",
  children,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  description?: ReactNode;
  /** Nút/bộ lọc của riêng khối — canh phải cùng hàng tiêu đề. */
  actions?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-300">
            {Icon && (
              <Icon
                className="w-4 h-4 shrink-0 text-zinc-400"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{title}</span>
          </h2>
          {description && <p className="mt-1 text-xs text-zinc-400">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
