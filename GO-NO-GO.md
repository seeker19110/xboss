# GO / NO-GO — A4-AC06 · 22/10/2026

**GO cho slice kiểm chứng A4-AC06 để review PR. NO-GO cho nghiệm thu hoặc triển khai toàn sản phẩm.**

## Phạm vi và bằng chứng

Các PR cũ #651–#662 đã merge; base main `a723c578afd1f3c08ccd305fb809d0a7309ae152`.
Nhánh `codex/autopilot-a4-ac06` bổ sung test và tài liệu, không đổi app/backend/schema/quyền/CI.

- Browser production, API/DB thật: 6 ca × desktop/mobile = 12 lượt + setup, **13/13 pass**, không mock hoặc skip.
- Oracle costs/portfolio với PostgreSQL disposable riêng: **18/18 pass**, không skip.
- Typecheck, production build và **18/18 cổng tĩnh** xanh. Lệnh và phạm vi ở [acceptance](docs/autopilot/A4-AC06-ACCEPTANCE.md).
- D-006/T-010: chạy chung A4/home/IPC/offline **43 pass, 2 skip**; hai skip có sẵn chỉ áp dụng viewport mobile nên không chạy trên desktop. Sửa membership fixture sau khi tái hiện A4 làm home mất fallback; không đổi policy hoặc assertion. Review độc lập D-006 không có finding actionable.
- Review tự động độc lập khác model: hai finding đã sửa và đóng. Required CI và kiểm lại `loop verify` phải xanh trên cây cuối trước bàn giao; trạng thái cụ thể ghi ở PR, không thay bằng chứng cục bộ cho CI.
- [S15 §10](docs/nang-cap/AUDIT-S15-RELEASE-CANDIDATE.md#10-checkpoint-22102026--bổ-sung-lớp-b-cho-a4-ac06) chỉ nâng A4-AC06 theo P/H/B, giữ các snapshot lịch sử và M/O.

## Còn chờ người

1. **T-008 — merge PR mới theo L1:** mở [PR #663](https://github.com/seeker19110/xboss/pull/663) của `codex/autopilot-a4-ac06`, xem diff/review và CI trên đúng HEAD; merge khi các check bắt buộc xanh. Không dùng quyền merge 12 PR cũ để tự merge PR mới.
2. **T-009 — checker doctor:** review riêng `HOOK_SIBLING_RE` của `.xtemplates/scripts/xt.py`, tái hiện đường dẫn `$(dirname "$0")/../..` bị nhận `..` thành file; sửa checker để phân biệt thư mục gốc và sibling file, giữ assertion bảo vệ hook thật; chạy regression và doctor. Không sửa hook hoặc hạ cổng trong slice này. [FB-001](docs/xtemplates-feedback/FB-001.md) còn mở.

Sau khi xử lý hai mục, chạy `python3 .xtemplates/scripts/xt.py loop resume --reason "Đã review/merge PR và xử lý checker"` rồi chạy lại các gate tương ứng và `loop verify`.

## Giới hạn kết luận

[BLUEPRINT.md](BLUEPRINT.md) toàn sản phẩm còn 1152 MUST/639 SHOULD chưa audit; không miễn hoặc tick các mục đó.
Chưa xác nhận UAT thiết bị thật, Safari/iOS thật, hợp đồng/IPC-PDF thật, restore/PITR hoặc production.
Không chạy benchmark A4-AC08, không tạo exporter costs mới, không deploy hoặc ký `RELEASE_VERIFIED`.
Quyết định tự duyệt D-001–D-006 ở [DECISIONS](docs/autopilot/DECISIONS.md).

## Khi chạy thật

Người phụ trách dùng runbook và các cổng M/O hiện hành để thu bằng chứng release riêng; không dùng kết quả browser với dữ liệu test thay cho dữ liệu vận hành. Tiếp tục các AC còn PARTIAL bằng slice và PR riêng sau khi PR này được review.
