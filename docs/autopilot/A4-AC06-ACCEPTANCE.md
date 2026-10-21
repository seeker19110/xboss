# Acceptance của slice A4-AC06

Nguồn: QUALITY-FINAL-1, A4-REPORTING §5 / TEST-MATRIX A4-AC06, Approved 25/09/2026.
Chỉ là tiêu chí của slice kiểm chứng browser; blueprint toàn sản phẩm ở `../../BLUEPRINT.md` còn mở, không được coi là đã nghiệm thu.

- [x] `A4-BROWSER-001` **MUST** List, KPI và filter dùng cùng org/visibility/status trong browser với API và DB thật; dự án không được gán hoặc sai org không lọt vào list/KPI.
- [x] `A4-BROWSER-002` **MUST** Hai sheet có cùng code và tầng nhưng khóa hợp lệ khác nhau vẫn là hai dòng; mở từng drilldown cho đúng tiền và không trỏ chứng từ tổ chức khác.
- [x] `A4-BROWSER-003` **MUST** Engineer/subcon/viewer/cdt có phiên và membership thật nhận 403 ở system/floor/export query; body chỉ lỗi, không tiền/rows/totals/alerts/metadata; DOM không có bảng hoặc drilldown tài chính.
- [x] `A4-BROWSER-004` **MUST** Desktop/mobile xanh không mock báo cáo; oracle miền, typecheck, build và gate liên quan xanh; reviewer kiểm diff; export chi phí chưa có nên không tạo exporter mới.

## Bằng chứng

- Browser: `e2e/authed/a4-ac06-report-scope.spec.ts`, fixture `e2e/helpers/a4-report-fixtures.ts`; sáu ca × desktop/mobile = 12 lượt, thêm một setup, **13/13 pass**, không skip. Chạy `npm run test:e2e -- e2e/authed/a4-ac06-report-scope.spec.ts --workers=2` với PostgreSQL 16 disposable, Chromium production và cookie/session thật. Không route mock.
- 001: ba status có cùng tập project và KPI; project cùng org không gán bị loại; grant `user_projects` sai org vẫn không vượt boundary; query org khác không lộ dữ liệu.
- 002: hai sheet trùng code/T1 có ID riêng; mỗi dialog có đúng tiền canonical/display. Theo link thật sang `/payments`, bắt response GET `/api/payments/bills` do trang đích phát, kiểm đúng hai bill IDs, amount, sheet/tầng; không có sentinel org khác. Chọn project org khác bị 403 và không đổi cookie/báo cáo.
- 003: bốn role có membership thật, mỗi role kiểm system/floor/export query; so sánh nguyên body với lỗi cố định an toàn. DOM không có bảng hoặc nút drilldown tài chính, nhãn/số tiền fixture.
- P/H: `npm run test:single -- --experimental-test-module-mocks --test-concurrency=1 tests/cost-report.test.ts tests/portfolio-kpi.test.ts` trên PostgreSQL riêng: **18/18 pass**, 0 skip. Typecheck, production build và **18/18 cổng tĩnh** xanh.
- Reviewer độc lập khác model đọc diff; hai finding về đích chứng từ và nội dung lỗi 403 đã được sửa rồi review lại, không còn finding actionable. Đây là review tự động; merge PR vẫn chờ người theo L1.
- Evidence runtime do `xt.py loop record` sinh ở `.autopilot/evidence/`; kiểm lại cây cuối bằng `loop verify`. PR/CI là bằng chứng chia sẻ theo HEAD; không dùng thư mục runtime ignored thay cho CI.

Phạm vi này không audit các AC khác, không xác nhận lớp M/O hoặc deploy production. Costs chưa có exporter; query export chỉ chứng minh không bypass 403, không chứng nhận exporter chưa tồn tại.
