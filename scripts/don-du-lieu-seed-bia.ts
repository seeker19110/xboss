// scripts/don-du-lieu-seed-bia.ts — Dò (và tuỳ chọn xoá) dữ liệu BỊA mà hai endpoint GET
// từng tự chèn vào DB thật trước audit 2026-08-25 §3.3:
//   - GET /api/engineering/subcon-ai/scores: 4 hồ sơ thầu phụ mẫu + chỉ số năng lực mẫu.
//   - GET /api/engineering/iot/devices: 5 cảm biến IoT mẫu kèm ngưỡng cảnh báo mẫu.
// Hai chỗ seed đó đã bị gỡ khỏi mã nguồn, nhưng dự án nào đã từng MỞ hai trang này thì
// dòng bịa vẫn nằm trong DB.
//
// AN TOÀN: mặc định CHỈ BÁO CÁO, không xoá gì. Chỉ xoá đúng các bản ghi khớp *vân tay*
// của bộ seed (mã thiết bị / mã số thuế + tên công ty đúng nguyên văn) — không xoá theo
// kiểu "mọi hồ sơ chưa gắn supplier_id", vì hồ sơ do người dùng tự nhập cũng có thể trống.
//
// Chạy:  npx tsx scripts/don-du-lieu-seed-bia.ts            # chỉ báo cáo
//        npx tsx scripts/don-du-lieu-seed-bia.ts --xoa      # xoá thật
import "./env";
import { query, run } from "@/lib/db";

// Vân tay bộ seed cũ — lấy nguyên văn từ hai câu INSERT đã gỡ.
const HO_SO_THAU_PHU: [string, string][] = [
  ["Công ty CP Cơ Điện Lạnh Hưng Phát", "0312345678"],
  ["Công ty TNHH Kỹ Thuật Điện Quang Minh", "0319876543"],
  ["Công ty CP PCCC & Cấp Thoát Nước Thăng Long", "0105678901"],
  ["Công ty TNHH Dịch Vụ MEP Toàn Cầu", "0309998888"],
];
const MA_THIET_BI_IOT = ["AQI-B2-01", "GAS-B2-PUMP", "NOISE-T5-01", "TEMP-HUM-T5", "METER-MSB-01"];

async function main() {
  const xoa = process.argv.includes("--xoa");

  const hoSo = await query<{ id: string; projectId: number; companyName: string }>(
    `SELECT id, project_id AS "projectId", company_name AS "companyName"
       FROM engineering_subcon_profiles
      WHERE (company_name, tax_code) IN (${HO_SO_THAU_PHU.map(() => "(?, ?)").join(", ")})
      ORDER BY project_id, company_name`,
    ...HO_SO_THAU_PHU.flat(),
  );

  const thietBi = await query<{ id: string; projectId: number; deviceCode: string }>(
    `SELECT id, project_id AS "projectId", device_code AS "deviceCode"
       FROM engineering_iot_devices
      WHERE device_code IN (${MA_THIET_BI_IOT.map(() => "?").join(", ")})
      ORDER BY project_id, device_code`,
    ...MA_THIET_BI_IOT,
  );

  console.log("=== Dữ liệu seed bịa còn trong DB ===");
  console.log(`Hồ sơ thầu phụ M82: ${hoSo.length}`);
  for (const h of hoSo) console.log(`  - dự án ${h.projectId}: ${h.companyName}`);
  console.log(`Thiết bị IoT: ${thietBi.length}`);
  for (const t of thietBi) console.log(`  - dự án ${t.projectId}: ${t.deviceCode}`);

  if (!hoSo.length && !thietBi.length) {
    console.log("\nKhông có gì để dọn.");
    return;
  }
  if (!xoa) {
    console.log("\nCHỈ BÁO CÁO — chạy lại với cờ --xoa để xoá thật.");
    return;
  }

  // Chỉ số năng lực tham chiếu hồ sơ qua FK ON DELETE CASCADE (migration 0115) nên xoá hồ
  // sơ là dọn theo. Xoá từng dòng theo id để không lỡ tay quét cả bảng.
  for (const h of hoSo) await run(`DELETE FROM engineering_subcon_profiles WHERE id = ?`, h.id);
  for (const t of thietBi) await run(`DELETE FROM engineering_iot_devices WHERE id = ?`, t.id);
  console.log(`\nĐã xoá ${hoSo.length} hồ sơ thầu phụ và ${thietBi.length} thiết bị IoT bịa.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
