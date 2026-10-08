#!/usr/bin/env node
// C4 §4 — "Mutation test chọn mẫu cho delayed/progress/money/RBAC/RLS/idempotency/risk/gates;
// CHỨNG MINH TEST FAIL KHI ĐỔI INVARIANT."
//
// VẤN ĐỀ ĐANG CÓ: một bộ test xanh chỉ chứng minh "code hiện tại không làm test đỏ". Nó
// KHÔNG chứng minh test sẽ bắt được khi ai đó phá đúng cái bất biến mà test tưởng là đang
// canh. Test kiểu đó (chạy qua code nhưng không assert đúng chỗ) trông y hệt test tốt cho
// tới ngày có người sửa nhầm và CI vẫn xanh.
//
// CÁCH LÀM: với mỗi bất biến, cố ý SỬA SAI code một chỗ, chạy đúng những file test được cho
// là canh nó, rồi đòi hỏi chúng phải ĐỎ. Mutation nào "sống sót" (test vẫn xanh) là một lỗ
// hổng có thật trong bộ test — báo tên ra, không im lặng.
//
// KHÔNG thêm thư viện mutation testing (Stryker...): ADR-0001/nguyên tắc #7 của roadmap là
// không thêm hạ tầng khi chưa cần. Ở đây chỉ cần thay chuỗi + chạy lại đúng vài file test,
// nên viết tay ~150 dòng là đủ và chạy nhanh hơn nhiều (chỉ chạy file liên quan, không quét
// toàn repo).
//
// Chạy: `npm run test:mutation` (cần TEST_DATABASE_URL cho các bất biến chạm DB).
// Mỗi mutation luôn được HOÀN NGUYÊN, kể cả khi lỗi giữa chừng (xem khối finally).

import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { CO_MOCK_MODULE } from "./test-flags.mjs";

const tsxLoader = "./" + join("node_modules", "tsx", "dist", "loader.mjs");

/**
 * Mỗi mutation: đổi ĐÚNG MỘT chỗ trong `file`, rồi đòi các file trong `tests` phải đỏ.
 * `find` phải là chuỗi xuất hiện DUY NHẤT trong file — script tự kiểm và báo lỗi nếu không,
 * để mutation không lặng lẽ trượt sang chỗ khác khi code đổi.
 */
