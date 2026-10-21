# GO / NO-GO — A5-AC03 ·22/10/2026

**GO cho review slice kiểm chứng A5-AC03; NO-GO cho nghiệm thu hoặc triển khai toàn sản phẩm.**

## Phạm vi và bằng chứng

Theo spec QUALITY-FINAL-1 Approved25/09/2026. Nhánh codex/autopilot-a5-ac03 stack lên doctor a81d7d9a, chỉ thêm hai file test/fixture và tài liệu. Không đổi app, schema, auth policy, hook/settings, CI hoặc dependency.

- B:5 ca A5 × desktop/mobile, regression mất ACK ×2 và setup:13/13 pass,0 skip. API/cookie/DB/browser production thật.
- Concurrency:hai PM khác ID, chỉ khóa taskA chung và cây blocker DB≥2 trước release; lịch ép bắt buộc secondPID→firstPID→locker cùng snapshot. T-008 kiểm lặp20 ordered cases thành công (năm lượt mỗi lịch/viewport), không skip. Approve đôi200+409, batch chồng/replay đúng state/history; hai lịch approve-vs-untick được ép riêng và trả đúng200/409,422/200. Hủy tầng giữ task đã duyệt riêng/source task và history, trả task source floor đúng trạng thái.
- P/H concurrency/approval_source:18/18 pass,0 skip. Typecheck/build xanh; 18 cổng tĩnh xanh; bảy Gate bắt buộc final verify trên commit cuối và CI theo HEAD cập nhật ở PR. Reviewer độc lập khác model không có P1/P2.
- [Acceptance](docs/autopilot/A5-AC03-ACCEPTANCE.md)6 MUST; [S15 §11](docs/nang-cap/AUDIT-S15-RELEASE-CANDIDATE.md#11-checkpoint-22102026--bổ-sung-lớp-b-cho-a5-ac03) bổ sung P/H/B, giữ snapshot lịch sử và M/O. Required CI phải xanh trên đúng HEAD; kết quả chia sẻ cập nhật ở PR.

## Tích hợp và phần chờ

[#663](https://github.com/seeker19110/xboss/pull/663) đã merge theo chỉ dẫn tại2adda49d. [#664](https://github.com/seeker19110/xboss/pull/664) sửa doctor:37/37 regression, doctor0 lỗi,18 cổng tĩnh và11 Gate final verify stable, toàn bộ CI xanh tại a81d7d9a. merge-check HUMAN do checker là đường dẫn cổng nhạy cảm và vượt150 dòng; T-012 của loop trước đã defer.

T-007 của slice A5 là merge PR mới theo L1. Sau khi PR doctor đáy được người cho phép/merge: đổi base PR A5 về main, git merge origin/main vào nhánh A5, giải conflict nếu có mà giữ code đã review, push; kiểm lại tree/CI/merge-check theo HEAD mới. Không rewrite/force-push, không gộp slice A5 vào PR doctor.

## Giới hạn và khi chạy thật

BLUEPRINT toàn sản phẩm1152 MUST/639 SHOULD chưa audit; không xác nhận M/O, thiết bị thật/Safari, hợp đồng thật, restore/PITR hoặc production. Không deploy/ký RELEASE_VERIFIED. Khi chạy thật thu bằng chứng release riêng theo runbook hiện hành.

Quyết định tự duyệt [D-001–D-005](docs/autopilot/A5-AC03-DECISIONS.md):giữ đầy đủ AC03, giữ contract dấu vết M120, ép cả hai lịch race và chứng minh queue thay vì suy từ first-arrival. Fixture chỉ ở DB disposable; giữ audit/input cô lập đến global-setup kế tiếp, đóng contexts/pool.
