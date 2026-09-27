# Kiểm tra bảo mật XBoss — 2026-09-27

Trạng thái: đang tích hợp bản vá và kiểm chứng; chưa xác nhận phát hành production.
Nguồn: `seeker19110/xboss`, baseline `main` tại
`f38a10ee949eba52bfb4895c9a1c75a302245ee8`.
Website: `https://xboss.donghanhcungban.org`.
Chủ dự án yêu cầu kiểm tra và sửa trong cùng lượt ngày 2026-09-27.

## Phạm vi

Ưu tiên API, xác thực/2FA, quyền tổ chức/dự án, API key, webhook/push,
tham chiếu mua sắm và cấu hình proxy. Inventory gồm 391 file route và 142 file trong
`lib/`; đây không phải tuyên bố đã kiểm thử mọi nhánh của mọi file.

Website thật chỉ nhận một số yêu cầu đọc không có thông tin đăng nhập.
Không dò mật khẩu, chạy tải lớn, thay đổi dữ liệu hay dùng DB/secret production.
Hồi quy dùng dữ liệu giả, mock và PostgreSQL disposable trong CI.

## Kế hoạch và bất biến

| Nhóm         | Bất biến                                                           | Kiểm chứng                                           |
| ------------ | ------------------------------------------------------------------ | ---------------------------------------------------- |
| 2FA          | Không ghi đè 2FA đang bật; thay đổi trạng thái atomic              | Từ chối không ghi; enrollment hợp lệ; ca đồng thời   |
| Org/dự án    | Admin cùng org; membership rõ ràng; không fallback dự án 1         | Hai org; không membership; input sai; luồng hợp lệ   |
| API key      | Dự án thuộc org của key lúc cấp và lúc dùng                        | Scoped/global; ngoài org; context DB                 |
| Quyền        | CRUD/index/snapshot có org; chưa nạp hoặc lỗi không mặc định allow | Cold start; deny; hai org; migration chạy lặp        |
| Webhook/push | Đúng tenant; không gọi đích nội bộ/đích redirect                   | Không gửi khi sai phạm vi; đích hợp lệ vẫn hoạt động |
| Mua sắm      | Tham chiếu cha/con cùng org/dự án trước khi ghi                    | Tham chiếu ngoài phạm vi không thay đổi dữ liệu      |
| Traffic      | Không gửi khóa ký phiên; đích từ cấu hình tin cậy                  | Fetch mock; khóa giả; cấu hình lỗi; redirect         |

Scope/quyền theo D01 **Approved for implementation** tại
`docs/nang-cap/AUDIT-2026-09-25/APPROVAL.md` và `DATA-CONTRACTS.md`.
Bản vá này không đóng toàn bộ chương trình QUALITY-FINAL-1 hoặc phần vault/offline/
money/PITR chưa thực hiện.

## Bằng chứng và bản vá đã tích hợp

- [AI] Setup 2FA: hai assertion bảo vệ cấu hình đang bật thất bại ở baseline,
  qua sau bản vá. Setup trả 409 khi đã bật; setup/confirm/disable giữ cùng khóa dòng
  trong transaction để tránh trạng thái xen kẽ. Có test dữ liệu và đồng thời cho CI.
- [AI] Traffic: mã cũ dùng nguyên khóa ký phiên làm token nội bộ và lấy đích từ URL
  request. Bản vá dùng HMAC tách mục đích, đích cấu hình/loopback, cấm redirect và
  không dùng khóa mặc định ở production. 22 test mock qua, so với 19 thất bại trước vá.
  Chưa xác nhận client ngoài có thể kiểm soát URL này trên cấu hình Next/proxy thật;
  không tuyên bố website đã bị khai thác hoặc khóa thật đã lộ.
- [AI] Các nhóm còn lại đang tích hợp; chưa coi ứng viên là lỗi đã đóng.
- HEAD `/` trả 200; API mẫu auth/me, projects, admin/api-keys, v1/tasks và cron/retention
  trả 401 khi thiếu xác thực; HEAD `/.env` và `/.git/config` trả 404.
- HTTPS có HSTS, CSP, DENY và nosniff. Header không chứng minh phân quyền nghiệp vụ đúng.
- `npm audit --json`: 0 advisory tại thời điểm kiểm tra cây dependency đã khóa.
- Baseline lint, typecheck, build và check route-perms/project-scope/db-params/
  sw-exclude/migration-numbers qua.

## Kiểm thử và giới hạn

Node 24.19.0; cài theo lockfile, không nâng dependency trong bản vá này.
CLI `tsx` cục bộ không mở được IPC; dùng loader tương đương
`node --experimental-test-module-mocks --import tsx --test ...` và
`node --import tsx scripts/...`.

Native PostgreSQL không chạy được trong namespace cục bộ chỉ ánh xạ uid 0.
Không dùng production DB thay thế. Transaction/RLS/migration phải qua PostgreSQL 16
disposable của GitHub CI. Test chưa chạy/bị skip không tính là pass.
E2E và release gate phải qua trên đúng commit cuối.

## Phát hành

Chưa merge/deploy trong bằng chứng hiện tại. Đối chiếu commit, CI và deployment thật,
không suy trạng thái phát hành từ việc mã đã có trên nhánh.

Unique index quyền theo org cần chặn tạm ghi cấu hình quyền và drain worker cũ khi
chuyển schema/code. Không rollback về writer thiếu org sau khi có override đa org;
không xóa/đổi org dữ liệu để vượt migration. Cấu hình DB/secret/SSH và migration trên
VPS chưa được kiểm chứng.

Không có kiểm tra hữu hạn nào chứng minh hết mọi điểm yếu. Chỉ đóng các bất biến
có bằng chứng kiểm thử; các phần chưa xác minh phải giữ trạng thái mở.
