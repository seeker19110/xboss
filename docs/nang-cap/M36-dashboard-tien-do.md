# M36 — Dashboard Tiến Độ đầy đủ theo mockup (tổng thể + theo hệ + đường găng & chậm tiến độ)

**Phạm vi: CHỈ chỉnh & bổ sung bên trong Dashboard Tiến Độ (cụm "Kế hoạch & Tiến độ", node `dash.tien-do`) — không đụng phần còn lại của AppShell. · Phụ thuộc: M21 (cây nav + hub), M15 (hệ thi công) · Phức tạp: Trung bình (3 PR) · Rủi ro: Thấp (không đổi schema)**

## Mục tiêu

Mockup `xBossmockup.xlsx` đặc tả **Dashboard Tiến Độ** gồm 3 khối:

1. **Kế Hoạch & Báo Cáo Tổng Thể** — Timeline tổng thể · Gantt tổng thể · Kế hoạch tuần (Lookahead) · Báo cáo tiến độ ngày/tuần/tháng · Đường cong S (S-Curve) tổng thể.
2. **Tiến Độ theo hệ** (mockup liệt kê 7: Trắc Đạc, Kết Cấu, Xây Tô – Hoàn Thiện, MEP-ACMV, MEP-Điện, MEP-Cấp Thoát Nước, MEP-PCCC) — lặp lại đúng 5 view trên nhưng **lọc theo từng hệ**.
3. **Kiểm Soát Đường Găng & Chậm Tiến Độ**.

Hiện node `dash.tien-do` mới có 3 lá Timeline/Gantt/Lookahead không lọc được theo hệ, S-Curve chỉ nằm trên trang chủ, và chưa có view kiểm soát đường găng riêng. M36 lấp các khoảng trống đó **bằng cách tái dùng trang/API sẵn có + tham số lọc theo hệ**, không nhân bản 7×5 trang.

## Hiện trạng & điểm chạm

| Khối mockup                 | Đã có                                                                                                                                                                              | Khoảng trống                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Timeline                    | `/timeline` + `GET /api/timeline`                                                                                                                                                    | Chưa lọc theo hệ                                                                                     |
| Gantt                       | `/gantt` + `GET /api/gantt` — CPM đường găng qua `package_dependencies` + `lib/cpm.ts` (highlight amber), filter sheet **in-page** (state, không URL)                                | Filter chưa nhận từ URL, chưa lọc theo hệ                                                            |
| Lookahead                   | `/lookahead` + `GET /api/lookahead?days=` — nhóm theo sheet                                                                                                                          | Chưa lọc theo hệ                                                                                     |
| Báo cáo ngày/tuần/tháng     | `/report` (in-friendly, đọc `/api/dashboard` + `/api/dashboard/forecast`); cron daily/weekly gửi email/Telegram                                                                      | Trang `/report` chỉ có "hiện tại", chưa chọn kỳ ngày/tuần/tháng, chưa lọc theo hệ                    |
| S-Curve                     | `SCurveChart` (trang chủ) + `GET /api/dashboard/scurve?sheet=&baseline=` — lọc theo **1 sheet**, có baseline selector                                                                | Chưa có trang riêng vào được từ nav; chưa gộp theo **hệ** (hệ = nhiều sheet)                         |
| Đường găng & chậm tiến độ   | Đường găng highlight trong Gantt; bảng trễ + Pareto `delay_reason` (`lib/delay.ts`) trên Dashboard                                                                                   | Chưa có trang kiểm soát riêng (danh sách nhóm việc trên đường găng + float + bảng trễ cùng một chỗ) |
| Danh mục hệ                 | Bảng `disciplines` (động, seed 6: `ket_cau/xay_to/acmv/dien/nuoc/pccc`) + `sheet_types.discipline_id` + hub `/he/[code]` + `GET /api/disciplines`                                    | Mockup có thêm "Trắc Đạc" — hệ là **danh mục động**, admin tự thêm, KHÔNG seed cứng (xem Điểm cần quyết) |

