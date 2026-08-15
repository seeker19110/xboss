import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Test tích hợp hash-chain audit_log (M43 PR3, migrations/0050_document_hash.sql +
// lib/audit-chain.ts::verifyAuditChain). Cần TEST_DATABASE_URL.
const S = Date.now().toString(36); // hậu tố duy nhất tránh đụng UNIQUE khi chạy lại trên cùng DB

test(
  "verifyAuditChain: chuỗi hợp lệ sau vài UPDATE liên tiếp trong withTransaction",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, query, withTransaction } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/request-context");
    const { verifyAuditChain } = await import("@/lib/audit-chain");

    const uid = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('Chain Tester', ?, 'admin', 'x')`,
      `chain-${S}@test.vn`,
    );
    const cid = await insertId(
      `INSERT INTO contracts (code, kind, title, value) VALUES (?, 'nhan_thau', 'HĐ chain', 100)`,
      `CHAIN-A-${S}`,
    );

    await runWithRequestContext({ userId: uid, role: "admin" }, async () => {
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ chain 1", cid);
      });
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ chain 2", cid);
      });
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ chain 3", cid);
      });
    });

    const result = await verifyAuditChain();
    assert.ok(result.checked > 0);
    // Chỉ khẳng định KHÔNG có lỗi nào ở đúng các dòng audit của contract test này — không
    // khẳng định `result.ok` toàn cục, vì DB test dùng chung có thể còn dòng cũ từ lần chạy
    // trước (vd bị test "tamper" bên dưới cố ý sửa tay) — không liên quan gì tới đúng/sai
    // của chuỗi hash cho phần dữ liệu test này vừa tạo.
    const myRows = await query<{ id: number }>(
      `SELECT id FROM audit_log WHERE entity_type='contracts' AND entity_id=? ORDER BY id ASC`,
      cid,
    );
    assert.equal(myRows.length, 4); // 1 INSERT + 3 UPDATE
    const myErrorIds = new Set(result.errors.map((e) => e.id));
    for (const r of myRows) {
      assert.ok(
        !myErrorIds.has(r.id),
        `dòng audit_log id=${r.id} (contract test) không được báo lỗi`,
      );
    }
  },
);

test(
  "verifyAuditChain: phát hiện đúng dòng bị sửa tay trực tiếp trong audit_log",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, query, withTransaction } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/request-context");
    const { verifyAuditChain } = await import("@/lib/audit-chain");

    const cid = await insertId(
      `INSERT INTO contracts (code, kind, title, value) VALUES (?, 'nhan_thau', 'HĐ tamper', 100)`,
      `CHAIN-T-${S}`,
    );

    await runWithRequestContext({ userId: 1, role: "admin" }, async () => {
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ tamper 1", cid);
      });
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ tamper 2", cid);
      });
      await withTransaction(async () => {
        await run(`UPDATE contracts SET title = ? WHERE id = ?`, "HĐ tamper 3", cid);
      });
    });

    const rows = await query<{ id: number }>(
      `SELECT id FROM audit_log WHERE entity_type='contracts' AND entity_id=? AND action='UPDATE' ORDER BY id ASC`,
      cid,
    );
    assert.equal(rows.length, 3);
    const middleId = rows[1].id; // dòng giữa chuỗi 3 thao tác trên cùng contract

    // Giả lập bị sửa trực tiếp ngoài luồng app (role test là owner DB nên bỏ qua được
    // REVOKE của migration 0049 — đúng ghi chú "chỉ mang tính khai báo" trong migration).
    await run(
      `UPDATE audit_log SET changes = '{"title": ["bị sửa tay", "khác"]}'::jsonb WHERE id = ?`,
      middleId,
    );

    const result = await verifyAuditChain();
    assert.equal(result.ok, false);
    assert.ok(result.errors.length >= 1, "phải phát hiện ít nhất 1 dòng lệch");
    const err = result.errors.find((e) => e.id === middleId);
    assert.ok(err, "phải phát hiện đúng dòng bị sửa (middleId)");
  },
);

// --- C3 §2 "Audit UUID" (migrations/0090) ---------------------------------------------
// Trước 0090, cả 2 ca dưới đây đều VỠ THẬT trên Postgres (đã đo trực tiếp):
//   - gắn trigger audit lên bảng khoá UUID → mọi INSERT lỗi
//     `invalid input syntax for type bigint: "<uuid>"`;
//   - ghi vào bảng có audit khi app.project_id = '*' (ngữ cảnh cross-project hợp lệ của RLS)
//     → lỗi `invalid input syntax for type integer: "*"`.

test(
  "audit UUID: bảng engineering_* ghi được audit — entity_key giữ UUID, entity_id NULL",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");

    const uid = await insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES ('Aud UUID', ?, 'admin', 'x')`,
      `auduuid-${S}@test.vn`,
    );
    const pid = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Aud', ?)`,
      `AUD-${S}`,
    );

    const extKey = `aud:obj:${S}`;
    // Trước 0090 chính lệnh này ném lỗi bigint vì trigger audit không nuốt nổi UUID.
    await run(
      `INSERT INTO engineering_objects (project_id, object_type, external_key, created_by, updated_by)
       VALUES (?, 'component', ?, ?, ?)`,
      pid,
      extKey,
      uid,
      uid,
    );

    const obj = await queryOne<{ id: string }>(
      `SELECT id FROM engineering_objects WHERE project_id = ? AND external_key = ?`,
      pid,
      extKey,
    );
    assert.ok(obj, "object phải được tạo");

    const audit = await queryOne<{ id: number; entityKey: string; entityId: number | null }>(
      `SELECT id, entity_key AS "entityKey", entity_id AS "entityId"
         FROM audit_log WHERE entity_type = 'engineering_objects' AND entity_key = ?`,
      obj!.id,
    );
    assert.ok(audit, "phải có dòng audit cho bảng khoá UUID");
    assert.equal(audit!.entityKey, obj!.id, "entity_key giữ nguyên UUID");
    assert.equal(audit!.entityId, null, "entity_id để NULL vì khoá không phải số");

    // CỐ Ý không gọi verifyAuditChain() ở đây: chuỗi hash là trạng thái TOÀN CỤC của
    // audit_log — test "phát hiện dòng bị sửa tay" phía trên cố ý phá 1 dòng, và mọi file
    // test khác cũng ghi vào cùng bảng. Assert lên chuỗi từ đây là tự cột test vào trạng
    // thái của người khác (đã thấy đỏ giả khi chạy chung nhiều file). Tính hợp lệ của chuỗi
    // đã có test 1 (chuỗi sạch) và test 2 (bắt được dòng bị sửa) lo; việc cần chứng minh ở
    // đây là dòng khoá UUID ĐƯỢC GHI ĐÚNG — trước 0090 thì INSERT còn không chạy nổi.
    assert.ok(audit!.id > 0, "dòng audit phải có id thật");

    // BẮT BUỘC dọn: `engineering_objects.created_by` là FK tới `users(id)` KHÔNG có
    // ON DELETE, mà `tests/auth.test.ts` (chạy ngay sau file này theo thứ tự abc của
    // scripts/run-tests.mjs) có bước `DELETE FROM users`. Để sót dòng này là làm file đó
    // đỏ vì FK — đúng lớp lỗi "fail ngẫu nhiên ở file không liên quan" mà chính runner
    // sinh ra để tránh. Đã gặp thật khi chạy bộ đầy đủ lần đầu.
    await run(`DELETE FROM engineering_objects WHERE project_id = ?`, pid);
    await run(`DELETE FROM projects WHERE id = ?`, pid);
    await run(`DELETE FROM users WHERE id = ?`, uid);
  },
);

