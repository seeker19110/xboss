---
name: ui-ux-craftsman
description: "Quy chuẩn thiết kế UI/UX đỉnh cao và quy trình triển khai trang/component cho XBoss. Bắt buộc kích hoạt khi tạo mới, thiết kế, review hoặc sửa đổi bất kỳ trang (page), layout, modal, form, bảng dữ liệu (table), dashboard hay component giao diện nào."
---

# UI/UX CRAFTSMAN — QUY CHUẨN THIẾT KẾ & QUY TRÌNH TRIỂN KHAI GIAO DIỆN XBOSS

Bộ Skill này đóng gói toàn bộ tri thức thiết kế UI/UX chuyên nghiệp, công thái học (ergonomics), chuẩn khả năng tiếp cận (**WCAG 2.2 AA**) và quy trình triển khai trang chuẩn mực cho nền tảng XBoss.

---

## 1. QUY TRÌNH 5 BƯỚC TRIỂN KHAI KHI CODE TRANG MỚI (PAGE WORKFLOW)

Mỗi khi tạo hoặc sửa đổi một trang/component, AI Agent và Kỹ sư phải đi qua tuần tự 5 bước:

```
[B1: Phân loại & Bối cảnh] ──► [B2: Thiết kế Bố cục & Tokens] ──► [B3: Xây dựng 5 Trạng thái] ──► [B4: Micro-Interactions] ──► [B5: Verification Gate]
```

### Bước 1: Xác định Phân loại Trang & Bối cảnh Sử dụng (Context & Category)

Tra cứu trang thuộc nhóm nào để áp dụng phong cách và công thái học tương ứng:

1. **Hiện trường & Tracking (`engineer`/`subcon` - 90% Mobile ngoài trời):**
   - Vùng chạm tối thiểu $44 \times 44\text{px}$.
   - Nút hành động chính nằm ở Thumb-Zone (nửa dưới màn hình).
   - Tối ưu thao tác 1 chạm, batch actions (chọn hàng loạt).
   - Tương phản màu cao, hỗ trợ Offline Queue / Optimistic UI.
2. **Dashboard & Tiến độ (`pm`/`bch`/`cdt` - Desktop/Tablet):**
   - Bố cục **Bento Grid** phân cấp thông tin rõ ràng.
   - Thẻ KPI có biểu đồ mini (Sparklines) và chỉ số chênh lệch $(\Delta)$.
   - Biểu đồ S-Curve so sánh Thực tế vs Baseline, hỗ trợ drill-down lọc dữ liệu bên dưới.
3. **Bảng Dữ liệu Lớn & BOQ/Chi phí (`qs`/`ke_toan`/`pm` - Desktop):**
   - Mật độ dữ liệu cao (**Data-Dense**), đệm compact (`p-1.5` đến `p-2.5`).
   - Cố định tiêu đề (Sticky Header) và cột mã hiệu bên trái (Sticky Left Columns).
   - Số liệu định dạng `font-mono tabular-nums` căn lề phải, phân tách hàng nghìn bằng dấu phẩy.
   - Cây danh mục WBS nhiều cấp mở rộng/thu gọn mượt mà.
4. **Nghiệm thu, QA/QC & Cổng kiểm soát (Approvals/Hold-Points):**
   - Tiến trình trực quan dạng **Stepper** từng bước.
   - Chống thao tác nhầm: Nút Từ chối bắt buộc nhập lý do; Nút Duyệt có xác nhận bảo vệ.
   - Bằng chứng thị giác: Carousel/Lightbox xem ảnh hiện trường kèm ngày giờ, vị trí và người upload.
   - Audit trail hiển thị rõ ràng người duyệt, thời gian và ghi chú.

---

### Bước 2: Thiết kế Bố cục & Tuân thủ Bất biến Theme (Design Tokens)

- **Cơ chế Đảo màu qua biến CSS:**
  - Tuyệt đối **KHÔNG dùng biến thể `dark:`** và **KHÔNG hardcode mã hex `#...`** trong component.
  - Sử dụng toàn bộ thang `zinc`:
    - Nền chính trang: `bg-background`
    - Bề mặt Card/Panel: `bg-zinc-950` hoặc `bg-zinc-900`
    - Viền ngăn cách: `border-zinc-800` (hoặc `border-zinc-700` khi cần tương phản mạnh)
    - Chữ chính (Primary text): `text-zinc-100` hoặc `text-foreground`
    - Chữ phụ (Secondary text): `text-zinc-400` (đạt chuẩn AA trên mọi theme; tránh `zinc-500` cho body text)
- **Nút Hành động & Màu Nhấn:**
  - Nút chữ trắng (`--on-accent`): Luôn dùng accent cấp `-600` hoặc `-700` (vd: `bg-emerald-600 hover:bg-emerald-700 text-white font-medium`) để đảm bảo tỉ lệ tương phản $\ge 4.5:1$ (AA).
- **Hệ thống Lưới & Khoảng cách (Spacing Scale):**
  - Tuân thủ nghiêm ngặt lưới 4px / 8px: `gap-2` (8px), `gap-4` (16px), `p-4` / `p-6`.

---

### Bước 3: Đảm bảo đầy đủ 5 Trạng thái Bắt buộc (The 5 States)

