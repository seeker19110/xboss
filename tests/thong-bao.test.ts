import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Test cho lib/dich-vu/thong-bao.ts — bộ đồng bộ hơn 30 loại thông báo/cảnh báo.
//
// Vì sao quan trọng: đây là nơi khoá 2 BẤT BIẾN dễ vỡ nhất của toàn hệ thống thông báo:
//   (a) DEDUP — chạy đồng bộ 2 lần liên tiếp KHÔNG được đẻ thêm thông báo trùng (UNIQUE
//       index + ON CONFLICT DO NOTHING cho từng loại; sai 1 cột dedup là user bị spam).
//   (b) TỰ DỌN — khi điều kiện hết đúng (task hết trễ, hợp đồng gia hạn...), thông báo
//       CHƯA ĐỌC phải biến mất tự động; thông báo ĐÃ ĐỌC thì giữ nguyên làm lịch sử.
// Ngoài ra còn khoá quyền xem theo vai trò (subcon chỉ thấy việc được giao, cdt/viewer/
// bch không thấy vài loại nhạy cảm...) — đúng những gì code đã cài qua `CAN`/`isAdminOrPm`.
//
// Toàn bộ import lib/db + lib nghiệp vụ đều là DYNAMIC import bên trong từng test (mẫu
// tests/boq-coverage.test.ts) để setup.ts kịp chặn DATABASE_URL thật trước khi lib/db nạp.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@/lib/nen/roles";

const S = { skip: !HAS_TEST_DB };

// Prefix riêng cho mọi mã/định danh sinh ra trong file này — DB test có thể được nhiều
// luồng agent khác dùng song song, tránh đụng mã UNIQUE toàn cục (contracts.code,
// boq_items.code, purchase_orders.po_code, equipment.code...) của dữ liệu người khác.
const PFX = "TBT";

type TestUser = { id: number; name: string; email: string; role: Role; orgId: number };

// ===== Fixture dùng chung: 1 dự án/tháp/hệ/sheet/nhóm + 7 user (đủ 7 vai trò) =====
let projectId = 0;
let towerId = 0;
let systemId = 0;
let sheetTypeId = 0;
let packageId = 0;
const users: Record<Role, TestUser> = {} as Record<Role, TestUser>;
let seq = 0;

async function mkUser(role: Role): Promise<TestUser> {
  const { insertId } = await import("@/lib/db");
  seq += 1;
  const email = `${PFX.toLowerCase()}-${role}-${seq}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, 'x', ?)`,
    `${PFX} ${role} ${seq}`,
    email,
    role,
  );
  return { id, name: `${PFX} ${role}`, email, role, orgId: 0 };
}

// Gọi syncAndListNotifications bọc trong ngữ cảnh request đã có sẵn projectId — bắt buộc
// vì design_change_pending/claim_pending gọi getCurrentProjectId(user), hàm này đọc
// cookies() thật nếu request-context CHƯA có projectId cache sẵn (throw ngoài request
// Next.js thật). Truyền cache sẵn thì hàm trả ngay, không đụng cookies().
async function sync(user: TestUser, limit = 200) {
  const { syncAndListNotifications } = await import("@/lib/dich-vu/thong-bao");
  const { runWithRequestContext } = await import("@/lib/nen/request-context");
  return runWithRequestContext({ projectId }, () =>
    syncAndListNotifications(user, projectId, limit),
  );
}

async function countNotif(userId: number, type: string, extraSql = "", extraArgs: unknown[] = []) {
  const { queryOne } = await import("@/lib/db");
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ? AND type = ?${extraSql}`,
    userId,
    type,
    ...extraArgs,
  );
  return row?.n ?? 0;
}

async function markAllRead(userId: number, type: string) {
  const { run } = await import("@/lib/db");
  await run(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND type = ?`, userId, type);
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  projectId = await insertId(`INSERT INTO projects (name) VALUES ('${PFX} Dự án')`);
  towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, '${PFX} Tháp')`,
    projectId,
  );
  systemId = await insertId(`INSERT INTO systems (code, name) VALUES ('${PFX}SYS', 'Hệ ${PFX}')`);
  sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, '${PFX}SHEET', 'Sheet ${PFX}', ?)`,
    towerId,
    systemId,
  );
  packageId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, '${PFX}PKG', 'Nhóm ${PFX}', '${PFX}-F1')`,
    sheetTypeId,
  );
  for (const role of ["admin", "pm", "engineer", "subcon", "bch", "cdt", "viewer"] as Role[]) {
    users[role] = await mkUser(role);
  }
});

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  const userIds = Object.values(users).map((u) => u.id);
  await run(`DELETE FROM notifications WHERE user_id = ANY(?)`, userIds);
  // Dọn triệt để mọi bảng con có thể còn sót lại nếu MỘT test giữa chừng bị assert
  // fail (thân test dừng ngay, bỏ qua phần dọn dẹp cuối test) — không để rác lại DB
  // dùng chung cho lần chạy sau (khác connection string test khác đang chạy song song).
  await run(
    `DELETE FROM material_transactions WHERE material_id IN (SELECT id FROM materials WHERE project_id = ?)`,
    projectId,
  );
  await run(
    `DELETE FROM boq_norms WHERE material_id IN (SELECT id FROM materials WHERE project_id = ?)
       OR boq_item_id IN (SELECT id FROM boq_items WHERE project_id = ? OR contract_id IN (SELECT id FROM contracts WHERE project_id = ?))`,
    projectId,
    projectId,
    projectId,
  );
  await run(
    `DELETE FROM boq_task_map WHERE boq_item_id IN (SELECT id FROM boq_items WHERE project_id = ? OR contract_id IN (SELECT id FROM contracts WHERE project_id = ?))`,
    projectId,
    projectId,
  );
  await run(
    `DELETE FROM po_items WHERE material_id IN (SELECT id FROM materials WHERE project_id = ?)
       OR po_id IN (SELECT id FROM purchase_orders WHERE project_id = ?)`,
    projectId,
    projectId,
  );
  await run(`DELETE FROM materials WHERE project_id = ?`, projectId);
  await run(`DELETE FROM proposals WHERE requested_by = ANY(?)`, userIds);
  await run(`DELETE FROM claims WHERE project_id = ?`, projectId);
  await run(`DELETE FROM design_changes WHERE project_id = ?`, projectId);
  await run(`DELETE FROM advances WHERE project_id = ?`, projectId);
  await run(`DELETE FROM warranty_claims WHERE project_id = ?`, projectId);
  await run(`DELETE FROM warranty_items WHERE project_id = ?`, projectId);
  await run(`DELETE FROM env_monitoring WHERE project_id = ?`, projectId);
  await run(`DELETE FROM env_permits WHERE project_id = ?`, projectId);
  await run(
    `DELETE FROM monitoring_readings WHERE point_id IN (SELECT id FROM monitoring_points WHERE project_id = ?)`,
    projectId,
  );
  await run(`DELETE FROM monitoring_points WHERE project_id = ?`, projectId);
  await run(`DELETE FROM punch_list WHERE project_id = ?`, projectId);
  await run(`DELETE FROM hse_records WHERE project_id = ?`, projectId);
  await run(
    `DELETE FROM meeting_actions WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id = ?)`,
    projectId,
  );
  await run(`DELETE FROM meetings WHERE project_id = ?`, projectId);
  await run(`DELETE FROM correspondences WHERE project_id = ?`, projectId);
  await run(`DELETE FROM variation_orders WHERE project_id = ?`, projectId);
  await run(`DELETE FROM legal_documents WHERE project_id = ?`, projectId);
  await run(`DELETE FROM certifications WHERE project_id = ?`, projectId);
  await run(`DELETE FROM insurance_bonds WHERE project_id = ?`, projectId);
  await run(`DELETE FROM equipment WHERE project_id = ?`, projectId);
  await run(`DELETE FROM floor_stage_fronts WHERE project_id = ?`, projectId);
  await run(`DELETE FROM vehicle_logs WHERE project_id = ?`, projectId);
  await run(`DELETE FROM purchase_orders WHERE project_id = ?`, projectId);
  await run(
    `DELETE FROM payment_cert_items WHERE cert_id IN (SELECT id FROM payment_certs WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?))`,
    projectId,
  );
  await run(
    `DELETE FROM payment_certs WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)`,
    projectId,
  );
  await run(
    `DELETE FROM boq_items WHERE project_id = ? OR contract_id IN (SELECT id FROM contracts WHERE project_id = ?)`,
    projectId,
    projectId,
  );
  await run(`DELETE FROM contracts WHERE project_id = ?`, projectId);
  await run(`DELETE FROM approval_requests WHERE project_id = ?`, projectId);
  await run(
    `DELETE FROM approval_steps WHERE flow_id IN (SELECT id FROM approval_flows WHERE project_id = ?)`,
    projectId,
  );
  await run(`DELETE FROM approval_flows WHERE project_id = ?`, projectId);
  await run(`DELETE FROM ncrs WHERE project_id = ?`, projectId);
  await run(`DELETE FROM construction_stages WHERE name LIKE ?`, `${PFX} %`);
  await run(
    `DELETE FROM task_history WHERE task_id IN (
       SELECT id FROM tasks WHERE package_id IN (SELECT id FROM work_packages WHERE sheet_type_id = ?))`,
    sheetTypeId,
  );
  await run(
    `DELETE FROM tasks WHERE package_id IN (SELECT id FROM work_packages WHERE sheet_type_id = ?)`,
    sheetTypeId,
  );
  await run(`DELETE FROM work_packages WHERE sheet_type_id = ?`, sheetTypeId);
  await run(`DELETE FROM sheet_types WHERE id = ?`, sheetTypeId);
  await run(`DELETE FROM systems WHERE id = ?`, systemId);
  await run(`DELETE FROM towers WHERE id = ?`, towerId);
  await run(`DELETE FROM users WHERE id = ANY(?)`, userIds);
  await run(`DELETE FROM projects WHERE id = ?`, projectId);
});

// ───────────────────────── 1) delayed + due_soon + stalled (SQL trực tiếp trên tasks) ─────────────────────────

test(
  "delayed: task quá hạn chưa xong sinh đúng 1 thông báo, chạy lại không đẻ trùng (DEDUP), " +
    "hết trễ thì thông báo CHƯA ĐỌC tự dọn (TỰ DỌN)",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
       VALUES (?, ?, 'Task trễ', ?, 0.3, 'dang_thi_cong')`,
      packageId,
      `${PFX}-DEL1`,
      daysFromTodayISO(-2),
    );

    await sync(users.pm);
    assert.equal(await countNotif(users.pm.id, "delayed", " AND task_id = ?", [taskId]), 1);

    // Bất biến (a) DEDUP: chạy lại lần 2 với dữ liệu y hệt — vẫn đúng 1 dòng, không nhân đôi.
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "delayed", " AND task_id = ?", [taskId]),
      1,
      "chạy đồng bộ 2 lần không được đẻ 2 thông báo trùng",
    );

    // Bất biến (b) TỰ DỌN: task hoàn thành → hết điều kiện trễ → thông báo CHƯA ĐỌC phải biến mất.
    await run(`UPDATE tasks SET progress_percent = 1, status = 'hoan_thanh' WHERE id = ?`, taskId);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "delayed", " AND task_id = ?", [taskId]),
      0,
      "task hết trễ thì thông báo delayed chưa đọc phải tự dọn",
    );

    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
  },
);

