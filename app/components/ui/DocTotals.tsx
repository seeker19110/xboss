import type { ReactNode } from "react";

export type DocTotalRow = {
  label: ReactNode;
  /** Giá trị ĐÃ định dạng sẵn (thường là <MaskedValue …/>) — component này không tính toán. */
  value: ReactNode;
  /** Dòng khấu trừ — hiện dấu "−" ở trước để người đọc không phải suy từ màu. */
  negative?: boolean;
};

// Khối tổng hợp tiền cuối chứng từ (M124). CỐ Ý không nhận số thô và không cộng/nhân:
// tiền tổng do SQL tính và API trả (quy ước M45), JS chỉ hiển thị. Dòng âm gắn dấu "−"
// chứ không chỉ đổi màu (không truyền tin CHỈ bằng màu — a11y).
export default function DocTotals({
  rows,
  total,
  className = "",
}: {
  rows: DocTotalRow[];
  total: { label: ReactNode; value: ReactNode };
  className?: string;
}) {
  return (
    <dl className={`space-y-2 ${className}`}>
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline justify-between gap-3">
          <dt className="text-sm text-zinc-400">{r.label}</dt>
          <dd
            className={`text-sm font-mono tabular-nums ${r.negative ? "text-amber-300" : "text-zinc-200"}`}
          >
            {r.negative && <span aria-hidden="true">−</span>}
            {r.value}
          </dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t border-zinc-800 pt-3">
        <dt className="text-sm font-semibold text-zinc-300">{total.label}</dt>
        <dd className="text-2xl font-bold font-mono tabular-nums text-emerald-300">
          {total.value}
        </dd>
      </div>
    </dl>
  );
}
