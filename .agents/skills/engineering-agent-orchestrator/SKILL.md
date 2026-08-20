---
name: engineering-agent-orchestrator
description: "Quy chuẩn điều phối mạng lưới 11 tác tử AI Swarm, ranh giới Gate 0 uỷ quyền (ENG-3), giao thức hòa giải xung đột 7 bước (ENG-4), sổ cái mật mã Merkle Tree bất biến (M73) và bảo đảm an toàn tự trị có kiểm soát (Controlled Autonomy A0-A2) trong XBoss. Bắt buộc kích hoạt khi điều phối AI, giải quyết tranh chấp dữ liệu hoặc xử lý luồng phê duyệt cấp cao."
---

# ENGINEERING AGENT ORCHESTRATOR — ĐIỀU PHỐI ĐA TÁC TỬ & BẢO ĐẢM TỰ TRỊ CÓ KIỂM SOÁT ĐẲNG CẤP THẦN THÁNH

Bộ Skill này đóng gói toàn bộ tri thức điều phối mạng lưới AI 12 tác tử chuyên sâu (12-Agent Swarm Ecosystem), ranh giới ủy quyền tự trị có kiểm soát (Controlled Autonomy Envelope A0-A3+), giao thức hòa giải tranh chấp kỹ thuật 7 bước (**ENG-4**), quy chuẩn kiểm định Trạm gác Gate 0, và kiến trúc sổ cái mật mã Merkle Tree chống can thiệp ngầm (**M73**) cho nền tảng XBoss.

---

## 1. MƯỜI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 10 APEX INVARIANTS)

1. **Ranh Giới Tự Trị Có Kiểm Soát (Controlled Autonomy Envelope A0-A3+):**
   - Hệ thống AI chỉ được vận hành trong các cấp độ tự trị cho phép:
     - **A0 (Hỗ trợ thuần túy):** AI chỉ đọc, tính toán và hiển thị thông tin.
     - **A1 (Đề xuất có bằng chứng):** AI đề xuất phương án kèm chứng cứ tính toán, con người duyệt mới thực thi.
     - **A2 (Ủy quyền có điều kiện):** AI tự động xử lý các tác vụ lặp lại dưới ngưỡng an toàn (cảnh báo trễ hạn, phân loại nguyên nhân, chuẩn hóa dữ liệu).
     - **A3+ (Tác vụ có tác dụng phụ / chi phí lớn):** CẤM TUYỆT ĐỐI nếu không có phê duyệt tường minh bằng chữ ký số của Kỹ sư trưởng / Giám đốc Dự án.

2. **Cấm Biểu Quyết Số Đông trong Kỹ Thuật (No Majority Voting Invariant):**
   - Tranh chấp kỹ thuật giữa các AI Agent tuyệt đối KHÔNG được phân định bằng biểu quyết số đông.
   - Bắt buộc giải quyết theo **Thứ bậc Thẩm quyền Nguồn dữ liệu (Authority Hierarchy)**:
     $$\text{Quy chuẩn Quốc gia / QCVN / TCVN} > \text{Hồ sơ Pháp lý / Hợp đồng FIDIC} > \text{Bản vẽ Thiết kế Cơ sở} > \text{Mô phỏng Thủy lực} > \text{Đề xuất Tối ưu}$$

3. **Bất biến Sổ Cái Mật Mã Merkle Tree (Merkle Cryptographic Invariant M73):**
   - Mọi sự kiện điều chỉnh dữ liệu quan trọng (BOQ, Đơn giá, Khối lượng nghiệm thu, Phiếu NCR, Thay đổi thiết kế, Quyết toán) đều được gắn kèm mã băm SHA-256 (Leaf Hash) và nối vào Cây Merkle toàn hệ thống (`engineering_merkle_roots`).
   - Nếu có bất kỳ sự can thiệp trực tiếp vào CSDL làm sai lệch dữ liệu: Gốc Merkle Root sẽ lập tức phát hiện không khớp (Root Tampering Mismatch) và kích hoạt chế độ khóa an toàn.

4. **Bất biến Trạm Gác Gate 0 Năm Trụ Cột (Gate 0 Five-Pillar Invariant):**
   - Không một quyết định hoặc đề xuất nào từ AI Swarm được phép tác động vào hệ thống sản xuất nếu chưa thỏa mãn $100\%$ 5 tiêu chuẩn của Gate 0:
     $$\text{Gate 0} = \text{Provenance Trace} \land \text{Role Authorization} \land \text{Evidence Sufficiency} \land \text{Conflict Resolution} \land \text{Merkle Sealing}$$

