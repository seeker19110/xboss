# CẨM NANG BẢN VẼ CHẾ TẠO ISOMETRIC DfMA SPOOL, MODULE HÓA SKID & GENETIC NESTING (DFMA ISOMETRIC & SKID MODULARIZATION)

Tài liệu này chuẩn hóa quy trình tự động xuất bản vẽ chế tạo Isometric từng đốt ống Spool, bùng nổ danh mục vật tư Micro-BOM 5 cấp, module hóa cụm thiết bị đúc sẵn (Skids) và giải thuật tối ưu phôi di truyền tận dụng kho phôi thừa (Remnant Pool) trong XBoss.

---

## 1. QUY CHUẨN BẢN VẼ CHẾ TẠO ISOMETRIC DfMA (SPOOL ISOMETRIC SHEET)

Mỗi đoạn phân đoạn chế tạo xưởng (Prefabrication Spool $\le 5.8\text{m}$) được hệ thống tự động xuất thành một bản vẽ Isometric độc lập:

1. **Hình chiếu Trục lượng $30^\circ - 30^\circ$ (Axonometric View):**
   - Trục $X$ nghiêng $30^\circ$ sang phải, Trục $Y$ nghiêng $30^\circ$ sang trái, Trục $Z$ thẳng đứng $90^\circ$.
2. **Kích thước Chiều dài Cắt Thực tế ($L_{\text{cut}}$):**
   $$L_{\text{cut}} = L_{\text{centerline}} - \sum \left( \text{Take-off} - \text{Socket Insertion Depth} \right) + \text{Field Fit Allowance}$$
3. **Đánh Số Mối Nối & Phụ Kiện (Bubble Tags):**
   - Các vị trí cút, tê, bích, van, que hàn/mối dán được đánh số tròn $\textcircled{1}, \textcircled{2}, \textcircled{3}\dots$ liên kết trực tiếp với bảng Micro-BOM.
4. **Mã Vạch QR Logistics DfMA:**
   - In trực tiếp trên khung tên bản vẽ: `XBOSS|PRJ:<id>|SPOOL:<code|SPEC:<dn-L>|SYS:<sys>`.

---

## 2. BẢNG BÙNG NỔ MICRO-BOM 5 CẤP ĐỘ (5-LEVEL MICRO-BOM)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MICRO-BOM 5 CẤP ĐỘ DfMA                         │
├───────┬──────────────────────┬─────────────────────────────────────────┤
│ Cấp 1 │ Ống Chính (Main Pipe)│ Ống thép đúc DN100 Sch40 L_cut = 3420mm │
│ Cấp 2 │ Phụ kiện (Fittings)  │ 01 Cút 90° DN100 hàn, 01 Tê giảm DN100x50│
│ Cấp 3 │ Thiết bị Van (Valves)│ 01 Van bướm tay quay DN100 PN16         │
│ Cấp 4 │ Vật tư phụ liên kết  │ 08 Bu lông M16x70, 02 Gioăng cao su EPDM│
│ Cấp 5 │ Giá đỡ & Kitting Box │ 02 Cùm U-bolt DN100, Mã Crate Căn Hộ    │
└───────┴──────────────────────┴─────────────────────────────────────────┘
```

---

## 3. MODULE HÓA CỤM THIẾT BỊ TIỀN CHẾ (MODULAR SKIDS)

Các cụm thiết bị cơ điện phức tạp được chuẩn hóa thiết kế thành các Module/Skid lắp ghép tiền chế trên khung thép Unistrut / Thép hình chữ I/U:

1. **Trạm Van Giảm Áp (PRV Skid Station):**
   - Tích hợp cụm van lọc Y $\rightarrow$ Van giảm áp chính (PRV) $\rightarrow$ Cụm Bypass van tay $\rightarrow$ Đồng hồ áp suất trước/sau $\rightarrow$ Van an toàn xả áp (Safety Relief Valve).
2. **Cụm Bơm Cấp Nước Tăng Áp (Booster Pump Skid):**
   - Bộ 2 hoặc 3 bơm đa tầng cánh đặt trên đế giảm chấn cao su lò xo, gom chung ống góp hút/đẩy (Header Manifold), bình tích áp màng và tủ điều khiển biến tần VFD.
3. **Cụm Đồng Hồ Nước Căn Hộ (Water Meter Manifold Skid):**
   - Cụm ống góp phân phối cho $4 - 8$ căn hộ trên 1 tầng, lắp sẵn đồng hồ nước có cổng đọc từ xa M-Bus / Modbus, van một chiều và van chặn từng căn hộ.

---

## 4. GIẢI THUẬT DI TRUYỀN & KHO PHÔI TỒN DƯ (REMNANT-FIRST GENETIC NESTING)

Quy trình tối ưu hóa cắt phôi xưởng với tỷ lệ hao hụt phế liệu $< 0.8\%$:

```
[Danh mục Spool L_cut] ──► [Quét Kho Phôi Thừa (Remnant >= 1.2m)] ──► [Ghép Cây Mới 6.0m (GA / BFD)] ──► [Cấp Mã Barcode Remnant Mới]
```

1. **Bước 1 — Quét Kho Phôi Tồn Dư:** So khớp các đoạn cắt ngắn với kho phôi thừa hiện có (`engineering_remnant_inventory`). Đoạn thừa $L_{\text{remnant}} \ge 1.2\text{m}$ từ các dự án trước được ưu tiên tiêu thụ trước.
2. **Bước 2 — Xếp Cây Nguyên 6.0m:** Sử dụng giải thuật Best-Fit Decreasing kết hợp tối ưu hoán vị di truyền để xếp các đoạn dài còn lại.
3. **Bước 3 — Tạo Mã Barcode Phôi Thừa Mới:** Mọi đầu mẩu thừa sau khi cắt có $L \ge 1.2\text{m}$ được tự động in nhãn Barcode đưa vào lưu kho cho đợt gia công tiếp theo.