test(
  "audit: ghi trong ngữ cảnh cross-project (app.project_id='*') không làm vỡ trigger",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, withProjectScope, run } = await import("@/lib/db");

    const code = `AUD-STAR-${S}`;
    // withProjectScope("*") + readOnly:false = ngữ cảnh cross-project CÓ GHI. Tổ hợp này
    // đang được dùng thật ở app/api/notifications/route.ts (`projectId ?? "*"`), hiện chưa
    // nổ chỉ vì bảng `notifications` không gắn trigger audit — gắn trigger cho bất kỳ bảng
    // nào được ghi trong ngữ cảnh '*' là thành sự cố. Trước 0090, lệnh dưới đây vỡ với
    // `invalid input syntax for type integer: "*"`.
    await withProjectScope(
      "*",
      () =>
        run(
          `INSERT INTO contracts (code, kind, title, value) VALUES (?, 'nhan_thau', 'HĐ cross', 1)`,
          code,
        ),
      { readOnly: false },
    );

    const c = await queryOne<{ id: number }>(`SELECT id FROM contracts WHERE code = ?`, code);
    assert.ok(c, "contract phải được tạo trong ngữ cảnh '*'");

    const audit = await queryOne<{ projectId: number | null; entityKey: string }>(
      `SELECT project_id AS "projectId", entity_key AS "entityKey"
         FROM audit_log WHERE entity_type = 'contracts' AND entity_id = ?`,
      c!.id,
    );
    assert.ok(audit, "phải có dòng audit");
    assert.equal(
      audit!.projectId,
      null,
      "'*' không phải số → project_id để NULL, không được ép kiểu",
    );
    assert.equal(audit!.entityKey, String(c!.id), "khoá số vẫn ghi vào entity_key dạng chuỗi");
    void insertId;
  },
);