Điểm chạm code: `app/lib/dashboardTree.ts` (chỉ node `dash.tien-do`), `app/components/DashboardHub.tsx` (+ `app/hub/[id]/page.tsx` giữ nguyên), `app/timeline|gantt|lookahead|report/page.tsx`, `app/api/timeline|gantt|lookahead/route.ts`, `app/api/dashboard/route.ts` + `app/api/dashboard/scurve/route.ts`, `lib/cpm.ts` (tái dùng, không sửa), `lib/delay.ts` (tái dùng).

## Thiết kế

### 1) Quy ước lọc theo hệ: query param `?he=<disciplines.code>`

- **Một chuẩn duy nhất** cho mọi trang/API tiến độ. Server resolve `he` → `disciplines.id` → lọc qua `JOIN sheet_types st ... WHERE st.discipline_id = ?`. `he` không tồn tại → 404 nhẹ nhàng (trả rỗng + thông điệp) chứ không lỗi 500.
- Giữ nguyên param cũ (`?sheet=` của scurve, `?days=` của lookahead) — `he` là **bổ sung**, không breaking. `sheet` và `he` cùng lúc thì `sheet` thắng (hẹp hơn).
- Component mới `app/components/HeFilter.tsx`: select hệ (đọc `/api/disciplines`, chấm màu `disciplineColorClasses`) + option "Tổng thể"; đổi lựa chọn → cập nhật URL (`history.replaceState`) + refetch. Dùng chung cho cả 4 trang, đặt cạnh các control sẵn có (vd cạnh select `days` của lookahead). Vùng chạm ≥40px, nhãn tiếng Việt.

### 2) Nav — chỉ sửa node `dash.tien-do` (append-only)

```ts
{
  id: "dash.tien-do",
  label: "Tiến độ",
  icon: CalendarRange,
  children: [
    { href: "/timeline",  label: "Timeline",                    icon: CalendarRange },
    { href: "/gantt",     label: "Gantt",                       icon: GanttChartSquare },
    { href: "/lookahead", label: "Lookahead",                   icon: CalendarClock },
    { href: "/scurve",    label: "S-Curve",                     icon: TrendingUp },      // MỚI (PR2)
    { href: "/schedule-control", label: "Đường găng & Chậm tiến độ", icon: AlertTriangle }, // MỚI (PR3)
  ],
},
```

- Link "Tổng quan" → `/hub/dash.tien-do` đã được `AppHeader` tự render cho node nhóm — không thêm tay.
- **Không** thêm lá "Báo cáo" vào đây (đã có `dash.bao-cao` → `/report` ở cụm "Tổng quan & Báo cáo"; 2 mục sidebar cùng href gây nhiễu breadcrumb/aria-current). Báo cáo xuất hiện trong **hub** (khối tổng thể + từng hệ) qua link kèm `?he=`.
- **Không** nhét 7 hệ × 5 view vào sidebar — bùng nổ node, ngược tinh thần M21 ("node cấp 4 chỉ khai khi trang hub cần render"). Ma trận theo hệ sống ở trang hub (mục 3).

### 3) Hub Tiến độ — `/hub/dash.tien-do` thành mặt tiền đúng mockup

`DashboardHub.tsx` thêm **section riêng khi `dashId === "dash.tien-do"`** (component con `TienDoHubSections` cùng file hoặc file cạnh đó — khuôn chung không đổi với các dashboard khác):

- **Khối 1 — "Kế hoạch & Báo cáo tổng thể"**: 5 card (Timeline, Gantt, Lookahead, Báo cáo ngày/tuần/tháng → `/report`, S-Curve → `/scurve`) — tái dùng `ChildCard`.
- **Khối 2 — "Tiến độ theo hệ"**: fetch `/api/disciplines` (đã trả kèm % tiến độ tổng), render **mỗi hệ 1 hàng**: chấm màu + tên hệ + progress bar % + 5 nút nhỏ `Timeline · Gantt · Lookahead · Báo cáo · S-Curve` đều kèm `?he=<code>`, và link tên hệ → hub hệ `/he/[code]` sẵn có. Danh sách **động theo DB** — dự án có Trắc đạc thì admin thêm hệ là hàng tự xuất hiện, đúng 7 hàng của mockup mà không hard-code.
- **Khối 3 — "Kiểm soát"**: card "Đường găng & Chậm tiến độ" → `/schedule-control`.
- Mobile: khối 2 đổ dọc (mỗi hệ 1 card, 5 nút cuộn ngang `.scrollbar-none`).