5. **Bất biến Ngưỡng Đồng Thuận Tranh Biện Swarm (Debate Consensus Threshold $\ge 0.80$):**
   - Điểm số đồng thuận kỹ thuật giữa các Tác tử AI trong phiên tranh luận (Swarm Debate) phải đạt mức tối thiểu:
     $$Score_{\text{consensus}} = w_E \cdot S_{\text{Engineer}} + w_Q \cdot S_{\text{QS}} + w_S \cdot S_{\text{Site}} + w_H \cdot S_{\text{HSE}} \ge 0.80$$
   - Nếu $Score_{\text{consensus}} < 0.80$, hệ thống tự động xuất hồ sơ bất đồng và chuyển quyền quyết định cho Giám đốc Dự án.

6. **Bất biến Cách Ly Tập Tin Đơn Ghi Đa Đọc (Single-Writer Multi-Reader File Isolation):**
   - Khi giao việc cho các Subagent chạy song song, Orchestrator tuyệt đối KHÔNG giao hai subagent cùng chỉnh sửa một file nguồn hoặc cùng một migration database. Phải phân định ranh giới độc lập trước khi dispatch.

7. **Bất biến Ngắt Mạch Khẩn Cấp Khi Phát Hiện Can Thiệp Trái Phép (Tamper Circuit Breaker):**
   - Khi hàm `verifyMerkleRoot()` phát hiện mã băm dữ liệu không khớp với Gốc Merkle: Hệ thống tự động chuyển sang chế độ `READ_ONLY_LOCKDOWN`, gửi cảnh báo an ninh cho Quản trị viên và cách ly giao dịch vi phạm.

8. **Bất biến Lũy Đẳng Trong Điều Phối Trạng Thái (State Machine Orchestration Idempotency):**
   - Mọi lệnh điều phối của Orchestrator (Dispatch, Approve, Revert, Sync) phải đạt tính lũy đẳng: Gọi lại nhiều lần không làm thay đổi trạng thái cuối cùng và không sinh thêm sự kiện dư thừa.

9. **Bất biến Leo Thang Xung Đột Tự Động (Automated Dispute Escalation):**
   - Bất kỳ xung đột nào giữa các Agent không được giải quyết xong trong vòng 3 vòng tranh biện (3 Debate Rounds) bắt buộc phải được tự động đóng gói hồ sơ (Dossier) và leo thang lên cấp Người Phê Duyệt (Human-in-the-Loop).

10. **Bất biến Mã Token Chứng Thực Không Thể Chối Bỏ (Immutable Provenance Token Invariant):**
    - Mọi đề xuất đã qua Gate 0 và được phê duyệt đều được cấp mã chứng thực dạng `SIG-GATE0-[ACTION]-[SHA256]` được lưu trữ vĩnh viễn trong audit trail.

---

## 2. QUY TRÌNH 10 BƯỚC ĐIỀU PHỐI ĐA TÁC TỬ & BẢO ĐẢM TỰ TRỊ

```
[B1: Tiếp nhận Đề xuất/Xung đột] ──► [B2: Kích hoạt AI Swarm Debate] ──► [B3: Thu thập Bằng chứng Định lượng] ──► [B4: Lọc Thứ bậc Thẩm quyền]
                                                                                                                        │
                                                                                                                        ▼
[B8: Trạm gác Gate 0 Năm Trụ cột] ◄── [B7: Tạo Mã Chứng thực SIG] ◄── [B6: Kiểm tra Ngưỡng Đồng thuận] ◄── [B5: Tối ưu Pareto Đa mục tiêu]
        │
        ▼
[B9: Phê duyệt Người & e-Sign] ──► [B10: Niêm phong Gốc Merkle M73]
```

### Bước 1: Tiếp Nhận Yêu Cầu & Phát Hiện Xung Đột Đa Chiều

- Tiếp nhận các yêu cầu thay đổi thiết kế, điều chỉnh tiến độ hoặc phát sinh chi phí từ hiện trường. Phân loại loại hình xung đột.

### Bước 2: Kích Hoạt Phiên Tranh Luận Đa Tác Tử (Swarm Debate Session)

- Khởi tạo phiên tranh biện (`engineering_agent_debate_sessions`) với sự tham gia của các Persona: Kỹ sư Thiết kế, Chuyên gia Chi phí QS, Chỉ huy Hiện trường, và Chuyên gia An toàn QA/QC.

### Bước 3: Thu Thập Bằng Chứng Kỹ Thuật Định Lượng (Evidence Harvesting)

