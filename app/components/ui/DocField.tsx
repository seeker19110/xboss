import type { ReactNode } from "react";

// Hàng "nhãn — giá trị" của khối thông tin chứng từ (M124). Một kiểu duy nhất cho cả ô
// nhập lẫn ô chỉ đọc, để phần đầu chứng từ đọc thành 2 cột thẳng hàng thay vì mỗi trang
// tự chế một kiểu <div className="flex justify-between"> khác nhau.
//
// Ô chỉ đọc (`readOnly`) dùng viền ĐỨT NÉT nền trong suốt: vẫn nhìn ra "đây là một
// trường của chứng từ" nhưng không mời gọi bấm vào như ô nhập thật.
export default function DocField({
  label,
  required = false,
  readOnly = false,
  htmlFor,
  hint,
  className = "",
  children,
}: {
  label: ReactNode;
  required?: boolean;
  /** Giá trị chỉ đọc — bọc trong khung viền đứt nét thay vì ô nhập. */
  readOnly?: boolean;
  /** id của control bên trong — khi có, nhãn là <label for> thật (a11y). */
  htmlFor?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const labelContent = (
    <>
      {label}
      {required && (
        <span className="text-red-400" aria-hidden="true">
          {" *"}
        </span>
      )}
    </>
  );
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-[120px_1fr] items-center gap-x-3 gap-y-1 min-h-10 ${className}`}
    >
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-sm text-zinc-400">
          {labelContent}
        </label>
      ) : (
        <span className="text-sm text-zinc-400">{labelContent}</span>
      )}
      <div className="min-w-0">
        {readOnly ? (
          <div className="rounded-lg border border-dashed border-zinc-700 bg-transparent px-3 py-2 text-sm text-zinc-200 min-h-10 flex items-center break-words">
            {children}
          </div>
        ) : (
          children
        )}
        {hint && <p className="mt-1 text-[11px] text-zinc-400">{hint}</p>}
      </div>
    </div>
  );
}

/** Khung 2 cột cho các `DocField` ở đầu chứng từ (trên md; dưới md dồn 1 cột). */
export function DocFieldGroup({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`grid md:grid-cols-[1.4fr_1fr] gap-x-7 gap-y-3 ${className}`}>{children}</div>
  );
}