Mọi trang hoặc component có tải dữ liệu không được phép chỉ vẽ trạng thái lý tưởng mà phải hoàn thiện đủ 5 trạng thái:

1. **Initial / Empty State:**
   - Khi chưa có dữ liệu: Icon minh họa tinh tế, dòng chữ thông báo thân thiện + Nút hành động kêu gọi tạo mới (CTA).
2. **Loading / Skeleton State:**
   - Dùng Skeleton Loader mô phỏng chính xác hình dạng layout (Card Skeleton, Table Row Skeleton) với hiệu ứng `animate-pulse`. Tuyệt đối không làm giật bố cục (CLS < 0.1).
3. **Data Loaded State:**
   - Trạng thái hiển thị dữ liệu đầy đủ, phân trang hoặc cuộn ảo mượt mà.
4. **Error / Offline State:**
   - Banner cảnh báo màu đỏ/hổ phách (`bg-red-500/10 text-red-400 border-red-500/20`), thông báo nguyên nhân dễ hiểu và nút "Thử lại" (`Retry`).
5. **Validation & Field Feedback:**
   - Lỗi nhập liệu xuất hiện ngay dưới input (`text-xs text-red-400 mt-1`), viền ô chuyển sang `border-red-500/50`.

---

### Bước 4: Vi tương tác & Khả năng Tiếp cận (Micro-Interactions & A11y)

- **Tương tác nút & Clickable:**
  - Luôn có đủ: `hover:bg-...`, `active:scale-[0.98]`, `focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none`, `disabled:opacity-50 disabled:pointer-events-none`.
  - Icon-only button bắt buộc có `aria-label` và `title` tooltip giải thích.
- **Tương tác Bảng & Danh sách:**
  - Hover hiệu ứng mờ nhẹ trên hàng: `hover:bg-zinc-900/60 transition-colors`.
- **Chuyển động (Transitions):**
  - Dùng thời gian chuyển động ngắn, dứt khoát: `duration-150 ease-out` hoặc `duration-200`.

---

### Bước 5: Cổng Kiểm thử & Nghiệm thu (Verification Gate)

Trước khi hoàn tất code một trang, chạy kiểm tra toàn bộ:

1. `npm run lint` — Không còn lỗi cú pháp hoặc rule vi phạm.
2. `npm run typecheck` — TypeScript strict 100% sạch type.
3. `npm run check:sw-exclude` — Kiểm tra service worker.
4. `npm run check:migrations` — Đảm bảo tính toàn vẹn database.
5. Chạy `npx tsx scripts/contrast-check.ts` nếu có thêm quy tắc màu mới.

---

## 2. BẢNG MẪU CODE CHUẨN (GOLDEN CODE PATTERNS)

### Mẫu 1: Card Thống kê / Bento Grid Item

```tsx
export function MetricCard({ title, value, unit, delta, icon: Icon }: MetricCardProps) {
  return (
    <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{title}</span>
        <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-300">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-zinc-100 font-mono tabular-nums">
          {value}
        </span>
        {unit && <span className="text-xs text-zinc-400">{unit}</span>}
      </div>
      {delta !== undefined && (
        <div className="mt-2 text-xs flex items-center gap-1">
          <span className={delta >= 0 ? "text-emerald-400" : "text-red-400"}>
            {delta >= 0 ? `+${delta}%` : `${delta}%`}
          </span>
          <span className="text-zinc-500">so với kế hoạch</span>
        </div>
      )}
    </div>
  );
}
```

### Mẫu 2: Nút Hành động Hiện trường (Touch-First Button)

```tsx
export function PrimaryActionButton({
  onClick,
  loading,
  children,
  icon: Icon,
}: PrimaryButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="min-h-[44px] min-w-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-medium text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <>
          {Icon && <Icon className="w-4 h-4 shrink-0" />}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}
```

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] wcag-contrast-matrix-and-tokens

# CẨM NANG BẢNG MA TRẬN TƯƠNG PHẢN WCAG 2.2 AA TRÊN 5 THEMES

## 1. QUY TẮC TƯƠNG PHẢN BODY TEXT THANG ZINC

| Theme        | `text-zinc-400` trên `--bg` / `zinc-950` / `zinc-900` | Kết luận đạt chuẩn |
| :----------- | :---------------------------------------------------- | :----------------- |
| **dark**     | $7.72:1 - 6.91:1$ (Ngưỡng AA $\ge 4.5:1$)             | **PASS (An toàn)** |
| **light**    | $7.73:1 - 7.03:1$                                     | **PASS (An toàn)** |
| **kingblue** | $6.93:1 - 5.35:1$                                     | **PASS (An toàn)** |
| **darkblue** | $7.33:1 - 5.99:1$                                     | **PASS (An toàn)** |
| **navy**     | $7.66:1 - 6.64:1$                                     | **PASS (An toàn)** |

- **Quy tắc vàng 1:** Tuyệt đối dùng `text-zinc-400` hoặc `text-zinc-300` cho body text. Cấm dùng `text-zinc-600` hoặc `text-zinc-500` vì sẽ vi phạm chuẩn tương phản ở chế độ Dark/Darkblue/Navy.
- **Quy tắc vàng 2:** Nút accent chữ trắng luôn sử dụng mức màu `-600` hoặc `-700` (`bg-emerald-600`, `bg-blue-600`, `bg-rose-700`).

---
