# M136 — checkpoint autopilot 24/10/2026

**Đã kiểm chứng:** M136 qua #675 đã deploy, public smoke desktop/mobile và health/readiness
kiểm lại 24/10 đạt. Chuỗi SHA/CI/deploy và giới hạn ở [release.md](release.md).

**NO-GO đóng toàn goal:** F2–F3 chưa có UAT/usage. F4 bản vá Zod mới phát hiện qua CI chưa
merge/deploy; public health tốt không thay kiểm tra bảo mật. Không xóa capability/dữ liệu thật.

## Phần tự làm

[PR #676](https://github.com/seeker19110/xboss/pull/676) lưu bằng chứng và đồng bộ hồ sơ;
D-002 bổ sung riêng Zod 4.6.5→4.6.6 vì advisory mức high chặn CI. Audit production sau vá
0 vulnerability, env 11/11, engineering DB test 55/55 (0 skip) và production build mới đạt;
gate mới 18/18 đạt; final verify và CI kiểm lại trên HEAD cuối. [Hồ sơ bản vá](zod-repair.md).

Final verify chạy lại Gate trên cây cuối; không dùng CI #675 hoặc HEAD trước vá thay HEAD mới.
Không sửa app/route/schema, quyền, cấu hình cổng hoặc dependency khác.

## Việc cần người

1. **T-006:** merge PR #676 theo `xt.yaml: merge_autonomy: L1` khi mọi kiểm tra đã qua;
   sau đó CI main/deploy cần thành công và kiểm chứng bản vá trước đóng F4.
2. **T-004 / M136-UAT-001:** bố trí 3–5 người kỹ sư/thầu phụ/PM, gồm Safari/cảm ứng thật;
   thực hiện bảng tác vụ trong [runbook](../../upgrade-ux-performance.md), ghi thời gian,
   trợ giúp, lỗi và kết luận owner. Browser giả lập không thay UAT.
3. **T-005 / M136-USAGE-001:** operator xác nhận nguồn, scope, coverage, người chịu trách
   nhiệm và ngày thu usage thực; quan sát đủ chu kỳ rồi owner quyết định giữ/gộp/gỡ.
   Chưa có ngày bắt đầu cửa sổ được kiểm chứng; không lấy ngày deploy để tính 30 ngày.

Các mục trên được `loop defer`, giữ task/MUST mở. Sau khi có bằng chứng và quyết định thực,
cập nhật hồ sơ rồi `python3 .xtemplates/scripts/xt.py loop resume --reason '<bằng chứng mới>'`.
