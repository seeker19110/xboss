import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M108 PR3 — route nạp lô + duyệt lô.
// (1) Route-source: mọi route mới phải có `force-dynamic` + `getCurrentUser()` (DoD của dự án).
// (2) Kiểm đầu vào của route, đã hạ xuống lib để test được ngoài request scope của Next.
// (3) Hàng rào a11y/bảo mật của panel + tính toàn vẹn của bộ đối chứng AC3.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DOI_CHUNG = join(process.cwd(), "plugin-autocad", "doi-chung");

const GOC = "app/api/engineering/cad/block-proposals/batch";
const ROUTES = [
  `${GOC}/route.ts`,
  `${GOC}/[id]/route.ts`,
  `${GOC}/[id]/approve/route.ts`,
  `${GOC}/[id]/reject/route.ts`,
];

// ── (1) Route-source ─────────────────────────────────────────────────────────

test("mọi route lô đều force-dynamic và kiểm phiên trước khi làm gì", () => {
  for (const r of ROUTES) {
    const src = readFileSync(join(process.cwd(), r), "utf8");
    assert.match(src, /export const dynamic = "force-dynamic";/, `${r} thiếu force-dynamic`);
    assert.match(src, /await getCurrentUser\(\)/, `${r} không kiểm phiên`);
    assert.match(src, /status: 401/, `${r} không trả 401 khi chưa đăng nhập`);
  }
});

test("route duyệt/từ chối dùng CAN.approve (hẹp hơn quyền nạp)", () => {
  for (const r of [`${GOC}/[id]/approve/route.ts`, `${GOC}/[id]/reject/route.ts`]) {
    const src = readFileSync(join(process.cwd(), r), "utf8");
    assert.match(src, /CAN\.approve\(user\.role\)/, `${r} phải giới hạn ở quyền duyệt`);
  }
  const nap = readFileSync(join(process.cwd(), `${GOC}/route.ts`), "utf8");
  assert.match(nap, /CAN\.manageDrawings\(user\.role\)/);
  assert.match(nap, /hitRateLimit/, "nạp lô là thao tác nặng, phải có rate limit");
});

// ── (2) Kiểm đầu vào (thuần, ở lib) ─────────────────────────────────────────
//
// Route dùng `getCurrentUser()` (next/headers) nên KHÔNG gọi handler trực tiếp ngoài request scope
// thật — đúng quy ước đã ghi ở tests/cad-dashboard-panel-route.test.ts và tests/permissions.test.ts.
// Phần nghiệp vụ đã phủ ở tests/cad-block-lo.test.ts (nhận/duyệt/từ chối/stale trên DB thật); ở đây
// phủ lớp kiểm đầu vào mà route gọi xuống.

test("docSuaDong: chặn loại block lạ ngay ở cửa, không để lọt xuống DB", async () => {
  const { docSuaDong } = await import("@/lib/ky-thuat/cad/block");
  const kq = docSuaDong([{ id: 1, kind: "ống gió" }]);
  assert.ok("loi" in kq);
  assert.match(kq.loi, /ống gió/);
});

test("docSuaDong: nhận dạng hợp lệ, ép kiểu đúng, bỏ trường không khai", async () => {
  const { docSuaDong } = await import("@/lib/ky-thuat/cad/block");
  const kq = docSuaDong([
    { id: 3, kind: "fitting", systemId: "HVAC", chon: 1 },
    { id: 4, kind: null },
  ]);
  assert.ok(!("loi" in kq));
  assert.deepEqual(kq.sua[0], { id: 3, kind: "fitting", systemId: "HVAC", chon: true });
  assert.deepEqual(
    kq.sua[1],
    { id: 4, kind: null },
    "không khai trường nào thì không đụng trường đó",
  );
});

