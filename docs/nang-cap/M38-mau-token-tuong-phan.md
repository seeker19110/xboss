# M38 — Màu cho người mù màu + tương phản (nền tảng, làm trước)

> **Trạng thái: KẾ HOẠCH — chưa triển khai.** Đọc `CLAUDE.md` + `docs/nang-cap/README.md` mục Quy ước chung trước khi code. Đây là 1 trong 4 module chạy song song trong đợt cải tiến UX 2026-07 (cùng M39/M40/M41) — xem `docs/ke-hoach-ux-cai-tien-2026-07.md` cho tổng quan & thứ tự phụ thuộc.

## Bối cảnh hiện trạng (đã có, không làm lại)

- Hệ token màu CSS variables đã có (`app/globals.css`): thang `zinc` đảo theo `html.light`/`html.kingblue`/`html.darkblue`/`html.navy`; các mã `-300/-400` của accent (emerald/sky/amber/violet/rose/…) đã đảo đậm cho theme sáng đủ AA. **Không tạo hệ token mới** — tái dùng đúng biến hiện có.
- `docs/a11y/contrast-audit.md` ghi nhận **toàn bộ trang trong backlog đã remediate & verify bằng axe** (Dashboard, tracking, payments, my-tasks, materials, notifications, admin + 8 trang khác). `@axe-core/playwright` đã cài, chạy trong `e2e/authed/*.spec.ts` theo pattern có sẵn.
- Màu trạng thái task tập trung ở `lib/status.ts` (`STATUS_LABEL`), nhưng **không có `STATUS_COLOR`/`STATUS_ICON` dùng chung** — mỗi nơi tự chọn class màu rời rạc (badge, `ProgressMap.tsx` heatmap, Pareto trễ ở `app/page.tsx`).
- `ProgressMap.tsx` (`bucketClass`, dòng 42-86) đã có comment giải thích kỹ lý do chọn từng mã màu heatmap (không dùng -300/-400 làm nền) — đọc kỹ trước khi đổi để không phá lại logic đã tự đúng.

## Vấn đề còn thiếu (phạm vi module này)

1. **Không có tín hiệu thứ hai ngoài màu** cho trạng thái/mức tiến độ ở các nơi hiển thị dày đặc màu:
   - `ProgressMap.tsx`: ô heatmap tầng×hệ chỉ có màu nền + %. Viền đỏ (trễ) chỉ là màu, không icon.
   - `NotificationBell.tsx`: mọi thông báo chưa đọc đều tô nền `bg-red-950/20` (dòng 166) bất kể loại — không phân biệt được mức độ nghiêm trọng chỉ bằng cách đọc nhanh.
   - Legend `ProgressMap.tsx` dòng 77-86: chỉ có ô màu + nhãn %, không có icon — khi in đen trắng (`/report` không nhúng ProgressMap nhưng dashboard `/` có) mất hết phân biệt.
2. **Chưa có kiểm tra tự động trong CI** cho việc **giả lập mù màu** (deuteranopia/protanopia) — chỉ có axe kiểm tương phản số, không kiểm "có phân biệt được nếu chỉ nhìn bằng độ sáng".
3. Vài dòng phụ vẫn tồn tại pattern cũ `text-zinc-500`/`text-zinc-600` cho **body text tĩnh quan trọng** (không phải placeholder/disabled) — quy ước README dòng 67 đã cấm nhưng chưa audit lại toàn bộ sau các module mới (M32-M37).

## Yêu cầu triển khai

### 1. `lib/status.ts` — thêm `STATUS_ICON` dùng chung

Thêm map icon (tên từ `lucide-react`, dùng string key để tránh import JSX trong file `.ts` thuần — theo đúng style file hiện tại chỉ export const/function, không JSX):

```ts
export const STATUS_ICON: Record<StatusSlug, "AlertTriangle" | "CheckCircle2" | "Circle" | "Clock" | "CircleDot"> = {
  chuan_bi: "Circle",
  dang_thi_cong: "CircleDot",
  hoan_thanh: "CheckCircle2",
  nghiem_thu: "CheckCircle2",
  tre: "AlertTriangle",
};
```

Nơi hiển thị `StatusBadge` (tìm component hiện có qua `grep -rn "STATUS_CLS" app/components`) thêm icon tương ứng cạnh nhãn chữ — nhãn chữ đã có sẵn (`STATUS_LABEL`) nên đa số nơi **đã có tín hiệu thứ 2 là chữ**; chỉ bổ sung icon cho nơi CHỈ có màu không có chữ (heatmap, dot thông báo).

### 2. `ProgressMap.tsx` — icon cho ô heatmap + legend