### 4) Lọc theo hệ trên 4 trang sẵn có (PR1)

- `GET /api/timeline?he=`, `GET /api/gantt?he=`, `GET /api/lookahead?days=&he=`: thêm điều kiện `st.discipline_id = ?` vào query sẵn có (điểm chạm nhỏ, giữ nguyên shape response).
  - Gantt: CPM tính **trên tập đã lọc** (đường găng nội bộ hệ) — chấp nhận, ghi chú tooltip "đường găng trong phạm vi lọc"; select sheet in-page hiện có **đồng bộ lên URL** luôn thể (`?sheet=`) để hub/link ngoài trỏ thẳng vào được.
- `GET /api/dashboard?he=` (nguồn của `/report`): KPI/bảng trễ lọc theo hệ; `/report` hiện tiêu đề "— Hệ <tên>" khi có lọc.
- 4 trang gắn `HeFilter` + đọc param lúc mount (các trang đều `'use client'`, đọc `window.location.search` như pattern sẵn có, tránh đổi sang server component).

### 5) Trang S-Curve `/scurve` (PR2)

- Trang mới bọc `SCurveChart` (đã có baseline selector + nút chốt baseline) + `HeFilter`.
- `GET /api/dashboard/scurve?he=`: mở rộng — `he` → lọc `st.discipline_id` (gộp mọi sheet thuộc hệ; logic nội suy/`task_history` giữ nguyên vì đã chạy trên danh sách task bất kỳ). Param `?sheet=` cũ giữ nguyên hành vi.
- `SCurveChart` nhận prop `he?` (nối vào query string như đang nối `sheet`/`baseline`).

### 6) Báo cáo ngày/tuần/tháng trên `/report` (PR3)

- Selector kỳ `?range=day|week|month` (mặc định `day` = hành vi hiện tại). `week`/`month`: thêm cột **Δ kỳ** cho KPI từng hệ — % đầu kỳ tái dựng từ `task_history` đúng cách `weekly-report` đang làm (tái dùng/trích hàm từ `lib/report.ts` thành hàm chung `progressAtDate(date, filter)` thay vì copy).
- Kết hợp được với `?he=`. Giữ sạch khi `window.print()`.
- **Không** thêm cron tháng (YAGNI — mockup chỉ cần *xem* báo cáo theo kỳ; cron ngày/tuần đã có).

### 7) Trang Kiểm soát Đường găng & Chậm tiến độ `/schedule-control` (PR3)

- `GET /api/schedule-control?he=` (route mới, auth + `force-dynamic` chuẩn): trả
  - `critical`: nhóm việc trên đường găng — tái dùng đúng dữ liệu + `computeCpm` như `/api/gantt` (trích phần dựng nodes/edges thành hàm chung trong `lib/` để 2 route không lặp), kèm `float` (độ trễ cho phép, ngày), % hiện tại, ngày BĐ/KT.
  - `delayed`: task `tre` (bảng + đếm theo `delay_reason` cho Pareto — tái dùng query panel Pareto của Dashboard).
- UI 2 panel: **Đường găng** (bảng: nhóm việc · float · %, hàng float ≈ 0 tô amber như Gantt, link sang `/gantt?sheet=`) và **Chậm tiến độ** (Pareto lý do bấm-để-lọc + bảng task trễ, như pattern Dashboard). `HeFilter` chung đầu trang. In được (print-friendly như `/report`).
- Mọi vai trò đăng nhập xem được (view thuần đọc — như `/gantt`).

## Schema

**Không đổi schema.** Mọi dữ liệu cần đã có: `disciplines` + `sheet_types.discipline_id`, `package_dependencies`, `task_history`, `tasks.delay_reason`. Không seed hệ "Trắc đạc" (danh mục động — xem Điểm cần quyết).

## API