test("docSuaDong: body rác bị từ chối, không ném lỗi", async () => {
  const { docSuaDong } = await import("@/lib/ky-thuat/cad/block");
  assert.deepEqual(docSuaDong(undefined), { sua: [] });
  assert.ok("loi" in docSuaDong("chuỗi"));
  assert.ok("loi" in docSuaDong([null]));
  assert.ok("loi" in docSuaDong([{ kind: "fitting" }]), "thiếu id phải bị chặn");
  assert.ok("loi" in docSuaDong([{ id: -1 }]));
});

test("panel nạp lô KHÔNG dùng dangerouslySetInnerHTML cho ảnh xem trước", () => {
  const src = readFileSync(
    join(process.cwd(), "app/engineering/chuan-hoa-ban-ve/components/NapLoBlockPanel.tsx"),
    "utf8",
  );
  // Ảnh dựng từ bản vẽ do người ngoài nộp — phải đi qua <img src="data:"> như ThuVienBlockPanel.
  const dungThat = src
    .split("\n")
    .filter((d) => d.includes("dangerouslySetInnerHTML") && !d.trimStart().startsWith("//"));
  assert.deepEqual(dungThat, [], "SVG người ngoài nộp không được nhúng thẳng vào DOM");
  assert.match(src, /data:image\/svg\+xml;charset=utf-8/);
});

test("mọi route lô đều được UI gọi tới — route viết ra mà không ai gọi là tính năng dở dang", () => {
  const panel = readFileSync(
    join(process.cwd(), "app/engineering/chuan-hoa-ban-ve/components/NapLoBlockPanel.tsx"),
    "utf8",
  );
  // CI có cổng `check:dead-routes` bắt việc này, nhưng bắt ở đây thì thấy ngay lúc chạy test
  // thay vì đợi vòng CI. Chính ca `reject` đã lọt qua vòng đầu: route có, nút thì quên.
  for (const duong of [
    "/api/engineering/cad/block-proposals/batch",
    "/api/engineering/cad/block-proposals/batch/${chiTiet.lo.id}",
    "/api/engineering/cad/block-proposals/batch/${chiTiet.lo.id}/approve",
    "/api/engineering/cad/block-proposals/batch/${chiTiet.lo.id}/reject",
  ]) {
    assert.ok(panel.includes(duong), `bảng duyệt lô chưa gọi ${duong}`);
  }
  // Từ chối bắt buộc kèm lý do — cả hai phía đều chặn, không chỉ máy chủ.
  assert.match(panel, /disabled=\{dangGui \|\| !lyDoTuChoi\.trim\(\)\}/);
});

test("bộ đối chứng AC3 có đủ 3 lớp khó và chưa được tự nhận là đã xác nhận", () => {
  const doc = JSON.parse(
    readFileSync(join(DOI_CHUNG, "block-phan-loai-doi-chung.json"), "utf8"),
  ) as { nhanDaXacNhan: boolean; blocks: { lop: string }[] };
  assert.ok(doc.blocks.length >= 50, "§15.4 đòi ≥50 block");
  assert.deepEqual(
    [...new Set(doc.blocks.map((b) => b.lop))].sort(),
    ["A-chuan", "B-viet-tat-VN", "C-ten-vo-nghia"],
    "phải phủ đủ 3 lớp khó mà đặc tả nêu",
  );
  assert.equal(
    doc.nhanDaXacNhan,
    false,
    "nhãn do người viết code đặt — chỉ kỹ sư trưởng mới được bật cờ này (§18 R4)",
  );
});

test("thư mục route lô không có tệp thừa ngoài 4 route đã khai", () => {
  const co = new Set<string>();
  const quet = (d: string, tien: string) => {
    for (const e of readdirSync(join(process.cwd(), d), { withFileTypes: true })) {
      if (e.isDirectory()) quet(join(d, e.name), `${tien}${e.name}/`);
      else co.add(`${tien}${e.name}`);
    }
  };
  quet(GOC, "");
  assert.deepEqual([...co].sort(), [
    "[id]/approve/route.ts",
    "[id]/reject/route.ts",
    "[id]/route.ts",
    "route.ts",
  ]);
});
