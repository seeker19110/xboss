# Acceptance — A1-AC01 browser org boundary

Lát bổ sung B cookie cho hai admin khác tổ chức qua read/write/select/export, theo QUALITY-FINAL-1 Approved 25/09/2026. Sáu MUST, không SHOULD; toàn blueprint 1152/639 chưa audit. A1-AC01 tổng thể giữ PARTIAL: M và các nhánh auth inventory ngoài phạm vi RESEARCH chưa được đóng.

- [x] `A1B-SESSION-001` **MUST** Hai admin ID/org khác nhau login UI thật, /auth/me đúng role/org; context rỗng giữ cấu hình desktop/mobile, data riêng và đóng context/pool, không mock.
- [x] `A1B-READ-002` **MUST** Cả hai chiều portfolio/users/API đọc đúng own ID/name và loại foreign, có own positive controls.
- [x] `A1B-WRITE-003` **MUST** Cả hai chiều foreign PATCH role hợp lệ và DELETE trả 404, target DB bất biến; own UI đổi role/xóa 200 và reload đúng.
- [x] `A1B-SELECT-004` **MUST** UI chọn own project thứ hai thật 200/cookie/reload; foreign POST 403 giữ project/cookie; listbox mở có own option và không foreign option ở cả hai admin.
- [x] `A1B-EXPORT-005` **MUST** Hai admin download Excel qua UI; workbook chứa đúng task đang chọn, headers literal, loại other org và own project chưa chọn; filename đúng code. Foreign slug 404, foreign business state bất biến.
- [x] `A1B-REGRESSION-006` **MUST** Bốn ca × desktop/mobile + setup đủ 9 lượt, 0 skip; P/H session/API-key/cron/2FA/OIDC/traffic theo RESEARCH, 0 skip; typecheck/build/static xanh, review khác model đóng findings; không nâng verdict toàn inventory/M/O/release.

Bằng chứng cập nhật sau Gate thật. Strict phải đếm đúng sáu MUST, không nhận 0 item là hoàn tất. Final verify trên commit cuối, CI theo HEAD PR. B mới không dựng task trễ; P/H s02c-dashboard-scope bổ sung nhánh export trễ.

## Bằng chứng cục bộ

T-004: bốn ca hai chiều × desktop/mobile + setup = 9/9 pass, 0 skip/retry (43.5 giây). T-005: select/export lặp ba lần mỗi viewport = 12 ca + setup = 13/13 pass, 0 skip/retry (1.8 phút). Mọi lượt dùng org/context riêng, cùng source đóng băng sau D-004 và selector theo viewport.

T-002: bảy suite P/H, 48/48 pass, 0 skip; S16 chạy app role NOSUPERUSER/NOBYPASSRLS thật. T-001 typecheck và T-003 build pass. Review độc lập Astra không có P1/P2. T-006 cổng tĩnh 18/18 pass. REGRESSION-006 có đủ bằng chứng cục bộ và review; strict kiểm sáu MUST ngay sau cập nhật này. Final verify/CI theo commit cuối còn phải xác nhận tại PR.

D-004 observer fetch-clone/binding trì hoãn app nhận response, giữ nguyên response và kiểm thêm wire status/payload. Bằng chứng select là chức năng, không chứng minh timing reload nguyên trạng. Browser dùng DB owner disposable; bằng chứng RLS đến từ P/H app role, không suy từ B.