test("delayed: thông báo ĐÃ ĐỌC không bị dọn dù task đã hết trễ (giữ làm lịch sử)", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { daysFromTodayISO } = await import("@/lib/nen/date");
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
       VALUES (?, ?, 'Task trễ đã đọc', ?, 0.2, 'dang_thi_cong')`,
    packageId,
    `${PFX}-DEL2`,
    daysFromTodayISO(-3),
  );
  await sync(users.pm);
  await markAllRead(users.pm.id, "delayed");
  await run(`UPDATE tasks SET progress_percent = 1, status = 'hoan_thanh' WHERE id = ?`, taskId);
  await sync(users.pm);
  assert.equal(
    await countNotif(users.pm.id, "delayed", " AND task_id = ?", [taskId]),
    1,
    "thông báo delayed ĐÃ ĐỌC không được xoá khi điều kiện hết",
  );
  await run(`DELETE FROM notifications WHERE task_id = ?`, taskId);
  await run(`DELETE FROM tasks WHERE id = ?`, taskId);
});

test(
  "delayed: subcon chỉ thấy task được giao cho MÌNH, không thấy task trễ của người khác",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const otherSubcon = await mkUser("subcon");
    const taskMine = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status, assigned_to)
       VALUES (?, ?, 'Task trễ của tôi', ?, 0.1, 'dang_thi_cong', ?)`,
      packageId,
      `${PFX}-DEL3`,
      daysFromTodayISO(-1),
      users.subcon.id,
    );
    const taskOther = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status, assigned_to)
       VALUES (?, ?, 'Task trễ của người khác', ?, 0.1, 'dang_thi_cong', ?)`,
      packageId,
      `${PFX}-DEL4`,
      daysFromTodayISO(-1),
      otherSubcon.id,
    );

    await sync(users.subcon);
    assert.equal(await countNotif(users.subcon.id, "delayed", " AND task_id = ?", [taskMine]), 1);
    assert.equal(
      await countNotif(users.subcon.id, "delayed", " AND task_id = ?", [taskOther]),
      0,
      "subcon không được thấy thông báo trễ của task giao cho subcon khác",
    );

    await run(`DELETE FROM notifications WHERE task_id IN (?, ?)`, taskMine, taskOther);
    await run(`DELETE FROM tasks WHERE id IN (?, ?)`, taskMine, taskOther);
    await run(`DELETE FROM users WHERE id = ?`, otherSubcon.id);
  },
);

test(
  "due_soon: sắp đến hạn + tiến độ dưới ngưỡng → cảnh báo sớm; hết điều kiện (xong việc) thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
       VALUES (?, ?, 'Task sắp hạn', ?, 0.1, 'dang_thi_cong')`,
      packageId,
      `${PFX}-DUE1`,
      daysFromTodayISO(1),
    );
    await sync(users.pm);
    assert.equal(await countNotif(users.pm.id, "due_soon", " AND task_id = ?", [taskId]), 1);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "due_soon", " AND task_id = ?", [taskId]),
      1,
      "DEDUP: chạy lại không đẻ trùng",
    );

    await run(`UPDATE tasks SET progress_percent = 1, status = 'hoan_thanh' WHERE id = ?`, taskId);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "due_soon", " AND task_id = ?", [taskId]),
      0,
      "TỰ DỌN: xong việc thì due_soon chưa đọc phải biến mất",
    );
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
  },
);

