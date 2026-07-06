import { HAS_TEST_DB } from "./setup"; // phải đứng đầu
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, makeToken } from "@/lib/auth";

// ===== Unit tests: hash + verify mật khẩu =====

test("hashPassword: hash khác nhau mỗi lần (do salt ngẫu nhiên)", () => {
  const h1 = hashPassword("abc123");
  const h2 = hashPassword("abc123");
  assert.notEqual(h1, h2, "Salt phải khác nhau mỗi lần");
});

test("verifyPassword: đúng mật khẩu trả true", () => {
  const hash = hashPassword("secret");
  assert.equal(verifyPassword("secret", hash), true);
});

test("verifyPassword: sai mật khẩu trả false", () => {
  const hash = hashPassword("secret");
  assert.equal(verifyPassword("wrong", hash), false);
});

test("verifyPassword: hash rỗng / không hợp lệ trả false", () => {
  assert.equal(verifyPassword("secret", ""), false);
  assert.equal(verifyPassword("secret", "onlyonesegment"), false);
});

test("makeToken: token chứa userId + pwFrag + exp", () => {
  process.env.XBOSS_SECRET = "test-secret-for-unit";
  const hash = hashPassword("pw");
  const token = makeToken(42, hash);
  const parts = token.split(".");
  assert.equal(parts.length, 4, "Token phải có 4 phần");
  assert.equal(parts[0], "42", "phần đầu là userId");
  assert.equal(parts[2], hash.slice(0, 12), "phần 3 là pwFrag");
});

// ===== Integration tests: DB =====

test("ensureDefaultUsers: tạo 4 tài khoản demo trong dev", { skip: !HAS_TEST_DB }, async () => {
  const { run, queryOne, withTransaction } = await import("@/lib/db");
  const { ensureDefaultUsers, _resetDefaultUsersCacheForTests } = await import("@/lib/auth");

  // `DELETE FROM users` xoá SẠCH bảng dùng chung giữa mọi file test — nếu chạy đúng
  // lúc file khác đang có user chưa commit/chưa dọn (FK từ work_packages/tasks/...),
  // xoá này gây lỗi FK ở NGAY FILE ĐÓ dù không liên quan gì tới test này (đã thấy thật
  // trong CI: work_packages_assigned_to_fkey/contracts_created_by_fkey vỡ giữa chừng).
  // Bọc trong transaction rồi luôn rollback (ném sentinel ở cuối, nuốt lại bên ngoài)
  // để hành vi test giữ nguyên (bảng "trống" theo góc nhìn trong transaction) nhưng
  // không bao giờ ảnh hưởng tới dữ liệu thật của file test khác đang chạy song song.
  //
  // Cũng phải reset cache in-process `defaultUsersEnsured`: nhiều file test chạy chung
  // 1 process (tsx --test nhiều file cùng lúc) — nếu file khác lỡ gọi ensureDefaultUsers()
  // trước (hoặc DB đã có user do file khác tạo lúc COUNT(*) kiểm tra), cờ bật sớm khiến
  // hàm return ngay mà không thật sự seed, làm assertion dưới đây luôn fail.
  const ROLLBACK_SENTINEL = Symbol("rollback");
  await withTransaction(async () => {
    await run(`DELETE FROM users`);
    _resetDefaultUsersCacheForTests();
    await ensureDefaultUsers();

    const admin = await queryOne<{ email: string; role: string }>(
      `SELECT email, role FROM users WHERE email = 'admin@xboss.vn'`,
    );
    assert.ok(admin, "Admin phải tồn tại");
    assert.equal(admin.role, "admin");

    throw ROLLBACK_SENTINEL;
  }).catch((e) => {
    if (e !== ROLLBACK_SENTINEL) throw e;
  });
});

test("password change invalidates old token (pwFrag check)", { skip: !HAS_TEST_DB }, async () => {
  const { run, insertId, queryOne } = await import("@/lib/db");
  const { hashPassword: hp, makeToken: mt } = await import("@/lib/auth");

  const pw1 = "password1";
  const hash1 = hp(pw1);
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Test','token@test.vn',?,'engineer')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    hash1,
  );

  const token = mt(userId, hash1);
  const pwFrag = hash1.slice(0, 12);

  // Trước khi đổi mật khẩu: pwFrag khớp
  const u1 = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  assert.ok(u1?.password_hash.startsWith(pwFrag), "Token cũ phải hợp lệ trước khi đổi mật khẩu");

  // Đổi mật khẩu
  const hash2 = hp("newpassword2");
  await run(`UPDATE users SET password_hash = ? WHERE id = ?`, hash2, userId);

  // Sau khi đổi: hash mới không bắt đầu bằng pwFrag cũ → token cũ vô hiệu
  const u2 = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  assert.ok(!u2?.password_hash.startsWith(pwFrag), "Token cũ phải bị vô hiệu sau khi đổi mật khẩu");

  // Cleanup
  await run(`DELETE FROM users WHERE id = ?`, userId);
  void token; // suppress unused warning
});

test("material issue: race condition không xuất quá tồn kho", { skip: !HAS_TEST_DB }, async () => {
  const { run, insertId, queryOne } = await import("@/lib/db");
  const { withTransaction } = await import("@/lib/db");

  // Setup: project → tower → sheet → material với qty_stock = 5
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test race')`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'T')`,
    projectId,
  );
  const stId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'TR', 'Test Race')`,
    towerId,
  );
  const matId = await insertId(
    `INSERT INTO materials (sheet_type_id, name, qty_stock, qty_used) VALUES (?, 'Vật tư test', 5, 0)`,
    stId,
  );

  // Giả lập 2 request đồng thời xuất 4 đơn vị — cộng lại = 8 > 5 tồn kho.
  // Với FOR UPDATE, chỉ 1 trong 2 thành công.
  const issue = async (qty: number) =>
    withTransaction(async () => {
      const mat = await queryOne<{ qty_stock: number; qty_used: number }>(
        `SELECT COALESCE(qty_stock,0) AS qty_stock, qty_used FROM materials WHERE id = ? FOR UPDATE`,
        matId,
      );
      if (!mat || qty > mat.qty_stock) return false;
      await run(
        `UPDATE materials SET qty_stock = ?, qty_used = ? WHERE id = ?`,
        mat.qty_stock - qty,
        mat.qty_used + qty,
        matId,
      );
      return true;
    });

  const [r1, r2] = await Promise.all([issue(4), issue(4)]);
  const ok = (r1 ? 1 : 0) + (r2 ? 1 : 0);
  assert.equal(ok, 1, "Chỉ đúng 1 request được xuất kho thành công");

  const final = await queryOne<{ qty_stock: number }>(
    `SELECT qty_stock FROM materials WHERE id = ?`,
    matId,
  );
  assert.equal(final?.qty_stock, 1, "Tồn kho còn lại phải là 1 (5 - 4)");

  // Cleanup
  await run(`DELETE FROM materials WHERE id = ?`, matId);
  await run(`DELETE FROM sheet_types WHERE id = ?`, stId);
  await run(`DELETE FROM towers WHERE id = ?`, towerId);
  await run(`DELETE FROM projects WHERE id = ?`, projectId);
});
