# Acceptance — A1-AC01 browser org boundary

Phạm vi lát bổ sung: B cookie cho hai admin khác tổ chức qua read/write/select/export, theo QUALITY-FINAL-1 Approved 25/09/2026. Sáu MUST, không SHOULD; toàn blueprint 1152/639 chưa audit. A1-AC01 tổng thể giữ PARTIAL: M và phần auth inventory ngoài bảng RESEARCH chưa được đóng.

- [ ] `A1B-SESSION-001` **MUST** Hai admin ID/org khác nhau loginUI thật, /auth/me đúngrole/org, context rỗng giữ cấu hình desktop/mobile; data riêng, đóng context/pool, không mock.
- [ ] `A1B-READ-002` **MUST** Cả hai chiều portfolio/users/API đọc đúng own IDs/names và loại foreign, có own positive controls.
- [ ] `A1B-WRITE-003` **MUST** Cả hai chiều foreign PATCH role hợp lệ và DELETE trả404, DB mục tiêu không đổi; đối chứng own UI đổi role/xóa200 và reload đúng.
- [ ] `A1B-SELECT-004` **MUST** UI chọn ownproject2 thật200/cookie/reload; foreign POST403 giữproject/cookie, mở listbox cóownoption và khôngforeignoption ở cả hai admin.
- [ ] `A1B-EXPORT-005` **MUST** Hai admin downloadExcel qua UI; workbook chứa đúng project/task đangchọn, headers literal, loại otherorg và ownproject chưa chọn; filename đúngcode. Foreignslug404, foreignbusinessstate khôngđổi.
- [ ] `A1B-REGRESSION-006` **MUST** Bốn ca ×desktop/mobile +setup đủ9lượt0skip; P/H session/API-key/cron/2FA/OIDC/traffic theo bảng RESEARCH, 0 skip, typecheck/build/static xanh, review khácmodel đóngfindings; không nâng verdict toàn406route/M/O/release.

Bằng chứng sẽ cập nhật sau Gate thật; strict phải đếm đúng6MUST, không nhận0item là hoàn tất. Finalverify trên commit cuối, CI theoHEAD PR.
