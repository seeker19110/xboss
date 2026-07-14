# G07 — Khởi động & Tổ chức

> Gộp từ M23 (khởi động & pháp lý) + M24 (nhân sự & tổ chức). Cả 2 đã triển khai — tóm tắt tra cứu, lịch sử PR xem `PROGRESS.md`.

## M23 — Khởi động & Pháp lý

Dashboard giai đoạn khởi động: hồ sơ pháp lý (giấy phép XD, phê duyệt QH/thiết kế, HĐ chính) + bàn giao mặt bằng/khảo sát/trắc đạc + huy động công trường. `legal_documents` (`kind`, hiệu lực, **1 file chính/giấy phép** — YAGNI so với bảng documents riêng) + `mobilization_items` (checklist, `category` mat_bang/khao_sat/trac_dac/huy_dong — **bảng riêng, không nhồi vào `work_fronts`** vì ngữ nghĩa khác mặt bằng thi công). `lib/kickoff.ts::expiringLegalDocs(days=30)` → notification `legal_expiry`; `kickoffReadiness` = % checklist huy động hoàn thành. UI (`/kickoff`): hub 5 tab. Quyền ghi: `CAN.manageKickoff` (admin/pm).

## M24 — Nhân sự & Tổ chức

Dashboard tổ chức công trường: sơ đồ tổ chức + RACI, nhân sự (**tách khỏi `users`** — công nhân không cần tài khoản đăng nhập), tổ đội (crew), chấm công (ưu tiên số 1, dùng nhiều nhất), đào tạo & chứng chỉ + cảnh báo hết hạn. `personnel` (CCCD nhạy cảm, ẩn khỏi payload nếu người gọi không phải admin/pm) + `crews` + `crew_members` + `attendance` (chấm theo người **hoặc** gộp headcount theo tổ, `personnel_id NULL` = gộp) + `certifications` + `raci_matrix`. `diary_manpower.crew_id` nối M05 (giữ tương thích, cột `crew` text cũ vẫn đọc được). `lib/hr.ts::expiringCertifications(days=30)` → notification `cert_expiry` (dùng chung cho HSE thẻ an toàn). **Lương không thuộc M24** — để M27 (Tài chính), M24 chỉ tới chấm công (đầu vào lương). UI: `/attendance` (ưu tiên, mobile-first), `/personnel`, `/org` (sơ đồ + RACI).

## Test

`tests/kickoff.test.ts`, `tests/hr.test.ts` (thuần + tích hợp, `TEST_DATABASE_URL`); `e2e/authed/kickoff.spec.ts`, `attendance.spec.ts`, `personnel.spec.ts`, `org.spec.ts` (desktop+mobile+axe).
