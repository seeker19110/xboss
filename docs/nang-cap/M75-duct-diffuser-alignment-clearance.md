# M75 — Đặc Tả Siêu Động Cơ Căn Chỉnh Độ Dài Ống Gió, Bù Trừ Sai Lệch Tim Miệng Gió & Chuẩn Hóa Dung Sai Gót Hộp Gió +10mm

## (Pinnacle Ductwork Alignment, Diffuser Drift Cancellation & +10mm Plenum Clearance Engine)

| Thuộc tính       | Giá trị                                                |
| :--------------- | :----------------------------------------------------- |
| Issue / Goal     | GOAL-2026-PINNACLE-AUTONOMOUS-COGNITIVE-ENGINEERING-OS |
| Spec owner       | Seeker / Chief Engineering Architect                   |
| State            | **Approved for implementation**                        |
| Người/ngày duyệt | Seeker / 2026-08-20                                    |
| Cập nhật         | 2026-08-20                                             |

> **Nguyên tắc bất biến:** Kích thước miệng đón / gót hộp gió (Plenum Boot / Opening) bắt buộc phải rộng hơn kích thước cổ miệng gió (Diffuser Neck) đúng $+10\text{mm}$ ($+5\text{mm}$ mỗi mép) để đảm bảo lắp ráp nhẹ nhàng, không bị kích kẹt tại hiện trường; đồng thời mọi độ dài dôi tích lũy từ bích TDC, bích V, nẹp C, van gió VCD, van dập lửa FD và khớp mềm canvas bắt buộc phải được bù trừ tự động bằng cách cắt ngắn đoạn ống thẳng liền kề để giữ đúng $100\%$ tim miệng gió vào ô trần thiết kế ($600\times 600\text{mm}$).

---

## 1. Vấn Đề & Mục Tiêu

### 1.1 Điểm nghẽn thực tế ngành HVAC/ACMV

1. **Bẫy kích thước gót hộp gió bằng cổ miệng gió:** Miệng gió nhôm sơn tĩnh điện không thể lọt vào hộp gió tôn do bavia, độ dày tôn và góc gập $\rightarrow$ thợ phải dùng kìm bấm, búa đập làm hỏng hộp gió, xước sơn và rò rỉ khí.
2. **Sai lệch tim miệng gió do độ dài dôi tích lũy (Ductwork Drift):** Bích TDC ($+3\text{mm}$), bích V ($+6\text{mm}$), van VCD ($+180\text{mm}$), van dập lửa FD ($+350\text{mm}$), khớp mềm canvas ($+120\text{mm} + 15\text{mm}$ giãn nở) tích lũy đẩy miệng gió lệch $30 - 60\text{mm}$ khỏi ô trần thạch cao/trần nhôm $600\times 600\text{mm}$.
3. **Ống mềm bị gập gãy (Kinking):** Thiếu hệ số uốn chùng $+10\% - 15\%$ khiến ống mềm bị kéo căng hoặc gập gãy tại cổ hộp gió làm giảm $40-60\%$ lưu lượng gió.

### 1.2 Mục tiêu Đột phá M75

- **Auto-Plenum Sizing (+10mm Rule):** Tự động tạo hộp gió $W_{\text{plenum}} = W_{\text{neck}} + 10\text{mm}$, $H_{\text{plenum}} = H_{\text{neck}} + 10\text{mm}$, Spigot $D - 5\text{mm}$, tính diện tích tôn và bảo ôn.
- **Ductline Length Accumulation Engine:** Tính toán chính xác độ dôi chiều dài của mọi loại bích nối và phụ kiện thiết bị trên tuyến.
- **Diffuser Drift Cancellation:** Tự động cắt ngắn chiều dài đoạn ống thẳng liền trước nhánh rẽ để đưa miệng gió về đúng $100\%$ tâm ô trần kiến trúc.
- **Flexible Duct Sag & Stretch Factor:** Tự động tính chiều dài ống mềm có bù uốn cong $+10\% - 15\%$.
- **5-Tier Micro-BOM & Kitting Logistics:** Bóc tách chi tiết hộp gió, miệng gió, van OBD, đai siết inox, ống mềm nhôm và tem nhãn QR định vị trần.

---

## 2. Kiến Trúc Phân Hệ

1. `lib/engineering-duct-diffuser-alignment.ts`:
   - `calculatePlenumBoxDimensions()`: Tính toán kích thước hộp gió chuẩn dung sai $+10\text{mm}$.
   - `calculateDuctlineAccumulatedLength()`: Động cơ tính độ dài dôi tích lũy.
   - `realignDuctSpoolsToCeilingGrid()`: Động cơ triệt tiêu độ trôi tim miệng gió.
   - `explodeDiffuserMicroBom()`: Động cơ bóc tách Micro-BOM hộp gió và miệng gió.
   - `generatePlenumFabricationSheet()`: Trình sinh bản vẽ chế tạo hộp gió và mã QR Token.
2. `migrations/0125_duct_diffuser_alignment_clearance.sql`:
   - `engineering_duct_plenum_boxes`
   - `engineering_duct_diffuser_alignments`
3. `.agents/skills/cad-bim-master/references/ductwork-drift-and-diffuser-clearance-standards.md`: Cẩm nang kỹ thuật tra cứu dung sai hộp gió và căn chỉnh tim trần.

---

## 3. Kế Hoạch Xác Minh

- `npm run check:migrations` (125 migrations liên tục)
- `npm run typecheck`
- `npm run lint`
- `npm run test:single -- tests/engineering-duct-diffuser-alignment.test.ts`
