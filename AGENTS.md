# AGENTS.md — XBoss

## Nguồn sự thật

Đọc `CLAUDE.md` trước mọi thay đổi. Với việc liên quan tính năng/kiến trúc, đọc thêm
`PROJECT.md`, `spec.md`, `PROGRESS.md`, ADR và đặc tả `docs/nang-cap/*` liên quan.
`docs/audit.md` là cổng review bắt buộc cho vùng rủi ro cao.

## Quy tắc làm việc

- Node.js 24 trong CI; npm theo `package-lock.json`; Next.js App Router + TypeScript strict.
- PostgreSQL raw SQL; không thêm ORM/Supabase SDK. Migration `migrations/000N_*.sql` append-only.
- API là ranh giới bảo mật: auth, permission, project/org scope, validation và parameterized SQL.
- Bảo vệ dữ liệu tiến độ, nghiệm thu, BOQ, chi phí, hợp đồng, payment và audit trail.
- Không dùng production DB/secret hoặc provider trả phí trong test.
- Không push thẳng `main`, merge, deploy hoặc sửa production nếu chưa được người dùng cấp quyền.

## Feature gate

Mọi capability mới phải đi qua Research → Spec → Approval trước implementation. Spec dùng
`docs/nang-cap/SPEC-TEMPLATE.md` hoặc file M/G hiện hữu có đủ trường tương đương. Không code khi
spec chưa ghi **Approved for implementation**, người duyệt và ngày duyệt.

## Vòng lặp mục tiêu lớn

Khi mục tiêu cần nhiều PR, làm theo `docs/AI_DELIVERY_LOOP.md` và tạo
`docs/goals/<goal-id>.md` từ template. Mỗi vòng:

1. reload/reconcile trạng thái thật từ `main`;
2. chọn một slice Ready nhỏ nhất có thể kiểm chứng;
3. implement, verify và mở một PR;
4. sau merge, cập nhật bằng chứng/khoảng cách mục tiêu rồi lặp;
5. kết thúc chỉ khi Goal DoD qua final audit, hoặc checkpoint WAITING/BLOCKED.

Không lặp vô hạn: cùng một failure tối đa ba repair attempts. Không làm gate xanh bằng cách skip
test, hạ threshold, nới auth/validation hoặc che lỗi.

## Phối hợp subagent song song

- Chỉ tách song song các việc thực sự độc lập; đọc, khảo sát và phân tích độc lập có thể chạy song
  song rộng hơn, nhưng số subagent không vượt số luồng công việc hữu ích.
- Trước khi giao việc, chốt interface/contract dùng chung và khai báo rõ phạm vi cùng tập file được
  phép sửa của từng subagent. Không giao hai subagent sửa cùng file hoặc cùng generated artifact.
- Chạy tuần tự mọi thay đổi vào dependency dùng chung, schema/migration, lockfile, cấu hình sinh mã
  hoặc phần có thứ tự phụ thuộc; chỉ mở lại song song sau khi contract nền đã ổn định.
- Mỗi subagent phải báo file đã đổi, checks đã chạy, kết quả và rủi ro/còn thiếu. Agent chính review
  toàn bộ diff, tích hợp, xử lý xung đột rồi chạy đầy đủ lint, typecheck, test và build liên quan.

## Verification

Chạy targeted checks trước, sau đó gate liên quan:

```bash
npm run lint
npm run typecheck
npm run check:sw-exclude
npm run check:migrations
npm test -- --release-gate
npm run build
npm run test:e2e
```

Test DB dùng PostgreSQL disposable. Thay đổi migration phải kiểm số thứ tự, chạy mới/chạy lặp,
ERD, verify query, rollout tương thích ngược và recovery.
