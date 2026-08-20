# CẨM NANG PHÁT HIỆN BẤT THƯỜNG THỐNG KÊ & GIẢI MÃ Ý ĐỊNH SÂU (ANOMALY DETECTION & DEEP INTENT AI)

Tài liệu này cung cấp công thức phát hiện bất thường số liệu theo thuật toán $Z\text{-Score}$ và giải thuật phân tích ngữ cảnh sâu cho khẩu lệnh công trường.

---

## 1. THUẬT TOÁN PHÁT HIỆN BẤT THƯỜNG DỮ LIỆU $Z\text{-SCORE}$

Khi kỹ sư hiện trường nhập khối lượng nghiệm thu hoặc tiêu hao vật tư:

1. **Thu thập Tập mẫu Lịch sử:** $X = \{x_1, x_2, \dots, x_n\}$ (ví dụ: khối lượng ống nước các tầng 2..9).
2. **Tính Trung bình Mẫu:**
   $$\mu = \frac{1}{n} \sum_{i=1}^{n} x_i$$
3. **Tính Độ lệch Chuẩn:**
   $$\sigma = \sqrt{\frac{1}{n} \sum_{i=1}^{n} (x_i - \mu)^2}$$
4. **Tính Chỉ số Độ lệch $Z\text{-Score}$ của Giá trị Nhập Mới $x_{\text{new}}$:**
   $$Z = \frac{|x_{\text{new}} - \mu|}{\sigma}$$

### Thang Cảnh Báo Thông Minh

- $Z < 2.0$: Bình thường (Không hiển thị cảnh báo).
- $2.0 \le Z < 3.5$: **Cảnh báo Nhẹ (Warning)** — "Khối lượng $x_{\text{new}}$ cao hơn $40\%$ so với mức trung bình các tầng trước (${}\mu{}$). Bạn có chắc chắn không?"
- $Z \ge 3.5$: **Bất thường Cực lớn (Critical Anomaly)** — "Phát hiện giá trị $x_{\text{new}}$ cao gấp $5$ lần mức bình quân! Hệ thống nghi ngờ bạn gõ thừa số 0. Đề xuất giá trị hợp lý: $\text{Median}(X)$."

---

## 2. GIẢI MÃ NGỮ CẢNH ĐA THỰC THỂ CHO KHẨU LỆNH CÔNG TRƯỜNG

Khẩu lệnh phức tạp: _"Sáng nay Zone 1 tầng 10 hoàn thành ống thoát nước rồi, chuyển thợ anh Tâm qua tầng 11 làm tiếp"_.

Quy trình bóc tách:

1. **Slot Extraction:**
   - Tầng hiện tại: $T10$, Zone: $Zone 1$.
   - Tầng tiếp theo: $T11$.
   - Hành động 1: `update_progress` (hoàn thành).
   - Hành động 2: `assign_worker` (chuyển thợ).
2. **Contextual Entity Linking:**
   - So khớp $T10 + Zone 1 + \text{"ống thoát nước"}$ với danh sách task đang mở trong CSDL $\rightarrow$ Tìm ra chính xác Task ID `TASK-P-UPVC-10-Z1`.
   - So khớp $\text{"anh Tâm"}$ với danh sách tài khoản nhà thầu phụ trong CSDL $\rightarrow$ Tìm ra User ID `USR-MINH-TAM`.
3. **Automated Batch Action Generation:**
   - Giao dịch 1: Cập nhật $100\%$ cho Task `TASK-P-UPVC-10-Z1`.
   - Giao dịch 2: Gán `USR-MINH-TAM` vào Task `TASK-P-UPVC-11-Z1`.
