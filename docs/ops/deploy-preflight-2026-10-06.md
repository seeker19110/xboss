# S03 — Preflight deploy trước khi thay checkout

Issue: #570. Baseline: `a891d5aebdbda82ab268d3e86c35065e54eb1db4`.
Phạm vi: sửa bootstrap vận hành theo QUALITY-FINAL-1 đã duyệt; không thêm tính năng nghiệp vụ.

## Sự cố đã đối chiếu

Deploy run `37288717358`, job `111707130738` dừng với lỗi thiếu file credential migration
đọc được tại `/etc/xboss/migrate.env`. Build và gửi artifact đã đạt. Workflow cũ reset checkout
trước khi gọi `deploy.sh`, nên guard credential bên trong script chạy sau thay đổi checkout.
Không suy từ CI xanh rằng bản mới đã được triển khai thành công.

## Thay đổi

Workflow fetch đúng SHA đã qua CI, đọc `deploy.sh` từ object đó vào file tạm ngoài checkout,
rồi chạy script với `EXPECTED_DEPLOY_SHA`. Không dùng script cũ trên VPS, không reset checkout
ở bootstrap. Trap dọn file tạm khi đọc object hoặc chạy script thất bại.

`deploy.sh` kiểm credential migrator và runtime env trước fetch/reset/clean/npm ci. Giữ lần
kiểm runtime env sau nạp staging, kiểm main khớp SHA CI và các cổng artifact hiện hữu.
Không fallback sang `DATABASE_URL`, không đưa credential vào argv hoặc PM2 runtime.
Đây không phải sửa toàn bộ cơ chế rollback/deploy atomic; phần còn lại giữ nguyên.

## Bằng chứng kiểm thử cục bộ

Ba file nền được đối chiếu Git blob SHA với GitHub trước khi sửa, vì runtime không phân giải
được `github.com` để clone repo. Không lấy snapshot cục bộ làm bằng chứng full checkout.

- Node `v22.16.0`: `node --experimental-strip-types --test tests/deploy-preflight.test.ts`.
- Trước sửa: 12 ca, 2 đạt / 10 lỗi; sau sửa: 12 đạt / 0 lỗi / 0 skip.
- `bash -n deploy.sh`: đạt.
- Fixture dùng git/npm/pm2 giả và thư mục tạm, không mạng/DB/secret production. Đường preflight
  hợp lệ cố ý dừng tại npm migrator giả với exit 91; không phải bằng chứng migration thành công.
- Bao phủ thiếu file, mode sai, URL trống, credential trong ba file runtime, SHA không hợp lệ,
  main lệch SHA, fetch/show lỗi, cleanup và credential chỉ được cấp cho bước migrate.
- Full formatter/lint/typecheck/release gate/DB/build/E2E chưa chạy cục bộ. CI Node 24 trên đúng
  PR HEAD vẫn là cổng bắt buộc; test chuỗi hiện có được cập nhật, không bỏ hoặc skip test.

## Blocker vận hành và bàn giao

Bản vá không tạo được credential trên VPS. Người vận hành được cấp quyền phải chuẩn bị file
migrator riêng ngoài checkout, mode `0600`, đúng ownership và DB role theo `DEPLOY.md` và
ADR-0003. Không gửi secret vào issue/chat và không chép quyền migrator vào app runtime.
Chưa thực hiện thao tác production hoặc xác nhận production đang chạy SHA nào.

Sau review độc lập và đủ CI, chỉ triển khai khi cấu hình môi trường đã hợp lệ, kèm kiểm chứng
đúng SHA, health/smoke và quy trình release đã duyệt. Không bỏ guard để làm deploy xanh.
Rollback phần code bằng revert PR. `PROGRESS.md` do coordinator cập nhật khi tích hợp, tránh
xung đột với sáu PR đang mở; checkpoint này không đánh dấu S03 hay dự án là COMPLETE.
