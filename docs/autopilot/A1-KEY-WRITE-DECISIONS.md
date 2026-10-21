# Nhật ký quyết định tự duyệt

> Ghi bởi `xt.py loop decide`. Phiên chính tự duyệt điểm quyết định theo tiêu chí chất lượng cuối (`LOOP-STOP-018`, ADR-0008 của khung). Người xem lại bất cứ lúc nào; đổi ý → quyết định mới ghi "thay D-NNN", không sửa mục cũ.

### D-001 · 2026-10-21T22:18:40+00:00 · Tiếp tục autopilot sau merge #666 bằng lát API-key write nào?

- Phương án: (1) H/P hai route session/claims, ba nhóm bound/global/read scope hai chiều, app role thật và owner oracle; bảy ca mới, sáu MUST · (2) Coi B cookie đã đóng toàn auth inventory hoặc mở audit toàn 406 route
- Chọn: H/P hai route session/claims, ba nhóm bound/global/read scope hai chiều, app role thật và owner oracle; bảy ca mới, sáu MUST
- Lý do (tiêu chí chất lượng cuối): Người dùng cho phép merge #666 rồi tiếp tục /autopilot. QUALITY-FINAL-1 Approved 25/09 và nghiên cứu Astra chỉ ra gap API-key write hai org/hai chiều. Lát test/docs dùng route/contract hiện hữu, context rỗng mới, non-bypass app role và owner snapshot để tránh positive giả; giữ A1 tổng thể PARTIAL và deadline phiên cũ.
- Đường lùi: Giữ MUST mở khi thiếu bằng chứng; không mock/skip/nới assertions hoặc đổi spec/policy. Chỉ mở rộng app fix sau decision nếu phát hiện bug theo contract đã duyệt.

### D-002 · 2026-10-21T22:25:23+00:00 · Giữ tương thích dev mode không có DB thế nào?

- Phương án: (1) Theo integration suites hiện có: skip chỉ khi thiếu TEST_DATABASE_URL; mọi Gate/final/CI dùng DB thật và phải xác nhận 7 pass, 0 skip, không thêm whitelist · (2) Làm npm test dev không DB thất bại hoặc coi skip là bằng chứng pass
- Chọn: Theo integration suites hiện có: skip chỉ khi thiếu TEST_DATABASE_URL; mọi Gate/final/CI dùng DB thật và phải xác nhận 7 pass, 0 skip, không thêm whitelist
- Lý do (tiêu chí chất lượng cuối): tests/setup.ts và scripts/run-tests.mjs cho phép dev không DB, release-gate chặn skip không whitelist. File mới chưa chạy DB lần đầu; guard này giữ contract harness, không bỏ ca đỏ hoặc giảm oracle. withFixture vẫn assert HAS_TEST_DB khi được gọi.
- Đường lùi: Nếu Gate có skip thì chưa tick MUST; kiểm env/DB thật trước khi nghiệm thu, không thêm allowlist hoặc tắt test.
