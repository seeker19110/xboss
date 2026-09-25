# Việc nhỏ độc lập — bỏ lượt tổng hợp chi phí bị lặp

State: **Approved for implementation**, 2026-09-25.
Căn cứ: QUALITY-FINAL-1 và lệnh triển khai song song việc nhỏ của chủ dự án.
Baseline: 381b06899b3eb5d9e1b2c99b167d51cc24419732.

## Phạm vi và contract

Đã đọc toàn bộ lib/tai-chinh/cost.ts, app/api/costs/route.ts và test chi phí hiện hữu.
Route nhóm system gọi costSummary, rồi costTotals gọi lại cùng costSummary(system).
Thêm tham số tùy chọn server-only systemRows cho costTotals; route truyền kết quả vừa đọc
khi groupBy=system và giữ cùng includeVo/projectId trong chính request. Không nhận rows từ
client, không cache liên request, không sửa input. Mảng rỗng hợp lệ không gây đọc lại.

Nhóm floor vẫn lấy tổng dự án theo system, không thay bằng tổng proxy hợp đồng tầng.
Caller cũ hai tham số giữ nguyên hành vi; cộng bigint qua helper tiền cũ giữ nguyên.
Không đổi SQL, JSON, auth/CAN/scope, cảnh báo, no-store hoặc chính sách BOQ/PO/advance.

File locks: cost.ts, route costs, tests/audit-cost-query-reuse.test.ts và tài liệu này.
Không sửa money.ts, DB layer, schema, permissions hoặc file của nhánh auth/DR/cache.

## Acceptance và bằng chứng

Trong fixture source thật với DB/Next/money boundary được stub: nhóm hệ còn 6 query
(5 dữ liệu + 1 settings), thay vì 11; nhóm tầng vẫn 7. Đây là số lời gọi trong test, không
phải benchmark độ trễ production. Auth thiếu/scope sai/quyền cấm không được query chi phí.
Nhóm floor vẫn trả tổng dự án đúng nghĩa; includeVo=0 được truyền; caller cũ và empty rows
được kiểm riêng. Không dùng test stub này làm bằng chứng tính tiền exact hoặc RLS thật.

9 ca cục bộ đạt; mutation bỏ tái sử dụng rows bị phát hiện. Chạy suite đồng thời auth và DR
trong process riêng: tổng 30 ca đạt, không skip. Local Node 22 + TypeScript loader/VM, không
có PostgreSQL/full dependencies. Full CI Node 24 và test chi phí PostgreSQL hiện hữu phải
qua trên HEAD mới trước merge; không giảm gate hoặc sửa expected để che sai nghiệp vụ.

## Rollout, rollback và việc còn lại

Không thay schema/dữ liệu thật. Rollback hẹp có thể bỏ optional argument và phục hồi lượt
đọc lặp, không đổi tiền lịch sử. Trước merge review diff đảm bảo không đổi câu SQL nguồn.

Chưa đóng A3/A4: direct payment lineage, unassigned, decimal-string DTO, float quantity,
canonical aggregate và snapshot nhất quán giữa mọi phép đọc vẫn thuộc S10/S11. Không coi
Promise.all hoặc tái sử dụng rows này là REPEATABLE READ. Không tuyên bố báo cáo đã đối soát
đầy đủ từ bản tối ưu hẹp; không merge/deploy production trong PR.
