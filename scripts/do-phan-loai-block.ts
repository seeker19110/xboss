// scripts/do-phan-loai-block.ts — M108 §15.4: đo AC3 (tỷ lệ phân loại `kind` đúng ngay từ đầu).
//
// Chạy: npx tsx scripts/do-phan-loai-block.ts
//   • Không có ANTHROPIC_API_KEY  → chỉ đo TẦNG 1 (số nền).
//   • Có khoá                     → đo cả 4 tầng, và in phần chênh chính là đóng góp thật của AI.
//
// Vì sao có script này thay vì một ca test: nó GỌI MẠNG và TỐN TIỀN, nên không được nằm trong cổng
// CI. Đây là công cụ chạy tay khi cần đánh giá, đúng như đặc tả xếp nó vào §15.4 chứ không §15.1.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { phanLoaiLoTheoLuat } from "@/lib/ky-thuat/cad/block-phan-loai-luat";
import { phanLoaiLo } from "@/lib/dich-vu/cad-block-phan-loai";
import { aiKhaDung, lyDoAiTat } from "@/lib/nen/ai";

type Dong = {
  blockName: string;
  nhan: string;
  lop: string;
  layer?: string;
  attributes?: string[];
  ghiChu?: string;
};

const DUONG_DAN = join(
  process.cwd(),
  "plugin-autocad",
  "doi-chung",
  "block-phan-loai-doi-chung.json",
);

function bang(nhan: string, dung: number, tong: number): string {
  const pct = tong === 0 ? 0 : (dung / tong) * 100;
  return `  ${nhan.padEnd(18)} ${String(dung).padStart(3)}/${String(tong).padEnd(3)}  ${pct.toFixed(1).padStart(5)}%`;
}

async function main(): Promise<void> {
  const doc = JSON.parse(readFileSync(DUONG_DAN, "utf8")) as {
    nhanDaXacNhan: boolean;
    nguoiGanNhan: string | null;
    blocks: Dong[];
  };
  const blocks = doc.blocks;
  const lops = [...new Set(blocks.map((b) => b.lop))].sort();

  console.log("=== M108 AC3 — đo phân loại block trên bộ đối chứng ===");
  console.log(`Bộ đối chứng: ${blocks.length} block, ${lops.length} lớp khó\n`);

  if (!doc.nhanDaXacNhan) {
    console.log("⚠️  NHÃN CHƯA ĐƯỢC XÁC NHẬN — mọi con số dưới đây chỉ để tham khảo.");
    console.log("   Theo M108 §18 R4, nhãn chuẩn phải do kỹ sư trưởng/CAD manager gán, không phải");
    console.log("   người viết code. Chưa có chữ ký đó thì KHÔNG được tuyên bố AC3 đạt.\n");
  }

  // ── Tầng 1 ─────────────────────────────────────────────────────────────────
  const t1 = phanLoaiLoTheoLuat(blocks);
  console.log("TẦNG 1 (luật tất định, không mạng) — số nền:");
  for (const lop of lops) {
    const idx = blocks.map((b, i) => (b.lop === lop ? i : -1)).filter((i) => i >= 0);
    console.log(bang(lop, idx.filter((i) => t1[i].kind === blocks[i].nhan).length, idx.length));
  }
  const dungT1 = blocks.filter((b, i) => t1[i].kind === b.nhan).length;
  console.log(bang("TỔNG", dungT1, blocks.length));

  // Đếm riêng phần SAI (nguy hiểm) với phần CHƯA QUYẾT (an toàn — người khai tiếp).
  const saiT1 = blocks.filter((b, i) => t1[i].kind !== null && t1[i].kind !== b.nhan).length;
  console.log(`  → sai: ${saiT1} · chưa quyết: ${blocks.length - dungT1 - saiT1}`);
  if (saiT1 > 0) {
    console.log(
      "  ⚠️  Tầng 1 SAI là lỗi nặng hơn chưa quyết nhiều — luật tất định phải đúng hoặc im.",
    );
    for (const [i, b] of blocks.entries()) {
      if (t1[i].kind !== null && t1[i].kind !== b.nhan) {
        console.log(
          `      ${b.blockName}: đoán "${t1[i].kind}", đúng là "${b.nhan}" — ${t1[i].lyDo}`,
        );
      }
    }
  }

  // ── 4 tầng ─────────────────────────────────────────────────────────────────
  if (!aiKhaDung()) {
    console.log(`\nBỎ QUA 4 tầng: ${lyDoAiTat()}`);
    console.log("Đặt ANTHROPIC_API_KEY rồi chạy lại để đo đóng góp thật của AI.");
    return;
  }

  console.log("\nĐang gọi mô hình…");
  const { ketQua } = await phanLoaiLo(blocks);
  console.log("\n4 TẦNG (luật → ngữ nghĩa → hình học):");
  for (const lop of lops) {
    const idx = blocks.map((b, i) => (b.lop === lop ? i : -1)).filter((i) => i >= 0);
    console.log(bang(lop, idx.filter((i) => ketQua[i].kind === blocks[i].nhan).length, idx.length));
  }
  const dung = blocks.filter((b, i) => ketQua[i].kind === b.nhan).length;
  console.log(bang("TỔNG", dung, blocks.length));

  const sai = blocks.filter((b, i) => ketQua[i].kind !== null && ketQua[i].kind !== b.nhan).length;
  console.log(`  → sai: ${sai} · chưa quyết: ${blocks.length - dung - sai}`);
  console.log(
    `\nĐÓNG GÓP CỦA AI: +${dung - dungT1} block (${(((dung - dungT1) / blocks.length) * 100).toFixed(1)}%) so với tầng 1 một mình.`,
  );

  const nguong = 0.9;
  const dat = dung / blocks.length >= nguong;
  console.log(
    `\nAC3 (≥${nguong * 100}%): ${dat ? "ĐẠT" : "CHƯA ĐẠT"}${doc.nhanDaXacNhan ? "" : " — nhưng nhãn CHƯA xác nhận nên chưa kết luận được"}`,
  );

  // Liệt kê ca sai để người rà soát biết sửa đâu.
  if (sai > 0) {
    console.log("\nCác ca SAI (cần xem lại prompt hoặc nhãn):");
    for (const [i, b] of blocks.entries()) {
      if (ketQua[i].kind !== null && ketQua[i].kind !== b.nhan) {
        console.log(
          `  ${b.blockName} [${b.lop}]: máy "${ketQua[i].kind}" (${ketQua[i].nguon}, tin cậy ${ketQua[i].doTinCay ?? "-"}), đúng là "${b.nhan}"`,
        );
        console.log(`      lý do máy đưa ra: ${ketQua[i].lyDo}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
