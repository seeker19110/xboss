# ĐẶC TẢ KỸ THUẬT: M95 — SMART PIPE MASS-BALANCE & GEOLOCATION STASH HUNTER

## Hệ Thống Đối Soát Cân Bằng Vật Chất 5 Chiều, Thống Kê Tiến Độ Ống Thực Địa & Săn Lùng Vật Tư Cất Giấu

- **Mã định danh:** SPEC-ENG-M95-STASH-HUNTER-2026
- **Trạng thái:** **Approved for implementation**
- **Người duyệt:** Seeker / Chief Engineering Architect
- **Ngày duyệt:** 2026-08-20
- **Phạm vi:** Thống kê ống đã lắp, tính toán số lượng còn lại theo thời gian thực, đối soát chuỗi cung ứng 5 chiều và định vị săn lùng vật tư cất giấu / thất thoát / nghiệm thu khống.

---

### 1. NGUYÊN TẮC VẬT LÝ & ĐỊNH LUẬT BẢO TOÀN VẬT CHẤT 5 CHIỀU

$$Q_{\text{GRN}} \equiv Q_{\text{Installed}}^{\text{Verified}} + Q_{\text{Staged\_Buffer}} + Q_{\text{Warehouse\_Central}} + Q_{\text{Remnants\_Reusable}} + Q_{\text{Scrap\_Logged}} + \Delta_{\text{Stash}}$$

1. **Khớp sạch ($|\Delta_{\text{Stash}}| \le 0.01\text{m}$):** Trạng thái `CLEAN_BALANCED`. Vật tư luân chuyển minh bạch 100%.
2. **Nghi vấn Thất thoát / Cất giấu ($\Delta_{\text{Stash}} > 0$):** Trạng thái `STASH_SUSPECTED_ALERT`. Kích hoạt AI khoanh vùng Voxel 3D nghi vấn cất giấu.
3. **Nghi vấn Khai khống Khối lượng ($\Delta_{\text{Stash}} < 0$):** Trạng thái `PHANTOM_CLAIM_FRAUD`. Khóa ngắt mạch không cho xuất biên bản nghiệm thu BBNT.

---

### 2. QUY CHUẨN THỜI GIAN LƯU KHO ĐỆM & BÁO ĐỘNG TỒN ĐỌNG (HOLDING-TIME ANOMALY)

- Khi Spool xuất kho lên sàn (`FLOOR_STAGED`), hệ thống tính thời gian lưu đệm:
  $$T_{\text{holding}} = \text{Now}() - \text{StagedAt}$$
- Nếu $T_{\text{holding}} > 72.0\text{ giờ}$ mà chưa chuyển sang `INSTALLED_VERIFIED` $\rightarrow$ Tự động cảnh báo `STAGNANT_BUFFER_RISK`.

---

### 3. DỰ BÁO NHU CẦU MUA SẮM JIT & ĐIỂM ĐẶT HÀNG LẠI (RE-ORDER POINT)

$$\text{ROP} = (v_{\text{install\_avg}} \times L_{\text{lead\_days}}) + \text{Buffer}_{\text{safety}}$$

- Nếu $(Q_{\text{Warehouse}} + Q_{\text{Staged}}) \le \text{ROP}$ $\rightarrow$ Tự động sinh dự thảo Đơn mua hàng PO (Draft PO).
