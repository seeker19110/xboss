import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { kiemTraTongTyTrong, NGUONG_LECH_WEIGHT } from "@/lib/khoi-luong/boq-coverage";

// ===== Luật tổng tỷ trọng (hàm thuần, không cần DB) =====

test("kiemTraTongTyTrong: Σ > 1 bị CHẶN — thanh toán không được vượt khối lượng hợp đồng", () => {
  const r = kiemTraTongTyTrong([0.8, 0.8]);
  assert.ok(r.loi, "Σ = 1.6 phải là lỗi chặn, không phải cảnh báo mềm");
  assert.match(r.loi!, /vượt/);
  assert.equal(r.canhBao, null);
});

test("kiemTraTongTyTrong: Σ < 1 chỉ CẢNH BÁO — map dần từng công việc là hợp lệ", () => {
  const r = kiemTraTongTyTrong([0.3]);
  assert.equal(r.loi, null);
  assert.ok(r.canhBao);
});

test("kiemTraTongTyTrong: Σ = 1 và map rỗng đều sạch", () => {
  assert.deepEqual(kiemTraTongTyTrong([0.5, 0.5]), { tong: 1, loi: null, canhBao: null });
  // Xoá sạch map (gửi mảng rỗng) là thao tác hợp lệ — không được coi là "chưa đủ 1".
  assert.deepEqual(kiemTraTongTyTrong([]), { tong: 0, loi: null, canhBao: null });
});

test("kiemTraTongTyTrong: sai số làm tròn NUMERIC(5,4) không bị coi là vi phạm", () => {
  const r = kiemTraTongTyTrong([0.3333, 0.3333, 0.3334]);
  assert.equal(r.loi, null);
  assert.equal(r.canhBao, null);
  assert.ok(Math.abs(r.tong - 1) < NGUONG_LECH_WEIGHT);
});

// ===== Bất biến trên DB thật (cần TEST_DATABASE_URL) =====

test(
  "boqExecutedQty: kẹp trần qty_contract kể cả khi dữ liệu cũ có Σweight > 1",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { boqExecutedQty } = await import("@/lib/khoi-luong/boq");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test kep tran KL')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp K')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTKEPTRAN', 'Sheet kẹp trần')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'K1', 'Nhóm kẹp trần')`,
      stId,
    );
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id)
       VALUES ('TESTKEPTRAN-0001', 'Ống gió', 'm2', 100, 0, ?)`,
      projectId,
    );

    // Hai công việc cùng 100%, tỷ trọng cộng lại 1.6 — dữ liệu kiểu này vẫn nằm sẵn trong DB
    // vì route chỉ mới chặn từ nay, không có migration nào dọn lịch sử.
    for (const [code, weight] of [
      ["K1,01", 0.8],
      ["K1,02", 0.8],
    ] as const) {
      const taskId = await insertId(
        `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, ?, ?, 1)`,
        pkgId,
        code,
        `Task ${code}`,
      );
      await run(
        `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, ?)`,
        boqId,
        taskId,
        weight,
      );
    }

    // Không kẹp thì ra 160 — tức là gợi ý thanh toán 160% khối lượng hợp đồng.
    assert.equal(Number(await boqExecutedQty(boqId)), 100);
  },
);

test(
  "Sổ mã BOQ: một task và một dòng BOQ KHÔNG THỂ mang cùng mã — nên mã trên task không phải con trỏ tới BOQ",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId } = await import("@/lib/db");
    const { doPhuBoq } = await import("@/lib/khoi-luong/boq-coverage");

    const projectId = await insertId(
      `INSERT INTO projects (name) VALUES ('Test ma BOQ khong noi')`,
    );
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp M')`,
      projectId,
    );
    const stId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TESTMOCOI', 'Sheet mã')`,
      towerId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'M1', 'Nhóm mã')`,
      stId,
    );
    await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id)
       VALUES ('TESTMOCOI-0001', 'Dòng BOQ', 'm', 10, 0, ?)`,
      projectId,
    );

    // Đây là bất biến khiến việc "đối chiếu tasks.boq_code với boq_items.code" trở nên vô nghĩa:
    // sổ đăng ký boq_codes cấm hai dòng khác bảng cùng giữ một mã, nên task KHÔNG THỂ mang mã
    // của dòng BOQ. Liên kết giá trị duy nhất là boq_task_map.
    await assert.rejects(
      () =>
        insertId(
          `INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, 'M1,01', 'Task đòi mã BOQ', 'TESTMOCOI-0001')`,
          pkgId,
        ),
      /đã được dùng ở bảng khác/,
    );

    // Task mang mã riêng vẫn hợp lệ, và độ phủ phải nói thẳng: có mã ≠ đã gắn giá trị.
    await insertId(
      `INSERT INTO tasks (package_id, code, name, boq_code) VALUES (?, 'M1,02', 'Task mã riêng', 'TESTMOCOI-T02')`,
      pkgId,
    );
    const dp = await doPhuBoq({ projectId });
    assert.equal(dp.coMaBoq, 1);
    assert.equal(dp.daMap, 0);
  },
);

test(
  "nextBoqSeq (qua previewBoqImport): so SỐ chứ không so CHUỖI, bỏ qua đuôi phi số",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId } = await import("@/lib/db");
    const { previewBoqImport } = await import("@/lib/khoi-luong/boq-import");

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test seq BOQ')`);
    // "TESTSEQ-9" sắp theo chuỗi thì đứng SAU "TESTSEQ-0010" → bản cũ tính mã kế tiếp là
    // TESTSEQ-0010 và đâm vào dòng đang có. "TESTSEQ-A1" từng làm parseInt trả NaN.
    for (const code of ["TESTSEQ-0010", "TESTSEQ-9", "TESTSEQ-A1"]) {
      await insertId(
        `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id)
         VALUES (?, 'Dòng sẵn có', 'm', 1, 0, ?)`,
        code,
        projectId,
      );
    }

    const preview = await previewBoqImport(
      [{ rowIndex: 0, name: "Dòng mới", unit: "m", qtyContract: 1, unitPrice: 0, note: null }],
      "testseq",
      1,
    );
    assert.equal(preview[0].code, "TESTSEQ-0011");
    assert.equal(preview[0].action, "add");
  },
);
