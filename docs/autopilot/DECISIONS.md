# Nhật ký quyết định tự duyệt

> Ghi bởi `xt.py loop decide`. Phiên chính tự duyệt điểm quyết định theo tiêu chí chất lượng cuối (`LOOP-STOP-018`, ADR-0008 của khung). Người xem lại bất cứ lúc nào; đổi ý → quyết định mới ghi "thay D-NNN", không sửa mục cũ.

### D-001 · 2026-10-21T19:45:24+00:00 · Chọn lát đầu sau khi merge toàn bộ PR

- Phương án: (1) Đóng bằng chứng browser A4-AC06 trên API/DB thật theo QUALITY-FINAL-1 · (2) Mở rộng ngay sang toàn bộ capability và audit production
- Chọn: Đóng bằng chứng browser A4-AC06 trên API/DB thật theo QUALITY-FINAL-1
- Lý do (tiêu chí chất lượng cuối): Spec đã duyệt, khoảng trống lớp B có bằng chứng; slice kiểm chứng nhỏ, không đổi API/schema/auth/tiền hoặc dữ liệu thật.
- Đường lùi: Revert PR test/docs; main và dữ liệu nghiệp vụ không đổi.

### D-002 · 2026-10-21T19:45:24+00:00 · Tách tiêu chí của slice browser khỏi nghiệm thu toàn sản phẩm brownfield

- Phương án: (1) Giữ blueprint sản phẩm L mở và dùng đủ A4-AC06 làm acceptance của loop này · (2) Coi hơn một nghìn MUST toàn sản phẩm là đã qua chỉ nhờ CI cũ
- Chọn: Giữ blueprint sản phẩm L mở và dùng đủ A4-AC06 làm acceptance của loop này
- Lý do (tiêu chí chất lượng cuối): 1152 MUST và 639 SHOULD mới sinh chưa được audit; không có bằng chứng để tick hoặc miễn. Loop này chỉ xác minh A4-AC06; GO-NO-GO toàn sản phẩm vẫn NO-GO.
- Đường lùi: Chạy vòng audit toàn sản phẩm riêng trên BLUEPRINT.md; không mất ID hay criteria đã sinh.

### D-003 · 2026-10-21T19:45:54+00:00 · Duyệt PLAN A4-AC06 với acceptance riêng và giữ blueprint sản phẩm mở

- Phương án: (1) Duyệt 9 task: test/docs, bằng chứng thật, gate nguyên trạng, merge L1 và doctor defer cho người · (2) Trì hoãn mọi bằng chứng browser cho tới khi audit toàn sản phẩm
- Chọn: Duyệt 9 task: test/docs, bằng chứng thật, gate nguyên trạng, merge L1 và doctor defer cho người
- Lý do (tiêu chí chất lượng cuối): Scope và falsifier rõ theo spec; source nghiệp vụ không đổi, có rollback, test context riêng trên DB disposable. Không đánh đồng một slice với release toàn sản phẩm.
- Đường lùi: Revert PR test/docs và dùng lại PROGRESS history nguyên byte.

### D-004 · 2026-10-21T19:53:35+00:00 · Sửa lệnh oracle miền thiếu cờ Node cho mock.module

- Phương án: (1) Thêm --experimental-test-module-mocks để chạy đúng hai test với assertion nguyên vẹn · (2) Bỏ mock/test hoặc ghi skip cho lỗi loader
- Chọn: Thêm --experimental-test-module-mocks để chạy đúng hai test với assertion nguyên vẹn
- Lý do (tiêu chí chất lượng cuối): Lượt T-003 đầu fail trước khi chạy assertion do mock.module không có khi thiếu cờ. Bổ sung điều kiện runtime, không đổi test, scope hoặc threshold.
- Đường lùi: Trả lệnh cũ khi Node hỗ trợ API không cần cờ; giữ log fail ban đầu trong evidence.
- Làm rõ lưu trữ: `loop record` ghi đè evidence cùng ID; JSON hiện hành là lượt 18/18 xanh. Lỗi ban đầu nằm trong hội thoại và PROGRESS; `.autopilot/runtime/T003-loader-repro.log` là lượt tái hiện lỗi thiếu cờ, không phải log nguyên bản.

### D-005 · 2026-10-21T19:55:57+00:00 · Giới hạn worker browser theo RAM 5,8 GB của runtime

- Phương án: (1) Chạy đủ 6 case trên desktop/mobile với 2 worker song song · (2) Dùng mặc định 50% CPU dù số CPU host lớn hơn tài nguyên RAM
- Chọn: Chạy đủ 6 case trên desktop/mobile với 2 worker song song
- Lý do (tiêu chí chất lượng cuối): Giữ nguyên 12 lượt kiểm thử, assertion và fixture cách ly; chỉ giới hạn song song để không OOM trong môi trường build/browser dùng chung.
- Đường lùi: Bỏ workers=2 khi runtime có tài nguyên phù hợp, không thay tiêu chí nghiệm thu.

### D-006 · 2026-10-21T20:10:12+00:00 · Sửa tương tác fixture E2E khi A4 kích hoạt membership toàn DB

- Phương án: (1) Seed membership demo theo org và helper cô lập gán dự án mình tạo; A4 opt-out để tự kiểm subset · (2) Chuyển từng test cũ sang fixture membership riêng trong nhiều file
- Chọn: Seed membership demo theo org và helper cô lập gán dự án mình tạo; A4 opt-out để tự kiểm subset
- Lý do (tiêu chí chất lượng cuối): CI home đỏ sau A4; visibleProjectIds chỉ fallback khi toàn user_projects rỗng. Cần fixture hợp lệ trong chế độ membership, giữ quyền app và mọi assertion. Home chạy riêng trên seed rỗng vẫn xanh; đang tái hiện A4 rồi home cùng DB.
- Đường lùi: Revert thay đổi fixture nếu cơ chế cutover ứng dụng thay đổi; không xoá membership toàn cục hoặc tăng timeout để che lỗi.
