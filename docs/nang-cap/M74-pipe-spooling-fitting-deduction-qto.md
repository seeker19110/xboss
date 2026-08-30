# M74 — Đặc Tả Siêu Động Cơ Bóc Tách Khối Lượng Lắp Đặt, Chia Đốt Spool & Bù Trừ Dung Sai Mối Nối Đường Ống

## (Pinnacle MEPF Spooling, Fitting Deduction & Micro-BOM Engine)

| Thuộc tính       | Giá trị                                                |
| :--------------- | :----------------------------------------------------- |
| Issue / Goal     | GOAL-2026-PINNACLE-AUTONOMOUS-COGNITIVE-ENGINEERING-OS |
| Spec owner       | Seeker / Chief Engineering Architect                   |
| State            | **Approved for implementation**                        |
| Người/ngày duyệt | Seeker / 2026-08-20                                    |
| Cập nhật         | 2026-08-20                                             |

> **Nguyên tắc bất biến:** Chiều dài ống cắt thực tế ($L_{\text{cut}}$) tại xưởng chế tạo DfMA bắt buộc phải được bù trừ chính xác theo độ ngập âm phụ kiện (Socket Insertion Depth), gờ chặn măng xông ($t_{\text{stop}}$), chiều dài ren ăn khớp (Thread Makeup), khe hở rãnh răn Grooved, đệm gioăng mặt bích và khe hở đáy hàn, kết hợp dung sai hiện trường (Field Fit Allowance) để triệt tiêu hoàn toàn sai số lắp ráp và giảm phế liệu xưởng xuống dưới $1.2\%$.

---

## 1. Vấn Đề & Mục Tiêu

### 1.1 Điểm nghẽn thực tế ngành MEPF

1. **Sai số ngập âm măng xông & phụ kiện:** Kỹ sư thiết kế vẽ khoảng cách tâm - tâm ($L_{\text{c-to-c}}$). Khi chuyển ra thi công, nếu không trừ kích thước phụ kiện hoặc trừ sai độ sâu ngập của ống vào phụ kiện (uPVC dán keo, PPR hàn nhiệt, ống thép ren/rãnh), ống sẽ bị cắt ngắn hụt hoặc dài quá mức làm cong vênh tuyến ống, căng nứt mối nối khi thử áp lực.
2. **Chuẩn bị thủ công, lục tìm vật tư phụ:** Hiện trường mất 20-30% thời gian để lục tìm bu lông, gioăng, đai ốc, keo dán, ty ren và phụ kiện rời rạc.
3. **Phế liệu cắt xưởng cao (6-10%):** Thiếu thuật toán xếp cắt kết hợp kho phôi thừa (Remnant Inventory) dẫn đến việc xả cây mới $6\text{m}$ liên tục.

### 1.2 Mục tiêu Đột phá M74

- **Precision Fitting Deduction:** Tính toán chính xác đến $0.1\text{mm}$ cho 7 hệ vật liệu (uPVC, PPR, HDPE, Thép ren, Thép rãnh Grooved, Thép hàn đối đầu, Bích tiêu chuẩn).
- **LOD 400 DfMA Spooling:** Tự động chia đốt ống $\le 5.8\text{m}$, trọng lượng $\le 50\text{kg}$, tự động giật dốc thoát nước và chèn lượng bù dung sai hiện trường (Field Fit Allowance $+50\dots +100\text{mm}$) cho đốt đóng tuyến.
- **5-Tier Micro-BOM Explosion:** Bóc tách tới cấp vi mô (Ống $\rightarrow$ Fitting $\rightarrow$ Van $\rightarrow$ Bu lông/Gioăng/Keo/Que hàn $\rightarrow$ Giá treo/Bảo ôn/Mã QR Kitting).
- **1D Nesting with Remnant Pool:** Tận dụng phôi thừa $\ge 600\text{mm}$, bù trừ mạch cưa $W_{\text{kerf}}$, giảm tỷ lệ phế liệu $< 1.2\%$.
- **Spool Fabrication Isometric Sheet & QR Kitting:** Xuất bản vẽ trục đo Isometric và mã QR đồng bộ Logistics xưởng $\rightarrow$ công trường.

---

## 2. Kiến Trúc Phân Hệ

1. `lib/engineering-pipe-spooling-qto.ts`:
   - `calculatePipeCutLength()`: Động cơ bù trừ chiều dài cắt thực tế.
   - `segmentPipelineIntoSpools()`: Động cơ chia đốt Spool tiền chế LOD 400.
   - `explode5TierMicroBom()`: Động cơ bóc tách Micro-BOM 5 cấp độ.
   - `optimizePipeNestingWithRemnants()`: Động cơ tối ưu cắt phôi 1D kèm kho phôi thừa.
   - `generateSpoolFabricationPackage()`: Trình sinh bản vẽ chế tạo trục đo & hồ sơ Kitting QR.
2. `migrations/0123_pipe_spooling_and_micro_bom.sql`:
   - `engineering_pipe_spools`
   - `engineering_pipe_spool_fittings`
   - `engineering_pipe_micro_bom_items`
   - `engineering_pipe_remnant_inventory`
3. `.agents/skills/cad-bim-master/references/pipe-spooling-and-fitting-deduction-standards.md`: Cẩm nang toàn thư kỹ thuật tra cứu dung sai mối nối và quy chuẩn DfMA.

---

## 3. Kế Hoạch Xác Minh

- `npm run check:migrations` (123 migrations liên tục)
- `npm run typecheck`
- `npm run lint`
- `npm run test:single -- tests/engineering-pipe-spooling-qto.test.ts`
