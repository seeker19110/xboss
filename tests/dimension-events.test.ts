import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// M120 — dữ liệu sự kiện theo ô tick (`installed_at`/`installed_by`/`note`).
// `ghiDauVetTick` là nơi DUY NHẤT quyết định 3 cột này; test ở đây khoá luật của nó thay vì
// gọi route handler (route dùng getCurrentUser()/next/headers nên không chạy được ngoài
// request scope thật — quy ước đã ghi ở tests/cad-block-lo-route.test.ts).

// Dựng 1 task + n ô, trả id để test thao tác. Gọi trong ca đã skip khi không có DB.
async function dungOTest(soO: number, tienTo: string) {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `DA ${tienTo}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
    projectId,
    `Tháp ${tienTo}`,
  );
  const stId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, ?)`,
    towerId,
    tienTo,
    `Sheet ${tienTo}`,
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, ?, ?)`,
    stId,
    `${tienTo}1`,
    `Nhóm ${tienTo}`,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name) VALUES (?, ?, ?)`,
    pkgId,
    `${tienTo}1,01`,
    `Task ${tienTo}`,
  );
  const dimIds: number[] = [];
  for (let i = 1; i <= soO; i++) {
    dimIds.push(
      await insertId(
        `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES (?, ?, 0)`,
        taskId,
        `Ô ${i}`,
      ),
    );
  }
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, 'x', 'engineer')`,
    `Kỹ sư ${tienTo}`,
    `ks-${tienTo.toLowerCase()}@test.local`,
  );
  return { projectId, towerId, stId, pkgId, taskId, dimIds, userId };
}

async function don(ids: {
  projectId: number;
  towerId: number;
  stId: number;
  pkgId: number;
  taskId: number;
  userId: number;
}) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM task_history WHERE task_id = ?`, ids.taskId);
  await run(`DELETE FROM progress_dimensions WHERE task_id = ?`, ids.taskId);
  await run(`DELETE FROM tasks WHERE id = ?`, ids.taskId);
  await run(`DELETE FROM work_packages WHERE id = ?`, ids.pkgId);
  await run(`DELETE FROM sheet_types WHERE id = ?`, ids.stId);
  await run(`DELETE FROM towers WHERE id = ?`, ids.towerId);
  await run(`DELETE FROM projects WHERE id = ?`, ids.projectId);
  await run(`DELETE FROM users WHERE id = ?`, ids.userId);
}

type ORow = {
  installed: number;
  installed_at: Date | null;
  installed_by: number | null;
  note: string | null;
};

test(
  "ghiDauVetTick: AC1 — tick đóng dấu người + thời điểm; AC2 — bỏ tick xoá sạch cả 3 cột",
  { skip: !HAS_TEST_DB },
  async () => {
    const { queryOne } = await import("@/lib/db");
    const { ghiDauVetTick } = await import("@/lib/tien-do/dimension-events");

    const ids = await dungOTest(1, "DVT1");
    const doO = () =>
      queryOne<ORow>(
        `SELECT installed, installed_at, installed_by, note FROM progress_dimensions WHERE id = ?`,
        ids.dimIds[0],
      );

    const truoc = Date.now();
    await ghiDauVetTick([ids.dimIds[0]], true, { userId: ids.userId, note: "Chờ nghiệm thu" });
    let o = await doO();
    assert.equal(o?.installed, 1);
    assert.equal(o?.installed_by, ids.userId, "AC1: installed_by = người thao tác");
    assert.ok(o?.installed_at, "AC1: có mốc thời gian tick");
    const lech = Math.abs(new Date(o!.installed_at!).getTime() - truoc);
    assert.ok(lech < 60_000, `AC1: installed_at phải ≈ hiện tại (lệch ${lech}ms)`);
    assert.equal(o?.note, "Chờ nghiệm thu");

    // AC2: bỏ tick → xoá cả 3 cột (quyết định D2), giữ bất biến installed=0 ⇒ không dấu vết.
    await ghiDauVetTick([ids.dimIds[0]], false, { userId: ids.userId });
    o = await doO();
    assert.equal(o?.installed, 0);
    assert.equal(o?.installed_at, null, "AC2: bỏ tick xoá installed_at");
    assert.equal(o?.installed_by, null, "AC2: bỏ tick xoá installed_by");
    assert.equal(o?.note, null, "AC2: bỏ tick xoá note");

    await don(ids);
  },
);

test(
  "ghiDauVetTick: note undefined giữ ghi chú cũ (đường batch), note null xoá ghi chú",
  { skip: !HAS_TEST_DB },
  async () => {
    const { queryOne } = await import("@/lib/db");
    const { ghiDauVetTick } = await import("@/lib/tien-do/dimension-events");

    const ids = await dungOTest(1, "DVT2");
    const doNote = async () =>
      (
        await queryOne<{ note: string | null }>(
          `SELECT note FROM progress_dimensions WHERE id = ?`,
          ids.dimIds[0],
        )
      )?.note;

    await ghiDauVetTick([ids.dimIds[0]], true, { userId: ids.userId, note: "Ghi chú gốc" });
    assert.equal(await doNote(), "Ghi chú gốc");

    // Đường batch không truyền note → phải GIỮ ghi chú đang có, không xoá trắng.
    await ghiDauVetTick([ids.dimIds[0]], true, { userId: ids.userId });
    assert.equal(await doNote(), "Ghi chú gốc", "note undefined = giữ nguyên");

    // Truyền null = xoá có chủ đích.
    await ghiDauVetTick([ids.dimIds[0]], true, { userId: ids.userId, note: null });
    assert.equal(await doNote(), null, "note null = xoá");

    await don(ids);
  },
);

