import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M70 — Closed-Loop Autonomous WBS & Payment Sync Engine: nối khối lượng đo đạc (spool)
// vào tiến độ WBS + Chứng chỉ thanh toán IPC, ghi log đồng bộ BẤT BIẾN (không sửa/xoá).
//
// Viết test cho module này đã lộ ra HAI lỗi thật khiến route /api/engineering/closed-loop-sync
// hỏng hoàn toàn ở cả GET lẫn POST: câu UPDATE dùng hai cột không tồn tại
// (`tasks.progress`, `tasks.project_id`), và hàm liệt kê log truyền tham số dạng mảng vào
// `query(sql, ...params)`. Cả hai đã được sửa cùng đợt này; test dưới khoá lại HÀNH VI ĐÚNG
// sau khi sửa — đặc biệt là các bất biến tiến độ (thang 0..1, enum slug, `nghiem_thu` không
// bị hạ cấp) để lần sau không ai vô tình viết lại thang 0..100.
import { test } from "node:test";
import assert from "node:assert/strict";

const S = { skip: !HAS_TEST_DB };

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, ten);
}

test(
  "syncSpoolToWbsAndPayment: không gắn wbsTaskId — tính đúng thành tiền, ghi log bất biến khớp DB",
  S,
  async () => {
    const { queryOne, run } = await import("@/lib/db");
    const { syncSpoolToWbsAndPayment } =
      await import("@/lib/ky-thuat/engineering-closed-loop-sync");

    const projectId = await taoDuAn("Test closed-loop sync 1");
    try {
      const kq = await syncSpoolToWbsAndPayment(projectId, {
        spoolId: "SPOOL-A01",
        wbsTaskId: null,
        discipline: "hvac",
        calculatedQty: 12.5,
        unit: "m",
        unitRateVnd: 200_000,
      });

      // Tiền phải tính ĐÚNG (2.500.000đ = 12.5 × 200.000) — đây là số liệu đưa vào IPC,
      // sai một đồng cũng là sai chứng chỉ thanh toán.
      assert.equal(kq.status, "synced_successfully");
      assert.equal(kq.syncedAmountVnd, 2_500_000);
      assert.equal(kq.syncedQty, 12.5);
      assert.equal(kq.spoolId, "SPOOL-A01");
      assert.equal(kq.wbsTaskId, null);
      assert.match(kq.syncCode, /^SYNC-LOOP-[0-9A-Z]+-[0-9A-F]{8}$/);
      // Token bằng chứng ký từ sha256 — đúng tiền tố + đủ 24 ký tự hex viết hoa.
      assert.match(kq.provenanceToken, /^SIG-PAY-[0-9A-F]{24}$/);
      assert.match(kq.message, /12\.5 m/);
      assert.match(kq.message, /WBS/);

      // Log phải ghi ĐÚNG những gì trả về cho người dùng — không lệch giữa response và sổ sách.
      const dong = await queryOne<{
        wbs_task_id: number | null;
        synced_qty: string;
        synced_amount_vnd: string;
        provenance_token: string;
      }>(
        `SELECT wbs_task_id, synced_qty, synced_amount_vnd, provenance_token
           FROM engineering_closed_loop_sync_logs WHERE project_id = ? AND sync_code = ?`,
        projectId,
        kq.syncCode,
      );
      assert.ok(dong, "phải có đúng 1 dòng log ứng với sync_code trả về");
      assert.equal(dong!.wbs_task_id, null);
      assert.equal(Number(dong!.synced_qty), 12.5);
      assert.equal(Number(dong!.synced_amount_vnd), 2_500_000);
      assert.equal(dong!.provenance_token, kq.provenanceToken);
    } finally {
      await run(`DELETE FROM engineering_closed_loop_sync_logs WHERE project_id = ?`, projectId);
      await run(`DELETE FROM projects WHERE id = ?`, projectId);
    }
  },
);

test(
  "syncSpoolToWbsAndPayment: làm tròn thành tiền theo Math.round (làm tròn LÊN khi ≥ 0.5), không phải làm tròn xuống",
  S,
  async () => {
    // Bẫy dễ sai nhất khi tính tiền từ khối lượng đo đạc thực tế (số lẻ): nếu ai đó vô tình
    // đổi Math.round thành Math.floor, số tiền thanh toán sẽ bị hụt — phải bắt được ngay.
    const { run } = await import("@/lib/db");
    const { syncSpoolToWbsAndPayment } =
      await import("@/lib/ky-thuat/engineering-closed-loop-sync");

    const projectId = await taoDuAn("Test closed-loop sync rounding");
    try {
      const kq = await syncSpoolToWbsAndPayment(projectId, {
        spoolId: "SPOOL-ROUND",
        wbsTaskId: null,
        discipline: "electrical",
        calculatedQty: 3,
        unit: "cái",
        unitRateVnd: 0.5, // 3 × 0.5 = 1.5 → Math.round = 2 (không phải 1 như Math.floor)
      });
      assert.equal(kq.syncedAmountVnd, 2);
    } finally {
      await run(`DELETE FROM engineering_closed_loop_sync_logs WHERE project_id = ?`, projectId);
      await run(`DELETE FROM projects WHERE id = ?`, projectId);
    }
  },
);

