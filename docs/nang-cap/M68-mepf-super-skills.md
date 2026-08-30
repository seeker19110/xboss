# M68 — Đặc Tả Hệ Thống Super Skills MEPF AI Đỉnh Cao Toàn Diện

## (Comprehensive Pinnacle MEPF Super-Skills Ecosystem)

| Thuộc tính       | Giá trị                                                |
| :--------------- | :----------------------------------------------------- |
| Issue / Goal     | GOAL-2026-PINNACLE-AUTONOMOUS-COGNITIVE-ENGINEERING-OS |
| Spec owner       | Seeker / Chief Engineering Architect                   |
| State            | **Approved for implementation**                        |
| Người/ngày duyệt | Seeker / 2026-08-19                                    |
| Cập nhật         | 2026-08-19                                             |

> **Nguyên tắc bất biến:** Mọi tính toán thủy lực và tối ưu hóa xếp cắt xưởng phải dựa trên các định luật vật lý thực nghiệm (Hazen-Williams / Darcy-Weisbach) và bài toán tối ưu tổ hợp (First-Fit Decreasing) để loại bỏ hoàn toàn sai số và phế liệu thi công.

---

## 1. Vấn Đề & Mục Tiêu

### 1.1 Điểm nghẽn thực tế

1. **Chọn cỡ ống thủ công:** Kỹ sư phải tra bảng ma sát thủ công, dễ chọn quá cỡ (lãng phí chi phí vật tư) hoặc quá nhỏ (gây tiếng ồn và sụt áp nghiêm trọng).
2. **Lãng phí phế liệu cắt xưởng:** Tỷ lệ hao hụt phôi thừa khi thợ tự cắt cây ống $6\text{m}$ tại xưởng lên tới $6-8\%$ giá trị gói thầu.
3. **Báo cáo tiến độ phân mảnh:** Kỹ sư hiện trường mất 1-2 tiếng mỗi ngày để gõ lại các ghi chú nghiệm thu từ sổ tay vào máy tính.

### 1.2 Mục tiêu Super Skills

- **AI Hydraulic Auto-Sizing:** Tự động chọn cỡ ống và tính tổn thất áp trong $< 100\text{ms}$.
- **1D Nesting Optimization:** Giảm tỷ lệ phế liệu cắt ống xuống $< 1.8\%$.
- **Voice-to-WBS Logger:** Chuyển đổi giọng nói hiện trường tiếng Việt thành tác vụ cập nhật tiến độ và Ticket Defect tức thời.

---

## 2. Các Phân Hệ Cốt Lõi

1. `lib/engineering-mepf-hydraulic.ts`: Động cơ Thủy lực & Tải trọng Ty treo.
2. `lib/engineering-mepf-nesting.ts`: Động cơ Tối ưu hóa Xếp cắt Phôi 1D/2D.
3. `lib/engineering-mepf-voice.ts`: Động cơ Ghi nhận Giọng nói Hiện trường & Năng suất Lao động.

---

## 3. Kế Hoạch Xác Minh

- `npm run check:migrations` (102 migrations liên tục)
- `npm run typecheck`
- `npm run lint`
- `node --import tsx --test tests/engineering-mepf-*.test.ts`
