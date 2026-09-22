// Ô chọn (select) dùng chung — chuẩn hoá control `<select>` đang bị chép tay ở nhiều bộ lọc
// (bảng trễ trang chủ, các trang hub…) về cùng một kiểu (ADR-0009).
export default function Select({
  value,
  onChange,
  options,
  placeholder,
  "aria-label": ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: { v: string; l: string }[];
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={`min-h-10 rounded-lg bg-zinc-800 border border-zinc-700 px-3 text-xs text-zinc-100 outline-none focus:border-emerald-500 transition ${className}`}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}