- Yêu cầu từng Agent xuất trình chứng cứ: Công thức thủy lực Hazen-Williams, Điều khoản FIDIC, Định mức TT12, Dung sai TAB NEBB, Giấy phép Đ107.

### Bước 4: Áp Dụng Thứ Bậc Thẩm Quyền Bắt Buộc (Authority Hierarchy Filtering)

- Loại bỏ ngay các phương án vi phạm Quy chuẩn Quốc gia (QCVN), vi phạm An toàn kết cấu hoặc vi phạm Pháp lý bắt buộc.

### Bước 5: Tối Ưu Hóa Đa Mục Tiêu Pareto (Multi-Objective Optimization)

- Tính toán điểm đánh đổi tối ưu giữa Thời gian ($\Delta T$), Chi phí ($\Delta C$), Chất lượng ($\Delta Q$) và An toàn ($\Delta S$).

### Bước 6: Đánh Giá Điểm Đồng Thuận Kỹ Thuật (Consensus Scoring)

- Tính toán điểm $Score_{\text{consensus}}$. Nếu $\ge 0.80 \rightarrow$ Đạt mức đồng thuận cao (High Consensus).

### Bước 7: Cấp Mã Token Chứng Thực Kỹ Thuật Số (`SIG-CONSENSUS-...`)

- Sinh mã chứng thực kèm chữ ký số điện tử của phiên tranh biện.

### Bước 8: Kiểm Tra Nghiêm Ngặt Tại Trạm Gác Gate 0 Năm Trụ Cột

- Rà soát 5 trụ cột Gate 0: Nguồn gốc, Phân quyền, Bằng chứng, Giải quyết xung đột, và Mã băm niêm phong.

### Bước 9: Trình Phê Duyệt 1-Chạm Cho Người Quản Lý (Human Review Dossier)

- Đóng gói toàn bộ phương án tối ưu và bảng phân tích rủi ro trình PM/Chỉ huy trưởng phê duyệt bằng chữ ký số.

### Bước 10: Cập Nhật & Niêm Phong Sổ Cái Merkle Tree M73

- Tính toán Leaf Hash của giao dịch đã duyệt, cập nhật Cây Merkle và tái tính toán Gốc Merkle Root của toàn dự án.

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] swarm-debate-and-gate0-verification

# CẨM NANG ĐIỀU PHỐI AI SWARM & TRẠM GÁC GATE 0

## 1. THUẬT TOÁN ĐỒNG THUẬN KỸ THUẬT SWARM DEBATE

$$Score_{\text{consensus}} = 0.35 \times S_{\text{Engineer}} + 0.30 \times S_{\text{QS}} + 0.25 \times S_{\text{Site}} + 0.10 \times S_{\text{HSE}}$$

- **Điểm Kỹ sư Thiết kế ($S_{\text{Engineer}}$):** Mức độ tuân thủ tiêu chuẩn TCVN, tổn thất cột áp thủy lực và bảo toàn độ dốc.
- **Điểm Chuyên gia Chi phí ($S_{\text{QS}}$):** Tác động ngân sách, hợp đồng FIDIC và tỷ lệ hao hụt phôi thừa.
- **Điểm Chỉ huy Hiện trường ($S_{\text{Site}}$):** Tính khả thi thi công, không gian thao tác và thời gian lắp đặt.
- **Điểm Chuyên gia An toàn ($S_{\text{HSE}}$):** Độ an toàn lao động, khoảng cách cách ly cháy nổ và chịu tải giá treo.

---

## 2. CHECKLIST KIỂM ĐỊNH TRẠM GÁC GATE 0 (GATE 0 VERIFICATION)

- [ ] **1. Provenance Trace:** Đối tượng có nguồn gốc rõ ràng (Source SHA-256).
- [ ] **2. Role Authorization:** Đề xuất nằm trong cấp độ tự trị cho phép (A1/A2).
- [ ] **3. Evidence Sufficiency:** Bằng chứng định lượng đầy đủ (không ảo giác AI).
- [ ] **4. Conflict Resolution:** Không còn xung đột chưa được hòa giải ($Score \ge 0.80$).
- [ ] **5. Merkle Sealing:** Đã sinh mã Leaf Hash sẵn sàng niêm phong sổ cái M73.

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/orchestrator_debate_simulator.ts](file:///c:/Users/liend/xboss/.agents/skills/engineering-agent-orchestrator/scripts/orchestrator_debate_simulator.ts): Bộ kịch bản CLI mô phỏng phiên tranh luận Swarm Debate, kiểm định Trạm gác Gate 0 và niêm phong Gốc Merkle SHA-256.