/** Dựng một task thật (dự án → tháp → sheet → nhóm → task) để kiểm nhánh cập nhật WBS. */
async function taoTask(projectId: number, progress: number, status: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp CLS')`,
    projectId,
  );
  const stId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet CLS')`,
    towerId,
    `CLS${Date.now().toString(36)}`,
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'C1', 'Nhóm CLS')`,
    stId,
  );
  return insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent, status) VALUES (?, 'C1,01', 'Task CLS', ?, ?)`,
    pkgId,
    progress,
    status,
  );
}

test(
  "syncSpoolToWbsAndPayment: có wbsTaskId — cộng 10% theo thang 0..1 và đặt status đúng enum slug",
  S,
  async () => {
    // Thang tiến độ của dự án là 0..1 (có CHECK trong DB), status là enum slug tiếng Việt.
    // Bản cũ viết `progress + 10` và `'in_progress'` — vừa sai cột, vừa sai thang, vừa sai
    // enum; nếu chỉ sửa tên cột mà giữ nguyên `+10` thì CHECK sẽ chặn và lỗi chuyển thành
    // một dạng khác. Ca này khoá cả ba điều đó cùng lúc.
    const { queryOne, run } = await import("@/lib/db");
    const { syncSpoolToWbsAndPayment } =
      await import("@/lib/ky-thuat/engineering-closed-loop-sync");

    const projectId = await taoDuAn("Test closed-loop sync wbsTaskId");
    try {
      const taskId = await taoTask(projectId, 0.5, "dang_thi_cong");
      await syncSpoolToWbsAndPayment(projectId, {
        spoolId: "SPOOL-WBS",
        wbsTaskId: taskId,
        discipline: "hvac",
        calculatedQty: 5,
        unit: "m",
        unitRateVnd: 100_000,
      });

      const sau = await queryOne<{ p: number; status: string }>(
        `SELECT progress_percent AS p, status FROM tasks WHERE id = ?`,
        taskId,
      );
      assert.ok(Math.abs(Number(sau!.p) - 0.6) < 1e-9, "0.5 + 10% phải thành 0.6");
      assert.equal(sau!.status, "dang_thi_cong");
    } finally {
      await run(`DELETE FROM engineering_closed_loop_sync_logs WHERE project_id = ?`, projectId);
    }
  },
);

test(
  "syncSpoolToWbsAndPayment: tiến độ chạm 100% thì lên 'hoan_thanh', không vượt 1",
  S,
  async () => {
    // Bất biến chung của toàn chuỗi tiến độ: "hoan_thanh ⇔ progress_percent >= 1". Kèm chặn
    // tràn: cộng thêm khi đã 0.95 không được cho ra 1.05 (CHECK trong DB sẽ nổ).
    const { queryOne, run } = await import("@/lib/db");
    const { syncSpoolToWbsAndPayment } =
      await import("@/lib/ky-thuat/engineering-closed-loop-sync");

    const projectId = await taoDuAn("Test closed-loop sync hoan thanh");
    try {
      const taskId = await taoTask(projectId, 0.95, "dang_thi_cong");
      await syncSpoolToWbsAndPayment(projectId, {
        spoolId: "SPOOL-DONE",
        wbsTaskId: taskId,
        discipline: "hvac",
        calculatedQty: 1,
        unit: "m",
        unitRateVnd: 1000,
      });
      const sau = await queryOne<{ p: number; status: string }>(
        `SELECT progress_percent AS p, status FROM tasks WHERE id = ?`,
        taskId,
      );
      assert.equal(Number(sau!.p), 1);
      assert.equal(sau!.status, "hoan_thanh");
    } finally {
      await run(`DELETE FROM engineering_closed_loop_sync_logs WHERE project_id = ?`, projectId);
    }
  },
);

test("syncSpoolToWbsAndPayment: task đã nghiệm thu KHÔNG bị hạ cấp trạng thái", S, async () => {
  // `nghiem_thu` là trạng thái do Admin/PM duyệt hai bước; không đường ghi tự động nào
  // được phép hạ nó xuống — nếu không, một lần đồng bộ spool sẽ xoá dấu vết nghiệm thu.
  const { queryOne, run } = await import("@/lib/db");
  const { syncSpoolToWbsAndPayment } = await import("@/lib/ky-thuat/engineering-closed-loop-sync");

  const projectId = await taoDuAn("Test closed-loop sync nghiem thu");
  try {
    const taskId = await taoTask(projectId, 1, "nghiem_thu");
    await syncSpoolToWbsAndPayment(projectId, {
      spoolId: "SPOOL-NT",
      wbsTaskId: taskId,
      discipline: "hvac",
      calculatedQty: 1,
      unit: "m",
      unitRateVnd: 1000,
    });
    const sau = await queryOne<{ status: string }>(`SELECT status FROM tasks WHERE id = ?`, taskId);
    assert.equal(sau!.status, "nghiem_thu");
  } finally {
    await run(`DELETE FROM engineering_closed_loop_sync_logs WHERE project_id = ?`, projectId);
  }
});