test(
  "stalled: đang thi công, còn hạn, không cập nhật tiến độ 7 ngày → nhắc; có cập nhật lại thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
       VALUES (?, ?, 'Task đình trệ', ?, 0.4, 'dang_thi_cong')`,
      packageId,
      `${PFX}-STL1`,
      daysFromTodayISO(30),
    );
    // Không ghi task_history nào trong 7 ngày gần đây → NOT EXISTS đúng → đình trệ.
    await sync(users.pm);
    assert.equal(await countNotif(users.pm.id, "stalled", " AND task_id = ?", [taskId]), 1);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "stalled", " AND task_id = ?", [taskId]),
      1,
      "DEDUP",
    );

    // Có cập nhật tiến độ mới (task_history trong 7 ngày) → hết đình trệ → tự dọn.
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at)
       VALUES (?, 0.4, 0.5, NOW())`,
      taskId,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "stalled", " AND task_id = ?", [taskId]),
      0,
      "TỰ DỌN: vừa cập nhật tiến độ thì stalled chưa đọc phải biến mất",
    );
    await run(`DELETE FROM task_history WHERE task_id = ?`, taskId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
  },
);

// ───────────────────────── 2) material_over (kèm webhook material.over_norm) ─────────────────────────

test(
  "material_over: vượt định mức → cảnh báo + webhook chỉ bắn cho lần chèn MỚI; hạ về ngưỡng an toàn thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, project_id, name, unit, qty_planned, qty_used)
       VALUES (?, ?, 'VT vượt định mức', 'kg', 10, 20)`,
      sheetTypeId,
      projectId,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "material_over", " AND material_id = ?", [matId]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "material_over", " AND material_id = ?", [matId]),
      1,
      "DEDUP — RETURNING material_id của ON CONFLICT DO NOTHING không được bắn webhook trùng lần 2",
    );

    // subcon KHÔNG quản vật tư → nhánh `if (user.role !== "subcon")` phải bỏ qua toàn bộ khối này.
    await sync(users.subcon);
    assert.equal(
      await countNotif(users.subcon.id, "material_over", " AND material_id = ?", [matId]),
      0,
      "subcon không được nhận cảnh báo vượt định mức vật tư",
    );

    await run(`UPDATE materials SET qty_used = 5 WHERE id = ?`, matId);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "material_over", " AND material_id = ?", [matId]),
      0,
      "TỰ DỌN: hạ dùng về dưới định mức thì cảnh báo chưa đọc phải biến mất",
    );
    await run(`DELETE FROM materials WHERE id = ?`, matId);
  },
);

// ───────────────────────── 3) Khối viewPayments (admin/pm/bch): cost_over, contract_expiry, cert_over_contract, insurance_expiry ─────────────────────────

test(
  "cost_over: hệ cam kết vượt ngưỡng cảnh báo ngân sách → nhắc; viewer không xem được (không có quyền tài chính)",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, system_id, project_id, qty_contract, unit_price)
       VALUES (?, 'Dòng BOQ ngân sách', 'm', ?, ?, 1, 100)`,
      `${PFX}-BOQ-COST`,
      systemId,
      projectId,
    );
    const poId = await insertId(
      `INSERT INTO purchase_orders (po_code, status, project_id) VALUES (?, 'confirmed', ?)`,
      `${PFX}-PO-COST`,
      projectId,
    );
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, project_id, name, unit) VALUES (?, ?, 'VT cam kết', 'm')`,
      sheetTypeId,
      projectId,
    );
    await run(
      `INSERT INTO po_items (po_id, material_id, qty_ordered, unit_price) VALUES (?, ?, 1, 95)`,
      poId,
      matId,
    );
    // committed/budget = 95/100 = 95% ≥ warnPct mặc định 90% → "over".

    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cost_over", " AND cost_group = ?", [`${PFX}SYS`]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cost_over", " AND cost_group = ?", [`${PFX}SYS`]),
      1,
      "DEDUP",
    );

    await sync(users.viewer);
    assert.equal(
      await countNotif(users.viewer.id, "cost_over", " AND cost_group = ?", [`${PFX}SYS`]),
      0,
      "viewer không có quyền viewPayments nên không nhận cảnh báo ngân sách",
    );

    // TỰ DỌN: giảm cam kết xuống dưới ngưỡng.
    await run(`UPDATE po_items SET unit_price = 1 WHERE po_id = ?`, poId);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cost_over", " AND cost_group = ?", [`${PFX}SYS`]),
      0,
      "TỰ DỌN: hệ không còn vượt ngưỡng ngân sách",
    );

    await run(`DELETE FROM po_items WHERE po_id = ?`, poId);
    await run(`DELETE FROM purchase_orders WHERE id = ?`, poId);
    await run(`DELETE FROM materials WHERE id = ?`, matId);
    await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
  },
);

test(
  "contract_expiry: hợp đồng sắp/đã hết hiệu lực → nhắc (message khác nhau tuỳ đã quá hạn hay chưa); hết điều kiện thì tự dọn",
  S,
  async () => {
    const { insertId, run, queryOne } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, status, valid_to, project_id)
       VALUES (?, 'nhan_thau', 'HĐ sắp hết hạn', 'active', ?, ?)`,
      `${PFX}-C-EXP`,
      daysFromTodayISO(10),
      projectId,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "contract_expiry", " AND contract_id = ?", [contractId]),
      1,
    );
    const row = await queryOne<{ message: string }>(
      `SELECT message FROM notifications WHERE user_id = ? AND type = 'contract_expiry' AND contract_id = ?`,
      users.pm.id,
      contractId,
    );
    assert.match(row!.message, /sắp hết hiệu lực/);

    // Đã quá hạn → message đổi nhánh "expired" (đọc trực tiếp field `expired` do expiringContracts tính).
    await run(`UPDATE contracts SET valid_to = ? WHERE id = ?`, daysFromTodayISO(-5), contractId);
    await run(
      `DELETE FROM notifications WHERE user_id = ? AND type = 'contract_expiry'`,
      users.pm.id,
    );
    await sync(users.pm);
    const row2 = await queryOne<{ message: string }>(
      `SELECT message FROM notifications WHERE user_id = ? AND type = 'contract_expiry' AND contract_id = ?`,
      users.pm.id,
      contractId,
    );
    assert.match(row2!.message, /đã quá hạn hiệu lực/);

    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "contract_expiry", " AND contract_id = ?", [contractId]),
      1,
      "DEDUP",
    );

    await run(`UPDATE contracts SET status = 'completed' WHERE id = ?`, contractId);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "contract_expiry", " AND contract_id = ?", [contractId]),
      0,
      "TỰ DỌN: đổi trạng thái khỏi active thì hết cảnh báo",
    );
    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
  },
);

test(
  "cert_over_contract: luỹ kế nghiệm thu (đợt đã duyệt) vượt giá trị HĐ → nhắc; giảm luỹ kế thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, status, value, project_id)
       VALUES (?, 'nhan_thau', 'HĐ vượt luỹ kế', 'active', 100, ?)`,
      `${PFX}-C-CERT`,
      projectId,
    );
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, contract_id, qty_contract, unit_price)
       VALUES (?, 'Dòng BOQ theo HĐ', 'm', ?, 10, 20)`,
      `${PFX}-BOQ-CERT`,
      contractId,
    );
    const certId = await insertId(
      `INSERT INTO payment_certs (code, contract_id, period_no, status)
       VALUES (?, ?, 1, 'approved')`,
      `${PFX}-IPC1`,
      contractId,
    );
    await run(
      `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
       VALUES (?, ?, 10, 10, 20)`,
      certId,
      boqId,
    );
    // Luỹ kế = 10 * 20 = 200 > value 100 → vượt.

    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cert_over_contract", " AND contract_id = ?", [contractId]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cert_over_contract", " AND contract_id = ?", [contractId]),
      1,
      "DEDUP",
    );

    await run(`DELETE FROM payment_cert_items WHERE cert_id = ?`, certId);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cert_over_contract", " AND contract_id = ?", [contractId]),
      0,
      "TỰ DỌN: hết vượt luỹ kế",
    );

    await run(`DELETE FROM payment_certs WHERE id = ?`, certId);
    await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
    void daysFromTodayISO;
  },
);

