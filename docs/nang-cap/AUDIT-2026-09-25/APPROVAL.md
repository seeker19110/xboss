# Approval — Quyết định cần chốt trước thi hành

Cập nhật: 2026-09-25. State: **In review**.
Chủ dự án đã yêu cầu hoàn thiện đặc tả để tự thi hành sau; chưa có phê duyệt implementation
hoặc production được ghi nhận cho A1–A6. Không điền tên/ngày hoặc tick thay người có thẩm quyền.

## 1. Ba quyền khác nhau

Duyệt tài liệu: xác nhận đặc tả đủ để review; không cho chạy code.
Approved for implementation: cho code/test trên nhánh riêng và môi trường được phép, theo
chương/slice nêu rõ; không mặc nhiên cho merge, triển khai hay đổi dữ liệu thật.
Approved for production: cho một release SHA, phạm vi người dùng/dự án, migration/runbook,
thời điểm và người vận hành cụ thể. Cần cấp quyền merge riêng nếu chưa có.

Một số chương được duyệt không làm chương khác tự Approved. S00 có thể đối chiếu/hoàn thiện
mapping trước, nhưng không áp DDL hoặc sửa code khi chưa qua gate tương ứng.

## 2. Quyết định đề xuất để chủ dự án duyệt

### D01 — Membership và org-session, chặn S01/S02/cutover strict

Đề xuất: mọi actor kể cả admin ứng dụng bị giới hạn org hiện tại; non-admin phải có gán
user_projects cụ thể. Bỏ fallback project 1 và bảng rỗng => thấy mọi project. Đổi org/quyền
phiên phải có cơ chế vô hiệu token cũ như A1.
Trước production cần danh sách ảnh hưởng trước/sau, xác nhận membership đúng và admin phục
hồi; không auto-gán mọi người vào mọi dự án. Các service account/cross-project hợp lệ có
scope tường minh cùng org. Chưa thêm capability cross-org quản trị toàn hệ.
Quyết định/ngoại lệ được duyệt: CHƯA CÓ. Người/ngày: CHƯA CÓ.

### D02 — Offline đọc, nhiều tab và thời hạn context, chặn S05/S08

Đề xuất: một project hoạt động chung cho phiên browser; switch ở một tab invalidates tab khác.
Cache nghiệp vụ theo allowlist/context; tài chính/auth/HTML cá nhân hóa network-only.
Offline đọc chỉ trong phiên đã xác minh đang mở, lease tối đa 15 phút; restart mất context
phải online xác minh lại. Đây là đánh đổi thiết bị dùng chung; không hứa revoke tức thời
khi mất mạng. Timeout ACK 3 giây chuyển LOCKED/network-only, không mở cache chung.
Quyết định/ngoại lệ được duyệt: CHƯA CÓ. Người/ngày: CHƯA CÓ.

### D03 — Draft khi logout và queue legacy, chặn S06/S07/rollout client

Đề xuất: logout còn draft cho hủy để xử lý trước hoặc xác nhận bỏ; không giữ plaintext người
A cho người B xem, không tự xuất file dữ liệu riêng tư. Queue v1 không owner quarantine,
không gán theo tài khoản đang mở và không flush. Thiết bị cũ đồng bộ trước upgrade; phần
legacy tồn phải được owner xác nhận cách xử lý. Không âm thầm xóa draft để nâng schema.
Cần ghi số thiết bị/draft còn tồn và người chịu trách nhiệm đối soát, không tự suy từ server.
Quyết định/ngoại lệ được duyệt: CHƯA CÓ. Người/ngày: CHƯA CÓ.

### D04 — Receipt, lease và retention, chặn S06/S07

Đề xuất: operationId không đổi qua retry, backend idempotency cùng transaction business;
IDB lease 30 giây renew 10 giây có fencing; lease không thay server dedup.
S00 xác định tái dùng cơ chế hiện có hay DDL A2. Không xóa dedup key khi replay vẫn được
chấp nhận; lưu tombstone tối thiểu theo A2. Thời hạn xóa dữ liệu/receipt cần policy riêng,
không áp một TTL ngắn tùy ý gây duplicate effect. Không lưu payload ảnh/nhật ký trong receipt.
Quyết định cơ chế/retention được duyệt: CHƯA CÓ. Người/ngày: CHƯA CÓ.

### D05 — Tiền, rounding và tương thích wire, chặn S09/S10/S13 tài chính

Đề xuất: giữ VND × 100 bigint và PostgreSQL numeric; wire opt-in decimal-string-v1;
SQL/JSON/export không qua float ở đường exact. Chứng từ lịch sử giữ snapshot/rule tại lúc chốt.
Quy tắc per-line/per-total, VAT, retention, recovery, negative/credit và quantity scale phải
khớp hợp đồng hiện hữu; default kỹ thuật trong A3 không thay luật thuế/hợp đồng.
Owner tài chính duyệt golden fixture và bảng monetary mapping trước mỗi miền cutover.
Quyết định/ngoại lệ được duyệt: CHƯA CÓ. Người/ngày: CHƯA CÓ.

### D06 — Nghĩa tổng chi phí và trọng số portfolio, chặn S11/S12

