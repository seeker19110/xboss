# Kiểm tra bảo mật XBoss — 2026-09-27

Trạng thái: đã tích hợp (thu hẹp) và review 2026-10-03 — xem mục cuối; chưa xác nhận phát hành production.
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

## Review tích hợp 2026-10-03

Đưa nhánh lên `main` tại `2b57156`, chạy toàn bộ test trên PostgreSQL 16 disposable và review
độc lập (`audit-bao-mat`, `audit-logic`). Kết quả trước khi sửa: 23 ca đỏ ở 10 file, cùng các
phát hiện dưới đây. Chủ dự án chọn **thu hẹp** PR: giữ bản vá an toàn, hoãn cutover membership D01.

| Mức          | Phát hiện                                                                                                                                                            | Xử lý                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Nghiêm trọng | `getCurrentProjectId` trả null khi cookie thiếu/sai hoặc có ≥2 dự án; ~86 route coi null là "không lọc" (`dashboard`, `gantt`, `claims`…) ⇒ lộ dữ liệu xuyên tổ chức | Giữ mặc định dự án đầu trong quyền (đã giới hạn org); cutover D01 để S01/S02 |
| Cao          | Override `role_permissions` cũ trỏ dự án org khác ⇒ nạp snapshot throw ⇒ mọi user của org lỗi 500, admin không tự sửa được                                           | Bỏ qua dòng lệch + `log.warn`; test hồi quy đỏ trên code cũ                  |
| Trung bình   | Cấu hình traffic sai (APP_URL/PORT/XBOSS_SECRET) throw đồng bộ trong `proxy.ts` ⇒ hỏng mọi `/api`                                                                    | Lỗi mềm + log, request gốc vẫn chạy                                          |
| Trung bình   | `POST /api/engineering/bidding/quotes` không kiểm `packageId` thuộc dự án                                                                                            | Kiểm trong `createVendorQuote`, 404; test hồi quy đỏ trên code cũ            |
| Trung bình   | Delivery webhook cũ đang chờ (không org/dự án) bị đánh failed; `emitWebhook`/push bỏ sự kiện không log                                                               | Thêm `log.warn`; giữ fail-closed                                             |
| Thấp         | `getCurrentUser` gọi song song trong một request sẽ throw; thêm ~5 lượt DB mỗi request                                                                               | Ghi chú ràng buộc trong code; hiệu năng ghi nợ                               |

**Truy vấn chỉ-đọc cho người vận hành, chạy trên production trước deploy** (role owner):

```sql
-- 1. Override quyền trỏ dự án ngoài tổ chức (nay bị bỏ qua, không còn hiệu lực)
SELECT rp.id, rp.org_id, rp.role, rp.perm_key, rp.project_id, p.org_id AS project_org
  FROM role_permissions rp LEFT JOIN projects p ON p.id = rp.project_id
 WHERE rp.project_id IS NOT NULL AND (p.id IS NULL OR p.org_id <> rp.org_id);

-- 2. Delivery webhook cũ đang chờ không mang org/dự án (sẽ bị đánh failed khi tới lượt gửi)
SELECT count(*) FROM webhook_deliveries
 WHERE status = 'pending' AND payload->>'orgId' IS NULL AND payload->>'projectId' IS NULL
   AND event <> 'ping';

-- 3. (cho cutover D01 sau này) non-admin chưa có membership trong tổ chức của mình
SELECT u.id, u.email, u.role FROM users u
 WHERE u.role <> 'admin' AND NOT EXISTS (
   SELECT 1 FROM user_projects up JOIN projects p ON p.id = up.project_id AND p.org_id = u.org_id
    WHERE up.user_id = u.id);
```

Migration `0158` chỉ DDL (đổi unique index sang có `org_id`) nên đi thẳng production được; writer
phiên bản cũ đang chạy song song có thể trả 500 ở PATCH ma trận quyền trong lúc cuốn chiếu —
tránh sửa ma trận quyền trong khung deploy.