test(
  "insurance_expiry: bảo hiểm/bảo lãnh sắp hết hiệu lực → nhắc; đổi trạng thái thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO insurance_bonds (project_id, kind, title, status, expiry_date)
       VALUES (?, 'car', 'Bảo hiểm CAR', 'valid', ?)`,
      projectId,
      daysFromTodayISO(5),
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "insurance_expiry", " AND insurance_bond_id = ?", [id]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "insurance_expiry", " AND insurance_bond_id = ?", [id]),
      1,
      "DEDUP",
    );
    await run(`UPDATE insurance_bonds SET status = 'released' WHERE id = ?`, id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "insurance_expiry", " AND insurance_bond_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM insurance_bonds WHERE id = ?`, id);
  },
);

// ───────────────────────── 4) Khối isAdminOrPm: legal_expiry, cert_expiry, cert_pending, correspondence_due, vo_pending, proposal_pending, design_change_pending, claim_pending, stage_missing, calibration_due ─────────────────────────

test(
  "legal_expiry: hồ sơ pháp lý sắp hết hạn → nhắc Admin/PM; hết điều kiện thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO legal_documents (project_id, kind, title, status, expiry_date)
     VALUES (?, 'giay_phep_xd', 'GP xây dựng', 'valid', ?)`,
      projectId,
      daysFromTodayISO(5),
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "legal_expiry", " AND legal_document_id = ?", [id]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "legal_expiry", " AND legal_document_id = ?", [id]),
      1,
      "DEDUP",
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "legal_expiry", " AND legal_document_id = ?", [id]),
      0,
      "chỉ Admin/PM mới thấy legal_expiry",
    );
    await run(`UPDATE legal_documents SET status = 'superseded' WHERE id = ?`, id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "legal_expiry", " AND legal_document_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM legal_documents WHERE id = ?`, id);
  },
);

test(
  "cert_expiry: chứng chỉ nhân sự sắp hết hạn → nhắc Admin/PM; hết hạn ghi nhận rồi gia hạn thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO certifications (project_id, kind, expiry_date) VALUES (?, 'Thẻ an toàn', ?)`,
      projectId,
      daysFromTodayISO(5),
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cert_expiry", " AND certification_id = ?", [id]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cert_expiry", " AND certification_id = ?", [id]),
      1,
      "DEDUP",
    );
    await run(`UPDATE certifications SET expiry_date = ? WHERE id = ?`, daysFromTodayISO(365), id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cert_expiry", " AND certification_id = ?", [id]),
      0,
      "TỰ DỌN: gia hạn xa ra thì hết cảnh báo",
    );
    await run(`DELETE FROM certifications WHERE id = ?`, id);
  },
);

test(
  "cert_pending: đợt thanh toán (IPC) trình quá lâu chưa quyết → nhắc Admin/PM; quyết định thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, project_id) VALUES (?, 'nhan_thau', 'HĐ IPC chờ', ?)`,
      `${PFX}-C-IPC`,
      projectId,
    );
    const certId = await insertId(
      `INSERT INTO payment_certs (code, contract_id, period_no, status, submitted_at)
     VALUES (?, ?, 1, 'submitted', ?)`,
      `${PFX}-IPC-PEND`,
      contractId,
      daysFromTodayISO(-10),
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cert_pending", " AND payment_cert_id = ?", [certId]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cert_pending", " AND payment_cert_id = ?", [certId]),
      1,
      "DEDUP",
    );
    await run(`UPDATE payment_certs SET status = 'approved' WHERE id = ?`, certId);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "cert_pending", " AND payment_cert_id = ?", [certId]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM payment_certs WHERE id = ?`, certId);
    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
  },
);

test(
  "correspondence_due: công văn quá hạn phản hồi → nhắc Admin/PM; trả lời xong thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO correspondences (code, direction, counterparty, subject, sent_date, due_date, status, project_id)
     VALUES (?, 'out', 'CĐT', 'Xin ý kiến', ?, ?, 'awaiting', ?)`,
      `${PFX}-CV1`,
      daysFromTodayISO(-10),
      daysFromTodayISO(-3),
      projectId,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "correspondence_due", " AND correspondence_id = ?", [id]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "correspondence_due", " AND correspondence_id = ?", [id]),
      1,
      "DEDUP",
    );
    await run(`UPDATE correspondences SET status = 'replied' WHERE id = ?`, id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "correspondence_due", " AND correspondence_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM correspondences WHERE id = ?`, id);
  },
);

test(
  "vo_pending: phát sinh/VO trình quá lâu chưa quyết → nhắc Admin/PM; quyết định thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO variation_orders (code, title, reason, status, submitted_at, project_id)
     VALUES (?, 'VO chờ quyết', 'site_condition', 'submitted', ?, ?)`,
      `${PFX}-VO1`,
      daysFromTodayISO(-10),
      projectId,
    );
    await sync(users.pm);
    assert.equal(await countNotif(users.pm.id, "vo_pending", " AND vo_id = ?", [id]), 1);
    await sync(users.pm);
    assert.equal(await countNotif(users.pm.id, "vo_pending", " AND vo_id = ?", [id]), 1, "DEDUP");
    await run(`UPDATE variation_orders SET status = 'approved' WHERE id = ?`, id);
    await sync(users.pm);
    assert.equal(await countNotif(users.pm.id, "vo_pending", " AND vo_id = ?", [id]), 0, "TỰ DỌN");
    await run(`DELETE FROM variation_orders WHERE id = ?`, id);
  },
);

test(
  "proposal_pending: đề xuất trình quá lâu chưa quyết → nhắc Admin/PM; quyết định thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO proposals (code, kind, title, status, submitted_at, requested_by, project_id)
     VALUES (?, 'other', 'Đề xuất chờ', 'submitted', ?, ?, ?)`,
      `${PFX}-DX1`,
      daysFromTodayISO(-10),
      users.pm.id,
      projectId,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "proposal_pending", " AND proposal_id = ?", [id]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "proposal_pending", " AND proposal_id = ?", [id]),
      1,
      "DEDUP",
    );
    await run(`UPDATE proposals SET status = 'approved' WHERE id = ?`, id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "proposal_pending", " AND proposal_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM proposals WHERE id = ?`, id);
  },
);

test(
  "design_change_pending: thay đổi thiết kế trình quá lâu chưa quyết → nhắc Admin/PM (đọc project qua getCurrentProjectId); quyết định thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const id = await insertId(
      `INSERT INTO design_changes (project_id, title, reason, status, created_at)
       VALUES (?, 'DC chờ quyết', 'Lý do thay đổi', 'submitted', NOW() - INTERVAL '10 days')`,
      projectId,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "design_change_pending", " AND design_change_id = ?", [id]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "design_change_pending", " AND design_change_id = ?", [id]),
      1,
      "DEDUP",
    );
    await run(`UPDATE design_changes SET status = 'approved' WHERE id = ?`, id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "design_change_pending", " AND design_change_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM design_changes WHERE id = ?`, id);
  },
);

test(
  "claim_pending: claim chi phí/EOT đang mở quá hạn xử lý → nhắc Admin/PM (đọc project qua getCurrentProjectId); xử lý xong thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO claims (project_id, code, kind, title, notice_date, cause, status)
       VALUES (?, ?, 'cost', 'Claim chờ xử lý', ?, 'Lý do', 'notice')`,
      projectId,
      `${PFX}-CLM1`,
      daysFromTodayISO(-40),
    );
    await sync(users.pm);
    assert.equal(await countNotif(users.pm.id, "claim_pending", " AND claim_id = ?", [id]), 1);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "claim_pending", " AND claim_id = ?", [id]),
      1,
      "DEDUP",
    );
    await run(`UPDATE claims SET status = 'settled' WHERE id = ?`, id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "claim_pending", " AND claim_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM claims WHERE id = ?`, id);
  },
);

