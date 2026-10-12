# PHẦN 3 — Hệ thống Theme (Dark blue + Light)

> Cụ thể hóa yêu cầu "design tokens nhất quán" của KHUNG 1 (GĐ 2) thành một hệ thống theme dùng được ngay.
> **Mặc định: nền Dark blue. Có thêm chế độ Light.** Người dùng tự chuyển; lựa chọn được nhớ lại.
> Ví dụ file tokens: `styles/theme.css` (tự tạo ở gốc dự án đích).

## Nguyên tắc
- **Dùng biến (design tokens), không hard-code màu** trong component → một nguồn sự thật, đổi theme là cả app đổi.
- **Tương phản đạt WCAG AA** ở *cả hai* chế độ (đã chọn màu trong `styles/theme.css` để đạt; vẫn kiểm lại bằng axe — xem Nhóm 2).
- **Không "nháy" theme sai khi tải trang** (no flash of wrong theme): đặt theme *trước khi* trang vẽ.
- **Mặc định Dark blue**, kể cả khi máy người dùng đang để Light (trừ khi bạn bật khối tùy chọn trong `theme.css`).

## Bước 1 — Nạp tokens

Import `styles/theme.css` ở layout gốc (Next App Router: `app/layout.tsx` hoặc đầu `app/globals.css`):

```css
/* app/globals.css */
@import 'tailwindcss';
@import '../styles/theme.css';
```

## Bước 2 — Nối tokens vào Tailwind (v4)

Tailwind v4 cấu hình theme bằng CSS. Thêm khối `@theme inline` để các tiện ích Tailwind
(`bg-background`, `text-foreground`, `border-border`...) trỏ tới biến *chạy theo theme*:

```css
/* app/globals.css — sau hai dòng @import ở trên */
@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-foreground: var(--foreground);
  --color-muted-foreground: var(--muted-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
}
```

> Dùng `@theme inline` (không phải `@theme`) để Tailwind sinh ra `var(--background)` thay vì "nướng cứng"
> giá trị màu — nhờ vậy đổi `data-theme` là màu đổi theo. (Tailwind v3: thay bằng `theme.extend.colors`
> trỏ `'background': 'var(--background)'` trong `tailwind.config`.)

Giờ viết UI bằng token, ví dụ:
```tsx
<div className="bg-background text-foreground">
  <button className="bg-primary text-primary-foreground rounded-lg px-4 py-2">Lưu</button>
</div>
```

## Bước 3 — Chặn "nháy" theme (no-flash)

Theme phải được đặt **trước khi** React hydrate. Thêm script nhỏ chạy đồng bộ trong `<head>`:

```tsx
// app/layout.tsx — đặt trong <head>, trước nội dung
const noFlashTheme = `
  (function () {
    try {
      var t = localStorage.getItem('theme');     // 'light' | 'dark' | null
      if (t === 'light' || t === 'dark') {
        document.documentElement.setAttribute('data-theme', t);
      }
      // không có lựa chọn đã lưu → để mặc định Dark blue (không set gì)
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

> `dangerouslySetInnerHTML` ở đây an toàn vì nội dung là **hằng số do ta viết**, không phải dữ liệu người dùng.

## Bước 4 — Nút chuyển theme

```tsx
'use client';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark'); // mặc định Dark blue

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
      className="border-border text-foreground rounded-lg border px-3 py-2"
    >
      {theme === 'dark' ? '☀️ Sáng' : '🌙 Tối'}
    </button>
  );
}
```

## Checklist khi làm UI có theme
- [ ] Không hard-code mã màu (`#fff`, `bg-blue-500`...) cho nền/chữ — dùng token (`bg-background`, `text-foreground`...).
- [ ] Thử **cả hai** chế độ: không có chữ "tàng hình", không mất viền, ảnh/biểu đồ vẫn đọc được.
- [ ] Tương phản đạt **AA** ở cả hai chế độ (axe + kiểm tay phần tử quan trọng).
- [ ] Viền focus (`--ring`) thấy rõ ở cả hai chế độ (a11y bàn phím).
- [ ] Không "nháy" theme khi tải lại trang (đã có script no-flash).
- [ ] Lựa chọn theme được **nhớ** giữa các lần truy cập (localStorage).


===============================================================================
