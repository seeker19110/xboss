# Nhật ký quyết định tự duyệt

> Ghi bởi `xt.py loop decide`. Phiên chính tự duyệt điểm quyết định theo tiêu chí chất lượng cuối (`LOOP-STOP-018`, ADR-0008 của khung). Người xem lại bất cứ lúc nào; đổi ý → quyết định mới ghi "thay D-NNN", không sửa mục cũ.

### D-001 · 2026-10-21T20:33:50+00:00 · Duyệt PLAN A5-AC03 browser concurrency sau doctor

- Phương án: (1) Bốn ca browser thật có barrier DB và regression mất ACK, giữ toàn bộ acceptance và P/H · (2) Chỉ thêm Promise.all hoặc lấy P/H thay lớp browser còn thiếu
- Chọn: Bốn ca browser thật có barrier DB và regression mất ACK, giữ toàn bộ acceptance và P/H
- Lý do (tiêu chí chất lượng cuối): Cách chặt hơn chứng minh overlap thật, effect/history và approval_source, dữ liệu cô lập; không thay app/guard/quyền hoặc miễn acceptance. Sáu MUST của slice, stack có sẵn, 28 vòng/40000 token/3600 giây mỗi gate/6 giờ.
- Đường lùi: Đóng PR slice hoặc revert commit test/docs, không ảnh hưởng production; giữ A5-AC03 PARTIAL nếu thiếu bằng chứng

### D-002 · 2026-10-21T20:43:53+00:00 · Replay batch online có cần bất biến dấu thời gian/người tick không?

- Phương án: (1) Giữ contract M120 đóng dấu mỗi request; kiểm flags/progress/status/history không nhân effect, còn replay cùng key dùng receipt mất ACK · (2) Đòi timestamp/người tick online bất biến dù contract hiện hữu chủ đích ghi lại
- Chọn: Giữ contract M120 đóng dấu mỗi request; kiểm flags/progress/status/history không nhân effect, còn replay cùng key dùng receipt mất ACK
- Lý do (tiêu chí chất lượng cuối): Không sửa nghĩa nghiệp vụ hoặc miễn AC03: online thao tác mới có dấu vết riêng, state/history không nhân; offline retry cùng operationId phải dedup receipt và hiệu ứng bằng ca server thật có sẵn.
- Đường lùi: Nếu spec đổi sang idempotency cho mọi tick online thì tạo slice app/spec riêng, giữ test hiện tại đến khi có contract mới

### D-003 · 2026-10-21T20:48:28+00:00 · Có ép cả hai thứ tự thắng của approve-vs-untick không?

- Phương án: (1) Hai ca fixture riêng: probe action đầu đã chờ khóa rồi khởi động action sau, chứng minh cả hai cùng chờ trước release · (2) Chỉ chấp nhận một kết quả hợp lệ từ race ngẫu nhiên mỗi lần chạy
- Chọn: Hai ca fixture riêng: probe action đầu đã chờ khóa rồi khởi động action sau, chứng minh cả hai cùng chờ trước release
- Lý do (tiêu chí chất lượng cuối): Review không có P1/P2 nhưng chỉ một lịch chạy chưa thực thi nhánh còn lại. Hai thứ tự có proof arrival DB và exact status pairs cho coverage đầy đủ hơn, không dùng sleep hoặc đổi app/guard.
- Đường lùi: Giữ invariant race ban đầu nhưng công khai nhánh chưa thực thi và giữ acceptance PARTIAL nếu thiếu bằng chứng

### D-004 · 2026-10-21T20:57:06+00:00 · Điều chỉnh dự toán token sau khi bổ sung hai lịch race và proof CI?

- Phương án: (1) Tăng dự toán mềm slice từ40000 lên60000 token, giữ nguyên deadline6h/trần28 vòng/evidence đã chạy · (2) Giữ dự toán ban đầu dù đã bổ sung coverage/proof và còn final verify/CI
- Chọn: Tăng dự toán mềm slice từ40000 lên60000 token, giữ nguyên deadline6h/trần28 vòng/evidence đã chạy
- Lý do (tiêu chí chất lượng cuối): Người dùng không đặt giới hạn token; hai lịch ép riêng, lưu proof thành công và kiểm grammar đủ6 MUST cần thêm review/verification. Ưu tiên hoàn tất phần đã nhận, không reset clock/counters hoặc bỏ gate.
- Đường lùi: Nếu người dùng đặt budget thấp hơn thì checkpoint theo giới hạn mới; không thay evidence hoặc deadline

### D-005 · 2026-10-21T21:02:13+00:00 · Ép thứ tự race sau flake của final verify thế nào?

- Phương án: (1) Chỉ khóa taskA chung, xác nhận cùng snapshot firstPID còn chờ locker và secondPID xếp sau firstPID trước release · (2) Giữ khóa nhiều task và suy thứ tự thắng chỉ từ thời điểm waiter đầu xuất hiện
- Chọn: Chỉ khóa taskA chung, xác nhận cùng snapshot firstPID còn chờ locker và secondPID xếp sau firstPID trước release
- Lý do (tiêu chí chất lượng cuối): Final verify26c25256 bắt untick-first mobile nhận200/409 thay422/200; JSON cho thấy hai waiter độc lập cùng chờ locker. First arrival không đủ khi đang giữ nhiều dòng. Cạnh hàng đợi trên cùng dòng chứng minh thứ tự serialize; giữ exact assertions và hai lịch, cần chạy lặp desktop/mobile.
- Đường lùi: Giữ acceptance thứ tự race mở/PARTIAL nếu không chứng minh được cạnh khóa; không đổi oracle hoặc claim cả hai lịch đã được ép

### D-006 · 2026-10-21T21:17:36+00:00 · Tích hợp hai PR sau khi người dùng xác nhận thế nào?

- Phương án: (1) Merge664 theo head đã xanh, restack665 vào main bằng merge thường, giải docs, kiểm lại đủ Gate/CI trên head mới rồi merge665 · (2) Giữ cả hai PR chờ xác nhận mới dù người dùng đã cho phép cả hai
- Chọn: Merge664 theo head đã xanh, restack665 vào main bằng merge thường, giải docs, kiểm lại đủ Gate/CI trên head mới rồi merge665
- Lý do (tiêu chí chất lượng cuối): Người dùng chọn Cho phép merge cả hai ngày22/10/2026. #664 đã squash merge8fc15d89 từa81d7d9a sau11 Gate stable vàCIxanh. #665 có7 Gate stable vàCIxanh tại9f584b19; đổi base vàmerge main tạo HEAD mới cần verify/CI mới. Chỉhai docs status conflict; giữ toàn bộ source đã review và evidence A5, cập nhật receipt664.
- Đường lùi: Dừng merge665 nếu Gate/CI đỏ hoặc có thay đổi source ngoài scope; không hạ policy hoặc bỏ assertion
