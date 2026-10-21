# Acceptance — A5-AC03 browser concurrency

Nguồn Approved 25/09/2026: [A5 §5](../nang-cap/AUDIT-2026-09-25/A5-BUSINESS-CHAIN.md#5-acceptance), [TEST-MATRIX §7](../nang-cap/AUDIT-2026-09-25/TEST-MATRIX.md#7-a5--9-ac-giữ-đúng-chính-sách-overrun), [S15 §A5](../nang-cap/AUDIT-S15-RELEASE-CANDIDATE.md). Chỉ bổ sung B còn thiếu, đối chiếu lại P/H; không miễn acceptance và không kết luận M/O hoặc release toàn sản phẩm.

- [x] `A5B-CONCUR-001` **MUST** Mọi ca race có hai request browser thật đồng thời chờ trong cây khóa DB, chứng minh bằng observer trước release; hai user/session riêng, không mock auth/API/DB.
- [x] `A5B-APPROVE-002` **MUST** Hai PM duyệt cùng tầng: đúng 200+409, UI phiên thua có lỗi, một floor row và một history nghiệm thu/task, hai trang reload hội tụ.
- [x] `A5B-BATCH-003` **MUST** Batch chồng cùng task không lost update, history là chuỗi liên tục không duplicate; replay không tăng effect, UI sau reload đúng tiến độ.
- [x] `A5B-INVARIANT-004` **MUST** Ép cả hai thứ tự thắng trên duy nhất taskA chung, probe unique firstPID trước khi khởi động request sau và xác nhận cùng snapshot secondPID→…→firstPID→locker trước khi nhả; duyệt tầng và bỏ tick đồng thời chỉ cho (200,409) hoặc (422,200), không 5xx; trạng thái/ô/floor/history nhất quán, nghiệm thu luôn đạt 100%.
- [x] `A5B-SOURCE-005` **MUST** Duyệt task A riêng rồi tầng A+B, hủy tầng giữ A nghiệm thu/source task, B hoàn thành/source null; audit A không nhân thêm. HTTP thật và kiểm DB/UI sau reload.
- [x] `A5B-OFFLINE-006` **MUST** Chạy lại ca mất ACK với server thật của offline-deep trên desktop/mobile: cùng idempotency key, đúng một receipt/effect, hàng đợi sạch; P/H concurrency/approval_source không skip.

Bằng chứng sau D-005: `T-008` chạy năm lượt mỗi lịch/viewport, **20 ordered cases pass**, không skip; cả20 JSON có taskA riêng, unique firstPID và cạnh secondPID→firstPID→locker. `T-004` đầy đủ **13/13 pass,0 skip**:5 ca A5 × desktop/mobile + mất ACK ×2 + setup. Mỗi race đợi≥2 backend trước release; hai lịch trả đúng200/409 và422/200. Các assertion API/DB/UI kiểm union ô, chuỗi history, replay, floor row, lỗi bên thua, reload và approval_source.

Final verify26c25256 từng bắt flake vì giữ nhiều task và suy người thắng từ first-arrival. D-005 đổi sang chỉ khóa taskA chung và chứng minh cạnh hàng đợi trong cùng lần quan sát, không nới oracle. Bảy Gate phải được final verify ổn định trên commit cuối; xem receipt/CI theo HEAD ở PR.

`T-002`:18/18 P/H pass,0 skip; typecheck/build xanh. Reviewer khác model đã đọc cả barrier hai lịch, context và cleanup, không còn P1/P2. JSON cây khóa được ghi dưới test output, attach theo path và log compact để CI thành công vẫn giữ bằng chứng thực (không có cookie/secret/query text).

Kiểm lại mọi Gate sau commit bằng loop verify; required CI theo đúng HEAD của PR là bằng chứng chia sẻ. Không dùng kết quả cục bộ thay CI. Lệnh chính xác và giới hạn ở [PLAN](A5-AC03-PLAN.md). PR/CI trên HEAD là bằng chứng chia sẻ; runtime ignored chỉ phục vụ loop cục bộ.