- Ô 100% (`BG_DONE`, dòng 63): thêm icon `CheckCircle2` nhỏ (`w-2.5 h-2.5`) cạnh %.
- Ô có trễ (`delayed > 0`, hàm `cellClass` dòng 70-72): đã có `ring-2 ring-red-500/70`; giữ nguyên viền nhưng đảm bảo icon `AlertTriangle` luôn hiển thị kèm số trễ (đã có ở dòng 191-193 cho bảng current — kiểm tra bảng history dòng 611-632 KHÔNG có icon tương ứng, chỉ có `ring-2` ở dòng 635 — bổ sung icon nhỏ vào ô "Nay" khi `hasDelayed`).
- Legend (dòng 77-86): thêm icon vào từng mục thay vì chỉ ô màu — vd mục "100%" có `<CheckCircle2>`, mục "Trễ" đã có chữ "(viền đỏ)" nhưng thêm `<AlertTriangle>` icon thật thay vì chỉ mô tả bằng chữ.

### 3. `NotificationBell.tsx` — phân cấp màu theo mức độ nghiêm trọng

Dòng 166 hiện tô MỌI thông báo chưa đọc cùng `bg-red-950/20`. Đổi sang phân cấp dựa trên `n.type` (field đã có sẵn trong `Notif`):
- `type === "delayed"` hoặc chứa "qua_han"/tương tự → đỏ (`bg-red-950/20`, giữ nguyên).
- `type === "due_soon"` → cam (`bg-amber-950/20`).
- `type === "comment"` → thông tin, xám/xanh nhạt (`bg-sky-950/20` hoặc giữ `bg-zinc-800/40`).
- Còn lại (material_over, …) → giữ đỏ hoặc cam tuỳ mức độ — quyết định dựa theo bảng loại thông báo trong `app/api/notifications/route.ts` (đọc để liệt kê đủ `type` đang tồn tại trước khi map).
- Thêm icon nhỏ đầu mỗi item tương ứng loại (dùng chung enum màu/icon nếu hợp lý, nhưng đây là notification type chứ không phải StatusSlug — có thể cần map riêng `NOTIF_ICON`/`NOTIF_COLOR` trong chính file này hoặc `lib/notifications.ts` nếu file đó tồn tại, kiểm tra trước khi tạo mới).

> Lưu ý: nếu M40 (trung tâm thông báo) chạy song song và cũng sửa file này — **đọc trước khi bắt đầu** xem M40 đã đổi cấu trúc item chưa (khả năng đụng file cao, xem mục "Rủi ro trùng file" cuối tài liệu).

### 4. Kiểm tra mù màu — thêm vào quy trình verify (không cần tool CI mới)

Không có ngân sách thêm dependency giả lập màu vào CI lần này (out of scope). Thay vào đó:
- Sau khi code xong, **tự verify bằng DevTools**: Chrome DevTools → Rendering → "Emulate vision deficiencies" → chọn Deuteranopia + Protanopia, chụp lại `/` (dashboard, có `ProgressMap`) và dropdown `NotificationBell` — xác nhận phân biệt được "trễ" vs "đạt" nhờ icon dù nhìn qua bộ lọc mù màu.
- Ghi kết quả verify (mô tả ngắn, không cần ảnh) vào `PROGRESS.md` khi hoàn thành.

### 5. Audit lại `text-zinc-500`/`text-zinc-600` trên body text tĩnh

```bash
grep -rn "text-zinc-500\|text-zinc-600" app --include="*.tsx" | grep -v "placeholder\|disabled"
```
Rà kết quả, với mỗi chỗ là **body text quan trọng** (không phải icon màu trung tính, không phải disabled state) → đổi sang `text-zinc-400` (hoặc đậm hơn) theo đúng ngưỡng đã dùng ở các trang đã remediate. Bỏ qua nếu đã đúng ngữ cảnh (icon phụ, watermark).

## Không làm (out of scope)

- Không đổi bộ biến CSS token hiện có trong `globals.css` (đã đúng, đã audit).
- Không thêm pipeline pa11y/axe mới vào CI — `@axe-core/playwright` đã đủ, chỉ tái dùng.
- Không đổi theme King Blue/Dark Blue/Navy.

## Test & Definition of Done

- `npm run lint` + `npm run typecheck` xanh.
- E2E axe hiện có (`e2e/authed/*.spec.ts` liên quan dashboard/notifications) vẫn pass sau khi đổi class màu.
- Verify tay bằng DevTools vision deficiency emulation (mục 4) — mô tả kết quả trong PR description.
- Diff nhỏ, đúng phạm vi: chỉ `lib/status.ts`, `ProgressMap.tsx`, `NotificationBell.tsx` + các nơi dùng `STATUS_ICON` mới (tìm qua `STATUS_CLS`).

## Rủi ro trùng file với module chạy song song

- `NotificationBell.tsx` **cũng bị M40 sửa** (trung tâm thông báo tái cấu trúc toàn bộ dropdown). Để tránh xung đột merge: module này (M38) chỉ đổi **màu/icon của item hiện có**, không đổi cấu trúc dropdown/tab/nhóm — đó là việc của M40. Khi tích hợp 2 nhánh, ưu tiên merge M38 trước (nền tảng màu) rồi rebase M40 lên trên.
