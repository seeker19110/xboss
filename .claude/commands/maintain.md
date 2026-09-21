---
description: Bảo trì định kỳ — quét (git/dependency/PROGRESS.md/allowlist) → triage → kế hoạch chờ duyệt → thực thi từng PR nhỏ
---

Kích hoạt **vòng bảo trì định kỳ** cho XBoss. Tham số: `/maintain` (mặc định, có kiểm dependency)
· `/maintain quick` (bỏ dependency, chỉ mất vài giây) · `/maintain continue` (tiếp kế hoạch đã
duyệt còn dở dang).

> **Khác `/review` và `docs/audit.md`:** `/review` soát **một diff cụ thể** trước khi mở PR;
> `docs/audit.md` là checklist rà **chất lượng nội tại** sâu, không định kỳ. `/maintain` nhắm vào
> thứ **mục nát theo thời gian** dù không ai đổi code (dependency lỗi thời, nhánh git chết,
> `PROGRESS.md` lỗi thời, allowlist hết lý do hợp lệ).

## PHA 0 — tiền kiểm

- Đảm bảo đang ở `main` sạch (không có thay đổi chưa commit) và đã `git fetch origin`.
- Có `docs/ops/MAINTENANCE-PLAN.md` còn mục chưa xong → đó là `/maintain continue`, nhảy thẳng
  PHA 3, không quét lại từ đầu (trừ khi người dùng bảo quét lại).

## PHA 1 — quét

Giao subagent `maintainer` chạy `bash scripts/maintenance-sweep.sh` (`quick` → thêm `--no-deps`).
Không tự bịa kết quả quét.

## PHA 2 — triage + kế hoạch, rồi DỪNG CHỜ DUYỆT

`maintainer` viết `docs/ops/MAINTENANCE-PLAN.md` theo mẫu trong `.claude/agents/maintainer.md`:
🔴 trước 🟡, mỗi mục là một PR nhỏ có tiêu chí xong đo được + nhãn `route:`; mục chạm bảo mật/dữ
liệu thật/breaking change/major bump → **DỪNG & HỎI**. Trình bày kế hoạch cho người dùng bằng
`AskUserQuestion` (duyệt toàn bộ / duyệt một phần / sửa) — **chưa duyệt thì không sửa source**.

## PHA 3 — thực thi từng mục đã duyệt

Mỗi mục một nhánh riêng, giao worker theo `route:` (bảng trong `CLAUDE.md`), sửa xong chạy đủ cổng
kiểm liên quan + lint/typecheck/test, mở PR riêng theo đúng quy ước `CLAUDE.md` (mô tả đủ, cập
nhật `PROGRESS.md` trong cùng PR nếu chạm nghiệp vụ), merge khi CI xanh theo "Merge NGAY khi CI
xanh". Không gộp nhiều mục vào một PR khổng lồ. Lockfile/migration → tuần tự, không song song.
Đánh dấu mục đã xong trong `docs/ops/MAINTENANCE-PLAN.md`.

## PHA 4 — hội tụ + đóng

Quay về `main`, chạy lại `bash scripts/maintenance-sweep.sh`: còn 🔴 → lặp PHA 2–3 cho phần còn
lại. Hết 🔴 và mọi mục đã duyệt xong → cập nhật `PROGRESS.md` (mốc "bảo trì <ngày>"), xoá hoặc ghi
ĐÓNG kế hoạch trong `docs/ops/MAINTENANCE-PLAN.md`.

## Không bao giờ

- Tắt/skip test, nới ngưỡng, thêm miễn trừ vào allowlist để cổng xanh.
- Nâng major dependency hàng loạt không hỏi.
- Xoá nhánh remote/dữ liệu mà chưa được duyệt rõ ràng.
- Gộp nhiều mục bảo trì vào một PR.

Bắt đầu **PHA 0** ngay.
