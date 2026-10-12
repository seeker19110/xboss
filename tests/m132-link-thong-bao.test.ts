import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M132 — link thông báo/push phải mang dự án của task (slug sheet chỉ duy nhất theo dự án từ
// migration 0161): bấm thông báo của dự án B khi đang chọn dự án A không được mở nhầm lưới A.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { linkTracking, docIdDuAn, quyetDinhDuAnTuLink } from "@/lib/nen/link-tracking";
import { trackingUrl } from "@/app/lib/trackingUrl";

test("linkTracking: ghép slug + tầng + dự án, mã hoá slug", () => {
  assert.equal(linkTracking("ogtd"), "/tracking/ogtd");
  assert.equal(linkTracking("ogtd", { floor: "T5" }), "/tracking/ogtd?floor=T5");
  assert.equal(
    linkTracking("ogtd", { floor: "T 5", projectId: 7 }),
    "/tracking/ogtd?floor=T+5&project=7",
  );
  assert.equal(linkTracking("a/b", { projectId: null }), "/tracking/a%2Fb");
});

test("trackingUrl: truyền projectId xuống link, giữ đường lui sheetType", () => {
  assert.equal(trackingUrl("odnn1", null, "T3", 2), "/tracking/odnn1?floor=T3&project=2");
  assert.equal(trackingUrl("odnn1", null, null, null), "/tracking/odnn1");
  assert.equal(trackingUrl(null, null, "T3", 2), null);
});

test("docIdDuAn: chỉ nhận số nguyên dương thập phân chuẩn", () => {
  assert.equal(docIdDuAn("12"), 12);
  for (const xau of [null, undefined, "", "0", "-1", "01", "1e3", "0x1", " 1", "1.5", "abc"])
    assert.equal(docIdDuAn(xau), null, String(xau));
  assert.equal(docIdDuAn("99999999999999999"), null); // > 16 chữ số
});

test("quyetDinhDuAnTuLink: không có / gỡ tham số / chuyển dự án", () => {
  assert.equal(quyetDinhDuAnTuLink(null, 1), "khong-co");
  assert.equal(quyetDinhDuAnTuLink("1", 1), "go-tham-so"); // cùng dự án
  assert.equal(quyetDinhDuAnTuLink("rac", 1), "go-tham-so"); // tham số hỏng
  assert.equal(quyetDinhDuAnTuLink("2", 1), "chuyen");
  assert.equal(quyetDinhDuAnTuLink("2", null), "chuyen"); // chưa có cookie
});

// ===== DB: listNotifications trả projectId; assignTask đẩy link có ?project= =====
const S = { skip: !HAS_TEST_DB };
const PFX = "M132";
let duAnA = 0;
let duAnB = 0;
let taskB = 0;
let userId = 0;

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, queryOne } = await import("@/lib/db");
  duAnA = await insertId(`INSERT INTO projects (name) VALUES ('${PFX} A')`);
  duAnB = await insertId(`INSERT INTO projects (name) VALUES ('${PFX} B')`);
  const thapB = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp')`, duAnB);
  // Cùng slug ở dự án A để khẳng định link phải phân biệt bằng dự án.
  const thapA = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp')`, duAnA);
  for (const thap of [thapA, thapB])
    await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, '${PFX}S', 'Sheet', 'm132-s')`,
      thap,
    );
  const sheetB = (await queryOne<{ id: number }>(
    `SELECT id FROM sheet_types WHERE tower_id = ? AND slug = 'm132-s'`,
    thapB,
  ))!.id;
  const goiB = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, '${PFX}P', 'Nhóm', 'T2')`,
    sheetB,
  );
  taskB = await insertId(
    `INSERT INTO tasks (package_id, code, name) VALUES (?, '${PFX}T', 'Task B')`,
    goiB,
  );
  userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('${PFX}', 'm132@test.local', 'x', 'engineer')`,
  );
});

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM notifications WHERE user_id = ?`, userId);
  await run(`DELETE FROM assignment_log WHERE target_id = ? AND level = 'task'`, taskB);
  await run(`DELETE FROM tasks WHERE id = ?`, taskB);
  for (const p of [duAnA, duAnB]) {
    await run(
      `DELETE FROM work_packages WHERE sheet_type_id IN (SELECT id FROM sheet_types WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM sheet_types WHERE project_id = ?`, p);
    await run(`DELETE FROM towers WHERE project_id = ?`, p);
    await run(`DELETE FROM projects WHERE id = ?`, p);
  }
  await run(`DELETE FROM users WHERE id = ?`, userId);
});

test("listNotifications trả projectId của task → link đúng dự án B", S, async () => {
  const { run } = await import("@/lib/db");
  const { listNotifications } = await import("@/lib/dich-vu/thong-bao");
  await run(
    `INSERT INTO notifications (user_id, task_id, type, message) VALUES (?, ?, 'comment', 'm132')`,
    userId,
    taskB,
  );
  const { notifications } = (await listNotifications(
    { id: userId, role: "engineer" } as Parameters<typeof listNotifications>[0],
    50,
  )) as {
    notifications: {
      taskId: number | null;
      projectId: number | null;
      sheetSlug: string | null;
      floorLabel: string | null;
    }[];
  };
  const n = notifications.find((x) => x.taskId === taskB);
  assert.ok(n, "phải thấy thông báo của task B");
  assert.equal(n.projectId, duAnB);
  assert.equal(
    trackingUrl(n.sheetSlug, null, n.floorLabel, n.projectId),
    `/tracking/m132-s?floor=T2&project=${duAnB}`,
  );
});
