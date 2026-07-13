# M39 — Filter/Search/Sort bảng Nghiệm thu + Sticky header/cột ma trận tiến độ

> **Trạng thái: KẾ HOẠCH — chưa triển khai.** Gộp mục 1 (filter/sort/search) + mục 2 (sticky) của kế hoạch vì dùng chung 1 component bảng + cùng hàm sắp tầng. 1 trong 4 module chạy song song — xem `docs/ke-hoach-ux-cai-tien-2026-07.md`.

## Bối cảnh hiện trạng (đã có, không làm lại)

- `lib/floors.ts` **đã có** `floorOrder(f)` + `sortFloorsAsc`/`sortFloorsDesc` — đúng thứ tự vật lý (B-levels < 1F < 2F < … < RF, RF=9999). **Dùng lại hàm này, không viết `compareFloor` mới.**
- `ProgressMap.tsx` **đã có sticky cột "Tầng"** (class `sticky -left-3 sm:-left-4 z-10 bg-zinc-900`, dòng 135, 154, 601) — vừa fix ở commit `9d37e96` ("che kín cột Tầng sticky"). **Chưa có sticky header hàng** (thead không có `sticky top-0`) — đây là phần còn thiếu thật của mục 2.
- `app/approvals/page.tsx` (`ApprovalsPage`) là bảng "Chờ nghiệm thu"/"Đã nghiệm thu" nêu trong đề bài — hiện **không có toolbar filter/search/sort nào**, dữ liệu tải 1 lần qua `GET /api/approvals` (trả `pending`/`approved` từ 1 query, không phân trang — xem `app/api/approvals/route.ts`). Số dòng thực tế phụ thuộc số tầng×hệ có work_package, không cố định 119 — coi con số trong đề bài là minh hoạ.
- Field đã có sẵn trong mỗi dòng (`FloorGroup` trong `approvals/page.tsx` dòng 20-32): `sheetType`, `floorLabel`, `wpName`, `totalTasks`, `doneTasks`, `docCount`, `isApproved` (suy ra từ việc nằm trong mảng `pending` hay `approved`) — đủ để lọc theo Hệ/Trạng thái/%/tìm kiếm, **không cần đổi API**.

## Yêu cầu triển khai

### A. Component dùng chung `app/components/TableToolbar.tsx` (mới)

Tạo 1 component toolbar tái dùng được cho bảng approvals (và các bảng tương lai), theo đúng style hiện có (`bg-zinc-900 border border-zinc-800 rounded-xl`, input `bg-zinc-800 border-zinc-700`):

```ts
type TableToolbarProps<T> = {
  data: T[];
  searchFields: (item: T) => string[];   // các chuỗi để search (tên, mã tầng, mã hệ)
  filters: {
    key: string;
    label: string;
    options: { value: string; label: string }[];
    getValue: (item: T) => string;       // giá trị field của item để so khớp
  }[];
  urlPrefix?: string;                    // tiền tố query param, tránh đụng key giữa 2 bảng cùng trang
  children: (filtered: T[], toolbar: ReactNode) => ReactNode;
};
```

- Ô tìm kiếm debounce 300ms (dùng `useState` + `useEffect` + `setTimeout`, không cần thêm thư viện).
- Filter multi-select dạng dropdown đơn giản (checkbox list trong `<details>`/popover tự chế theo style `Modal`/dropdown đã có ở `NotificationBell.tsx` — không cần thư viện ngoài).
- Đồng bộ state vào URL qua `useSearchParams`/`useRouter` (`next/navigation`) — pattern: mỗi lần đổi filter, `router.replace(...)` với query mới, đọc lại lúc mount qua `useSearchParams()`.
- Chip filter đang áp dụng + nút xoá từng chip + "Xoá tất cả".
- Đếm "Hiển thị X / Y".
- Highlight từ khoá khớp: hàm nhỏ `highlightMatch(text, query)` trả `ReactNode` (wrap `<mark>` hoặc `<span className="bg-amber-500/30 text-inherit">`), dùng `dangerouslySetInnerHTML`-free (escape thủ công, KHÔNG dùng regex không escape để tránh vỡ nếu query chứa ký tự đặc biệt — dùng `String.prototype.split` sau khi escape regex đặc biệt của query bằng `query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`).

Sort: header cột click để đổi hướng, dùng comparator truyền vào — riêng cột "Tầng" **bắt buộc dùng `sortFloorsAsc`/`sortFloorsDesc` từ `lib/floors.ts`**, không viết localeCompare.

Stable sort: `Array.prototype.sort` trong V8/Node hiện đại đã ổn định theo spec ES2019 — không cần thêm index tie-break thủ công, nhưng khi so 2 hệ cùng tầng, comparator chính (tầng) trả 0 thì giữ nguyên thứ tự gốc từ API (đã `ORDER BY st.id, wp.floor_label`) — đủ điều kiện "tie-break theo hệ".

### B. Áp dụng vào `app/approvals/page.tsx`