const MUTATIONS = [
  {
    key: "progress: 199/200 không được thành 100%",
    file: "lib/tien-do/recompute.ts",
    find: "Math.min(0.99, Math.round((checked / total) * 100) / 100)",
    replace: "Math.round((checked / total) * 100) / 100",
    tests: ["tests/recompute.test.ts"],
    why: "Bỏ trần 0.99 → 199/200 làm tròn lên 1.00, mở khoá nghiệm thu sai khi còn ô chưa tick.",
  },
  {
    key: "delayed: quá hạn mà chưa xong phải là 'tre'",
    file: "lib/tien-do/recompute.ts",
    find: 'if (endDate && endDate < todayISO()) return "tre";',
    replace: 'if (endDate && endDate < todayISO()) return "dang_thi_cong";',
    tests: ["tests/recompute.test.ts"],
    why: "Task trễ không còn được đánh dấu trễ → dashboard/cảnh báo/Pareto mất sạch việc trễ.",
  },
  {
    key: "nghiệm thu không bao giờ bị hạ cấp tự động",
    file: "lib/tien-do/recompute.ts",
    find: 'if (current === "nghiem_thu") return "nghiem_thu";',
    replace: 'if (false) return "nghiem_thu";',
    tests: ["tests/recompute.test.ts"],
    why: "Task đã nghiệm thu bị tính lại về trạng thái khác — mất dấu nghiệm thu đã ký.",
  },
  {
    key: "RBAC: chỉ Admin/PM được duyệt nghiệm thu",
    file: "lib/bao-mat/auth.ts",
    find: 'approve: (r?: Role) => r === "admin" || r === "pm",',
    replace: 'approve: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",',
    // Bất biến này được canh ở permissions.test.ts (map `CAN` + override theo vai trò),
    // KHÔNG phải auth.test.ts. Bản đầu trỏ nhầm sang auth.test.ts và mutation "sống sót" —
    // hoá ra là lỗi bản đồ của chính script, không phải lỗ hổng của bộ test. Giữ ghi chú
    // này để lần sau đọc kết quả không kết luận vội.
    tests: ["tests/permissions.test.ts"],
    why: "Nới quyền duyệt cho engineer — leo thang quyền ở đúng chỗ nhạy cảm nhất.",
  },
  {
    key: "risk: an toàn là tuyệt đối (critical bất kể yếu tố khác)",
    file: "lib/ky-thuat/engineering-workflow.ts",
    find: 'if (i.safetyRisk) return "critical";',
    replace: 'if (i.safetyRisk) return "high";',
    tests: ["tests/engineering-workflow.test.ts"],
    why: "Hạ rủi ro an toàn xuống high → đổi profile duyệt, bớt gate cho đúng loại việc nguy hiểm nhất.",
  },
  {
    key: "gates: profile C phải có đủ 2 gate",
    file: "lib/ky-thuat/engineering-workflow.ts",
    find: "      return [GATE_1, GATE_2];",
    replace: "      return [GATE_1];",
    tests: ["tests/engineering-workflow.test.ts"],
    why: "Bớt một cửa ký duyệt — separation of duties bị phá âm thầm.",
  },
  {
    key: "idempotency: cùng key + body KHÁC phải 409",
    file: "app/api/v1/engineering/ingest/route.ts",
    find: "if (prior.requestSha256 !== requestSha256)",
    replace: "if (false)",
    tests: ["tests/engineering-ingest.test.ts", "tests/engineering-contract.test.ts"],
    why: "Dùng lại Idempotency-Key cho payload khác được trả về response cũ — client tưởng đã ghi, thực ra không.",
  },
  {
    key: "RLS: withProjectScope mặc định CHỈ ĐỌC",
    file: "lib/db/index.ts",
    find: "const readOnly = opts?.readOnly ?? true;",
    replace: "const readOnly = opts?.readOnly ?? false;",
    tests: ["tests/rls.test.ts"],
    why: "Mặc định thành ghi được → mọi đường đọc bọc scope bỗng có quyền ghi ngoài ý muốn.",
  },
  {
    key: "money: nhân hệ số phải làm tròn nửa lên",
    file: "lib/nen/money.ts",
    find: "return roundHalfUpNum(Number(v) * rate);",
    replace: "return BigInt(Math.floor(Number(v) * rate));",
    tests: ["tests/money.test.ts"],
    why: "Đổi cách làm tròn tiền → lệch từng đồng dồn lại trên hoá đơn/IPC, sai lệch tài chính.",
  },
  // QUALITY-FINAL-1 S10a: đường IPC exact. `moiFile` = MỖI file test phải đỏ (không chỉ 1) — mỗi
  // lớp (utility golden, route golden, DTO/export) canh bất biến độc lập, lớp nào im là có lỗ.
  {
    key: "money: mulRatio làm tròn nửa xa 0 (tạm ứng IPC)",
    file: "lib/nen/money.ts",
    find: "return divRoundHalfUp(minor * numerator, denominator);",
    replace: "return (minor * numerator) / denominator;",
    tests: [
      "tests/money-exact-golden.test.ts",
      "tests/money-ipc-golden-route.test.ts",
      "tests/payment-certs-money-dto.test.ts",
    ],
    moiFile: true,
    why: "Chặt cụt thay vì làm tròn → tạm ứng 10,25% × 94,00 ra 9,63 thay 9,64; lệch xu trên IPC/phiếu thanh toán.",
  },
  {
    key: "money: ipc-sum-v1 cộng rồi mới round tổng",
    file: "lib/nen/money.ts",
    find: "const periodValue = sumMoneyProductsExact(products, IPC_QTY_SCALE);",
    replace:
      "const periodValue = products.reduce((s, p) => s + sumMoneyProductsExact([p], IPC_QTY_SCALE), 0n);",
    tests: [
      "tests/money-exact-golden.test.ts",
      "tests/money-ipc-golden-route.test.ts",
      "tests/payment-certs-money-dto.test.ts",
    ],
    moiFile: true,
    why: "Round từng dòng trước khi cộng (trái A3-FR05) → 2 dòng 0,005 thành 0,02 thay 0,01; giá trị đợt sai.",
  },
  // QUALITY-FINAL-1 S13c: quyết định IPC (A5-FR06/FR07).
  {
    key: "IPC: cảnh báo vượt HĐ phải được xác nhận đúng bản hiện tại",
    file: "lib/tai-chinh/ipc-quyet-dinh.ts",
    find: "if (!xn.acknowledged || !xn.reason || xn.warningVersion == null)",
    replace: "if (false)",
    tests: ["tests/s13a-chuoi-ipc-thanh-toan.test.ts", "tests/s13c-ipc-quyet-dinh.test.ts"],
    moiFile: true,
    why: "Duyệt đợt luỹ kế vượt khối lượng hợp đồng mà không ai xác nhận cảnh báo — sinh phiếu thanh toán tiền thật.",
  },
  {
    key: "IPC: decide tính lại luỹ kế dưới khoá",
    file: "app/api/payment-certs/[id]/decide/route.ts",
    find: "      await tinhLaiLuyKeDot(id);",
    replace: "",
    tests: ["tests/s13c-ipc-quyet-dinh.test.ts"],
    why: "Duyệt bằng luỹ kế lưu lúc trình/nháp (đã cũ) → luỹ kế chốt sai và mất cảnh báo vượt HĐ (A5-FR06).",
  },
  {
    key: "IPC: không duyệt kỳ trước khi kỳ sau đã duyệt",
    file: "app/api/payment-certs/[id]/decide/route.ts",
    find: "        if (sau)",
    replace: "        if (sau && false)",
    tests: ["tests/s13a-chuoi-ipc-thanh-toan.test.ts"],
    why: "Duyệt ngược kỳ → lịch sử luỹ kế lệch, không đối soát (A5-FR06).",
  },
  // QUALITY-FINAL-1 S13d: ngưỡng duyệt IPC theo giá trị đợt HIỆN TẠI.
  {
    key: "IPC: decide chốt lại amount cũ trước khi engine chọn bước",
    file: "app/api/payment-certs/[id]/decide/route.ts",
    find: "            await kiemAmountTruocKhiDuyet({",
    replace: "            void ({",
    tests: ["tests/s13d-ipc-con-lai.test.ts"],
    why: "Request trình trước bản vá S10a mang amount lúc lập nháp → engine bỏ qua bước duyệt cấp cao theo min_amount.",
  },
  // QUALITY-FINAL-1 S13e: cùng bất biến cho đề xuất + phát sinh (VO).
  {
    key: "Đề xuất: decide chốt lại amount cũ trước khi engine chọn bước",
    file: "app/api/proposals/[id]/decide/route.ts",
    find: "          await kiemAmountTruocKhiDuyet({",
    replace: "          void ({",
    tests: ["tests/s13e-de-xuat-vo-quyet-dinh.test.ts"],
    why: "Đề xuất trình trước S13d mang số tiền lúc lập → engine bỏ qua bước duyệt cấp cao theo min_amount.",
  },
  {
    key: "VO: decide chốt lại amount cũ trước khi engine chọn bước",
    file: "app/api/variations/[id]/decide/route.ts",
    find: "          await kiemAmountTruocKhiDuyet({",
    replace: "          void ({",
    tests: ["tests/s13e-de-xuat-vo-quyet-dinh.test.ts"],
    why: "VO lập trước S13e mang amount từ SUM float → engine chọn cấp duyệt theo số xấp xỉ/cũ.",
  },
];

