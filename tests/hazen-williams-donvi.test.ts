import "./setup";
import test from "node:test";
import assert from "node:assert/strict";
import { calcHazenWilliams } from "@/lib/ky-thuat/engineering-cad-nesting";
import { calculateHydraulicLoss } from "@/lib/ky-thuat/engineering-hydraulic-engine";

// Dự án cố ý giữ HAI quy ước đơn vị lưu lượng cho Hazen-Williams (quyết định 2026-08-25):
//   - calcHazenWilliams (M89)         : L/s,  thứ tự (Q, ĐƯỜNG KÍNH, CHIỀU DÀI)
//   - calculateHydraulicLoss (M68)    : m³/h, thứ tự (Q, CHIỀU DÀI, ĐƯỜNG KÍNH)
// Bộ test này canh: quy đổi đúng đơn vị thì hai bản phải ra CÙNG kết quả vật lý.
// 1 L/s = 3,6 m³/h.

const LPS_TO_M3H = 3.6;
const G_M89 = 9806.65; // Pa mỗi mét cột nước, bản M89

test("Hazen-Williams: hai quy ước đơn vị cho cùng tổn thất khi quy đổi đúng", () => {
  for (const [qLps, dMm, lM] of [
    [2.5, 50, 10],
    [10, 100, 50],
    [30, 150, 120],
  ]) {
    const m89 = calcHazenWilliams(qLps, dMm, lM, 120);
    const m68 = calculateHydraulicLoss(qLps * LPS_TO_M3H, lM, dMm, 120);

    // Vận tốc là phép chia thuần, phải khớp gần như tuyệt đối.
    assert.ok(
      Math.abs(m89.velocityMs - m68.velocityMs) < 1e-3,
      `vận tốc lệch: ${m89.velocityMs} vs ${m68.velocityMs} (Q=${qLps} L/s, D=${dMm}mm)`,
    );

    // Tổn thất: M89 trả Pa, M68 trả mét cột nước. Quy về mét rồi so.
    const headLossM89 = m89.totalHeadLossPa / G_M89;
    const saiSoTuongDoi = Math.abs(headLossM89 - m68.headLossM) / m68.headLossM;
    assert.ok(
      saiSoTuongDoi < 0.005,
      `tổn thất lệch ${(saiSoTuongDoi * 100).toFixed(3)}%: ${headLossM89} m vs ${m68.headLossM} m ` +
        `(Q=${qLps} L/s, D=${dMm}mm, L=${lM}m)`,
    );
  }
});

test("Hazen-Williams: nhầm đơn vị L/s sang bản m³/h ra kết quả sai rõ rệt", () => {
  // Ca bảo vệ: nếu ai đó truyền thẳng số L/s vào bản m³/h, tổn thất tụt hàng chục lần.
  // Test này KHÔNG kiểm đúng/sai công thức — nó ghi lại vì sao hai hàm phải khác tên.
  const dung = calculateHydraulicLoss(10 * LPS_TO_M3H, 50, 100, 120);
  const nham = calculateHydraulicLoss(10, 50, 100, 120);
  assert.ok(
    dung.headLossM > nham.headLossM * 5,
    `nhầm đơn vị phải lệch rất xa, nhưng ${dung.headLossM} vs ${nham.headLossM}`,
  );
});
