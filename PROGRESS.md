# PROGRESS — XBoss

## Đang làm

/autopilot tiếp tục A5-AC03 trên nhánh codex/autopilot-a5-ac03 theo [PLAN](docs/autopilot/A5-AC03-PLAN.md), nhật ký quyết định riêng D-001–D-005. Final verify26c25256 phát hiện flake ở barrier; D-005 sửa thành khóa taskA chung và bắt buộc cạnh queue. Sau sửa20 ordered cases qua năm lượt mỗi lịch/viewport và bộ13/13 đều pass,0 skip. Phạm vi gồm: năm ca browser desktop/mobile cho bốn nhóm nghiệp vụ chứng minh overlap bằng khóa DB, bảo vệ state/history/approval_source, cộng regression mất ACK.

[PR #663](https://github.com/seeker19110/xboss/pull/663) đã merge theo chỉ dẫn tại main 2adda49d. Bản vá doctor ở [#664](https://github.com/seeker19110/xboss/pull/664), head a81d7d9a:37 regression pass,0 skip; doctor/typecheck và18 cổng tĩnh xanh, review khác model không còn P1/P2; Final verify11 Gate stable và toàn bộ CI xanh; merge-check HUMAN (checker nhạy cảm/source>150), T-012 loop trước defer. Nhánh A5 đã nhận predecessor, doctor --fix tại đây0 lỗi/0 cảnh báo; loop A5 mới độc lập, không reset evidence loop trước.

## Tiếp theo

B13/13 và20 ordered cases kiểm lặp pass,0 skip; hai lịch có cạnh khóa thực. P/H concurrency/approval_source18/18, typecheck/build và18 cổng tĩnh xanh; reviewer khác model không có P1/P2 sau D-005. Sáu MUST đủ bằng chứng; final verify phải kiểm lại bảy Gate ổn định sau commit, CI cập nhật theo HEAD ở PR. Root kiểm lại các Gate thật trên PostgreSQL disposable và production browser, reviewer độc lập soát diff. Nếu không chứng minh overlap hoặc thiếu nhánh acceptance thì giữ A5-AC03 PARTIAL; không nới assertion hoặc dùng Promise.all thay proof. Mở PR test/docs riêng, stack lên doctor nếu chưa merge; CI theo đúng HEAD. Merge PR mới theo L1 gom chờ người sau khi kết quả sẵn sàng.

## Quyết định

[A5 D-001–D-005](docs/autopilot/A5-AC03-DECISIONS.md) giữ đủ AC03 và contract M120: request tick online mới có thể đóng dấu lại; flags/progress/status/history không nhân, retry cùng key kiểm receipt/effect qua mất ACK. SQL chỉ dựng input0%; mọi tick/duyệt/hủy chạy qua HTTP/cookie thật. Hai PM khác ID cùng org/project, context đúng thiết bị và storageState rỗng.

A4-AC06 đã tích hợp qua #663:13/13 browser,18/18 P/H, build/typecheck/static xanh; regression chung43 pass/2 skip desktop có sẵn cho ca mobile. BLUEPRINT toàn sản phẩm1152 MUST/639 SHOULD chưa audit; không xác nhận M/O hoặc release. Người dùng thu hồi AGENTS.md cũ; không khôi phục WIP/file xóa ở checkout gốc.

## Bàn giao phiên

Base main đã merge `2adda49d592d744fb6eddb0954bb6f035196f5a0`; nhánh hiện tại codex/autopilot-a5-ac03. State/evidence riêng ở .autopilot; deadline6 giờ từ init,28 vòng,60000 token dự toán mềm theo D-004 và3600 giây mỗi Gate. Không sửa app/CI/hook/schema/quyền hoặc production trong slice test này.

[Lịch sử nguyên byte](PROGRESS-HISTORY-2026-10-22.md), SHA256 ce10b14403c8be6fdba16cb755e0b6c919d3552624a3f39b3862d4f95edc8009. Bằng chứng chia sẻ ở PR/CI; [acceptance](docs/autopilot/A5-AC03-ACCEPTANCE.md) đã có bằng chứng cục bộ, chờ final verify/CI trên HEAD cuối.
