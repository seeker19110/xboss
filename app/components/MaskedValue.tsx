"use client";

// MaskedValue — M50 PR2 (quyền theo trường): hiển thị "•••" cho ô tiền mà API đã che
// (trả null) vì user thiếu quyền xem, kèm aria-label để không truyền tải thông tin CHỈ
// bằng ký hiệu (a11y — xem CLAUDE.md mục Khả năng tiếp cận).
//
// Quy ước phân biệt với ô rỗng thật: giá trị null/không hữu hạn (NaN do cộng dồn từ
// trường bị che) → "•••" (không có quyền); số hữu hạn (kể cả 0) → để `format` xử lý như
// cũ (thường ra "0 đ"/"—"). Vậy 0 KHÔNG bị nhầm thành "không có quyền".
export default function MaskedValue({
  value,
  format,
}: {
  value: number | null | undefined;
  format: (n: number) => string;
}) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span
        className="text-zinc-500 tracking-widest select-none"
        aria-label="Không có quyền xem"
        title="Không có quyền xem"
      >
        •••
      </span>
    );
  }
  return <>{format(value)}</>;
}
