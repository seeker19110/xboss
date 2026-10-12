---
description: Nâng cấp một/nhóm dependency theo yêu cầu cụ thể (khác /maintain định kỳ) — đọc changelog, kiểm breaking change, chạy test, một PR riêng
---

> 💡 Lệnh lấy từ `projects-template` @ `59bd1d1` (ADR-0014 của XBoss). Model theo `CLAUDE.md` mục "Quy trình theo mức rủi ro".
> Các chỗ ghi `CLAUDE.md §N`, "contract §3d" hay số ADR trong lệnh là của **repo khung** (`docs/framework/02-ai-rules-and-project-template.md`,
> `docs/framework/standard-delivery.md`); ở XBoss, `CLAUDE.md` + `docs/adr/` của XBoss thắng — đối chiếu ở `docs/framework/XBOSS.md`.

Kích hoạt quy trình **nâng cấp dependency theo yêu cầu cụ thể** (khác `/maintain` — quét định kỳ toàn repo theo chu kỳ; lệnh này chạy khi người dùng chỉ đích danh một/nhóm thư viện cần nâng, hoặc có CVE cần vá gấp).

> **TRIGGER:** người dùng nói "nâng cấp thư viện X", "cập nhật dependency Y lên bản mới", "có CVE ở gói Z, vá đi", hoặc dependency-review CI báo lỗ hổng cụ thể cần xử lý ngay (không đợi chu kỳ `/maintain`).

## Bước 1 — Xác định phiên bản đích bằng nguồn sống
Không dùng trí nhớ mô hình cho số phiên bản (CLAUDE.md §4). Tra bản mới nhất/bản vá lỗ hổng qua registry gói (npm/PyPI/crates.io/…) hoặc advisory chính thức (GitHub Security Advisories/NVD). Việc cơ học này giao subagent `version-check` nếu có sẵn.

## Bước 2 — Đọc CHANGELOG/release notes giữa bản hiện tại và bản đích
- Liệt kê **breaking change** thật sự ảnh hưởng code đang dùng (API đổi chữ ký, hành vi mặc định đổi, deprecation đã gỡ).
- Nâng **major** version → coi là thay đổi đáng kể, nếu ảnh hưởng lan rộng thì dừng và hỏi chỉ theo CLAUDE.md §9 (thiếu mục tiêu/dữ kiện không tự xác minh · không có phương án đạt chất lượng trong scope/budget · cần quyền chưa cấp) và `docs/framework/standard-delivery.md` §3d — nêu rõ rủi ro trước khi làm.
- Nâng **patch/minor** không breaking → làm thẳng, không cần hỏi thêm.

## Bước 3 — Nâng cấp + sửa điểm chạm breaking change
Cập nhật file khai báo dependency + lockfile bằng đúng công cụ hệ sinh thái (không sửa lockfile bằng tay). Sửa mọi điểm gọi bị breaking change ảnh hưởng.

## Bước 4 — Qua cổng đầy đủ
Chạy `/gate` (build/type/lint/format/test toàn bộ liên quan, không chỉ phần đổi). Dependency ảnh hưởng diện rộng (runtime, framework chính) → chạy thêm smoke test luồng chính thật (đúng CLAUDE.md §6).

## Bước 5 — PR riêng, không gộp vào tính năng khác
Một PR chỉ chứa nâng cấp dependency (+ điểm chạm phải sửa kèm theo) — không trộn với thay đổi tính năng khác, để dễ revert nếu có vấn đề. Mô tả PR ghi: phiên bản cũ → mới, lý do (tính năng mới/vá CVE/theo yêu cầu), breaking change đã xử lý.

## Ranh giới
- Không tự ý nâng **major** version của dependency lõi (framework, DB driver) khi chỉ được yêu cầu chung chung "cập nhật dependency" — hỏi lại phạm vi cụ thể trước.
- Không tắt/nới lỏng dependency-review CI để né lỗi — sửa gốc hoặc báo người dùng nếu không sửa được ngay.
- Việc quét **toàn repo theo chu kỳ** (không chỉ định gói cụ thể) vẫn thuộc `/maintain`, không dùng lệnh này thay thế.