test(
  "stage_missing: tầng chưa sẵn sàng mặt bằng mà task sắp/đã tới ngày bắt đầu → nhắc Admin/PM; bàn giao xong thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const stageId = await insertId(
      `INSERT INTO construction_stages (name, sort_order, active) VALUES (?, 999999, TRUE)`,
      `${PFX} Công tác cuối`,
    );
    const floorLabel = `${PFX}-STAGE-F1`;
    const fsfId = await insertId(
      `INSERT INTO floor_stage_fronts (floor_label, stage_id, project_id) VALUES (?, ?, ?)`,
      floorLabel,
      stageId,
      projectId,
    );
    const pkgId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, start_date)
       VALUES (?, ?, 'Nhóm tầng chờ mặt bằng', ?, ?)`,
      sheetTypeId,
      `${PFX}-STAGEPKG`,
      floorLabel,
      daysFromTodayISO(1),
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, status) VALUES (?, ?, 'Task chờ mặt bằng', 'chuan_bi')`,
      pkgId,
      `${PFX}-STAGETASK`,
    );

    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "stage_missing", " AND floor_stage_front_id = ?", [fsfId]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "stage_missing", " AND floor_stage_front_id = ?", [fsfId]),
      1,
      "DEDUP",
    );

    await run(
      `UPDATE floor_stage_fronts SET handed_over_at = ? WHERE id = ?`,
      daysFromTodayISO(0),
      fsfId,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "stage_missing", " AND floor_stage_front_id = ?", [fsfId]),
      0,
      "TỰ DỌN: bàn giao xong thì hết cảnh báo",
    );

    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, pkgId);
    await run(`DELETE FROM floor_stage_fronts WHERE id = ?`, fsfId);
    await run(`DELETE FROM construction_stages WHERE id = ?`, stageId);
  },
);

test(
  "calibration_due: thiết bị sắp/đã hết hạn kiểm định → nhắc Admin/PM; hiệu chuẩn lại thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO equipment (code, name, kind, calibration_due, project_id)
     VALUES (?, 'Máy đo', 'may_do', ?, ?)`,
      `${PFX}-EQ1`,
      daysFromTodayISO(5),
      projectId,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "calibration_due", " AND equipment_id = ?", [id]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "calibration_due", " AND equipment_id = ?", [id]),
      1,
      "DEDUP",
    );
    await run(`UPDATE equipment SET calibration_due = ? WHERE id = ?`, daysFromTodayISO(365), id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "calibration_due", " AND equipment_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM equipment WHERE id = ?`, id);
  },
);

// ───────────────────────── 5) monitoring_alarm (admin/pm/engineer) ─────────────────────────

test(
  "monitoring_alarm: mốc quan trắc có kỳ đo gần nhất ở mức báo động → nhắc; kỳ đo mới về normal thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const pointId = await insertId(
      `INSERT INTO monitoring_points (project_id, code, kind, warn_threshold, alarm_threshold, status)
     VALUES (?, ?, 'lun', 10, 20, 'active')`,
      projectId,
      `${PFX}-MP1`,
    );
    await run(
      `INSERT INTO monitoring_readings (point_id, measured_at, value, cumulative, level)
     VALUES (?, CURRENT_DATE, 25, 25, 'alarm')`,
      pointId,
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "monitoring_alarm", " AND monitoring_point_id = ?", [
        pointId,
      ]),
      1,
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "monitoring_alarm", " AND monitoring_point_id = ?", [
        pointId,
      ]),
      1,
      "DEDUP",
    );

    await sync(users.viewer);
    assert.equal(
      await countNotif(users.viewer.id, "monitoring_alarm", " AND monitoring_point_id = ?", [
        pointId,
      ]),
      0,
      "viewer không thuộc nhóm admin/pm/engineer nên không nhận cảnh báo quan trắc",
    );

    await run(
      `INSERT INTO monitoring_readings (point_id, measured_at, value, cumulative, level)
     VALUES (?, CURRENT_DATE + 1, 5, 5, 'normal')`,
      pointId,
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "monitoring_alarm", " AND monitoring_point_id = ?", [
        pointId,
      ]),
      0,
      "TỰ DỌN: kỳ đo mới nhất về normal thì hết cảnh báo",
    );
    await run(`DELETE FROM monitoring_readings WHERE point_id = ?`, pointId);
    await run(`DELETE FROM monitoring_points WHERE id = ?`, pointId);
  },
);

// ───────────────────────── 6) approval_pending (engine duyệt M46) ─────────────────────────

