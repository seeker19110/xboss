# M35 — Thiết kế & Biện pháp thi công (đóng nốt node coming-soon cuối cùng)

**Đợt: dọn nợ kỹ thuật sau FastCons đợt 4 (M32/M33/M34) · Phụ thuộc: M08 (đã xong) · Phức tạp: Rất thấp**

## Mục tiêu

Node sidebar `dash.thiet-ke-bptc` ("Thiết kế & Biện pháp thi công", nhóm "Thiết kế & Bản vẽ") là node coming-soon **cuối cùng** còn sót lại trong toàn bộ cây điều hướng sau khi M32/M33/M34 gán href thật cho các node còn lại. Comment sẵn trong `app/lib/dashboardTree.ts` ghi rõ `// M08 mở rộng`.

## Hiện trạng — không cần module mới

Đọc lại `docs/nang-cap/M08-ban-ve.md` + `app/drawings/page.tsx` + `lib/drawings.ts`/`lib/qaqc.ts` xác nhận **"Biện pháp thi công" đã được code đầy đủ từ M08**, không phải tính năng còn thiếu:

- Schema: `drawings.kind` đã có giá trị `'method'` (cùng bảng với shop/asbuilt/bim), không cần bảng/cột mới.
- API: `GET /api/drawings?kind=method` lọc được ngay (`lib/drawings.ts::listDrawings`, tham số `kind` có sẵn).
- UI: `app/drawings/page.tsx` đã có chip lọc theo `kind` (biến `kindFilter`, khởi tạo `"all"`) hiển thị đúng nhãn "Biện pháp thi công" + icon `HardHat`.
- Gate nghiệm thu: `lib/qaqc.ts` (dòng ~99-113) đã chặn tick hold-point khi chưa có `drawing.kind='method'` `approved` cho work package đó.

**Việc thật sự còn thiếu chỉ là 1 điểm nối UX**: `kindFilter` hiện là state cục bộ, không đọc từ URL — nên sidebar không thể trỏ thẳng vào đúng tab đã lọc `method`. Không có gì khác cần xây mới (đúng nguyên tắc "đọc trước khi sửa, tái dùng trước khi viết mới" / KISS / YAGNI trong `CLAUDE.md`).

## Thay đổi

1. `app/drawings/page.tsx`: đọc query string `?kind=` lúc mount (pattern `useSearchParams` đã dùng ở `app/payment-certs/page.tsx`, cần bọc `<Suspense>` quanh component chính vì Next App Router yêu cầu) để khởi tạo `kindFilter` — cho phép deep-link `/drawings?kind=method` mở đúng thẳng danh sách "Biện pháp thi công" đã lọc sẵn, không phải tự bấm chip.
2. `app/lib/dashboardTree.ts`: gán `href: "/drawings?kind=method"` cho `dash.thiet-ke-bptc` — đóng nốt node coming-soon cuối cùng.
3. `e2e/authed/appshell.spec.ts`: test "dashboard mockup chưa có trang hiện mờ + badge 'Sắp có'" mất mẫu vì hết node coming-soon lá — đổi hướng test sang xác nhận node vừa gán href hoạt động đúng (link thật, điều hướng tới `/drawings?kind=method`, danh sách lọc đúng `kind=method`); giữ lại đoạn code hiển thị coming-soon trong `AppHeader.tsx` không đổi (vẫn cần cho module coming-soon tương lai nếu có), chỉ không còn dữ liệu mẫu để test qua sidebar thật — ghi rõ trong comment.

## Không làm (ngoài phạm vi, tránh over-engineer)

- Không thêm bảng/route mới — mọi nghiệp vụ "biện pháp thi công" đã có ở M08.
- Không tách trang riêng `/method-statements` — giữ nguyên trong hub `/drawings` theo đúng quyết định gốc của M08 ("biện pháp thi công dùng chung luồng" với drawing register).

## Test

- `e2e/authed/appshell.spec.ts`: sửa test coming-soon → test node "Thiết kế & Biện pháp thi công" là link thật, trỏ đúng `/drawings?kind=method`.
- `e2e/authed/drawings.spec.ts` (nếu có): thêm case mở `/drawings?kind=method` trực tiếp → chip "Biện pháp thi công" active sẵn, danh sách chỉ gồm `kind=method` (không cần bấm tay).

## Chia PR

1 PR duy nhất (thay đổi nhỏ, không đổi schema).
