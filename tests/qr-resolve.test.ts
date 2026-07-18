import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M58 PR1 — QR resolve + tem in. Route /api/r/:kind/:id gọi getCurrentUser() (next/headers)
// nên không gọi handler trực tiếp ngoài request scope thật của Next (đúng quy ước đã ghi ở
// tests/audit-log-api.test.ts, tests/permissions.test.ts, tests/totp.test.ts) — kiểm 2 lớp:
// (1) hàm thuần (isQrKind, qrTargetPath, absoluteUrl, escapeHtml) — unit, không cần DB;
// (2) resolveQr — hàm DB route thật sự dùng để tra + áp project scope, test tích hợp qua
// Postgres riêng (TEST_DATABASE_URL, không có thì tự skip). Route GET chỉ là lớp mỏng gọi
// getCurrentUser() → 401 rồi gọi thẳng resolveQr(), nên phủ đủ logic nghiệp vụ thật.
import { test } from "node:test";
import assert from "node:assert/strict";

const S = { skip: !HAS_TEST_DB };

// ===== Unit: hàm thuần trong lib/qr.ts =====

test("isQrKind: chỉ chấp nhận đúng 4 giá trị whitelist", async () => {
  const { isQrKind } = await import("@/lib/qr");
  assert.equal(isQrKind("eq"), true);
  assert.equal(isQrKind("mt"), true);
  assert.equal(isQrKind("wf"), true);
  assert.equal(isQrKind("tk"), true);
  assert.equal(isQrKind("other"), false);
  assert.equal(isQrKind(""), false);
});

test("qrTargetPath: dựng đúng /r/:kind/:id, encode id có ký tự đặc biệt", async () => {
  const { qrTargetPath } = await import("@/lib/qr");
  assert.equal(qrTargetPath("eq", 12), "/r/eq/12");
  assert.equal(qrTargetPath("wf", "Tầng 5"), "/r/wf/T%E1%BA%A7ng%205");
});

