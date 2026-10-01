import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { docBuocCi } from "../scripts/lib/gate-steps";

// `npm run gate` (ADR-0012) đọc danh sách cổng từ job `static` của ci.yml thay vì chép tay — test
// chứng minh parser nhận đủ cổng thật của repo (nếu ai đổi cách viết ci.yml làm parser "mù",
// gate sẽ báo xanh giả: đúng lớp lỗi check:db-params từng mắc, xem TRAPS.md §4).

test("đọc đủ các cổng cốt lõi từ job static của ci.yml thật", () => {
  const buoc = docBuocCi(readFileSync(".github/workflows/ci.yml", "utf8"));
  const scripts = buoc.map((b) => b.script);
  for (const s of [
    "format:check",
    "lint",
    "typecheck",
    "check:migrations",
    "check:lib-layers",
    "check:route-perms",
    "check:project-scope",
    "check:db-params",
    "check:hex-hardcode",
    "check:ui-ux-guard",
  ]) {
    assert.ok(scripts.includes(s), `gate thiếu cổng ${s} — parser không còn khớp ci.yml`);
  }
  assert.ok(!scripts.includes("ci"), "không được lấy npm ci");
  // Mọi script đọc được phải tồn tại trong package.json (gate gọi npm run <script>).
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  for (const s of scripts) assert.ok(pkg.scripts[s], `package.json thiếu script ${s}`);
});

test("chỉ lấy run 1 dòng 'npm run' trong đúng job, dừng ở job kế tiếp", () => {
  const yaml = [
    "jobs:",
    "  static:",
    "    steps:",
    "      - name: Cài",
    "        run: npm ci",
    "      - name: Audit",
    "        run: |",
    "          npm audit",
    '      - name: "Lint"',
    "        run: npm run lint",
    "      - uses: actions/checkout@abc",
    "      - name: Kiểm A",
    "        run: npm run check:a",
    "  test:",
    "    steps:",
    "      - name: Test",
    "        run: npm run test",
  ].join("\n");
  assert.deepEqual(docBuocCi(yaml), [
    { ten: "Lint", script: "lint" },
    { ten: "Kiểm A", script: "check:a" },
  ]);
  assert.throws(() => docBuocCi(yaml, "khong-co"), /Không thấy job/);
});