test("syncSpoolToWbsAndPayment: task thuộc dự án KHÁC không bị đụng tới", S, async () => {
  // Bảng tasks không có cột project_id nên phạm vi dự án phải kiểm bằng JOIN. Thiếu điều
  // kiện đó là một lần đồng bộ của dự án A sửa tiến độ task của dự án B.
  const { queryOne, run } = await import("@/lib/db");
  const { syncSpoolToWbsAndPayment } = await import("@/lib/ky-thuat/engineering-closed-loop-sync");

  const duAnA = await taoDuAn("Test CLS dự án A");
  const duAnB = await taoDuAn("Test CLS dự án B");
  try {
    const taskB = await taoTask(duAnB, 0.2, "dang_thi_cong");
    await syncSpoolToWbsAndPayment(duAnA, {
      spoolId: "SPOOL-XPROJ",
      wbsTaskId: taskB,
      discipline: "hvac",
      calculatedQty: 1,
      unit: "m",
      unitRateVnd: 1000,
    });
    const sau = await queryOne<{ p: number }>(
      `SELECT progress_percent AS p FROM tasks WHERE id = ?`,
      taskB,
    );
    assert.equal(Number(sau!.p), 0.2, "task của dự án B phải giữ nguyên");
  } finally {
    await run(
      `DELETE FROM engineering_closed_loop_sync_logs WHERE project_id IN (?, ?)`,
      duAnA,
      duAnB,
    );
  }
});

test("listClosedLoopSyncLogs: trả log của ĐÚNG dự án, mới nhất trước", S, async () => {
  // Hàm này trước đây truyền `[projectId]` vào `query(sql, ...params)` nên `$1` nhận một
  // mảng Postgres và câu SELECT luôn lỗi "invalid input syntax for type integer" — tức là
  // tab lịch sử đồng bộ chưa bao giờ hiện được gì. Ca này khoá lại cả kết quả lẫn phạm vi dự án.
  const { syncSpoolToWbsAndPayment, listClosedLoopSyncLogs } =
    await import("@/lib/ky-thuat/engineering-closed-loop-sync");
  const { run } = await import("@/lib/db");

  const duAnA = await taoDuAn("Test CLS list A");
  const duAnB = await taoDuAn("Test CLS list B");
  try {
    for (const spoolId of ["SPOOL-L1", "SPOOL-L2"]) {
      await syncSpoolToWbsAndPayment(duAnA, {
        spoolId,
        wbsTaskId: null,
        discipline: "hvac",
        calculatedQty: 1,
        unit: "m",
        unitRateVnd: 1000,
      });
    }
    await syncSpoolToWbsAndPayment(duAnB, {
      spoolId: "SPOOL-KHAC",
      wbsTaskId: null,
      discipline: "hvac",
      calculatedQty: 1,
      unit: "m",
      unitRateVnd: 1000,
    });

    const logs = await listClosedLoopSyncLogs(duAnA);
    assert.equal(logs.length, 2, "chỉ log của dự án A");
    assert.deepEqual(
      logs.map((l) => l.spool_id).sort(),
      ["SPOOL-L1", "SPOOL-L2"],
      "không được lẫn log của dự án khác",
    );
  } finally {
    await run(
      `DELETE FROM engineering_closed_loop_sync_logs WHERE project_id IN (?, ?)`,
      duAnA,
      duAnB,
    );
  }
});

test(
  "syncSpoolToWbsAndPayment: hai lần đồng bộ liên tiếp KHÔNG trùng mã, kể cả trong cùng mili giây",
  S,
  async () => {
    // `sync_code` có UNIQUE (project_id, sync_code) trong DB. Bản cũ sinh mã chỉ từ
    // Date.now() nên đồng bộ hàng loạt — đường dùng bình thường — làm lần thứ hai vỡ ở
    // ràng buộc. CI (máy nhanh hơn máy dev) dựng lại được ngay, nên ca này chạy một loạt
    // lời gọi sát nhau và đòi mọi mã phải khác nhau.
    const { syncSpoolToWbsAndPayment } =
      await import("@/lib/ky-thuat/engineering-closed-loop-sync");
    const { run } = await import("@/lib/db");

    const projectId = await taoDuAn("Test CLS ma duy nhat");
    try {
      const ma = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const kq = await syncSpoolToWbsAndPayment(projectId, {
          spoolId: `SPOOL-DUP-${i}`,
          wbsTaskId: null,
          discipline: "hvac",
          calculatedQty: 1,
          unit: "m",
          unitRateVnd: 1000,
        });
        ma.add(kq.syncCode);
      }
      assert.equal(ma.size, 10, "10 lần đồng bộ phải cho 10 mã khác nhau");
    } finally {
      await run(`DELETE FROM engineering_closed_loop_sync_logs WHERE project_id = ?`, projectId);
    }
  },
);