| Route                                | Thay đổi | Quyền                | Ghi chú                                                                 |
| ------------------------------------ | -------- | -------------------- | ----------------------------------------------------------------------- |
| `GET /api/timeline?he=`              | mở rộng  | user đăng nhập (đã có) | Lọc `st.discipline_id`; shape response giữ nguyên                       |
| `GET /api/gantt?he=`                 | mở rộng  | như trên             | CPM trên tập đã lọc                                                      |
| `GET /api/lookahead?days=&he=`       | mở rộng  | như trên             |                                                                          |
| `GET /api/dashboard?he=`             | mở rộng  | như trên             | Nguồn `/report`; các chỗ gọi cũ không truyền `he` → nguyên hành vi       |
| `GET /api/dashboard/scurve?he=`      | mở rộng  | như trên             | `sheet` thắng nếu truyền cả hai                                          |
| `GET /api/schedule-control?he=`      | **mới**  | user đăng nhập       | `getCurrentUser()` + 401, `export const dynamic = "force-dynamic"`      |

## Test

- `tests/schedule-control.test.ts` (tích hợp, import `tests/setup.ts` đầu tiên, skip khi thiếu `TEST_DATABASE_URL`): seed 2 hệ × sheet × package/task + dependency — `?he=` lọc đúng (task hệ khác không lọt), `critical`/`float` khớp `computeCpm`, `delayed` đếm đúng theo `delay_reason`.
- Cập nhật test API sẵn có (lookahead/scurve nếu có): thêm case `he` không tồn tại → trả rỗng, không 500.
- Unit cho hàm chung `progressAtDate` (thuần, tái dựng % từ `task_history` — case: chưa có event, event trước/sau mốc).

## Chia PR

1. **PR1 — Lọc theo hệ**: param `he` cho `timeline/gantt/lookahead/dashboard/scurve` + `HeFilter.tsx` + 4 trang đọc URL (+ gantt đồng bộ `?sheet=` lên URL). Không node nav mới.
2. **PR2 — `/scurve` + hub Tiến độ**: trang `/scurve`, section `TienDoHubSections` trong `DashboardHub`, thêm lá "S-Curve" vào `dash.tien-do`.
3. **PR3 — `/schedule-control` + báo cáo theo kỳ**: route + trang mới, lá "Đường găng & Chậm tiến độ", `?range=` trên `/report` + hàm chung `progressAtDate` + test.

Mỗi PR tự đứng được (nav chỉ thêm lá khi trang thật đã có trong cùng PR — cây "sống" không trỏ 404). Uỷ thác: cả 3 PR đủ đặc tả để giao `coder`; PR1 phần thêm điều kiện SQL lặp 4 route có thể giao `mechanical` sau khi PR mẫu 1 route được duyệt.

## Điểm cần quyết & mặc định đã chọn

- **Không seed hệ "Trắc đạc"** — `disciplines` là danh mục động, dự án TT AVIO (MEP/ACMV) không có hạng mục trắc đạc; mockup mang tính tổng quát. Admin thêm hệ qua UI khi dự án cần → hub tự thêm hàng. (Nếu về sau muốn khớp mockup 100% cho demo: 1 dòng `INSERT ... ON CONFLICT DO NOTHING` là đủ, quyết lúc đó.)
- **Sidebar không lặp lá "Báo cáo"** trong `dash.tien-do` (đã có ở cụm Tổng quan & Báo cáo) — báo cáo theo hệ đi qua hub. Nếu người dùng thật phàn nàn khó tìm, cân nhắc dời hẳn node `dash.bao-cao` vào `dash.tien-do` ở đợt sau (đổi vị trí, không đổi URL).
- **Đường găng tính trong phạm vi lọc** (khi `?he=`) thay vì luôn toàn dự án — nhất quán "cái đang nhìn là cái đang tính"; toàn dự án = bỏ lọc.
- **Trang kiểm soát đặt tên `/schedule-control`** (1 trang gộp đường găng + chậm tiến độ đúng mockup) thay vì 2 trang riêng — dữ liệu liên quan chặt, PM xem cùng lúc.
- **`?range=` chỉ là view** trên `/report`, không sinh cron/email tháng mới (YAGNI).
