# Acceptance của slice A4-AC06

Nguồn: QUALITY-FINAL-1, A4-REPORTING §5 / TEST-MATRIX A4-AC06, Approved 25/09/2026.
Chỉ là tiêu chí của slice kiểm chứng browser; blueprint toàn sản phẩm ở `../../BLUEPRINT.md` còn mở, không được coi là đã nghiệm thu.

- [ ] `A4-BROWSER-001` **MUST** List, KPI và filter dùng cùng org/visibility/status trong browser với API và DB thật; dự án không được gán hoặc sai org không lọt vào list/KPI.
- [ ] `A4-BROWSER-002` **MUST** Hai sheet có cùng code và tầng nhưng khóa hợp lệ khác nhau vẫn là hai dòng; mở từng drilldown cho đúng tiền và không trỏ chứng từ tổ chức khác.
- [ ] `A4-BROWSER-003` **MUST** Engineer/subcon/viewer/cdt có phiên và membership thật nhận 403 ở system/floor/export query; body chỉ lỗi, không tiền/rows/totals/alerts/metadata; DOM không có bảng hoặc drilldown tài chính.
- [ ] `A4-BROWSER-004` **MUST** Desktop/mobile xanh không mock báo cáo; oracle miền, typecheck, build và gate liên quan xanh; reviewer kiểm diff; export chi phí chưa có nên không tạo exporter mới.