const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const list = only ? MUTATIONS.filter((m) => m.key.includes(only)) : MUTATIONS;

/** Chạy 1 file test (cùng cờ mock.module như runner chính); true nếu file ĐỎ. */
function fileFails(f) {
  const res = spawnSync(process.execPath, [CO_MOCK_MODULE, `--import=${tsxLoader}`, "--test", f], {
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf8",
  });
  return res.status !== 0;
}

/** Chạy các file test; trả true nếu CÓ ÍT NHẤT MỘT file đỏ. */
function testsFail(files) {
  return files.some(fileFails);
}

/** Sau mutation: `moiFile` đòi MỌI file đỏ; còn lại chỉ cần 1. Trả danh sách file vẫn xanh. */
function filesStillGreen(m) {
  if (!m.moiFile) return testsFail(m.tests) ? [] : [...m.tests];
  return m.tests.filter((f) => !fileFails(f));
}

let songSot = 0;
let daChay = 0;

for (const m of list) {
  const src = readFileSync(m.file, "utf8");
  const soLan = src.split(m.find).length - 1;

  if (soLan !== 1) {
    process.stdout.write(
      `\n⚠️  BỎ QUA "${m.key}"\n` +
        `    Chuỗi cần thay xuất hiện ${soLan} lần trong ${m.file} (phải đúng 1).\n` +
        `    Code đã đổi — cập nhật lại 'find' trong scripts/mutation-check.mjs, đừng để mutation trượt chỗ khác.\n`,
    );
    songSot++; // coi như lỗi: mutation không còn kiểm được gì
    continue;
  }

  process.stdout.write(`\n▶ ${m.key}\n   ${m.file} · test: ${m.tests.join(", ")}\n`);

  // ĐƯỜNG NỀN (baseline) — BẮT BUỘC kiểm trước khi sửa code.
  //
  // Không có bước này, script tự lừa mình: bất kỳ lý do nào làm test thoát khác 0 (Postgres
  // chết, thiếu TEST_DATABASE_URL, lỗi cú pháp sẵn có) đều bị đếm là "mutation đã bị bắt",
  // và bảng kết quả ra 9/9 xanh mượt trong khi thực chất chưa đo được gì. Đã mắc đúng lỗi
  // này ở lần chạy đầu (Postgres tắt giữa chừng) — nên chốt thành bước cứng.
  if (testsFail(m.tests)) {
    process.stdout.write(
      `   ⚠️  BỎ QUA — test đã ĐỎ SẴN khi CHƯA sửa gì.\n` +
        `      Kết quả mutation sẽ vô nghĩa (đỏ vì hạ tầng/lỗi có sẵn, không phải vì bắt được).\n` +
        `      Sửa cho test xanh trước (thường là thiếu TEST_DATABASE_URL hoặc Postgres chưa chạy).\n`,
    );
    songSot++;
    continue;
  }

  daChay++;
  try {
    writeFileSync(m.file, src.replace(m.find, m.replace));
    const conXanh = filesStillGreen(m);
    if (conXanh.length === 0) {
      process.stdout.write(`   ✅ test ĐỎ như mong đợi — bất biến này thật sự được canh\n`);
    } else {
      songSot++;
      process.stdout.write(
        `   ❌ MUTATION SỐNG SÓT — test vẫn XANH dù code đã bị phá: ${conXanh.join(", ")}\n` +
          `      Hậu quả nếu lọt thật: ${m.why}\n` +
          `      => Bộ test chưa canh bất biến này. Bổ sung assert, đừng sửa mutation cho qua.\n`,
      );
    }
  } finally {
    // Luôn trả file về nguyên trạng, kể cả khi test ném lỗi giữa chừng.
    writeFileSync(m.file, src);
  }
}

process.stdout.write(
  `\n=== Mutation: ${daChay}/${list.length} chạy được · ${songSot} sống sót (mong đợi 0) ===\n`,
);
process.exit(songSot > 0 ? 1 : 0);
