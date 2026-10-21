# GO / NO-GO — A4-AC06 và doctor · 22/10/2026

**A4-AC06 đã merge. Bản vá doctor sẵn sàng kiểm chứng/review; NO-GO cho nghiệm thu hoặc triển khai toàn sản phẩm.**

## Đã tích hợp

[#663](https://github.com/seeker19110/xboss/pull/663) merge theo chỉ dẫn người dùng tại `2adda49d592d744fb6eddb0954bb6f035196f5a0`, sau khi CI head `a327f4e7bcd33d5f2038175db696898afee5b51d` xanh. #651–#662 đã merge trước đó.

- A4 browser/API/DB thật:6 ca × desktop/mobile + setup,13/13 pass, không mock hoặc skip.
- P/H costs/portfolio:18/18 pass,0 skip; build/typecheck và18/18 cổng tĩnh xanh.
- A4/home/IPC/offline chung:43 pass,2 skip desktop có sẵn cho ca chỉ dành mobile; sửa membership fixture theo D-006, giữ assertion/policy.
- Review độc lập khác model đã đóng finding A4; [acceptance](docs/autopilot/A4-AC06-ACCEPTANCE.md) và [S15 §10](docs/nang-cap/AUDIT-S15-RELEASE-CANDIDATE.md#10-checkpoint-22102026--bổ-sung-lớp-b-cho-a4-ac06) chỉ xác nhận P/H/B của A4-AC06.

## Bản vá doctor

User đã cho phép sửa checker tại D-007. Nhánh `codex/autopilot-doctor` giữ nguyên hooks/settings/quyền/CI; full relative path, filesystem gốc và chỉ loại navigation toàn dấu chấm. Regression kiểm thiếu/syntax của hook trực tiếp, _lib.sh, guard.py, hidden file, ./, ../, nested và thư mục trung gian thiếu; không sao chép regex để test chính nó. Xem [FB-002](docs/xtemplates-feedback/FB-002.md) và D-008 cho các blind spot phát hiện qua review.

T-008 merge663 đã đóng; T-009/T-011 có gate thực. Phải kiểm lại mọi gate bằng loop verify trên commit cuối và required CI trên head PR; trạng thái cụ thể ở PR. Merge PR mới vẫn theo L1; đây là bước tích hợp riêng sau khi bản vá đã review/kiểm xong.

## Tiếp tục và giới hạn

A5-AC03 còn PARTIAL ở S15: tiếp tục slice browser riêng cho batch/approve concurrency và approval_source, chạy lại regression mất ACK. Không dùng Promise.all thay bằng chứng overlap DB, không nâng PASS trước khi đủ acceptance.

[BLUEPRINT](BLUEPRINT.md) toàn sản phẩm còn1152 MUST/639 SHOULD chưa audit; M/O thiết bị thật, Safari/iOS, hợp đồng thật, restore/PITR và production chưa được xác nhận. Không deploy/ký RELEASE_VERIFIED. D-001–D-008 ở [DECISIONS](docs/autopilot/DECISIONS.md). Khi chạy thật phải thu bằng chứng release riêng theo runbook hiện hành.