test(
  "approval_pending: bước duyệt quá hạn SLA → nhắc đúng người có vai trò = bước hiện tại; " +
    "vai trò không phải người duyệt (viewer) bị bỏ qua hoàn toàn; loại thực thể lạ bị continue-qua, không vỡ vòng lặp",
  S,
  async () => {
    const { insertId, run, query } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, status) VALUES (?, ?, 'Task chờ duyệt nghiệm thu', 'chuan_bi')`,
      packageId,
      `${PFX}-APPRTASK`,
    );
    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'task_acceptance', 'Flow test')`,
      projectId,
    );
    await run(
      `INSERT INTO approval_steps (flow_id, seq, role, sla_days) VALUES (?, 1, 'pm', 1)`,
      flowId,
    );
    const reqId = await insertId(
      `INSERT INTO approval_requests (flow_id, entity_type, entity_id, project_id, current_seq, status, created_by, created_at)
       VALUES (?, 'task_acceptance', ?, ?, 1, 'pending', ?, ?)`,
      flowId,
      taskId,
      projectId,
      users.pm.id,
      daysFromTodayISO(-5) + "T00:00:00Z",
    );
    // Request loại thực thể LẠ (không nằm trong APPROVAL_ENTITY_COLUMN) — phủ nhánh
    // `if (!col) continue;`: overdueApprovals vẫn trả về nó (không lọc theo loại đóng),
    // nhưng vòng lặp insert/dọn phải bỏ qua êm, không throw, không tạo cột lạ.
    const flowIdX = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'khong_ro', 'Flow lạ')`,
      projectId,
    );
    await run(
      `INSERT INTO approval_steps (flow_id, seq, role, sla_days) VALUES (?, 1, 'pm', 1)`,
      flowIdX,
    );
    const reqIdX = await insertId(
      `INSERT INTO approval_requests (flow_id, entity_type, entity_id, project_id, current_seq, status, created_by, created_at)
       VALUES (?, 'khong_ro', 999999, ?, 1, 'pending', ?, ?)`,
      flowIdX,
      projectId,
      users.pm.id,
      daysFromTodayISO(-5) + "T00:00:00Z",
    );

    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "approval_pending", " AND task_id = ?", [taskId]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "approval_pending", " AND task_id = ?", [taskId]),
      1,
      "DEDUP",
    );

    // viewer nằm trong NON_APPROVER_ROLES → toàn khối bị bỏ qua, không gọi overdueApprovals.
    await sync(users.viewer);
    assert.equal(
      await countNotif(users.viewer.id, "approval_pending", " AND task_id = ?", [taskId]),
      0,
      "viewer không phải người duyệt nên không nhận approval_pending",
    );

    // TỰ DỌN: duyệt xong (status khác pending) thì hết cảnh báo.
    await run(`UPDATE approval_requests SET status = 'approved' WHERE id = ?`, reqId);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "approval_pending", " AND task_id = ?", [taskId]),
      0,
      "TỰ DỌN",
    );

    const leftover = await query(`SELECT id FROM approval_requests WHERE id = ?`, reqIdX);
    assert.equal(leftover.length, 1, "request loại thực thể lạ không bị vòng lặp làm vỡ/xoá nhầm");

    await run(`DELETE FROM approval_requests WHERE id IN (?, ?)`, reqId, reqIdX);
    await run(`DELETE FROM approval_steps WHERE flow_id IN (?, ?)`, flowId, flowIdX);
    await run(`DELETE FROM approval_flows WHERE id IN (?, ?)`, flowId, flowIdX);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
  },
);

// ───────────────────────── 7) ncr_overdue (admin/pm thấy hết; người khác chỉ thấy NCR gán mình) ─────────────────────────

test(
  "ncr_overdue: NCR quá hạn khắc phục → Admin/PM thấy MỌI NCR quá hạn, người thường chỉ thấy NCR gán cho mình; đóng NCR thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const ncrId = await insertId(
      `INSERT INTO ncrs (code, description, assigned_to, due_date, status, project_id)
       VALUES (?, 'NCR quá hạn', ?, ?, 'open', ?)`,
      `${PFX}-NCR1`,
      users.engineer.id,
      daysFromTodayISO(-3),
      projectId,
    );

    // Admin/PM: thấy dù không được gán.
    await sync(users.pm);
    assert.equal(await countNotif(users.pm.id, "ncr_overdue", " AND ncr_id = ?", [ncrId]), 1);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "ncr_overdue", " AND ncr_id = ?", [ncrId]),
      1,
      "DEDUP",
    );

    // Người thường: chỉ thấy NCR gán cho MÌNH.
    await sync(users.engineer);
    assert.equal(await countNotif(users.engineer.id, "ncr_overdue", " AND ncr_id = ?", [ncrId]), 1);
    await sync(users.bch);
    assert.equal(
      await countNotif(users.bch.id, "ncr_overdue", " AND ncr_id = ?", [ncrId]),
      0,
      "vai trò không phải Admin/PM và không được gán thì không thấy NCR của người khác",
    );

    await run(`UPDATE ncrs SET status = 'closed' WHERE id = ?`, ncrId);
    await sync(users.pm);
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.pm.id, "ncr_overdue", " AND ncr_id = ?", [ncrId]),
      0,
      "TỰ DỌN (Admin/PM)",
    );
    assert.equal(
      await countNotif(users.engineer.id, "ncr_overdue", " AND ncr_id = ?", [ncrId]),
      0,
      "TỰ DỌN (người được gán)",
    );
    await run(`DELETE FROM ncrs WHERE id = ?`, ncrId);
  },
);

// ───────────────────────── 8) punch_overdue (mirror ncr_overdue, quản lý chung bàn giao) ─────────────────────────

test(
  "punch_overdue: tồn tại bàn giao quá hạn xử lý → Admin/PM thấy hết, người được gán chỉ thấy của mình; đóng thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO punch_list (project_id, description, status, due_date, assignee)
       VALUES (?, 'Tồn tại quá hạn', 'open', ?, ?)`,
      projectId,
      daysFromTodayISO(-2),
      users.engineer.id,
    );
    await sync(users.pm);
    assert.equal(await countNotif(users.pm.id, "punch_overdue", " AND punch_item_id = ?", [id]), 1);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "punch_overdue", " AND punch_item_id = ?", [id]),
      1,
      "DEDUP",
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "punch_overdue", " AND punch_item_id = ?", [id]),
      1,
    );
    await sync(users.bch);
    assert.equal(
      await countNotif(users.bch.id, "punch_overdue", " AND punch_item_id = ?", [id]),
      0,
      "không phải Admin/PM và không được gán thì không thấy",
    );
    await run(`UPDATE punch_list SET status = 'closed' WHERE id = ?`, id);
    await sync(users.pm);
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.pm.id, "punch_overdue", " AND punch_item_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM punch_list WHERE id = ?`, id);
  },
);

// ───────────────────────── 9) po_late + vehicle_late (admin/pm) ─────────────────────────

test("po_late: PO trễ giao chưa đủ hàng → nhắc Admin/PM; nhận đủ hàng thì tự dọn", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { daysFromTodayISO } = await import("@/lib/nen/date");
  const id = await insertId(
    `INSERT INTO purchase_orders (po_code, status, expected_date, project_id)
     VALUES (?, 'confirmed', ?, ?)`,
    `${PFX}-PO-LATE`,
    daysFromTodayISO(-2),
    projectId,
  );
  await sync(users.pm);
  assert.equal(await countNotif(users.pm.id, "po_late", " AND po_id = ?", [id]), 1);
  await sync(users.pm);
  assert.equal(await countNotif(users.pm.id, "po_late", " AND po_id = ?", [id]), 1, "DEDUP");
  await sync(users.engineer);
  assert.equal(
    await countNotif(users.engineer.id, "po_late", " AND po_id = ?", [id]),
    0,
    "chỉ Admin/PM quản mua sắm",
  );
  await run(`UPDATE purchase_orders SET status = 'received' WHERE id = ?`, id);
  await sync(users.pm);
  assert.equal(await countNotif(users.pm.id, "po_late", " AND po_id = ?", [id]), 0, "TỰ DỌN");
  await run(`DELETE FROM purchase_orders WHERE id = ?`, id);
});

test(
  "vehicle_late: xe NCC quá giờ dự kiến ≥2h chưa vào cổng → nhắc Admin/PM; vào cổng thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const id = await insertId(
      `INSERT INTO vehicle_logs (plate, expected_at, status, project_id)
     VALUES (?, NOW() - INTERVAL '3 hours', 'registered', ?)`,
      `${PFX}-XE1`,
      projectId,
    );
    await sync(users.pm);
    assert.equal(await countNotif(users.pm.id, "vehicle_late", " AND vehicle_id = ?", [id]), 1);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "vehicle_late", " AND vehicle_id = ?", [id]),
      1,
      "DEDUP",
    );
    await run(`UPDATE vehicle_logs SET entered_at = NOW() WHERE id = ?`, id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "vehicle_late", " AND vehicle_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM vehicle_logs WHERE id = ?`, id);
  },
);

// ───────────────────────── 10) diary_missing (admin/pm/engineer) ─────────────────────────

test(
  "diary_missing: có cập nhật tiến độ nhưng chưa lập nhật ký thi công ngày đó → nhắc; lập nhật ký thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, status, progress_percent) VALUES (?, ?, 'Task có nhật ký', 'dang_thi_cong', 0.5)`,
      packageId,
      `${PFX}-DIARYTASK`,
    );
    // missingDiaryDates chỉ xét NGÀY TRONG QUÁ KHỨ (< hôm nay, không tính hôm nay — có thể
    // lập nhật ký cuối ngày) nên phải ghi task_history của HÔM QUA, không phải hôm nay.
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, changed_at)
     VALUES (?, 0.3, 0.5, NOW() - INTERVAL '1 day')`,
      taskId,
    );
    await sync(users.engineer);
    const { queryOne } = await import("@/lib/db");
    const today = (
      await queryOne<{ d: string }>(
        `SELECT ((NOW() - INTERVAL '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d`,
      )
    )?.d as string;
    assert.equal(
      await countNotif(users.engineer.id, "diary_missing", " AND diary_date = ?", [today]),
      1,
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "diary_missing", " AND diary_date = ?", [today]),
      1,
      "DEDUP",
    );
    await sync(users.subcon);
    assert.equal(
      await countNotif(users.subcon.id, "diary_missing", " AND diary_date = ?", [today]),
      0,
      "subcon không lập nhật ký thi công",
    );

    await run(`INSERT INTO site_diaries (diary_date, project_id) VALUES (?, ?)`, today, projectId);
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "diary_missing", " AND diary_date = ?", [today]),
      0,
      "TỰ DỌN: đã lập nhật ký ngày đó",
    );
    await run(`DELETE FROM site_diaries WHERE diary_date = ? AND project_id = ?`, today, projectId);
    await run(`DELETE FROM task_history WHERE task_id = ?`, taskId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
  },
);