- Bọc `pending` và `approved` bằng `TableToolbar` riêng (2 instance, `urlPrefix="pending"` / `urlPrefix="approved"` để query param không đụng nhau, vd `?pending_he=A-OGHL&pending_status=cho`).
- Filter theo Hệ: options lấy từ `Array.from(new Set(pending.map(g => g.sheetType)))`.
- Filter theo Trạng thái: với bảng pending → "Đủ điều kiện duyệt (100%)" (`g.doneTasks === g.totalTasks`) vs "Đang chờ" (còn lại); với cả 2 bảng thêm option "Đã có biên bản" (`g.docCount > 0`) / "Chưa có biên bản" (`g.docCount === 0`).
- Filter theo % tiến độ: preset buttons (0%, 1-49%, 50-99%, 100%) tính từ `doneTasks/totalTasks`.
- Search: theo `sheetType`, `floorLabel`, `wpName`.
- Sort mặc định: theo tầng dùng `sortFloorsAsc`, tie-break `sheetType`.
- Empty state khi lọc ra 0 dòng: khác với empty state gốc (chưa có dữ liệu) — thêm minh hoạ + text "Không có tầng/hệ nào khớp bộ lọc" + nút "Xoá bộ lọc" (khác thông điệp hiện có ở dòng 407-409/445-447 vốn dùng cho trường hợp KHÔNG có filter).
- Vẫn giữ nguyên toàn bộ logic hành động (duyệt/huỷ/upload biên bản) — chỉ bọc thêm lớp lọc/sort ở trên `row()`, không đổi hàm `row()`.

### C. Sticky header hàng cho `ProgressMap.tsx`

- Thêm `sticky top-0 z-20 bg-zinc-900` vào `<thead><tr>` của cả `TowerCurrentTable` (dòng ~133-149) và bảng history mode (dòng ~569-585). Vì `ProgressMap` thường nhúng trong section có scroll riêng (`overflow-x-auto`, không phải scroll toàn trang), `top: 0` là top của container cuộn — kiểm tra thực tế xem có cần `top` khác 0 nếu legend/toolbar cũng nằm trong cùng khối cuộn (thực tế: legend/controls nằm NGOÀI `overflow-x-auto` div nên top:0 đúng).
- Xử lý z-index chồng lớp theo đúng yêu cầu gốc: cột trái dính `z-10` (giữ nguyên, đã có), header hàng dính `z-20`, ô góc trên-trái (nơi `<th>` đầu tiên vừa sticky-left vừa sticky-top) cần `z-30` — tức riêng `<th>` đầu tiên trong `<tr>` header phải có CẢ `sticky -left-3 sm:-left-4 top-0 z-30 bg-zinc-900` (kết hợp 2 lớp sticky) thay vì chỉ 1 lớp như các `<td>` thân bảng.
- Đảm bảo nền sticky **đục hoàn toàn** (`bg-zinc-900`, không dùng `/50` hay `/20`) để không lộ nội dung cuộn phía sau — đúng yêu cầu gốc, tái xác nhận class hiện có đã đục (đúng).
- Test thủ công trên Chrome + Firefox (Safari không có sẵn trong môi trường CI/dev — ghi chú trong PR nếu không test được, không block PR vì lý do môi trường).

### D. `lib/floors.ts` — không cần sửa

Hàm đã đúng yêu cầu acceptance criteria ("bấm header Tầng → B1F, 1F, 2F, 3F… RF"). Chỉ cần export thêm không cần thiết — dùng trực tiếp.

## Yêu cầu kỹ thuật chung

- Toàn bộ lọc/sort/search **client-side** (dữ liệu approvals tải 1 lần, số dòng thực tế của dự án 1 tháp không tới 500) — không chuyển server-side/phân trang trong module này. Nếu sau này số dòng vượt 500 thật, đó là việc của module riêng.
- Không thêm thư viện ngoài (không cần `use-debounce`, `fuse.js`...) — logic đủ đơn giản để tự viết, giữ đúng nguyên tắc KISS/YAGNI của dự án.
- A11y: input tìm kiếm có `aria-label`, nút xoá filter có `aria-label`, dropdown multi-select điều hướng được bằng bàn phím (dùng `<details>/<summary>` native là đủ, không cần ARIA combobox phức tạp).

## Test & Definition of Done

- Test thuần cho `lib/floors.ts` đã có sẵn (kiểm tra `tests/` có file chưa; nếu chưa có test cho `floorOrder`, thêm `tests/floors.test.ts` ngắn — không phải trọng tâm module này nhưng nên có vì giờ dùng làm sort chính thức cho UI).
- Test tay trên `/approvals`: gõ "23F" chỉ lọc đúng, chọn hệ+trạng thái ra đúng tập + chip đúng, bấm sort "Tầng" ra đúng thứ tự vật lý, refresh giữ filter qua URL, phản hồi tức thời (<200ms cảm nhận, không có lỗi console).
- Test tay `/timeline` (dùng chung `ProgressMap`) và dashboard `/`: cuộn dọc thấy header dính, cuộn ngang thấy cột Tầng dính, không có ô nội dung "xuyên qua" ở cả 2 theme (dark mặc định + `html.light`).
- `npm run lint` + `npm run typecheck` xanh; verify UI thật (không chỉ dựa vào build).

## Rủi ro trùng file với module chạy song song

- `ProgressMap.tsx` không bị module nào khác trong đợt này chạm — an toàn.
- Nếu M41 (responsive) cũng chạm `app/approvals/page.tsx` (khả năng cao — mục 6 yêu cầu card view mobile cho đúng trang này), **ưu tiên merge M39 trước** (toolbar filter là lớp trên/trước card view) rồi M41 rebase lên, đổi phần render "bảng" thành "card trên mobile, bảng trên desktop" nhưng vẫn dùng chung dữ liệu đã lọc/sort từ `TableToolbar`.
