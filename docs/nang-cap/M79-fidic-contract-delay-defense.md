# M79 — AI FIDIC Contract Dispute & Delay Defense Dossier Generator

> **Trạng thái:** Đã hoàn thành (2026-08-19)  
> **Phụ thuộc:** `migrations/0113_fidic_delay_claims.sql`, `lib/engineering-fidic-claim.ts`

## 1. Mục tiêu & Bối cảnh

Tự động hóa lập hồ sơ khiếu nại gia hạn thời gian hoàn thành (Claim for Extension of Time - EOT) và chi phí kéo dài dự án (Prolongation Costs) theo chuẩn các mẫu hợp đồng quốc tế FIDIC (Red Book, Yellow Book 1999 & 2017) và Hợp đồng mẫu Việt Nam, bảo vệ quyền lợi tài chính và miễn trừ phạt trễ hạn cho Nhà thầu thi công MEPF.

## 2. Năng Lực Cốt Lõi

1. **FIDIC Clause Mapping Rule Engine (`mapDelayEventToFidicClause`):**
   - Tự động đối chiếu nguyên nhân chậm trễ vào điều khoản hợp đồng:
     - Sub-Clause 2.1 (Chậm bàn giao mặt bằng) $\rightarrow$ Quyền EOT + Cost + Profit.
     - Sub-Clause 1.9 (Chậm bản vẽ / chỉ dẫn kỹ thuật) $\rightarrow$ Quyền EOT + Cost + Profit.
     - Sub-Clause 4.12 (Điều kiện vật chất không lường trước) $\rightarrow$ Quyền EOT + Cost.
     - Sub-Clause 8.4(c) (Thời tiết bất lợi đặc biệt) $\rightarrow$ Quyền EOT.
     - Sub-Clause 13.3 (Lệnh thay đổi / phát sinh thiết kế) $\rightarrow$ Quyền EOT + Cost + Profit.
2. **28-Day Notice Compliance Sentinel (`checkNoticeCompliance`):**
   - Kiểm tra tính tuân thủ thời hạn nộp thông báo khiếu nại ban đầu trong vòng 28 ngày kể từ ngày xảy ra sự kiện theo **Sub-Clause 20.1 / 20.2 FIDIC**.
   - Cảnh báo cờ đỏ (_Time-Bar Risk_) nếu quá hạn nhằm tránh mất quyền khiếu nại.
3. **Time Impact Analysis (TIA) & Prolongation Cost Engine (`calculateTimeImpactAnalysis`):**
   - Phân tích tương quan sự kiện với Đường găng tiến độ (Critical Path).
   - Tính toán số ngày trễ thực tế và tổng chi phí quản lý gián tiếp phát sinh ($Days \times Overhead$).
4. **Bilingual Claim Dossier Generator (`generateFidicClaimDossier`):**
   - Tự động biên soạn văn bản hồ sơ pháp lý chuẩn song ngữ, tập hợp chứng cứ hiện trường (Nhật ký thi công, RFI, NCR) sẵn sàng đệ trình Kỹ sư Tư vấn / Chủ Đầu Tư.

## 3. Schema & DDL

- Migration `0113_fidic_delay_claims.sql`: Tạo 2 bảng `engineering_fidic_claims` và `engineering_fidic_claim_evidences` có RLS đa dự án nghiêm ngặt.

## 4. API Endpoints

- `GET/POST /api/engineering/fidic/claims`: Quản lý danh mục hồ sơ khiếu nại EOT.
- `POST /api/engineering/fidic/claims/generate-dossier`: Tính toán TIA và tự động sinh bản thảo hồ sơ khiếu nại FIDIC.

## 5. UI/UX

- Giao diện `/engineering/fidic-claims` (Form thiết lập sự kiện chậm trễ, Cảnh báo 28-Day Time-Bar Sentinel, Khung soạn thảo và xuất bản văn bản Claim Dossier Markdown chuẩn).
