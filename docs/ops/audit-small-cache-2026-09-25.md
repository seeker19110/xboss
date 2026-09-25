# S04 — Chặn cache dữ liệu riêng tư trước vault

Yêu cầu thi hành việc nhỏ song song ngày 2026-09-25; QUALITY-FINAL-1 ở PR #531 head 30de3cd.
Base code main 8336918. Nhánh này độc lập tiền/IDB; không sửa queue, auth, schema hoặc membership.

## Kiểm kê và phạm vi

Đã đọc public/sw.js, scripts/check-sw-exclude.ts, app/offline/page.tsx và contract S04.
File locks: ba file này, tests/audit-sw-network-only.test.ts và tài liệu này.
Registry module vẫn giữ nguyên; gate mới đọc MODULES ở CI để kiểm mọi swExclude thực tế.
Chỉ sửa cache runtime, không tuyên bố S00 route/caller toàn repository đã hoàn thành.

## Chính sách mới

Mọi API kể cả API tương lai và request Authorization luôn network-only, cache no-store.
Không cache HTML cá nhân hóa, RSC, export, URL query/đường ký hoặc response lỗi.
Chỉ shell vô danh và static assets không query được cache; tải chúng không gửi credentials,
không theo redirect và không lưu MIME HTML lỗi thay chunk JS. Response private/no-store bị loại.
401/403/409/5xx từ server giữ nguyên; chỉ navigation lỗi mạng mới dùng shell /offline vô danh.

Namespace mới xboss-public-v20. Activate/clear chỉ dọn các namespace xboss-vN/xboss-public-vN;
không xóa cache ứng dụng khác. Generation và thứ tự put/purge chặn response muộn ghi cache lại;
ACK qua MessagePort chỉ sau purge thành công. Không đụng IndexedDB hoặc tự xóa bản nháp.
Push/click/background-sync chuyển tín hiệu giữ nguyên; SW không tự phát lại queue.

## Đánh đổi rollout bắt buộc thông báo

Đây là bước chặn rò cache trước S05–S08: không còn khả năng mở lại trang tracking từ cache
API/HTML cũ khi hoàn toàn offline. Shell công khai vẫn hoạt động khi đã precache được.
Vault tracking offline, đổi context mọi tab và phục hồi draft mã hóa chưa được triển khai.
Trang đang mở có state React riêng và queue cũ vẫn thuộc các slice sau; không gọi S04 là đã
sửa toàn bộ rò dữ liệu phía client. Chưa triển khai production.

## Kiểm chứng

21 test chạy handler SW thật trong VM với Cache Storage/fetch mô phỏng: tất cả đạt cục bộ,
kể cả response cũ và put đang bay khi purge. Suite đã chạy đồng thời money/IDB bằng process
riêng; mutation bỏ generation guard bị phát hiện, đã khôi phục. Đây không thay Safari/E2E thật.
Gate check:sw-exclude nay kiểm hành vi với mỗi path registry, 401 và mất mạng; không bỏ gate
hoặc duy trì danh sách giả chỉ để grep xanh. CI đúng HEAD còn phải kiểm toàn bộ app/E2E.

Rollback không được quay về private cache v19; sửa tiến hoặc network-only an toàn.
Không thay schema/dữ liệu thật, không merge/deploy. Kết quả CI sau commit được ghi tại PR.