test("absoluteUrl: ưu tiên APP_URL, bỏ dấu / thừa ở cuối", async () => {
  const { absoluteUrl } = await import("@/lib/qr");
  const prevAppUrl = process.env.APP_URL;
  process.env.APP_URL = "https://xboss.example.com/";
  try {
    const url = absoluteUrl("/r/eq/1", { headers: new Headers() });
    assert.equal(url, "https://xboss.example.com/r/eq/1");
  } finally {
    if (prevAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevAppUrl;
  }
});

test("absoluteUrl: không có APP_URL → suy từ header host + x-forwarded-proto", async () => {
  const { absoluteUrl } = await import("@/lib/qr");
  const prevAppUrl = process.env.APP_URL;
  delete process.env.APP_URL;
  try {
    const headers = new Headers({ host: "192.168.1.10:3000", "x-forwarded-proto": "http" });
    const url = absoluteUrl("/r/mt/7", { headers });
    assert.equal(url, "http://192.168.1.10:3000/r/mt/7");
  } finally {
    if (prevAppUrl !== undefined) process.env.APP_URL = prevAppUrl;
  }
});

test("escapeHtml: escape đủ 5 ký tự nguy hiểm, chống XSS trong tên vật tư/thiết bị", async () => {
  const { escapeHtml } = await import("@/lib/qr");
  assert.equal(
    escapeHtml(`<script>alert('x')</script> & "quote"`),
    "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quote&quot;",
  );
});

// ===== Tích hợp: resolveQr (cần Postgres qua TEST_DATABASE_URL) =====

test(
  "resolveQr: dựng 2 dự án đầy đủ WBS + equipment/materials/task/work_packages — resolve đúng 4 kind, id lạ/dự án khác → null",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { resolveQr } = await import("@/lib/qr");

    const suffix = Date.now().toString(36);

    async function seedProject(tag: string) {
      const projectId = await insertId(
        `INSERT INTO projects (name, code) VALUES (?, ?)`,
        `DA QR ${tag}`,
        `PJT-QR${tag}${suffix}`,
      );
      const towerId = await insertId(
        `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp QR')`,
        projectId,
      );
      const sheetTypeId = await insertId(
        `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'OGTD', 'OGTĐ', ?)`,
        towerId,
        `qr-slug-${tag}-${suffix}`,
      );
      const packageId = await insertId(
        `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, progress, status)
         VALUES (?, 'A1', 'Nhóm A1', ?, 0, 'chuan_bi')`,
        sheetTypeId,
        `TangQR-${tag}-${suffix}`,
      );
      const taskId = await insertId(
        `INSERT INTO tasks (package_id, code, name, status, progress_percent)
         VALUES (?, 'A1,01', 'Task QR test', 'chuan_bi', 0)`,
        packageId,
      );
      const equipmentId = await insertId(
        `INSERT INTO equipment (code, name, kind, condition, project_id)
         VALUES (?, 'Máy hàn QR test', 'may_han', 'good', ?)`,
        `EQ-QR-${tag}-${suffix}`,
        projectId,
      );
      const materialId = await insertId(
        `INSERT INTO materials (name, unit, boq_code, project_id, sheet_type_id)
         VALUES ('Ống gió QR test', 'm', ?, ?, ?)`,
        `MT-QR-${tag}-${suffix}`,
        projectId,
        sheetTypeId,
      );
      return {
        projectId,
        sheetSlug: `qr-slug-${tag}-${suffix}`,
        floorLabel: `TangQR-${tag}-${suffix}`,
        taskId,
        equipmentId,
        materialId,
      };
    }

    const a = await seedProject("A");
    const b = await seedProject("B");

    // 4 kind resolve đúng cho dự án A (trong đúng phạm vi dự án A).
    const eq = await resolveQr("eq", String(a.equipmentId), a.projectId);
    assert.ok(eq);
    assert.equal(eq!.kind, "eq");
    assert.equal(eq!.id, a.equipmentId);

    const mt = await resolveQr("mt", String(a.materialId), a.projectId);
    assert.ok(mt);
    assert.equal(mt!.kind, "mt");
    assert.equal(mt!.id, a.materialId);

    const wf = await resolveQr("wf", a.floorLabel, a.projectId);
    assert.ok(wf);
    assert.equal(wf!.kind, "wf");
    assert.equal(wf!.id, a.floorLabel);

    const tk = await resolveQr("tk", String(a.taskId), a.projectId);
    assert.ok(tk);
    assert.equal(tk!.kind, "tk");
    if (tk!.kind === "tk") assert.equal(tk!.sheetSlug, a.sheetSlug);

    // id không tồn tại → null (không throw).
    assert.equal(await resolveQr("eq", "999999999", a.projectId), null);
    assert.equal(await resolveQr("mt", "999999999", a.projectId), null);
    assert.equal(await resolveQr("tk", "999999999", a.projectId), null);
    assert.equal(await resolveQr("wf", "Tầng không tồn tại XYZ", a.projectId), null);

    // Tài nguyên thuộc dự án B, tra bằng projectId dự án A → null (không lộ, không phải
    // trả về object có dữ liệu của dự án khác).
    assert.equal(await resolveQr("eq", String(b.equipmentId), a.projectId), null);
    assert.equal(await resolveQr("mt", String(b.materialId), a.projectId), null);
    assert.equal(await resolveQr("wf", b.floorLabel, a.projectId), null);
    assert.equal(await resolveQr("tk", String(b.taskId), a.projectId), null);

    // projectId null (chưa có dự án nào) → luôn null, không lỗi.
    assert.equal(await resolveQr("eq", String(a.equipmentId), null), null);

    // id không phải số nguyên cho kind số → null thay vì lỗi SQL.
    assert.equal(await resolveQr("eq", "abc", a.projectId), null);

    // Dọn dữ liệu test — theo đúng thứ tự FK con → cha (không bảng nào ở đây có CASCADE).
    for (const p of [a, b]) {
      await run(`DELETE FROM equipment WHERE id = ?`, p.equipmentId);
      await run(`DELETE FROM materials WHERE id = ?`, p.materialId);
      await run(`DELETE FROM tasks WHERE id = ?`, p.taskId);
    }
    await run(
      `DELETE FROM work_packages WHERE sheet_type_id IN
        (SELECT id FROM sheet_types WHERE tower_id IN
          (SELECT id FROM towers WHERE project_id IN (?, ?)))`,
      a.projectId,
      b.projectId,
    );
    await run(
      `DELETE FROM sheet_types WHERE tower_id IN
        (SELECT id FROM towers WHERE project_id IN (?, ?))`,
      a.projectId,
      b.projectId,
    );
    await run(`DELETE FROM towers WHERE project_id IN (?, ?)`, a.projectId, b.projectId);
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, a.projectId, b.projectId);
  },
);

test("resolveManyForLabels: bỏ qua id không tồn tại/dự án khác, không throw", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const { resolveManyForLabels } = await import("@/lib/qr");

  const suffix = Date.now().toString(36);
  const projectId = await insertId(
    `INSERT INTO projects (name, code) VALUES (?, ?)`,
    "DA QR Labels",
    `PJT-QRL${suffix}`,
  );
  const eq1 = await insertId(
    `INSERT INTO equipment (code, name, kind, condition, project_id)
       VALUES (?, 'Máy khoan QR', 'may_khoan', 'good', ?)`,
    `EQ-QRL-1-${suffix}`,
    projectId,
  );
  const eq2 = await insertId(
    `INSERT INTO equipment (code, name, kind, condition, project_id)
       VALUES (?, 'Máy cắt QR', 'may_cat', 'good', ?)`,
    `EQ-QRL-2-${suffix}`,
    projectId,
  );

  const items = await resolveManyForLabels(
    "eq",
    [String(eq1), "999999999", String(eq2), "abc"],
    projectId,
  );
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => i.id).sort((x, y) => Number(x) - Number(y)),
    [eq1, eq2].sort((x, y) => x - y),
  );

  await run(`DELETE FROM equipment WHERE id IN (?, ?)`, eq1, eq2);
  await run(`DELETE FROM projects WHERE id = ?`, projectId);
});
