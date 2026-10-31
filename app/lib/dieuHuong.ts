// Quy tắc điều hướng client-side (next/link) cho link nội bộ (FE-1). Thuần, không chạm DOM —
// test ở tests/dieu-huong.test.ts; component dùng nó là app/components/LinkNoiBo.tsx.
//
// Mặc định: link nội bộ đi qua router của Next (không tải lại trang, giữ chunk JS đã parse và các
// cache module như fetchMe). Những trường hợp vẫn TẢI LẠI CỨNG như thẻ <a> cũ:
//   - href không phải trang nội bộ: ngoài origin, `//host`, `/api/*` (tải file/export), có query
//     hoặc hash — nhiều trang đọc query bằng `window.location` lúc khởi tạo state, mà khi điều hướng
//     client-side Next chỉ đổi URL SAU lúc render trang mới (trang sẽ đọc nhầm URL cũ);
//   - URL hiện tại đang có query: cùng lý do — query cũ (vd `?status=`, `?q=`) sẽ rò vào state khởi
//     tạo của trang mới (vd bộ lọc lưới tracking);
//   - cùng pathname: Next giữ nguyên state trang khi chỉ đổi query/bấm lại chính trang đang mở —
//     tải lại cứng giữ đúng hành vi cũ (bấm lại menu = làm mới trang).
// Đổi dự án/đăng xuất/401 KHÔNG đi qua đây: vẫn dùng window.location (chuyenDuAn.ts, me.ts).

/** href có thể điều hướng client-side không (xét riêng href, chưa biết URL hiện tại). */
export function laHrefNoiBoMem(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  if (/^\/api(?:[/?#]|$)/.test(href)) return false;
  return !/[?#]/.test(href);
}

/** Lúc bấm: có phải tải lại cứng thay vì để next/link điều hướng không. */
export function phaiTaiLaiCung(
  href: string,
  hienTai: { pathname: string; search: string },
): boolean {
  if (!laHrefNoiBoMem(href)) return true;
  return hienTai.search !== "" || href === hienTai.pathname;
}
