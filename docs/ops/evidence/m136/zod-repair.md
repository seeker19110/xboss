# PR #676 — bản vá Zod phát sinh khi kiểm CI

Ngày 24/10/2026 (UTC+7), CI HEAD `653714b3` thất bại tại audit production, không phải
lỗi registry: cả sáu lần đều báo cùng advisory mức high. Kiểm local tái hiện đúng một
vulnerability ở Zod đã khóa `4.6.5`.

[GitHub Reviewed Advisory GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
cập nhật 23/10 ghi affected `<4.6.6`, patched `4.6.6`: nguy cơ tiêu thụ bộ nhớ khi validate
collection quá lớn. Không kết luận đã có khai thác trên XBoss từ kết quả audit package.

## Phạm vi sửa được tự duyệt D-002

`package.json` pin Zod `4.6.6`; lock chỉ đổi range gốc và version/resolved/integrity của Zod.
Không đổi dependency khác, app/route/schema, auth, CI hoặc ngưỡng kiểm tra. Metadata npm
registry xác nhận bản và integrity; không dùng `npm audit fix` để nâng hàng loạt.
Đây là bổ sung sau M136; bản #675 trên production chưa có bản vá này.

Zod được dùng tại env, engineering kernel/workflow/intel/agents và route agent claims.
Vì có array/object/record schemas, kiểm env riêng chưa đủ; phải kiểm cả engineering trên
PostgreSQL disposable và chạy CI đầy đủ trên HEAD sửa Zod.

## Kiểm chứng

- Trước vá: `npm audit --omit=dev --audit-level=high` exit 1, một high ở Zod.
- Sau vá: cùng audit exit 0, `found 0 vulnerabilities`.
- `tests/env.test.ts`: 11 pass, 0 fail, 0 skip.
- Production build với cấu hình DB test: exit 0; không kết nối DB/secret production.
- Năm file engineering workflow/intel/agents/ingest và API-key write-org: 55 pass, 0 fail,
  0 skip trên PostgreSQL 16 disposable mới, 171 migration; kiểm cả validation/claims/cross-org.
  Cả test và fixture giữ nguyên, không thêm skip hoặc sửa assertion.
- `npm run gate` sau vá: 18/18 đạt. Final verify và CI: xem kết quả cuối ở
  [PR #676](https://github.com/seeker19110/xboss/pull/676); không dùng CI của HEAD trước vá.

Reviewer độc lập kiểm package diff: 0 P1/P2; yêu cầu phủ thêm engineering đã được đưa vào
verification. Không merge khi CI đỏ. Merge/phát hành theo L1; F4 còn mở tới khi có bằng
chứng deploy và kiểm tra sau deploy. Nếu phải trả dependency cũ vì lỗi tương thích thì giữ
NO-GO đến khi có bản vá phù hợp, không bỏ qua audit để phát hành.
