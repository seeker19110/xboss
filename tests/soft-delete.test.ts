import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// M45 PR4 — soft-delete: UPDATE deleted_at ẩn khỏi danh sách; deletedView lọc
// đúng; restore (deleted_at = NULL) đưa lại. Cần TEST_DATABASE_URL.

const S = Date.now().toString(36);

test(
  "listContracts: soft-delete ẩn khỏi 'alive', hiện ở 'deleted', restore đưa lại",
  {
    skip: !HAS_TEST_DB,
  },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { listContracts } = await import("@/lib/contracts");

    const pid = await insertId(`INSERT INTO projects (name) VALUES (?)`, `SD Proj ${S}`);
    const cid = await insertId(
      `INSERT INTO contracts (project_id, code, kind, title, value) VALUES (?, ?, 'nhan_thau', ?, 1000)`,
      pid,
      `SD-CT-${S}`,
      "HĐ test soft-delete",
    );

    const aliveBefore = await listContracts(undefined, pid, "alive");
    assert.ok(
      aliveBefore.some((c) => c.id === cid),
      "HĐ mới phải nằm trong danh sách 'alive'",
    );

    // Soft-delete.
    await run(`UPDATE contracts SET deleted_at = now() WHERE id = ?`, cid);

    const aliveAfter = await listContracts(undefined, pid, "alive");
    assert.ok(!aliveAfter.some((c) => c.id === cid), "HĐ đã xoá không được ở 'alive'");

    const deleted = await listContracts(undefined, pid, "deleted");
    assert.ok(
      deleted.some((c) => c.id === cid),
      "HĐ đã xoá phải ở 'deleted'",
    );
    assert.ok(
      deleted.find((c) => c.id === cid)?.deletedAt != null,
      "deletedAt phải có giá trị sau khi xoá",
    );

    const all = await listContracts(undefined, pid, "all");
    assert.ok(
      all.some((c) => c.id === cid),
      "'all' phải bao gồm cả HĐ đã xoá",
    );

    // Restore.
    await run(`UPDATE contracts SET deleted_at = NULL WHERE id = ?`, cid);
    const aliveRestored = await listContracts(undefined, pid, "alive");
    assert.ok(
      aliveRestored.some((c) => c.id === cid),
      "HĐ khôi phục phải trở lại 'alive'",
    );
  },
);

test("listClaims: mặc định loại claim đã soft-delete", { skip: !HAS_TEST_DB }, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { listClaims } = await import("@/lib/claims");

  const pid = await insertId(`INSERT INTO projects (name) VALUES (?)`, `SD Claim Proj ${S}`);
  const clid = await insertId(
    `INSERT INTO claims (project_id, code, kind, title, notice_date, cause)
     VALUES (?, ?, 'cost', ?, CURRENT_DATE, 'test')`,
    pid,
    `SD-CLM-${S}`,
    "Claim test soft-delete",
  );

  assert.ok(
    (await listClaims(pid)).some((c) => c.id === clid),
    "claim mới ở danh sách mặc định",
  );
  await run(`UPDATE claims SET deleted_at = now() WHERE id = ?`, clid);
  assert.ok(
    !(await listClaims(pid)).some((c) => c.id === clid),
    "claim đã xoá không ở danh sách mặc định (alive)",
  );
  assert.ok(
    (await listClaims(pid, { deletedView: "deleted" })).some((c) => c.id === clid),
    "claim đã xoá hiện khi deletedView='deleted'",
  );
});
