---
name: engineering-agent-orchestrator
description: "Quy chuẩn điều phối mạng lưới đa tác tử AI Swarm, ranh giới Gate 0 uỷ quyền (ENG-3), giao thức hòa giải xung đột 7 bước (ENG-4), sổ cái mật mã Merkle Tree bất biến (M73) và bảo đảm an toàn tự trị có kiểm soát (Controlled Autonomy A0-A2) trong XBoss. Bắt buộc kích hoạt khi điều phối AI, giải quyết tranh chấp dữ liệu hoặc xử lý luồng phê duyệt cấp cao."
---

# ENGINEERING AGENT ORCHESTRATOR — ĐIỀU PHỐI ĐA TÁC TỬ & BẢO ĐẢM TỰ TRỊ CÓ KIỂM SOÁT

Bộ Skill này đóng gói toàn bộ tri thức điều phối mạng lưới AI đa tác tử (Multi-Agent Swarm), ranh giới ủy quyền Gate 0, giao thức hòa giải tranh chấp kỹ thuật 7 bước, và kiến trúc sổ cái mật mã Merkle Tree chống can thiệp ngầm cho nền tảng XBoss.

---

## 1. NGUYÊN TẮC BẤT BIẾN (INVARIANTS)

1. **Ranh giới Tự trị Có kiểm soát (Controlled Autonomy Envelope):**
   - Hệ thống AI chỉ được vận hành trong các cấp độ tự trị cho phép:
     - **A0 (Hỗ trợ thuần túy):** AI chỉ đọc, tính toán và hiển thị thông tin.
     - **A1 (Đề xuất có bằng chứng):** AI đề xuất phương án kèm chứng cứ tính toán, con người duyệt mới thực thi.
     - **A2 (Ủy quyền có điều kiện):** AI tự động xử lý các tác vụ lặp lại dưới ngưỡng an toàn được cấu hình sẵn (ví dụ: cảnh báo trễ hạn, phân loại nguyên nhân, kiểm tra định dạng).
     - **A3+ (Tự động thực thi có tác dụng phụ / chi phí lớn):** CẤM TUYỆT ĐỐI nếu không có phê duyệt tường minh bằng chữ ký số của Kỹ sư trưởng / Giám đốc Dự án.
2. **Cấm Biểu quyết Số đông trong Kỹ thuật (No Majority Voting Invariant):**
   - Tranh chấp kỹ thuật giữa các AI Agent (ví dụ: Design Agent vs Cost Agent) tuyệt đối KHÔNG được phân định bằng biểu quyết số đông.
   - Bắt buộc giải quyết theo **Thứ bậc Thẩm quyền Nguồn dữ liệu (Authority Hierarchy)**:
     $$\text{Quy chuẩn Quốc gia / TCVN} > \text{Hồ sơ Pháp lý / Hợp đồng FIDIC} > \text{Bản vẽ Thiết kế Cơ sở} > \text{Mô phỏng Thủy lực} > \text{Đề xuất Tối ưu}$$
3. **Bất biến Sổ cái Mật mã (Merkle Tree Cryptographic Invariant):**
   - Mọi sự kiện điều chỉnh dữ liệu quan trọng (BOQ, Đơn giá, Khối lượng nghiệm thu, Phiếu NCR, Thay đổi thiết kế) đều được gắn kèm mã băm SHA-256 (Leaf Hash) và nối vào Cây Merkle toàn hệ thống (`engineering_merkle_roots`).
   - Nếu có bất kỳ sự can thiệp trực tiếp vào CSDL làm sai lệch dữ liệu: Gốc Merkle Root sẽ lập tức phát hiện không khớp (Root Tampering Mismatch) và kích hoạt chế độ khóa an toàn.

---

## 2. QUY TRÌNH HÒA GIẢI XUNG ĐỘT 7 BƯỚC (ENG-4 PROTOCOL)

Khi có $\ge 2$ Tác tử AI đưa ra các nhận định hoặc đề xuất trái ngược nhau (ví dụ: Agent Thiết kế đòi hạ cao độ ống nước vs Agent Chi phí phản đối vì tăng chi phí fitting):

```
[B1: Phát hiện Xung đột] ──► [B2: Thu thập Bằng chứng] ──► [B3: Áp Thứ bậc Thẩm quyền] ──► [B4: Tính Hàm Mục tiêu Pareto] ──► [B5: Xác định Mức Đồng thuận] ──► [B6: Kiểm tra Trạm gác Gate 0] ──► [B7: Trình Người Duyệt Kèm Bằng chứng]
```

1. **Bước 1 — Phát hiện Xung đột (Conflict Detection):** Ghi nhận loại xung đột (`spatial_clash`, `cost_variance`, `standard_dispute`, `schedule_impact`, `resource_contention`).
2. **Bước 2 — Thu thập Bằng chứng (Evidence Harvesting):** Mỗi Agent phải cung cấp bằng chứng định lượng (Công thức thủy lực, Điều khoản TCVN, Mã định mức TT12, Tọa độ 3D).
3. **Bước 3 — Áp Thứ bậc Thẩm quyền (Authority Filtering):** Loại bỏ các đề xuất vi phạm Quy chuẩn bắt buộc hoặc vi phạm An toàn kết cấu.
4. **Bước 4 — Tối ưu hóa Đa mục tiêu Pareto (Multi-Objective Optimization):** Tính toán điểm đánh đổi giữa Thời gian ($\Delta T$), Chi phí ($\Delta C$) và Chất lượng ($\Delta Q$).
5. **Bước 5 — Xác định Mức độ Đồng thuận (Consensus Level):** Đánh giá mức độ đồng thuận (Full Consensus, Qualified Consensus, Divergent, No Consensus).
6. **Bước 6 — Kiểm tra Trạm gác Gate 0 (Gate 0 Verification):** Kiểm tra tính toàn vẹn dữ liệu, kiểm tra quyền hạn và định dạng.
7. **Bước 7 — Trình Duyệt Kèm Hồ sơ Bằng chứng (Human Review Dossier):** Đóng gói đề xuất tối ưu cùng phân tích rủi ro trình PM/Chỉ huy trưởng phê duyệt một chạm.

---

## 3. TÀI LIỆU THAM CHIẾU KỸ THUẬT (REFERENCES)

- [cad-bim-master/references/clash-solver-and-generative-shopdrawing.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/clash-solver-and-generative-shopdrawing.md): Ma trận ưu tiên không gian và giải thuật hòa giải xung đột hình học.
- [cad-bim-master/references/asbuilt-redline-and-handover-standards.md](file:///c:/Users/liend/xboss/.agents/skills/cad-bim-master/references/asbuilt-redline-and-handover-standards.md): Cân đối khối lượng quyết toán 3 chiều và chữ ký số phân quyền Gate 0.
