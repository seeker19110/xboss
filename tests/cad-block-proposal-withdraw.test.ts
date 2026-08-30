import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Thu hồi đề xuất block (bổ sung sau M103) — người gửi tự rút lại đề xuất SAI của chính mình
// khi còn "pending". Admin/PM vẫn dùng route reject sẵn có để từ chối đề xuất của người khác.
//
// (1) Route-source: force-dynamic, getCurrentUser, KHÔNG nhận token thiết bị, đủ mã lỗi.
//     Route CHỈ gọi getCurrentUser() (next/headers cookies()) — như approve/reject cùng thư
//     mục, KHÔNG gọi handler trực tiếp trong test (ngoài request scope thật sẽ throw, xem
//     ghi chú ở cuối tests/cad-block-proposals.test.ts) — kiểm hành vi qua `thuHoiDeXuat` (lib
//     mà route uỷ quyền toàn bộ logic) + kiểm mã trạng thái/điều kiện ở mức nguồn.
// (2) Integration (TEST_DATABASE_URL, tự skip): not-found / forbidden (403) / withdrawn (200,
//     đổi trạng thái) / conflict (409, đã duyệt hoặc từ chối) qua `thuHoiDeXuat`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const S = { skip: !HAS_TEST_DB };

// ===== (1) Route-source =====

function nguon(): string {
  return readFileSync(
    join(
      process.cwd(),
      "app",
      "api",
      "engineering",
      "cad",
      "block-proposals",
      "[id]",
      "withdraw",
      "route.ts",
    ),
    "utf8",
  );
}

test("route withdraw: force-dynamic, getCurrentUser, đủ 400/401/403/404/409, không nhận token thiết bị", () => {
  const src = nguon();
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 400/);
  assert.match(src, /status: 401/);
  assert.match(src, /status: 403/);
  assert.match(src, /status: 404/);
  assert.match(src, /status: 409/);
  assert.ok(!src.includes("getCadTokenUser"), "route withdraw không được nhận token thiết bị");
  assert.match(src, /thuHoiDeXuat/, "route phải uỷ quyền logic cho lib thuHoiDeXuat");
  // Chỉ chính chủ mới thu hồi được — route KHÔNG được kiểm quyền qua CAN.approve như reject/
  // approve (đó là đường của Admin/PM), thu hồi là hành động của người gửi.
  assert.ok(
    !src.includes("CAN.approve"),
    "route withdraw không được yêu cầu quyền duyệt — chỉ chính chủ mới thu hồi được",
  );
});

// ===== (2) Integration — hành vi thật của lib mà route uỷ quyền =====

let pmId = 0;
let ownerId = 0;
let khacId = 0;

async function xoaSach() {
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM cad_block_proposals WHERE proposed_by IN (?, ?, ?)`,
    pmId,
    ownerId,
    khacId,
  );
}

async function taoDeXuatPending(proposedBy: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const { createHash } = await import("node:crypto");
  const ten = `XB-WD-TEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return insertId(
    `INSERT INTO cad_block_proposals
       (block_name, kind, system_id, takeoff_item_id, base_lib_version, candidate_manifest,
        candidate_storage_key, candidate_dwg_sha256, status, proposed_by)
     VALUES (?, 'fitting', 'HVAC', 'duct-fitting', 'b0-test', ?::jsonb, ?, ?, 'pending', ?)`,
    ten,
    JSON.stringify({ version: "b0-test", blocks: [] }),
    `test-key-${ten}.dwg`,
    createHash("sha256").update(ten).digest("hex"),
    proposedBy,
  );
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const dau = Date.now();
  pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('PM thu hồi', 'bpw-pm-${dau}@test.local', 'x', 'pm', 1)`,
  );
  ownerId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Kỹ sư đề xuất', 'bpw-owner-${dau}@test.local', 'x', 'engineer', 1)`,
  );
  khacId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Kỹ sư khác', 'bpw-khac-${dau}@test.local', 'x', 'engineer', 1)`,
  );
});

after(async () => {
  if (!HAS_TEST_DB || !pmId) return;
  const { run } = await import("@/lib/db");
  await xoaSach();
  await run(`DELETE FROM users WHERE id IN (?, ?, ?)`, pmId, ownerId, khacId);
});

test("thuHoiDeXuat: id không tồn tại → not-found (route trả 404)", S, async () => {
  const { thuHoiDeXuat } = await import("@/lib/ky-thuat/cad/block");
  const kq = await thuHoiDeXuat({ id: 999999999, userId: ownerId });
  assert.equal(kq.status, "not-found");
});

test(
  "thuHoiDeXuat: người khác thu hồi → forbidden (route trả 403), không đổi trạng thái",
  S,
  async () => {
    await xoaSach();
    const id = await taoDeXuatPending(ownerId);
    const { thuHoiDeXuat } = await import("@/lib/ky-thuat/cad/block");
    const kq = await thuHoiDeXuat({ id, userId: khacId });
    assert.equal(kq.status, "forbidden");

    const { queryOne } = await import("@/lib/db");
    const dx = await queryOne<{ status: string }>(
      `SELECT status FROM cad_block_proposals WHERE id = ?`,
      id,
    );
    assert.equal(dx?.status, "pending", "trạng thái không được đổi khi người khác thu hồi");
  },
);

test(
  "thuHoiDeXuat: chính chủ thu hồi đề xuất pending → withdrawn (route trả 200), trạng thái đổi",
  S,
  async () => {
    await xoaSach();
    const id = await taoDeXuatPending(ownerId);
    const { thuHoiDeXuat, layDanhSachDeXuat } = await import("@/lib/ky-thuat/cad/block");
    const kq = await thuHoiDeXuat({ id, userId: ownerId });
    assert.equal(kq.status, "withdrawn");

    const { queryOne } = await import("@/lib/db");
    const dx = await queryOne<{ status: string }>(
      `SELECT status FROM cad_block_proposals WHERE id = ?`,
      id,
    );
    assert.equal(dx?.status, "withdrawn");

    // Thu hồi lại lần nữa → không còn pending → conflict (route trả 409).
    const lai = await thuHoiDeXuat({ id, userId: ownerId });
    assert.equal(lai.status, "conflict");

    // Vẫn liệt kê được (không bị xoá dòng) — người gửi thấy lịch sử đề xuất đã rút.
    const ds = await layDanhSachDeXuat({ chiNguoiDeXuat: ownerId });
    assert.ok(ds.some((d) => d.id === id && d.status === "withdrawn"));
  },
);

test(
  "thuHoiDeXuat: đề xuất đã từ chối/duyệt → conflict (route trả 409), không thu hồi được",
  S,
  async () => {
    await xoaSach();
    const idDaTuChoi = await taoDeXuatPending(ownerId);
    const { run } = await import("@/lib/db");
    await run(
      `UPDATE cad_block_proposals
          SET status = 'rejected', reject_reason = 'x', decided_by = ?, decided_at = now()
        WHERE id = ?`,
      pmId,
      idDaTuChoi,
    );

    const { thuHoiDeXuat } = await import("@/lib/ky-thuat/cad/block");
    const kq = await thuHoiDeXuat({ id: idDaTuChoi, userId: ownerId });
    assert.equal(kq.status, "conflict");

    const { queryOne } = await import("@/lib/db");
    const dx = await queryOne<{ status: string }>(
      `SELECT status FROM cad_block_proposals WHERE id = ?`,
      idDaTuChoi,
    );
    assert.equal(dx?.status, "rejected", "trạng thái rejected không bị thu hồi ghi đè");
  },
);