// ───────────────────────── 11) norm_over (admin/pm/engineer) ─────────────────────────

test(
  "norm_over: vật tư/nhân công vượt định mức theo BOQ → nhắc; hạ về ngưỡng thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, project_id, qty_contract)
     VALUES (?, 'Dòng BOQ định mức', 'm', ?, 10)`,
      `${PFX}-BOQ-NORM`,
      projectId,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, status, progress_percent)
     VALUES (?, ?, 'Task định mức', 'dang_thi_cong', 1)`,
      packageId,
      `${PFX}-NORMTASK`,
    );
    await run(
      `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
      boqId,
      taskId,
    );
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, project_id, name, unit) VALUES (?, ?, 'VT định mức', 'kg')`,
      sheetTypeId,
      projectId,
    );
    const normId = await insertId(
      `INSERT INTO boq_norms (boq_item_id, resource_type, material_id, qty_per_unit, unit_label)
     VALUES (?, 'material', ?, 1, 'kg')`,
      boqId,
      matId,
    );
    // executed = LEAST(10, 10*1*1) = 10; expected = 1*10 = 10. Dùng thực tế 20 → vượt 100%.
    // overNormItems lọc SUM theo floor_label của các task map vào dòng BOQ (boqItemFloors) khi
    // work_package đó CÓ floor_label (fixture dùng chung của file này có) — phải khớp đúng
    // floor_label '${PFX}-F1' của packageId, nếu không SUM rỗng → actual = 0, bỏ lỡ luôn cảnh báo.
    await run(
      `INSERT INTO material_transactions (material_id, delta, qty_after, type, floor_label)
     VALUES (?, -20, 0, 'xuat_cong_truong', ?)`,
      matId,
      `${PFX}-F1`,
    );

    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "norm_over", " AND boq_norm_id = ?", [normId]),
      1,
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "norm_over", " AND boq_norm_id = ?", [normId]),
      1,
      "DEDUP",
    );
    await sync(users.subcon);
    assert.equal(
      await countNotif(users.subcon.id, "norm_over", " AND boq_norm_id = ?", [normId]),
      0,
      "subcon không thuộc nhóm admin/pm/engineer",
    );

    await run(`UPDATE material_transactions SET delta = -10 WHERE material_id = ?`, matId);
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "norm_over", " AND boq_norm_id = ?", [normId]),
      0,
      "TỰ DỌN: về đúng định mức thì hết cảnh báo",
    );

    await run(`DELETE FROM material_transactions WHERE material_id = ?`, matId);
    await run(`DELETE FROM boq_norms WHERE id = ?`, normId);
    await run(`DELETE FROM materials WHERE id = ?`, matId);
    await run(`DELETE FROM boq_task_map WHERE boq_item_id = ?`, boqId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
    await run(`DELETE FROM boq_items WHERE id = ?`, boqId);
  },
);

// ───────────────────────── 12) hse_action_due (assignee + Admin/PM) ─────────────────────────

test(
  "hse_action_due: hành động khắc phục HSE quá hạn → Admin/PM thấy hết, người được gán chỉ thấy của mình; đóng thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO hse_records (kind, record_date, description, action_required, action_assignee, action_due, action_status, project_id)
       VALUES ('inspection', ?, 'Vi phạm HSE', 'Khắc phục ngay', ?, ?, 'open', ?)`,
      daysFromTodayISO(-10),
      users.engineer.id,
      daysFromTodayISO(-2),
      projectId,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "hse_action_due", " AND hse_record_id = ?", [id]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "hse_action_due", " AND hse_record_id = ?", [id]),
      1,
      "DEDUP",
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "hse_action_due", " AND hse_record_id = ?", [id]),
      1,
    );
    await sync(users.bch);
    assert.equal(
      await countNotif(users.bch.id, "hse_action_due", " AND hse_record_id = ?", [id]),
      0,
      "không phải Admin/PM và không được gán thì không thấy",
    );
    await run(`UPDATE hse_records SET action_status = 'closed' WHERE id = ?`, id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "hse_action_due", " AND hse_record_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM hse_records WHERE id = ?`, id);
  },
);

// ───────────────────────── 13) action_overdue (việc sau họp) ─────────────────────────

test(
  "action_overdue: việc sau họp quá hạn chưa xong → Admin/PM thấy hết, người được gán chỉ thấy của mình; xong việc thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const meetingId = await insertId(
      `INSERT INTO meetings (meeting_date, title, project_id) VALUES (?, 'Họp tuần', ?)`,
      daysFromTodayISO(-10),
      projectId,
    );
    const id = await insertId(
      `INSERT INTO meeting_actions (meeting_id, content, assignee, due_date, status)
       VALUES (?, 'Việc sau họp', ?, ?, 'open')`,
      meetingId,
      users.engineer.id,
      daysFromTodayISO(-2),
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "action_overdue", " AND meeting_action_id = ?", [id]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "action_overdue", " AND meeting_action_id = ?", [id]),
      1,
      "DEDUP",
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "action_overdue", " AND meeting_action_id = ?", [id]),
      1,
    );
    await sync(users.bch);
    assert.equal(
      await countNotif(users.bch.id, "action_overdue", " AND meeting_action_id = ?", [id]),
      0,
      "không phải Admin/PM và không được gán thì không thấy",
    );
    await run(`UPDATE meeting_actions SET status = 'done', done_at = NOW() WHERE id = ?`, id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "action_overdue", " AND meeting_action_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM meeting_actions WHERE id = ?`, id);
    await run(`DELETE FROM meetings WHERE id = ?`, meetingId);
  },
);

// ───────────────────────── 14) env_permit_expiry + env_monitoring_over (CAN.manageEnv) ─────────────────────────

test(
  "env_permit_expiry: hồ sơ môi trường sắp/đã hết hạn → nhắc admin/pm/engineer; đổi trạng thái thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO env_permits (project_id, kind, title, status, expiry_date)
     VALUES (?, 'giay_phep_mt', 'Giấy phép MT', 'valid', ?)`,
      projectId,
      daysFromTodayISO(5),
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "env_permit_expiry", " AND env_permit_id = ?", [id]),
      1,
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "env_permit_expiry", " AND env_permit_id = ?", [id]),
      1,
      "DEDUP",
    );
    await sync(users.subcon);
    assert.equal(
      await countNotif(users.subcon.id, "env_permit_expiry", " AND env_permit_id = ?", [id]),
      0,
      "subcon không có quyền manageEnv",
    );
    await run(`UPDATE env_permits SET status = 'superseded' WHERE id = ?`, id);
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "env_permit_expiry", " AND env_permit_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM env_permits WHERE id = ?`, id);
  },
);

