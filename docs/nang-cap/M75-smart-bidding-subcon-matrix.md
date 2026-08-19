# M75 — Ma Trận So Sánh Đấu Thầu & Kiểm Soát Đơn Giá Thầu Phụ (Smart Procurement & Subcon Bidding Engine)

> **Trạng thái:** Đã hoàn thành (2026-08-19)  
> **Phụ thuộc:** `migrations/0109_smart_bidding_procurement.sql`, `lib/engineering-bidding-matrix.ts`

## 1. Mục tiêu & Bối cảnh

Tự động hóa quá trình so sánh báo giá, phân tích tính hợp lý của đơn giá chào thầu giữa các Nhà thầu phụ / Nhà cung cấp vật tư MEPF so với Dự toán nội bộ (Internal Target Budget), ngăn chặn rủi ro thầu phụ dồn giá giai đoạn đầu (Front-loading) hoặc phá giá thiếu năng lực (Underbidding / Unbalanced Bidding).

## 2. Năng Lực Cốt Lõi

1. **Bid Leveling Matrix (Đối soát đa chiều từng hạng mục dòng):**
   - So sánh đơn giá từng mã công việc/vật tư (`calculateLineItemVariances`) giữa Target Budget và các Vendor.
   - Tính toán tỷ lệ chênh lệch $\Delta\%$ và chênh lệch thành tiền VND.
2. **Price Skewing & Front-Loading Radar:**
   - Thuật toán phát hiện bất thường giá (`detectPriceSkewing`): Phân tích tương quan độ lệch giữa giai đoạn đầu (Early stage: ống, vỏ) và giai đoạn cuối (Late stage: van, thiết bị).
   - Tự động cắm cờ `Front-Loading Risk` khi đơn giá đầu kỳ tăng cao bất thường nhằm rút tiền tạm ứng trước.
3. **Multi-Criteria Ranking & Decision Optimization:**
   - Thuật toán chấm điểm tổng hợp đa tiêu chí (`evaluateVendorRanking`): Giá (50%), Năng lực (25%), An toàn HSE (15%), Tuân thủ Kỹ thuật (10%).
   - Đưa ra đề xuất chọn thầu tối ưu kèm mã băm Provenance Token SHA-256 bất biến.

## 3. Schema & DDL

- Migration `0109_smart_bidding_procurement.sql`: Tạo 3 bảng `engineering_bidding_packages`, `engineering_bidding_vendor_quotes`, `engineering_bidding_analysis_runs` có RLS đa dự án nghiêm ngặt.

## 4. API Endpoints

- `GET/POST /api/engineering/bidding/packages`: Quản lý danh sách gói thầu.
- `GET/POST /api/engineering/bidding/quotes`: Quản lý hồ sơ báo giá nhà thầu.
- `POST /api/engineering/bidding/analyze`: Chạy ma trận đối soát và xếp hạng.

## 5. UI/UX

- Giao diện `/engineering/bidding-matrix` (Bảng đối soát đa nhà thầu, Radar phát hiện Front-loading, Card đề xuất chọn thầu tối ưu).
