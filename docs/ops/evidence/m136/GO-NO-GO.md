# M136 — checkpoint autopilot 24/10/2026

**GO:** giữ bản M136 đã phát hành qua #675; rollout/public smoke VERIFIED, kiểm lại desktop/
mobile và health/readiness ngày 24/10 đạt. Chuỗi SHA/CI/deploy và giới hạn ở [release.md](release.md).

**NO-GO đóng toàn goal:** F2–F3 chưa có bằng chứng. Không xóa capability sống hoặc dữ liệu thật.

## Phần tự làm

Lát tài liệu [PR #676](https://github.com/seeker19110/xboss/pull/676) đã commit/push;
18/18 cổng tĩnh và review độc lập đạt. Final verify của loop chạy lại Gate trên cây cuối;
CI của PR được theo dõi trên GitHub, không lấy kết quả CI #675 thay cho HEAD #676.
Không sửa mã chạy, schema, quyền, cấu hình cổng hoặc dependencies.

## Việc cần người

1. **T-006:** merge PR #676 theo `xt.yaml: merge_autonomy: L1` khi mọi kiểm tra đã qua.
2. **T-004 / M136-UAT-001:** bố trí 3–5 người kỹ sư/thầu phụ/PM, gồm Safari/cảm ứng thật;
   thực hiện bảng tác vụ trong [runbook](../../upgrade-ux-performance.md), ghi thời gian,
   trợ giúp, lỗi và kết luận owner. Browser giả lập không thay UAT.
3. **T-005 / M136-USAGE-001:** operator xác nhận nguồn, scope, coverage, người chịu trách
   nhiệm và ngày thu usage thực; quan sát đủ chu kỳ rồi owner quyết định giữ/gộp/gỡ.
   Chưa có ngày bắt đầu cửa sổ được kiểm chứng; không lấy ngày deploy để tính 30 ngày.

Các mục trên được `loop defer`, giữ task/MUST mở. Sau khi có bằng chứng và quyết định thực,
cập nhật hồ sơ rồi `python3 .xtemplates/scripts/xt.py loop resume --reason '<bằng chứng mới>'`.
Không cần mở phiên/provider trả phí hay thay đổi policy để hoàn tất phần đối soát này.
