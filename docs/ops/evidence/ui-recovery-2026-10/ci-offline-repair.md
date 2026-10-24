# Hồi quy phát hiện trong CI PR #680

CI đầu 40062755551 trên `79be9544` phát hiện một ca legacy trên mỗi desktop/mobile,
`e2e/authed/offline-idb-abort.spec.ts:170`. Cùng thông báo OFFLINE_SAVE_ERROR được hiển thị
ở role=alert trong form và toast, làm assertion getByText xác định hai phần tử.
Job 120779575051 (2/4) và 120779575015 (4/4) đều fail cùng lỗi qua hai retry; không coi retry
là kết quả đạt. Các nhánh 1/4, 3/4, static, build và coverage đã đạt trong lượt đó.

Sửa `251ec883`: chỉ bỏ một lệnh showToast lỗi trong reportError của DiaryEditorModal.
Lỗi vẫn hiện bền vững ngay trong form, không hiển thị trùng. Không đổi assertion/test cũ,
ngưỡng, timeout hoặc thêm skip. Toast success, queued offline, compare và khóa sổ giữ nguyên.
API/body/If-Match/If-None-Match/412, receipt/idempotency và cơ chế ghi IDB không đổi.
Review độc lập xác nhận lỗi queue vẫn giữ nội dung, modal mở, nút lưu được mở lại và op IDB=0.

Build mới ID `QTpB20JxOWhybrez898ap` (content `251ec883`), format/lint đạt; đã kiểm lại
bộ **33 pass/0 fail/0 flaky/0 skip**, retries=0, gồm các ca gồm nhật ký, pending, offline recovery/IDB abort và xung đột/mất ACK cả desktop/mobile.
Kết quả CI mới sẽ đối soát ở mục Kết quả phát hành của PR; chưa merge/deploy lượt CI đỏ.
