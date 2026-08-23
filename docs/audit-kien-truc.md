# Audit kiến trúc XBoss

> Đợt rà 2026-08-23. Số liệu đo bằng script, không ước lượng: đồ thị import toàn repo
> (`npm run check:dead-code`), `find`/`wc -l`, và grep có kiểm chứng từng ca.
> Tài liệu này bổ sung cho `docs/audit.md` (audit **nội dung**: bảo mật, nghiệp vụ, UI/UX)
> — ở đây chỉ nói về **cấu trúc code**.

## 1. Hiện trạng đo được

| Chỉ số                                 | Giá trị |
| -------------------------------------- | ------: |
| LOC TypeScript/TSX                     | 222.666 |
| Route API (`app/api/**/route.ts`)      |     498 |
| Nhóm API cấp 1 (`app/api/*/`)          |     121 |
| Page (`app/**/page.tsx`)               |     100 |
| Module trong `lib/` (file `.ts` phẳng) |     175 |
| Migration SQL                          |     131 |
| File test                              |     211 |
| File > 1000 LOC                        |      24 |
| File > 2000 LOC                        |       4 |

## 2. Những gì ĐANG tốt (không sửa)

Ghi lại để đợt sau đừng "cải tiến" nhầm vào chỗ đang lành:

- **Kỷ luật auth ở ranh giới API rất cao.** 480/498 route gọi `getCurrentUser()`.
  18 route còn lại đều đúng chủ đích và đã có cơ chế xác thực riêng: `/api/v1/*`
  (API key), webhook Zalo/Telegram, `/api/auth/*` (chính là chỗ cấp phiên), OIDC
  callback, `admin/traffic/ingest`. Không có route nào hở thật.
- **100% route có `export const dynamic = "force-dynamic"`** — không có ca nào bị
  Next.js cache nhầm dữ liệu động.
- **Quy ước theme gần như sạch**: chỉ 3 file `.tsx` còn dùng biến thể `dark:`,
  22 file còn hardcode hex. Trên 100 page thì đây là mức lệch nhỏ.
- **`any` ở mức thấp**: 99 lần xuất hiện trên 222k LOC (~0,04%).
- **Hạ tầng chất lượng đã có sẵn và thật**: CI với Postgres 16 service container,
  mutation test (`npm run test:mutation`), release gate cho test bị skip, cổng CI
  riêng cho `swExclude` và số migration, staging gate cho migration đụng dữ liệu, ADR.

Kết luận: đây **không** phải codebase thiếu kỷ luật. Nợ của nó là nợ **quy mô** —
các quy ước đúng nhưng không còn ranh giới nào chia 222k LOC thành phần hiểu được.

## 3. Code chết — nhỏ hơn nhiều so với cảm nhận

Đồ thị import toàn repo (1199 file, duyệt từ entrypoint thật của Next.js) cho:

- **File không ai với tới được: 2.** Không phải hàng chục như grep thô gợi ý —
  grep theo tên file bỏ sót import tương đối `./x`, dẫn tới báo động giả.
  - `lib/engineering-spatial-routing.ts` (132 LOC) — đã bị `engineering-generative-routing.ts`
    - `engineering-bim-cad.ts` thay thế. **Đã xoá** trong đợt này.
  - `app/components/MaskedValue.tsx` — **KHÔNG xoá**. Đây là nửa UI của M50 PR2
    (che trường tiền theo quyền): backend đã ship (`lib/sensitive-fields.ts`, 8 route
    dùng `stripSensitive`) nhưng chưa page nào gắn component. Đây là **tính năng dở dang,
    không phải rác** — xoá đi là mất cách hiển thị `•••` đúng a11y. Đã ghi vào
    `scripts/dead-code-allowlist.json` kèm lý do.
- **Export không ai dùng ngoài file khai báo: 549**, trong đó chỉ **77** là thân code
  chết hẳn (không dùng cả trong chính file). 45 trong số đó là hằng/map nhãn tiếng Việt
  (`*_LABEL`, `*_STATUSES`) — chúng là **nguồn nhãn chuẩn** của từng miền; UI hiện đang
  lặp lại nhãn tại chỗ thay vì import. Đó là lỗi **trùng lặp**, xoá map đi thì sửa nhầm
  hướng. 23 còn lại là hàm, và nhiều cái là tính năng chưa gắn dây chứ không phải rác:
  `generateSignerOtp` (ký số), `reclaimStaleTasks` (hàng đợi), `daysSinceLastIncident` (HSE).

**Vì vậy cổng CI mới chỉ đỏ với file unreachable, và chỉ cảnh báo với export chết** —
quyết định xoá tính năng dở dang phải là của người, không để CI ép.

## 4. Nợ cấu trúc thật sự

### 4.1 `lib/` phẳng 175 module — không còn ranh giới miền

`ls lib/` không cho ai biết hệ thống gồm những gì. Không có quy tắc hướng phụ thuộc,
nên bất kỳ module nào cũng import được bất kỳ module nào; không có gì ngăn `lib/auth.ts`
một ngày nào đó phụ thuộc ngược vào một module nghiệp vụ. Riêng cụm `engineering-*` đã
là 70 file / 24.665 LOC nằm chung một mặt phẳng với `date.ts` và `money.ts`.

### 4.2 File khổng lồ

24 file > 1000 LOC, 4 file > 2000. Nặng nhất: `TrackingGrid.tsx` (94KB),
`mepf-process/page.tsx` (90KB), `engineering/mepf-lifecycle/page.tsx` (88KB),
`lib/engineering-pipe-spooling-qto.ts` (69KB). Ở kích thước này không review được diff,
không test được từng phần, và mọi thay đổi đều có bán kính ảnh hưởng không đoán nổi.

### 4.3 Không có tầng service

Page là `'use client'` gọi thẳng `/api/*`; route handler chứa luôn nghiệp vụ. Hệ quả:
logic nghiệp vụ chỉ test được qua HTTP + DB thật, nên bộ test tích hợp phình ra và
chậm (đợt tối ưu vừa rồi kéo từ ~30 phút xuống 1 phút 53 giây — nhưng nguyên nhân gốc
là thiếu lớp thuần để test đơn vị vẫn còn đó).

## 5. Lộ trình

| Đợt | Nội dung                                      | Rủi ro | Trạng thái |
| --- | --------------------------------------------- | ------ | ---------- |
| 1   | Xoá code chết + cổng CI `check:dead-code`     | Thấp   | Xong       |
| 2   | Tái tổ chức `lib/` theo miền + lint ranh giới | Thấp\* | Đang làm   |
| 3   | Tách tầng service khỏi route/page             | Cao    | Làm mẫu    |
| 4   | Chẻ nhỏ file > 1000 LOC                       | Vừa    | Chưa mở    |

\* Đợt 2 rủi ro _logic_ thấp (chỉ đổi vị trí file + đường import, không đổi hành vi)
nhưng diff rất rộng — phải verify bằng lint + typecheck + build + toàn bộ test.
