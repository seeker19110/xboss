import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { quetTests } from "../scripts/lib/test-fk-ids-scan";

// Đợt 6 Việc D — Test bất biến chặn lớp lỗi "hằng số nguyên nhỏ gán cứng vào vị trí id khoá
// ngoại tới `users` trong test" (created_by/updated_by/actorId...).
//
// LỊCH SỬ: lớp lỗi này đã làm ĐỎ bộ test ở CẢ Đợt 4 lẫn Đợt 5, dù Đợt 5 đã ghi thành ràng buộc
// cứng trong PLAN.md kèm ví dụ chính xác — kết luận trong PROGRESS.md: viết luật vào kế hoạch
// là CHƯA ĐỦ, phải có cổng tự động. Bài học Đợt 5 (`check:db-params` báo [OK] suốt nhiều
// tháng trong khi 20 vi phạm thật đang tồn tại vì regex không khớp phong cách gọi phổ biến
// nhất của repo): file test NÀY BẮT BUỘC gọi thẳng hàm quét trên đoạn mã vi phạm DỰNG SẴN và
// khẳng định nó TÌM RA — không chỉ tin cổng chạy "xanh" trên tests/ hiện tại là đủ.
//
// Bộ quét dùng chung nằm ở `scripts/lib/test-fk-ids-scan.ts` — cổng CI `check:test-fk-ids`
// (chạy trên tests/ thật) và test này (chạy trên fixture dựng riêng) DÙNG CHUNG một cài đặt.

/** Dựng cây thư mục fixture tối thiểu: migrations/ (khai schema FK), lib/ (hàm ghi DB), tests/. */
function dungFixture(): string {
  const goc = mkdtempSync(join(tmpdir(), "xboss-fk-ids-"));
  mkdirSync(join(goc, "migrations"));
  mkdirSync(join(goc, "lib"));
  mkdirSync(join(goc, "tests"));

  // Schema: 2 bảng — 1 CÓ REFERENCES users(id) thật (feature_flags.updated_by, boq_norms.created_by),
  // 1 KHÔNG có ràng buộc (role_permissions.updated_by chỉ là INT trần) — để chứng minh cổng
  // không báo nhầm cột không có nguy cơ vỡ khi user bị xoá (đúng như role_permissions thật).
  writeFileSync(
    join(goc, "migrations", "0001_fixture.sql"),
    `CREATE TABLE IF NOT EXISTS boq_norms (
      id SERIAL PRIMARY KEY,
      created_by INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS feature_flags (
      id SERIAL PRIMARY KEY,
      updated_by INT REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS role_permissions (
      id SERIAL PRIMARY KEY,
      updated_by INT
    );
    `,
  );

  // Hàm lib mô phỏng đúng `setFlag` thật: tham số actorId ghi vào cột updated_by (CÓ FK thật).
  writeFileSync(
    join(goc, "lib", "setFlag.ts"),
    `import { run } from "@/lib/db";
export async function setFlag(
  moduleKey: string,
  projectId: number,
  enabled: boolean,
  actorId: number,
  orgId: number,
): Promise<void> {
  await run(
    \`INSERT INTO feature_flags (module_key, project_id, enabled, updated_by, org_id)
     VALUES (?, ?, ?, ?, ?)\`,
    moduleKey,
    projectId,
    enabled,
    actorId,
    orgId,
  );
}
`,
  );

  // Hàm lib mô phỏng đúng `setPermissionOverride` thật: tham số updatedBy ghi vào cột KHÔNG
  // có FK thật (role_permissions.updated_by) — KHÔNG được coi là vi phạm dù tên khớp mẫu.
  writeFileSync(
    join(goc, "lib", "setPermissionOverride.ts"),
    `import { run } from "@/lib/db";
export async function setPermissionOverride(
  role: string,
  permKey: string,
  updatedBy: number,
): Promise<void> {
  await run(
    \`INSERT INTO role_permissions (role, perm_key, updated_by) VALUES (?, ?, ?)\`,
    role,
    permKey,
    updatedBy,
  );
}
`,
  );

  return goc;
}

test("bộ quét TÌM RA 2 ca thật đã xảy ra (SQL literal + tham số lời gọi)", () => {
  const goc = dungFixture();
  try {
    writeFileSync(
      join(goc, "tests", "vi-pham.test.ts"),
      `import { insertId } from "@/lib/db";
import { setFlag } from "@/lib/setFlag";

// Ca 1: hằng SQL literal trong chuỗi (đúng dạng đã xảy ra ở boq_norms.created_by).
async function ca1() {
  await insertId(
    \`INSERT INTO boq_norms (created_by) VALUES (1)\`,
  );
}

// Ca 2: hằng truyền TRỰC TIẾP vào tham số actorId (đúng dạng đã xảy ra ở setFlag).
async function ca2(moduleKey: string, projectId: number) {
  await setFlag(moduleKey, projectId, true, 1, 1);
}
`,
    );

    const viPham = quetTests(goc);
    const chiTiet = viPham.map((v) => `${v.tep}:${v.dong}`);

    assert.ok(
      viPham.some((v) => v.chiTiet.includes("created_by") && v.chiTiet.includes("1")),
      `Phải bắt được ca 1 (SQL literal created_by=1): ${chiTiet.join(", ")}`,
    );
    assert.ok(
      viPham.some((v) => v.chiTiet.includes("setFlag")),
      `Phải bắt được ca 2 (setFlag actorId=1): ${chiTiet.join(", ")}`,
    );
    assert.equal(viPham.length, 2, `Phải bắt đúng 2 vi phạm, không thừa: ${chiTiet.join(", ")}`);
  } finally {
    rmSync(goc, { recursive: true, force: true });
  }
});

test("bộ quét BỎ QUA mã hợp lệ (id động từ tao*(), cột không có FK thật)", () => {
  const goc = dungFixture();
  try {
    writeFileSync(
      join(goc, "tests", "hop-le.test.ts"),
      `import { insertId } from "@/lib/db";
import { setFlag } from "@/lib/setFlag";
import { setPermissionOverride } from "@/lib/setPermissionOverride";

async function taoUser(): Promise<{ id: number }> {
  const id = await insertId(\`INSERT INTO users (name) VALUES ('x')\`);
  return { id };
}

// Đúng cách: id từ tao*() qua tham số \`?\`, không phải hằng cứng trong SQL.
async function hopLe1() {
  const u = await taoUser();
  await insertId(
    \`INSERT INTO boq_norms (created_by) VALUES (?)\`,
    u.id,
  );
}

// Đúng cách: actorId động, không phải hằng cứng.
async function hopLe2(moduleKey: string, projectId: number) {
  const u = await taoUser();
  await setFlag(moduleKey, projectId, true, u.id, 1);
}

// Cột KHÔNG có FK thật tới users (role_permissions.updated_by) — hằng cứng ở đây KHÔNG có
// nguy cơ vỡ khi user bị xoá, không phải lớp lỗi đang chặn.
async function hopLe3() {
  await setPermissionOverride("pm", "manageX", 1);
}
`,
    );

    const viPham = quetTests(goc);
    assert.deepEqual(
      viPham,
      [],
      `Không được báo vi phạm trên mã hợp lệ: ${viPham.map((v) => `${v.tep}:${v.dong} ${v.chiTiet}`).join(", ")}`,
    );
  } finally {
    rmSync(goc, { recursive: true, force: true });
  }
});
