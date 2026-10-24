# Phát hành M137 — PR #677

Chủ dự án duyệt merge/deploy trong chat ngày 24/10/2026. PR #677 squash thành main
`6b631f15708817824ba511c06abee57f6168cb54` từ HEAD `65571994`.

- [CI main 40055784430](https://github.com/seeker19110/xboss/actions/runs/40055784430): success; 383 file, 5.160 unit pass/0 fail/1 skip allowlist; mutation 52/52 chạy được, 0 survivor; coverage 557 file, lines 91,69%, branches 85,03%, functions 94,84%.
- E2E main: 742 pass ngay, 1 flaky qua retry, 51 skip điều kiện có sẵn. Ca cũ `costs-recovery.spec.ts:219` desktop không tìm được ô HD-FIXTURE sau 5s lần đầu; retry xanh. Không có artifact lỗi vì job thành công; đọc source/log chưa xác định nguyên nhân. Không sửa timeout/assertion/skip. CI PR trước merge khác lượt: 743 pass/0 flaky/51 skip.
- [Deploy 40056412712](https://github.com/seeker19110/xboss/actions/runs/40056412712): success, log xác nhận build đúng SHA 6b631f15/Node major 24, PM2 reload, health-check và hoàn tất 03:02:44 UTC (10:02:44 UTC+7), 24/10.
- Public smoke sau deploy PASS: desktop/mobile login 200, không lỗi JS hoặc assets, axe 0 serious/critical; API dashboard/search 401, health 200/db true và ready 200/schema ok.

Public smoke chỉ đọc, không đăng nhập hoặc ghi dữ liệu production. Các luồng có đăng
nhập kiểm trên DB disposable/CI; chưa thay cho UAT người thật/Safari/cảm ứng hay usage.
Không suy ra patch Node/Undici bundled trên VPS từ kiểm Node major 24 của deploy.

[Evidence máy đọc](release.json), [kiểm kỹ thuật và lab](verification.md).
