import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Bổ sung cho app/api/engineering/cad/boq-map/route.ts — tests/cad-boq-map.test.ts (M101 PR4)
// đã phủ route-source (401/403/không nhận token) + lib ghi/đọc map + boq-snapshot qua handler
// thật, nhưng CHƯA kiểm PHÉP HỢP (composition) chính xác của GET /boq-map: route tự lắp
// `danhSachItemBocTach()` (tên/nhóm/đơn vị từ rule pack) với `laySnapshotBoqTheoDuAn()` (mã đã
// gán + KL hợp đồng đối chiếu) thành đúng hình dạng { takeoffItemId, ten, nhom, donVi, boqCode,
// tenBoq, klBoq } mà UI đọc — và CHƯA kiểm rate-limit key/thứ tự 409 "chưa chọn dự án" của PUT.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const S = { skip: !HAS_TEST_DB };

function nguon(): string {
  return readFileSync(
    join(process.cwd(), "app", "api", "engineering", "cad", "boq-map", "route.ts"),
    "utf8",
  );
}

// ===== Route-source bổ sung =====

test("route boq-map PUT: rate-limit đúng khoá `cad-boq-map:`, 409 khi chưa chọn dự án, 400 khi thiếu items", () => {
  const src = nguon();
  assert.match(src, /hitRateLimit\(`cad-boq-map:\$\{user\.id\}`, 30, 15\)/);
  assert.match(src, /status: 429/);
  assert.match(src, /Retry-After/);
  assert.match(src, /status: 409/);
  assert.match(src, /Chưa chọn dự án/);
  assert.match(src, /Array\.isArray\(body\.items\)/);
  assert.match(src, /status: 400/);

  const iPutFn = src.indexOf("export async function PUT");
  const doanPut = src.slice(iPutFn);
  const iUser = doanPut.indexOf("getCurrentUser()");
  const i401 = doanPut.indexOf("status: 401");
  const iRole = doanPut.indexOf("isAdminOrPm(user.role)");
  const i403 = doanPut.indexOf("status: 403");
  const iRate = doanPut.indexOf("hitRateLimit(");
  const i429 = doanPut.indexOf("status: 429");
  const iProject = doanPut.indexOf("getCurrentProjectId(user)");
  const i409 = doanPut.indexOf("status: 409");
  assert.ok(
    iUser < i401 &&
      i401 < iRole &&
      iRole < i403 &&
      i403 < iRate &&
      iRate < i429 &&
      i429 < iProject &&
      iProject < i409,
    "PUT phải đúng thứ tự: đăng nhập → quyền Admin/PM → rate-limit → chọn dự án",
  );
});

test("route boq-map GET: lắp đúng danhSachItemBocTach + laySnapshotBoqTheoDuAn thành từng dòng UI", () => {
  const src = nguon();
  assert.match(src, /danhSachItemBocTach\(\)\.map/);
  assert.match(src, /laySnapshotBoqTheoDuAn\(projectId\)/);
  assert.match(src, /takeoffItemId: i\.id/);
  assert.match(src, /ten: i\.name/);
  assert.match(src, /nhom: i\.group/);
  assert.match(src, /donVi: i\.unit/);
  assert.match(src, /boqCode: d\?\.boqCode \?\? ""/);
  assert.match(src, /tenBoq: d\?\.ten \?\? null/);
  assert.match(src, /klBoq: d\?\.qtyContract \?\? null/);
});

// ===== Integration: tái hiện đúng phép hợp của GET (như tests/cad-takeoff-export-route.test.ts) =====

let pmId = 0;
let duAn = 0;

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, run } = await import("@/lib/db");
  const dau = Date.now();
  duAn = await insertId(
    `INSERT INTO projects (name, code, org_id) VALUES ('BOQ map compose', 'BMC-${dau}', 1)`,
  );
  pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('PM compose BOQ', 'boqmap-compose-${dau}@test.local', 'x', 'pm', 1)`,
  );
});

after(async () => {
  if (!HAS_TEST_DB || !pmId) return;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM cad_takeoff_boq_map WHERE project_id = ?`, duAn);
  await run(`DELETE FROM boq_items WHERE project_id = ?`, duAn);
  await run(`DELETE FROM users WHERE id = ?`, pmId);
  await run(`DELETE FROM projects WHERE id = ?`, duAn);
});

test(
  "GET boq-map (tái hiện phép hợp của route): item chưa gán mã → boqCode rỗng/tenBoq null/klBoq null; " +
    "item đã gán mã khớp dòng BOQ → đủ tên + KL hợp đồng; mã gán nhưng KHÔNG khớp dòng nào → tenBoq/klBoq vẫn null",
  S,
  async () => {
    const { danhSachItemBocTach, ghiMapBoqTheoDuAn } = await import("@/lib/ky-thuat/cad/dashboard");
    const { laySnapshotBoqTheoDuAn } = await import("@/lib/dich-vu/cad");
    const { insertId } = await import("@/lib/db");

    const items = danhSachItemBocTach();
    assert.ok(
      items.length >= 2,
      "rule pack phải có ít nhất 2 hạng mục bóc tách để test có ý nghĩa",
    );
    const [it1, it2] = items;

    const maKhop = `BMC-KHOP-${Date.now()}`;
    await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id)
       VALUES (?, 'Ống gió cấp — hợp đồng', 'm', 88.25, 0, ?)`,
      maKhop,
      duAn,
    );
    await ghiMapBoqTheoDuAn(duAn, pmId, [
      { takeoffItemId: it1.id, boqCode: maKhop },
      { takeoffItemId: it2.id, boqCode: `BMC-KHONG-KHOP-${Date.now()}` }, // gán mã nhưng không có dòng BOQ nào mang mã đó
    ]);

    const snapshot = await laySnapshotBoqTheoDuAn(duAn);
    const theoId = new Map(snapshot.dong.map((d) => [d.takeoffItemId, d]));

    // Tái hiện ĐÚNG khối .map() trong route GET.
    const rows = items.map((i) => {
      const d = theoId.get(i.id);
      return {
        takeoffItemId: i.id,
        ten: i.name,
        nhom: i.group,
        donVi: i.unit,
        boqCode: d?.boqCode ?? "",
        tenBoq: d?.ten ?? null,
        klBoq: d?.qtyContract ?? null,
      };
    });

    const dong1 = rows.find((r) => r.takeoffItemId === it1.id)!;
    assert.equal(dong1.boqCode, maKhop);
    assert.equal(dong1.tenBoq, "Ống gió cấp — hợp đồng");
    assert.equal(dong1.klBoq, 88.25);
    assert.equal(dong1.ten, it1.name);
    assert.equal(dong1.nhom, it1.group);
    assert.equal(dong1.donVi, it1.unit);

    const dong2 = rows.find((r) => r.takeoffItemId === it2.id)!;
    assert.notEqual(dong2.boqCode, "", "đã gán mã thì boqCode không được rỗng");
    assert.equal(
      dong2.tenBoq,
      null,
      "mã gán không khớp dòng BOQ nào → tenBoq null, không phải chuỗi rỗng",
    );
    assert.equal(dong2.klBoq, null, "mã gán không khớp dòng BOQ nào → klBoq null, KHÔNG suy ra 0");

    // Hạng mục thứ 3 trở đi (nếu có) chưa gán mã nào → boqCode rỗng đúng theo hợp đồng UI.
    for (const r of rows.slice(2)) {
      assert.equal(r.boqCode, "");
      assert.equal(r.tenBoq, null);
      assert.equal(r.klBoq, null);
    }
  },
);
