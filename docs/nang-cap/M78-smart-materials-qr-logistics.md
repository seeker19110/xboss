# M78 — Smart Materials QR Logistics & Mobile Barcode Receiving Scanner

> **Trạng thái:** Đã hoàn thành (2026-08-19)  
> **Phụ thuộc:** `migrations/0112_materials_qr_logistics.sql`, `lib/engineering-qr-logistics.ts`

## 1. Mục tiêu & Bối cảnh

Quản lý chuỗi cung ứng và hành trình giao nhận vật tư (Chain of Custody) bằng mã QR định danh chuẩn hóa, cho phép Kỹ sư/Thủ kho dùng Camera điện thoại PWA quét nhận hàng nhanh tại công trường và tự động đối soát 3 bên giữa Phiếu Giao Hàng (DO) vs Thực nhận vs Đơn Đặt Hàng (PO).

## 2. Năng Lực Cốt Lõi

1. **Deterministic QR / Barcode Tag Generator (`generateMaterialQrCode` & `parseMaterialQrCode`):**
   - Sinh chuỗi mã QR có cấu trúc `XB-MAT|v1|P<project>|<itemCode>|B<batch>|T<type>|Q<qty>|CHK<checksum>`.
   - Xác thực chữ ký toàn vẹn Checksum SHA-256 chống giả mạo hoặc sai lệch thông tin vật tư.
2. **Automated 3-Way Receiving Reconciliation (`reconcileShipmentReceiving`):**
   - Đối soát tự động số lượng từng mã hàng trên Manifest của Phiếu giao hàng (DO) với số lượng các thẻ Tag thực tế đã quét.
   - Báo cáo chênh lệch (Thiếu hàng / Thừa hàng) và tự động cấp mã Biên Bản Nhập Kho (Goods Receipt Note - GRN).
3. **Chain of Custody Tracking:**
   - Theo dõi trạng thái vật tư từ lúc xuất xưởng (`dispatched`) $\rightarrow$ nhập kho công trường (`site_received`) $\rightarrow$ kiểm định chất lượng (`inspected_ok`) $\rightarrow$ lắp đặt (`installed`).

## 3. Schema & DDL

- Migration `0112_materials_qr_logistics.sql`: Tạo 3 bảng `engineering_material_shipments`, `engineering_material_qr_tags`, `engineering_goods_receipt_notes` có RLS đa dự án nghiêm ngặt.

## 4. API Endpoints

- `GET/POST /api/engineering/logistics/shipments`: Quản lý danh sách lô hàng và Manifest.
- `POST /api/engineering/logistics/scan-receive`: Tiếp nhận quét mã QR và trả về kết quả đối soát GRN.

## 5. UI/UX

- Giao diện `/engineering/qr-logistics` (Bàn tạo nhãn QR Code, Máy quét Barcode & Camera PWA, Lịch sử quét nhận và Biên bản GRN).