test(
  "env_monitoring_over: chỉ tiêu quan trắc môi trường vượt ngưỡng ở kỳ gần nhất → nhắc; kỳ mới đạt thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const id = await insertId(
      `INSERT INTO env_monitoring (project_id, measured_at, category, indicator, value, threshold, passed)
     VALUES (?, CURRENT_DATE, 'khi_bui', ?, 100, 50, FALSE)`,
      projectId,
      `${PFX}-CHITIEU`,
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "env_monitoring_over", " AND env_monitoring_id = ?", [
        id,
      ]),
      1,
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "env_monitoring_over", " AND env_monitoring_id = ?", [
        id,
      ]),
      1,
      "DEDUP",
    );
    // Kỳ đo MỚI HƠN cùng indicator đạt ngưỡng → DISTINCT ON đổi sang kỳ mới → tự dọn kỳ cũ.
    const id2 = await insertId(
      `INSERT INTO env_monitoring (project_id, measured_at, category, indicator, value, threshold, passed)
     VALUES (?, CURRENT_DATE + 1, 'khi_bui', ?, 30, 50, TRUE)`,
      projectId,
      `${PFX}-CHITIEU`,
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "env_monitoring_over", " AND env_monitoring_id = ?", [
        id,
      ]),
      0,
      "TỰ DỌN: kỳ đo mới nhất đã đạt ngưỡng",
    );
    await run(`DELETE FROM env_monitoring WHERE id IN (?, ?)`, id, id2);
  },
);

// ───────────────────────── 15) warranty_expiry + warranty_claim_overdue (CAN.manageWarranty) ─────────────────────────

test(
  "warranty_expiry: hạng mục bảo hành sắp/đã hết hạn → nhắc admin/pm/engineer; hết trạng thái active thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO warranty_items (project_id, title, warranty_from, warranty_months, status)
     VALUES (?, 'HM bảo hành', ?, 1, 'active')`,
      projectId,
      daysFromTodayISO(-25),
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "warranty_expiry", " AND warranty_item_id = ?", [id]),
      1,
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "warranty_expiry", " AND warranty_item_id = ?", [id]),
      1,
      "DEDUP",
    );
    await sync(users.viewer);
    assert.equal(
      await countNotif(users.viewer.id, "warranty_expiry", " AND warranty_item_id = ?", [id]),
      0,
      "viewer không có quyền manageWarranty",
    );
    await run(`UPDATE warranty_items SET status = 'expired' WHERE id = ?`, id);
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "warranty_expiry", " AND warranty_item_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM warranty_items WHERE id = ?`, id);
  },
);

test(
  "warranty_claim_overdue: claim lỗi sau bàn giao quá hạn xử lý → Admin/PM thấy hết, người được gán chỉ thấy của mình; đóng thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO warranty_claims (project_id, description, status, due_date, assignee)
       VALUES (?, 'Lỗi sau bàn giao', 'open', ?, ?)`,
      projectId,
      daysFromTodayISO(-2),
      users.engineer.id,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "warranty_claim_overdue", " AND warranty_claim_id = ?", [id]),
      1,
    );
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "warranty_claim_overdue", " AND warranty_claim_id = ?", [id]),
      1,
      "DEDUP",
    );
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.engineer.id, "warranty_claim_overdue", " AND warranty_claim_id = ?", [
        id,
      ]),
      1,
    );
    await sync(users.cdt);
    assert.equal(
      await countNotif(users.cdt.id, "warranty_claim_overdue", " AND warranty_claim_id = ?", [id]),
      0,
      "không phải Admin/PM và không được gán thì không thấy",
    );
    await run(`UPDATE warranty_claims SET status = 'closed' WHERE id = ?`, id);
    await sync(users.pm);
    await sync(users.engineer);
    assert.equal(
      await countNotif(users.pm.id, "warranty_claim_overdue", " AND warranty_claim_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM warranty_claims WHERE id = ?`, id);
  },
);

// ───────────────────────── 16) advance_overdue (CAN.manageFinance) ─────────────────────────

test(
  "advance_overdue: tạm ứng quá hạn hoàn ứng → nhắc Admin/PM; hoàn ứng xong thì tự dọn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const id = await insertId(
      `INSERT INTO advances (project_id, code, advance_date, amount, recipient, status)
     VALUES (?, ?, ?, 1000000, 'NCC A', 'open')`,
      projectId,
      `${PFX}-TU1`,
      daysFromTodayISO(-40),
    );
    await sync(users.pm);
    assert.equal(await countNotif(users.pm.id, "advance_overdue", " AND advance_id = ?", [id]), 1);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "advance_overdue", " AND advance_id = ?", [id]),
      1,
      "DEDUP",
    );
    await sync(users.bch);
    assert.equal(
      await countNotif(users.bch.id, "advance_overdue", " AND advance_id = ?", [id]),
      0,
      "bch xem được trang thanh toán nhưng KHÔNG có quyền manageFinance (nhạy cảm tiền)",
    );
    await run(`UPDATE advances SET status = 'settled' WHERE id = ?`, id);
    await sync(users.pm);
    assert.equal(
      await countNotif(users.pm.id, "advance_overdue", " AND advance_id = ?", [id]),
      0,
      "TỰ DỌN",
    );
    await run(`DELETE FROM advances WHERE id = ?`, id);
  },
);

// ───────────────────────── 17) items trả về: JOIN sheet slug/tầng khi có task_id, badge đếm chưa đọc không bị kẹt ở LIMIT ─────────────────────────

test(
  "items trả về: thông báo GẮN task có sheetSlug/floorLabel; thông báo KHÔNG gắn task thì 2 trường này null",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
       VALUES (?, ?, 'Task có link', ?, 0.1, 'dang_thi_cong')`,
      packageId,
      `${PFX}-LINKTASK`,
      daysFromTodayISO(-1),
    );
    const advId = await insertId(
      `INSERT INTO advances (project_id, code, advance_date, amount, status)
       VALUES (?, ?, ?, 1, 'open')`,
      projectId,
      `${PFX}-TU-LINK`,
      daysFromTodayISO(-40),
    );
    const { notifications } = await sync(users.pm);
    const taskNoti = notifications.find((n) => n.taskId === taskId);
    const advNoti = notifications.find(
      (n) => n.type === "advance_overdue" && n.message.includes(`${PFX}-TU-LINK`),
    );
    assert.ok(taskNoti, "phải có thông báo delayed gắn với task vừa tạo");
    assert.equal(
      taskNoti!.sheetSlug,
      null,
      "sheet_types test chưa gắn slug nên vẫn null — không throw",
    );
    assert.ok(advNoti, "phải có thông báo advance_overdue không gắn task");
    assert.equal(advNoti!.taskId, null);
    assert.equal(advNoti!.floorLabel, null, "thông báo không gắn task thì floorLabel phải null");

    await run(`DELETE FROM notifications WHERE advance_id = ? OR task_id = ?`, advId, taskId);
    await run(`DELETE FROM advances WHERE id = ?`, advId);
    await run(`DELETE FROM tasks WHERE id = ?`, taskId);
  },
);

test(
  "unread trả về đúng TỔNG số chưa đọc, không bị kẹt ở LIMIT của danh sách items (bug thật đã gặp ở M40)",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { daysFromTodayISO } = await import("@/lib/nen/date");
    const taskIds: number[] = [];
    for (let i = 0; i < 5; i++) {
      taskIds.push(
        await insertId(
          `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, status)
           VALUES (?, ?, 'Task badge', ?, 0.1, 'dang_thi_cong')`,
          packageId,
          `${PFX}-BADGE${i}`,
          daysFromTodayISO(-1),
        ),
      );
    }
    const { syncAndListNotifications } = await import("@/lib/dich-vu/thong-bao");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    const { notifications, unread } = await runWithRequestContext({ projectId }, () =>
      syncAndListNotifications(users.pm, projectId, 2),
    );
    assert.equal(notifications.length, 2, "items bị giới hạn đúng bằng limit truyền vào");
    assert.ok(
      unread >= 5,
      `unread (${unread}) phải đếm ĐẦY ĐỦ, không bị kẹt ở limit=2 của danh sách items`,
    );
    await run(`DELETE FROM notifications WHERE task_id = ANY(?)`, taskIds);
    await run(`DELETE FROM tasks WHERE id = ANY(?)`, taskIds);
  },
);
