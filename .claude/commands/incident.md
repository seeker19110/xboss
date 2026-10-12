---
description: Xử lý sự cố production (incident response) — giảm thiệt hại trước, tìm nguyên nhân sau; kết bằng post-mortem cho SEV1/SEV2
---

Kích hoạt quy trình xử lý sự cố production. Đọc kỹ `docs/ops/incident-response.md` và **làm theo đúng các bước trong đó** (nguồn sự thật: severity, 7 bước, nguyên tắc, mẫu post-mortem). Lõi: **giảm thiệt hại TRƯỚC, tìm nguyên nhân SAU**.

> Đây là việc đụng **production & dữ liệu thật** → thuộc nhóm "hành động cần quyền chưa cấp": không suy quyền từ ủy quyền kỹ thuật (CLAUDE.md §9, contract §3d). Cân nhắc rollback **trước** khi chạy, và xác nhận với người dùng trước mọi bước lên dữ liệu thật hoặc không thể hoàn tác.

> 💡 Lệnh lấy từ `projects-template` @ `59bd1d1` (ADR-0014 của XBoss). Model theo `CLAUDE.md` mục "Quy trình theo mức rủi ro".
> Các chỗ ghi `CLAUDE.md §N`, "contract §3d" hay số ADR trong lệnh là của **repo khung** (`docs/framework/02-ai-rules-and-project-template.md`,
> `docs/framework/standard-delivery.md`); ở XBoss, `CLAUDE.md` + `docs/adr/` của XBoss thắng — đối chiếu ở `docs/framework/XBOSS.md`.

Thiếu `docs/ops/incident-response.md` (chưa áp khung) → báo người dùng cân nhắc `copy-framework.sh`; không tự suy ra quy trình.

Bắt đầu: hỏi nhanh **triệu chứng + nguồn cảnh báo**, rồi vào **Bước 1**.
