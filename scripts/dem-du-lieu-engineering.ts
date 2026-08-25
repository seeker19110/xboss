// scripts/dem-du-lieu-engineering.ts — Đếm số dòng THẬT của từng bảng `engineering_*` và
// của bảng nghiệp vụ đối ứng, để quyết 6 cặp stack song song còn lại (ADR-0011 §"Việc CÒN
// LẠI", audit 2026-08-25 §3.3 / đề xuất #6).
//
// VÌ SAO cần script này: quyết định "gộp hai lớp" hay "xoá lớp engineering" phụ thuộc DUY
// NHẤT vào một dữ kiện mà không đọc được từ mã nguồn — các bảng đó có dữ liệu thật hay rỗng.
// Bảng rỗng thì "gộp" (migration nhiều tháng) biến thành "xoá" (một PR). Chạy trên chính DB
// production/staging rồi đọc cột KẾT LUẬN.
//
// CHỈ ĐỌC: script không ghi, không xoá, không đổi schema. An toàn chạy trên production.
//
// Chạy:  DATABASE_URL=<chuỗi kết nối production> npx tsx scripts/dem-du-lieu-engineering.ts
//        thêm --tat-ca để liệt kê cả 119 bảng engineering_* chứ không chỉ 6 cặp.
import "./env";
import { query } from "@/lib/db";

/** 6 cặp còn treo trong ADR-0011 + cặp thầu phụ (đã nối ở 0137, để đối chiếu). */
const CAP: { nghiepVu: string; bangGoc: string[]; engineering: string[] }[] = [
  {
    nghiepVu: "Claim / EOT",
    bangGoc: ["claims"],
    engineering: ["engineering_fidic_claims", "engineering_fidic_tia_claims"],
  },
  {
    nghiepVu: "Đấu thầu",
    bangGoc: ["tender_packages", "tender_bids"],
    engineering: ["engineering_bidding_packages", "engineering_bidding_vendor_quotes"],
  },
  {
    nghiepVu: "Dòng tiền",
    bangGoc: ["invoices"],
    engineering: ["engineering_cashflow_forecast_runs", "engineering_cashflow_period_projections"],
  },
  {
    nghiepVu: "HSE",
    bangGoc: ["hse_records"],
    engineering: ["engineering_hse_vision_scans", "engineering_hse_detected_hazards"],
  },
  {
    nghiepVu: "BIM / bản vẽ",
    bangGoc: ["drawings"],
    engineering: ["engineering_bim_models", "engineering_bim_elements"],
  },
  {
    nghiepVu: "Rủi ro / dự báo",
    bangGoc: ["risks"],
    engineering: ["engineering_prediction_runs", "engineering_prediction_outputs"],
  },
  {
    nghiepVu: "Thầu phụ (đã nối 0137)",
    bangGoc: ["subcontractor_profiles"],
    engineering: ["engineering_subcon_profiles"],
  },
];

async function dem(bang: string): Promise<number | null> {
  try {
    const r = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${bang}`);
    return r[0]?.n ?? 0;
  } catch {
    return null; // bảng chưa tồn tại trên DB này
  }
}

async function main() {
  const tatCa = process.argv.includes("--tat-ca");

  console.log("=== Mức dùng thật của lớp engineering (chỉ đọc) ===\n");
  console.log(
    "Nghiệp vụ".padEnd(26) + "Bảng gốc".padStart(10) + "Lớp eng.".padStart(11) + "   Kết luận",
  );
  console.log("-".repeat(84));

  for (const c of CAP) {
    const goc = (await Promise.all(c.bangGoc.map(dem))).reduce<number>((a, b) => a + (b ?? 0), 0);
    const engRaw = await Promise.all(c.engineering.map(dem));
    const eng = engRaw.reduce<number>((a, b) => a + (b ?? 0), 0);

    // Ngưỡng cố ý thô: điều cần biết chỉ là "có ai dùng thật không".
    const ketLuan =
      eng === 0
        ? "XOÁ được lớp eng. (rỗng) — rẻ hơn gộp nhiều bậc"
        : goc === 0
          ? "Chỉ lớp eng. có dữ liệu → xem lại: nghiệp vụ gốc chưa dùng?"
          : eng < goc / 10
            ? "Lớp eng. gần như không dùng → nghiêng về XOÁ"
            : "CẢ HAI đang dùng → phải GỘP thật, cần kế hoạch di trú";

    console.log(
      c.nghiepVu.padEnd(26) + String(goc).padStart(10) + String(eng).padStart(11) + "   " + ketLuan,
    );
  }

  if (tatCa) {
    const bang = await query<{ tableName: string }>(
      `SELECT table_name AS "tableName" FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'engineering!_%' ESCAPE '!'
        ORDER BY table_name`,
    );
    console.log(`\n=== Toàn bộ ${bang.length} bảng engineering_* ===`);
    let rong = 0;
    for (const b of bang) {
      const n = await dem(b.tableName);
      if (n === 0) rong++;
      console.log(`${String(n ?? "-").padStart(8)}  ${b.tableName}`);
    }
    console.log(`\nRỗng hoàn toàn: ${rong}/${bang.length} bảng.`);
  } else {
    console.log("\n(thêm cờ --tat-ca để liệt kê toàn bộ 119 bảng engineering_*)");
  }

  console.log('\nGhi kết quả vào ADR-0011 mục "Việc CÒN LẠI" rồi mới quyết gộp/xoá từng cặp.');
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
