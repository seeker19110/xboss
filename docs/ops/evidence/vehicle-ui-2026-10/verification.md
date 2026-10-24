# Checkpoint kiểm chứng trước CI — Xe ra vào

Baseline main `8f5e6702ca2f96e2dafbf7db1b7f9b5ed64e5b86`. Đây là checkpoint trước CI/merge/deploy;
kết quả phát hành cuối đối soát ở PR. UAT/usage F2/F3 vẫn WAITING.

## Kết quả local

- Build production cuối `IM5TAIdkFusxT9mXQxefH` PASS; source SHA256 ở `visual.json`.
- E2E sau login thật trên PostgreSQL16 disposable:30 case mới × desktop/mobile +4 hồi quy vehicles
  - setup = **65pass/0fail/0flaky/0skip**, retries0. Timezone Asia/Ho_Chi_Minh; oracle POST09:15
    ngày12/11/2099 là02:15Z độc lập, payload còn lại/optional NCC giữ contract.
- Nguồn chính kiểm lỗi HTTP/network/malformed/loading/empty, response ngày cũ, snapshot chỉ xem,
  retry đúng ngày, invalid date không GET vô điều kiện, role xem/subcon, PATCH pending và refresh
  lỗi. Form kiểm lazy/cache/abort/reopen/retry, giữ draft, POSTHTTP/network, pending/close/Escape,
  payload, emptyNCC/invalidhour, confirmation không ghi khi huỷ và return focus.
- Axe default motion trên hai theme:modal bàn phím/16px/44px, thẻ quá giờ, lỗi/snapshot/NCC,
  hover nút ra. Chờ trạng thái ready và finite transition tự hoàn tất; không tắt motion để đo axe.
- `invariants.json`:11 bất biến AST/text giữ trạng thái/label/isLate/sort/rolemanage/export/default
  form/JSONpayload và không chạm API/backend/auth/schema/lock/SW/workflow.
- `visual.json` và4 ảnh synthetic đã mở xem, desktop Sáng và mobile360 Dark Blue. Requestcount:
  chỉ đọc0GET NCC, mở form1GET; test mở lại1 tổng cộng, lỗi+retry2; đổi ngày không tải NCC.
- Typecheck và gate cuối18/18 PASS; build riêng PASS. Full unit PostgreSQL đang chốt trước merge; không coi trạng
  thái đang chạy là PASS. Full CI trên exactHEAD mới là cổng bắt buộc trước merge.

## RED và repair

`red.json`:6 lỗi tái hiện trước sửa (3 case×2profile) + setup pass. Giữ log local.
`repair.json` ghi cả lỗi harness/typings và lỗi tương phản có thật được phát hiện thêm khi kiểm
hình ảnh/trạng thái. Không xóa/skip test, nới timeout/assertion/coverage hoặc thay cấu hình CI.

## Giới hạn và phát hành

Auth test là phiên thật trong DB disposable; fixtures tiêm failure/delay/role UI/count/payload,
không thay test RBAC server hoặc dữ liệu thật. Full unit/CI kiểm backend hiện hữu. Không đo CWV,
latency hoặc usage production từ fixture. Không có phiên production sau đăng nhập được xác minh.

Squash sau checks exactHEAD hoàn tất xanh và review được xử lý; mainCI/deploy cùng SHA, public
smoke chỉ đọc (login/assets/SSR mới/health/readiness/API401) sau deploy. Revert squash rollback,
không migration. Không gỡ capability nghiệp vụ, không bắt đầu UAT hoặc usage thay owner.