test(
  "ghiDauVetTick: AC8 — cả lô nhiều ô đều được đóng dấu trong đúng 1 câu UPDATE",
  { skip: !HAS_TEST_DB },
  async () => {
    const { queryOne } = await import("@/lib/db");
    const { ghiDauVetTick } = await import("@/lib/tien-do/dimension-events");

    const ids = await dungOTest(50, "DVT3");
    await ghiDauVetTick(ids.dimIds, true, { userId: ids.userId });

    const dem = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM progress_dimensions
        WHERE task_id = ? AND installed = 1 AND installed_at IS NOT NULL AND installed_by = ?`,
      ids.taskId,
      ids.userId,
    );
    assert.equal(Number(dem?.n), 50, "AC8: mọi ô trong lô đều mang dữ liệu sự kiện");

    await don(ids);
  },
);

test(
  "ghiDauVetTick: userId null vẫn ghi được mốc thời gian (import/seed không có người dùng)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { queryOne } = await import("@/lib/db");
    const { ghiDauVetTick } = await import("@/lib/tien-do/dimension-events");

    const ids = await dungOTest(1, "DVT4");
    await ghiDauVetTick([ids.dimIds[0]], true, { userId: null });
    const o = await queryOne<ORow>(
      `SELECT installed, installed_at, installed_by, note FROM progress_dimensions WHERE id = ?`,
      ids.dimIds[0],
    );
    assert.equal(o?.installed, 1);
    assert.ok(o?.installed_at, "vẫn có mốc thời gian");
    assert.equal(o?.installed_by, null);

    await don(ids);
  },
);

// ===== chuanHoaGhiChuO: hồi quy lỗi bắt trong review M120 =====
// Route từng gộp "client không gửi note" vào `null`, nên MỌI lần tick không kèm ghi chú
// (chính là cái `toggle`/`setAllInRow` của lưới gửi) rơi vào nhánh ghi đè và xoá sạch ghi chú.
// "Tick cả hàng" PATCH luôn cả ô ĐANG tick ⇒ mất ghi chú cả hàng dù không ai đụng tới.

test("chuanHoaGhiChuO: không gửi field → undefined (giữ ghi chú cũ), KHÔNG phải null", async () => {
  const { chuanHoaGhiChuO } = await import("@/lib/tien-do/dimension-events");
  const r = chuanHoaGhiChuO(undefined);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.note, undefined, "vắng mặt field = giữ nguyên, không được thành null");
});

test("chuanHoaGhiChuO: null và chuỗi rỗng/trắng → null (xoá có chủ đích)", async () => {
  const { chuanHoaGhiChuO } = await import("@/lib/tien-do/dimension-events");
  for (const v of [null, "", "   "]) {
    const r = chuanHoaGhiChuO(v);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.note, null, `${JSON.stringify(v)} phải thành null`);
  }
});

test("chuanHoaGhiChuO: chuỗi được trim; AC12 — quá 500 ký tự trả lỗi 422 tiếng Việt", async () => {
  const { chuanHoaGhiChuO, MAX_NOTE_LEN } = await import("@/lib/tien-do/dimension-events");
  const ok = chuanHoaGhiChuO("  chờ vật tư  ");
  assert.equal(ok.ok && ok.note, "chờ vật tư");

  const vua = chuanHoaGhiChuO("x".repeat(MAX_NOTE_LEN));
  assert.equal(vua.ok, true, "đúng 500 ký tự vẫn hợp lệ");

  const qua = chuanHoaGhiChuO("x".repeat(MAX_NOTE_LEN + 1));
  assert.equal(qua.ok, false, "AC12: 501 ký tự phải bị từ chối");
  assert.match(!qua.ok ? qua.error : "", /Ghi chú tối đa 500 ký tự/);
});

test("ghiDauVetTick: danh sách rỗng là no-op, không dựng SQL `IN ()` hỏng", async () => {
  const { ghiDauVetTick } = await import("@/lib/tien-do/dimension-events");
  await ghiDauVetTick([], true, { userId: 1 }); // không được throw, không chạm DB
});

// ===== Chống giả mạo (AC3) + bất biến ở tầng route =====

test("AC3: route tick KHÔNG đọc installedAt/installedBy từ body — chỉ server quyết định", () => {
  for (const r of ["app/api/dimensions/[id]/route.ts", "app/api/dimensions/batch/route.ts"]) {
    const src = readFileSync(join(process.cwd(), r), "utf8");
    assert.doesNotMatch(
      src,
      /body\.installed(At|By)/,
      `${r}: không được nhận mốc thời gian/người tick từ client (giả mạo được)`,
    );
    assert.match(
      src,
      /ghiDauVetTick\(/,
      `${r}: phải đi qua lib dùng chung, không tự viết SQL ghi dấu vết riêng`,
    );
    assert.match(src, /userId: user\.id/, `${r}: installed_by phải lấy từ phiên đăng nhập`);
  }
});

test("mọi đường ghi ô đều dùng ghiDauVetTick — không còn UPDATE installed rời rạc", () => {
  // Nếu thêm đường ghi thứ 5 mà quên dữ liệu sự kiện thì ca này đỏ (giả định A1 của đặc tả).
  for (const f of [
    "app/api/dimensions/[id]/route.ts",
    "app/api/dimensions/batch/route.ts",
    "lib/tien-do/system-upload.ts",
  ]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.doesNotMatch(
      src,
      /UPDATE progress_dimensions\s+SET installed\s*=/i,
      `${f}: còn SQL ghi `.concat("`installed` trực tiếp — phải gọi ghiDauVetTick"),
    );
  }
});
