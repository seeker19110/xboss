# QUY CHUẨN GHI CHÚ, GIẢI THÍCH LÝ DO KỸ THUẬT & TỪ ĐIỂN GIẢI TRÌNH CHẾ TẠO MEPF (ENGINEERING RATIONALE & ANNOTATION STANDARDS)

Tài liệu này chuẩn hóa ngôn ngữ, văn phong, cấu trúc giải trình kỹ thuật và các mẫu ghi chú thực chiến cho toàn bộ bản vẽ Shopdrawing, Spool Fabrication Sheet, Bảng kê cắt phôi và Phiếu Kitting Logistics trong XBoss.

---

## 1. NGUYÊN TẮC GHI CHÚ THỰC CHIẾN (THE 4 CLARITY INVARIANTS)

1. **Minh Bạch Số Liệu (Data Provenance):** Mọi kích thước cắt ($L_{\text{cut}}$) bắt buộc phải giải trình rõ từ kích thước thiết kế gốc ($L_{\text{c-to-c}}$) đã trừ đi bao nhiêu milimét ở từng đầu phụ kiện và bù bao nhiêu milimét dung sai hiện trường.
2. **Giải Thích Rõ Ràng Lý Do Kỹ Thuật (Engineering Rationale):** Không chỉ đưa ra con số mà phải giải thích _tại sao_ (Ví dụ: tại sao gót hộp gió phải rộng hơn $+10\text{mm}$, tại sao măng xông chỉ trừ $2\text{mm}$, tại sao ống thẳng bị cắt ngắn $186\text{mm}$).
3. **Chỉ Dẫn Thi Công Từng Bước (Step-by-Step Field Instructions):** Mỗi đốt Spool và hộp gió phải kèm hướng dẫn thao tác rõ ràng để công nhân và thợ xưởng không cần hỏi lại kỹ sư.
4. **Không Thừa - Không Thiếu:** Câu từ cô đọng, chuẩn thuật ngữ cơ điện Việt Nam kết hợp quốc tế (uPVC, PPR, Grooved Victaulic, TDC/TDF, VCD, FD, OBD).

---

## 2. BỘ MẪU GIẢI TRÌNH KỸ THUẬT TIÊU CHUẨN (STANDARD RATIONALE DICTIONARY)

### 2.1 Bù Trừ Kích Thước Cắt Ống ($L_{\text{cut}}$ vs $L_{\text{c-to-c}}$)

> _"Kích thước tâm-tâm $L_{\text{c-to-c}} = 3000\text{mm}$. Đầu 1 (Elbow 90° DN114) trừ $58\text{mm}$ (Center-to-Face $122\text{mm}$ - Độ sâu ngập socket $64\text{mm}$); Đầu 2 (Elbow 90° DN114) trừ $58\text{mm}$. Chiều dài cắt thực tế $L_{\text{cut}} = 2884\text{mm}$."_

### 2.2 Đặc Trị Bẫy Măng Xông Nối Thẳng (Coupling Stop Trap)

> _"Măng xông nối thẳng uPVC DN114 dài tổng $132\text{mm}$, độ sâu ngập mỗi bên $64\text{mm}$, gờ chặn giữa dày $4\text{mm}$. Lượng trừ mối nối của mỗi đầu ống chỉ bằng đúng một nửa gờ chặn $\Delta L = 2\text{mm}$ để ống đút ngập trọn vẹn chạm khít đáy gờ chặn. Tuyệt đối không trừ cả chiều dài măng xông làm hụt ống."_

### 2.3 Đoạn Đóng Tuyến Bù Dung Sai Hiện Trường (Closing Spool / Pup Piece)

> _"Đốt đóng tuyến kết nối thiết bị — Đã cộng $+50\text{mm}$ dung sai hiện trường (Field Fit Allowance). Thợ đo khoảng cách thực tế sau khi định vị thiết bị/bê tông rồi mới cắt tinh chỉnh trước khi dán/hàn nối cố định."_

### 2.4 Dung Sai Gót Hộp Gió $+10\text{mm}$ & Viền Miệng Gió Che Phủ

> _"Cổ miệng gió nhôm danh nghĩa $450\times 450\text{mm}$. Gót hộp gió gia công lọt lòng $460\times 460\text{mm}$ (rộng hơn đúng $+10\text{mm}$, tức $+5\text{mm}$ mỗi mép) để cổ miệng gió trượt vào nhẹ nhàng, không bị kích kẹt bavia tôn và góc gập. Viền mặt miệng gió $600\times 600\text{mm}$ có cánh phủ $75\text{mm}$ che kín hoàn toàn $100\%$ khe hở $5\text{mm}$ trên mặt trần. Cổ trích spigot $D=195\text{mm}$ (nhỏ hơn ống mềm $5\text{mm}$) để lồng ống mềm D200 dễ dàng."_

### 2.5 Bù Trừ Dài Dôi Tuyến Ống Gió & Căn Chuẩn Tim Trần $600\times 600\text{mm}$

> _"Tuyến ống gió có 2 mối bích TDC ($+6\text{mm}$) và 1 van gió VCD ($+180\text{mm}$) làm dôi chiều dài tích lũy $+186\text{mm}$. Để giữ đúng $100\%$ tim miệng gió vào tâm ô trần $600\times 600\text{mm}$, đoạn ống thẳng thiết kế lý thuyết $3000\text{mm}$ được tự động cắt ngắn còn $2814\text{mm}$ (sai lệch tim trần $= 0.0\text{mm}$)."_

### 2.6 Độ Chùng & Uốn Cong Ống Gió Mềm (Sag Factor)

> _"Khoảng cách hình học từ ống gió xuống hộp gió $1.2\text{m}$ được cắt thực tế $1.35\text{m}$ (bù $+12\%$ hệ số uốn chùng - Sag Factor) để ống mềm nhôm bọc bông thủy tinh lượn cong $90^\circ$ mượt mà vào cổ trích, không bị bẹp gập (Kinking) gây sụt áp lưu lượng khí."_

---

## 3. QUY TRÌNH KIỂM TRA CHẤT LƯỢNG GHI CHÚ TRƯỚC KHI XUẤT XƯỞNG

1. **Khớp nối dữ liệu:** Mọi số liệu trong phần giải trình phải khớp tuyệt đối với BOM và tọa độ 3D.
2. **Không dùng ký hiệu bí hiểm:** Mọi ký hiệu viết tắt phải có chú giải đi kèm (ví dụ: SW = Shop Weld / Mối hàn xưởng, FW = Field Weld / Mối hàn hiện trường).
3. **Mã QR liên kết:** Quét mã QR phải hiển thị đầy đủ văn bản giải trình kỹ thuật và hướng dẫn lắp đặt trực quan.