Đề xuất: selectedTotals là tổng nhóm đang xem; projectTotals là toàn project có unassigned;
floor budget là proxy hợp đồng tầng, không giả đã phân bổ BOQ. Giữ semantics actual gồm
advance hiện có; source-lineage thay đổi cần tài chính duyệt. Không SUM(DISTINCT amount).
Portfolio mặc định trọng số số task; không task trả unavailable, không giả tiến độ 0%.
Tập lọc/visibility/org phải giống nhau giữa danh sách và KPI.
Quyết định/ngoại lệ được duyệt: CHƯA CÓ. Người/ngày: CHƯA CÓ.

### D07 — Giới hạn nghiệm thu–IPC, adjustment và SoD, chặn S13 enforcement

Đề xuất: lũy kế qty được duyệt không vượt nguồn nghiệm thu/hợp đồng/VO đủ điều kiện, kiểm
lại khi commit; giữ exception advance và luồng thủ công đã có phê duyệt rõ nguồn.
Thiếu mapping nghiệm thu–BOQ chỉ draft cần đối soát, không tự phát hành. Hủy upstream có
chứng từ chốt phải qua adjustment/reversal, không sửa lịch sử; quyền ký/SoD theo policy
đã duyệt, không tự cho admin bỏ qua các bước.
Owner nghiệm thu/tài chính phải duyệt transition map từ schema thật và golden chain fixture.
Quyết định/ngoại lệ được duyệt: CHƯA CÓ. Người/ngày: CHƯA CÓ.

### D08 — Recovery set, RPO/RTO và retention, chặn S14 vận hành

Đề xuất để duyệt: RPO <= 24 giờ, RTO <= 4 giờ, recovery set gồm DB+attachments+key references+
app/migration manifest; đích restore cách ly không outbound. Các mục tiêu chưa phải SLA.
Nơi lưu, retention, miền lỗi thứ hai, chi phí và người giữ key cần xác nhận riêng. Cần RPO
ngắn hơn thì đặc tả PITR/WAL bổ sung; không gọi pg_dump là PITR.
Cho phép dùng snapshot production hoặc chỉ dữ liệu tổng hợp: CHƯA CÓ.
Quyết định/owner backup/ngày: CHƯA CÓ.

### D09 — Release và phạm vi production, chặn S16

Đề xuất: pilot nhỏ trước, quan sát 24 giờ sau mở rộng; thời gian này chưa là lịch tự động.
Mọi P0/P1 scope/money/draft/approval là no-go; migration/queue v2 có rollback tương thích.
Cần ghi release SHA, PRs đã merge, dự án/nhóm pilot, migration IDs, checklist backup/restore,
rollback owner, quyền deploy, cửa sổ vận hành và kênh xử lý sự cố. Không chỉ tick “CI xanh”.
Phê duyệt production, merge và thời điểm: CHƯA CÓ.

## 3. Vai trò phê duyệt cần điền

Chủ dự án/scope: chưa chỉ định người ký trong tài liệu này.
Owner kỹ thuật/API/schema: chưa chỉ định.
Reviewer bảo mật/permission/RLS: chưa chỉ định.
Owner nghiệp vụ tài chính/nghiệm thu: chưa chỉ định.
Reviewer UX/offline/mobile: chưa chỉ định.
Người vận hành backup/deploy: chưa chỉ định.
Một người có thể đảm nhiệm nhiều vai trò nếu chủ dự án xác nhận; không giả các vai trò là
các tài khoản người thật đã sẵn sàng. Không tự thêm reviewer/assignee ngoài yêu cầu.

## 4. Phiếu phê duyệt từng chương hoặc slice

```text
Chương/slice và spec commit:
State: Approved for implementation / Changes requested
Người duyệt và thẩm quyền:
Ngày duyệt:
D01–D09 áp dụng và quyết định:
Main SHA đã reconcile / evidence S00:
Files/contract/schema được duyệt:
Phạm vi code/test được phép:
Môi trường dữ liệu được phép:
Ngoại lệ và điều kiện dừng:
Quyền merge: chưa cấp / cấp rõ PR hoặc phạm vi
Quyền production: chưa cấp / ghi phiếu production riêng
```

Các placeholder phải được người duyệt điền trước chuyển READY. Chấp thuận một bản spec
không áp tự động cho thay đổi materially khác về schema, quyền, dữ liệu hoặc nghiệp vụ.

## 5. Checklist đủ để Approved for implementation

- [ ] Product/scope, non-goals và các decision liên quan đã chốt.
- [ ] UX/a11y/offline mọi trạng thái và browser fallback được duyệt.
- [ ] API/data/DDL/transaction đã khớp mapping main mới, không còn tên bảng/cột phỏng đoán.
- [ ] Security/RBAC/SoD/RLS/audit không có ngoại lệ ngầm.
- [ ] Mỗi AC có test/evidence, rollout/rollback và owner rõ.
- [ ] Không còn blocking question cho slice; quyền test/môi trường đủ.
- [ ] Người/ngày/spec SHA của approval đã ghi.

**Kết luận hiện tại: In review. Không có slice implementation nào được tự coi Approved.**
