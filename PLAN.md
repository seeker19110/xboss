# PLAN.md — Sau ENG-4: kiểm chứng trước, mở rộng sau

**Cập nhật:** 2026-08-15
**Nguồn trạng thái:** `PROGRESS.md` và các commit `cdecf55`, `a6f98da`, `f14ea21`, `1186efb`.

## Trạng thái kế hoạch trước đó

M64 — Upload kế hoạch & tracking theo hệ đã hoàn tất ngày 2026-08-09 (migration `0082`, API/UI/test và CI). Không còn là công việc đang thực hiện; không lập lại triển khai M64 trừ khi có lỗi hoặc yêu cầu nghiệp vụ mới được xác nhận.

## Mục tiêu giai đoạn

Đưa nền tảng Engineering OS ENG-1→ENG-4 vừa hoàn tất từ trạng thái **đã có code** sang **đã được xác minh có kiểm soát trong vận hành**. Không triển khai Digital Twin, Predictive OS hoặc autonomy trước các cổng bên dưới.

## Việc 1 — Xác minh phát hành ENG-1→ENG-4 (`route: verification`)

- **Phạm vi:** staging trước production cho migrations `0084_engineering_core.sql` đến `0087_engineering_agents.sql`; chạy đầy đủ integration test với `TEST_DATABASE_URL`, E2E, build và kiểm tra rollback/backup theo quy trình deploy.
- **Tiêu chí đạt:** migration append-only chạy sạch trên bản sao dữ liệu; không lỗi RLS/quyền/API key; các luồng ingest → suggestion → workflow → agent session hoạt động đúng phân quyền; không có thay đổi tự động vào task/BOQ/thanh toán.
- **Điểm dừng:** bất kỳ lỗi migration, cách ly dự án/tổ chức, hoặc Gate/SoD sai phải được sửa và kiểm thử lại trước production.

## Việc 2 — Pilot tích hợp MEPF-Agents (`route: integration`)

- **Repository đối tác:** [seeker19110/MEPF-Agents](https://github.com/seeker19110/MEPF-Agents) — hệ Multi-Agent tư vấn MEPF (HVAC, điện, nước, PCCC, QS, CAD/BIM và reviewer). Đây là nguồn tích hợp chính thức; chưa cần clone, vendor hoặc chia sẻ database.
- **Phạm vi:** cấp API key scope `engineering` theo từng dự án, gửi dữ liệu mẫu có `external_key` ổn định, kiểm thử ingest lặp lại, evidence/provenance, claims và conflict resolution.
- **Tiêu chí đạt:** idempotency xác nhận bằng gửi lại cùng payload; object và suggestion không lẫn dự án; người có quyền duyệt được nội dung/evidence; conflict có cách phân xử và người chốt rõ ràng.
- **Ranh giới cứng:** XBoss là bên điều phối/lưu vết. Agent không có quyền tự ghi task, BOQ, payment hoặc tự duyệt workflow.

## Việc 3 — Khắc phục dữ liệu ngày Excel cũ (`route: operations`)

- **Phạm vi:** sao lưu, chạy `scripts/backfill-import-dates.ts` ở chế độ preview trên staging; đối chiếu danh sách dòng dự kiến sửa với file Excel nguồn; chỉ khi được xác nhận mới chạy `--apply` trên production.
- **Tiêu chí đạt:** dữ liệu chỉ thay đổi khi có đúng dấu vết lệch ngày; các dòng đã người dùng sửa tay được giữ nguyên; script chạy lại không tạo thay đổi mới.
- **Điểm dừng:** có mã task trùng đa dự án/chênh nguồn không giải thích được thì dừng và chọn `--project=<id>` hoặc xử lý thủ công.

## Việc 4 — Lập kế hoạch riêng cho audit UUID (`route: specification`)

- **Phạm vi:** thiết kế migration tương thích ngược để audit các thực thể UUID `engineering_*`, bao gồm dữ liệu lịch sử, index, truy vấn UI, rollback và tải trên bảng `audit_log`.
- **Tiêu chí đạt:** đặc tả + proof-of-concept trên staging; không sửa migration cũ hay chạy trực tiếp trên production khi chưa có kế hoạch triển khai được phê duyệt.

## Cổng mở rộng sau đó

Chỉ cân nhắc Engineering OS nâng cao, Digital Twin, Predictive OS hoặc Controlled Autonomy khi đồng thời đạt:

1. ENG-1→ENG-4 có traffic thật từ MEPF-Agents và pilot qua ít nhất một chu kỳ vận hành.
2. UAT của PM/QA xác nhận Gate 0, risk profile, SoD và cơ chế `no_consensus` hoạt động phù hợp.
3. Monitoring, audit và quy trình xử lý sự cố đủ cho dữ liệu kỹ thuật thật.
4. Có owner nghiệp vụ, phạm vi side effect và cơ chế rollback được phê duyệt bằng workflow.

## Loại khỏi giai đoạn này

- Không thêm mô hình AI/LLM tự quyết hoặc cơ chế majority vote.
- Không tự động thực thi thay đổi nghiệp vụ.
- Không mở rộng module mới chỉ vì đã có khung dữ liệu kỹ thuật.
