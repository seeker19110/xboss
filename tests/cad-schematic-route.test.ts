import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// tests/cad-schematic-route.test.ts — M117 PR2 (§7 FR5, §8 AC2/AC4): 4 route của sơ đồ nguyên lý.
//
// (1) Route-source: mọi route mới phải có `force-dynamic` + `getCurrentUser()` + 401 (DoD dự án);
//     route plugin phải xác thực ghép máy và chặn graph chưa chốt bằng 409 (AC4).
// (2) Vòng đời thật trên DB (tự skip khi thiếu TEST_DATABASE_URL): nạp DXF → sửa → chốt → khoá,
//     chạy với AI TẮT để chứng minh pipeline vẫn trọn vẹn (AC2).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GOC = "app/api/engineering/cad/schematic";
const ROUTES = [`${GOC}/route.ts`, `${GOC}/[id]/route.ts`, `${GOC}/[id]/plugin/route.ts`];

// ── (1) Route-source ─────────────────────────────────────────────────────────

test("mọi route schematic đều force-dynamic và kiểm phiên trước khi làm gì", () => {
  for (const r of ROUTES) {
    const src = readFileSync(join(process.cwd(), r), "utf8");
    assert.match(src, /export const dynamic = "force-dynamic";/, `${r} thiếu force-dynamic`);
    assert.match(src, /getCurrentUser\(\)/, `${r} không kiểm phiên`);
    assert.match(src, /status: 401/, `${r} không trả 401 khi chưa đăng nhập`);
    assert.match(src, /CAN\./, `${r} không kiểm quyền qua CAN`);
  }
});

test("route nạp: whitelist .dxf, trần 50MB, chốt lại id dự án, rate limit", () => {
  const src = readFileSync(join(process.cwd(), `${GOC}/route.ts`), "utf8");
  assert.match(src, /\.dxf/, "phải whitelist đuôi .dxf");
  assert.match(src, /50 \* 1024 \* 1024/, "trần tệp 50MB theo M117 §7 FR1");
  assert.match(src, /chotProjectIdChoGhi/, "không tin project_id client gửi");
  assert.match(src, /hitRateLimit/, "nạp schematic là thao tác nặng, phải có rate limit");
  assert.match(src, /storagePut/, "tệp gốc đi qua lớp lưu trữ chung");
});

test("AC4: route plugin xác thực ghép máy và trả 409 khi graph chưa chốt", () => {
  const src = readFileSync(join(process.cwd(), `${GOC}/[id]/plugin/route.ts`), "utf8");
  assert.match(src, /getCadTokenUser/, "plugin phải xác thực bằng token thiết bị đã ghép");
  assert.match(src, /trangThai !== "da_duyet"/, "chỉ trả graph đã chốt");
  assert.match(src, /status: 409/, "chưa chốt phải là 409");
});

// ── (2) Vòng đời thật trên DB ────────────────────────────────────────────────

const S = { skip: !HAS_TEST_DB };

/** DXF nhỏ: hai đoạn nối tiếp + một nhãn kích thước — đủ để tầng 1 dựng cạnh. */
const DXF_MAU = [
  "0",
  "SECTION",
  "2",
  "ENTITIES",
  "0",
  "LINE",
  "8",
  "M-DUCT",
  "10",
  "0",
  "20",
  "0",
  "30",
  "0",
  "11",
  "1000",
  "21",
  "0",
  "31",
  "0",
  "0",
  "LINE",
  "8",
  "M-DUCT",
  "10",
  "1000",
  "20",
  "0",
  "30",
  "0",
  "11",
  "1000",
  "21",
  "800",
  "31",
  "0",
  "0",
  "ENDSEC",
  "0",
  "EOF",
].join("\n");

let duAn = 0;
let nguoi = 0;
let khoaAi: string | undefined;

before(async () => {
  if (!HAS_TEST_DB) return;
  // AC2: chạy trọn vòng đời với AI TẮT — không lượt gọi mạng nào trong CI.
  khoaAi = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const { insertId } = await import("@/lib/db");
  duAn = await insertId(`INSERT INTO projects (name) VALUES ('Schematic PR2')`);
  nguoi = await insertId(
    `INSERT INTO users (name, email, role, password_hash) VALUES ('Schematic PR2', ?, 'pm', 'x')`,
    `schematic-pr2-${Date.now()}@x.vn`,
  );
});

after(async () => {
  if (!HAS_TEST_DB) return;
  if (khoaAi !== undefined) process.env.ANTHROPIC_API_KEY = khoaAi;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM cad_schematic_graphs WHERE project_id = ?`, duAn);
  await run(`DELETE FROM users WHERE id = ?`, nguoi);
  await run(`DELETE FROM projects WHERE id = ?`, duAn);
});

test("AC2: nạp → sửa → chốt → khoá, chạy trọn với AI tắt", S, async () => {
  const { taoGraphSchematic, layGraphSchematic, suaGraphSchematic } =
    await import("@/lib/dich-vu/cad");

  const tao = await taoGraphSchematic({
    projectId: duAn,
    userId: nguoi,
    systemId: "HVAC",
    filePath: "schematic-pr2.dxf",
    dxf: DXF_MAU,
  });
  assert.equal(tao.aiDaChay, false, "AI tắt thì tầng 2 không chạy");
  assert.ok(tao.graph.edges.length >= 1, "tầng 1 vẫn dựng được cạnh");

  const ban = await layGraphSchematic(duAn, tao.id);
  assert.ok(ban);
  assert.equal(ban.trangThai, "nhap");
  assert.equal(ban.systemId, "HVAC");
  assert.equal(ban.graph.version, tao.graph.version, "graph đọc lại từ JSONB giữ nguyên hình dạng");

  const canhId = ban.graph.edges[0].id;
  const sua = await suaGraphSchematic({
    projectId: duAn,
    id: tao.id,
    userId: nguoi,
    sua: { nodes: [], edges: [{ id: canhId, size: "DN100" }] },
    duyet: true,
  });
  assert.equal(sua.status === "ok" ? sua.ban.trangThai : "", "da_duyet");
  assert.ok(sua.status === "ok" && sua.ban.duyetBoi === nguoi && sua.ban.duyetLuc);
  assert.equal(
    sua.status === "ok" ? sua.ban.graph.edges[0].size : null,
    "DN100",
    "sửa tay phải nằm trong cột graph",
  );

  // Đã chốt là khoá: plugin đang dùng bản này, đổi sau lưng là lớp lỗi "dữ liệu đổi mà không ai biết".
  const lai = await suaGraphSchematic({
    projectId: duAn,
    id: tao.id,
    userId: nguoi,
    sua: { nodes: [], edges: [] },
    duyet: true,
  });
  assert.equal(lai.status, "da-duyet");

  // Dự án khác không đọc được (RLS + điều kiện project_id ở tầng app).
  assert.equal(await layGraphSchematic(duAn + 100000, tao.id), null);
});

test("audit: mọi thao tác trên graph vào audit_log qua trigger 0147", S, async () => {
  const { query, withProjectScope } = await import("@/lib/db");
  const rows = await withProjectScope(duAn, () =>
    query<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity_type = 'cad_schematic_graphs' AND project_id = ?`,
      duAn,
    ),
  );
  const hanhDong = rows.map((r) => r.action);
  assert.ok(hanhDong.includes("INSERT"), "nạp graph phải để lại dấu");
  assert.ok(hanhDong.includes("UPDATE"), "sửa/chốt graph phải để lại dấu");
});
