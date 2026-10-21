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
