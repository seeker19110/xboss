import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODULES } from "@/lib/modules";
import { isPermKey } from "@/lib/auth";

// Unit thuần trên bảng khai báo lib/modules.ts — KHÔNG chạm DB (không cần tests/setup.ts).
//
// Registry là "nguồn tra cứu duy nhất" các điểm chạm của mỗi module, nhưng trước PR này
// chưa có test nào giữ nó khỏi trôi khỏi thực tế: chỉ scripts/check-sw-exclude.ts kiểm
// đúng 1 trường (swExclude). Các invariant dưới đây bắt đúng những kiểu lệch đã từng xảy
// ra thật trong dự án: gõ sai tên quyền, trùng key/href khi copy-paste entry cũ.

test("MODULES: key duy nhất", () => {
  const keys = MODULES.map((m) => m.key);
  assert.deepEqual(
    keys.filter((k, i) => keys.indexOf(k) !== i),
    [],
    "có module trùng key",
  );
});

test("MODULES: mọi permKeys đều là quyền có thật trong map CAN (lib/auth.ts)", () => {
  const unknown = MODULES.flatMap((m) =>
    m.permKeys.filter((p) => !isPermKey(p)).map((p) => `${m.key}:${p}`),
  );
  assert.deepEqual(unknown, [], "permKeys không tồn tại trong CAN");
});

test("MODULES: routePrefix luôn bắt đầu bằng /api/", () => {
  const bad = MODULES.flatMap((m) =>
    m.routePrefix.filter((p) => !p.startsWith("/api/")).map((p) => `${m.key}:${p}`),
  );
  assert.deepEqual(bad, []);
});

test("MODULES: nav href bắt đầu bằng / và không trùng giữa các module", () => {
  const hrefs = MODULES.flatMap((m) => m.nav.map((n) => n.href));
  assert.deepEqual(
    hrefs.filter((h) => !h.startsWith("/")),
    [],
    "href phải là đường dẫn tuyệt đối",
  );
  assert.deepEqual(
    hrefs.filter((h, i) => hrefs.indexOf(h) !== i),
    [],
    "có href trùng giữa các module",
  );
});

test("MODULES: nav luôn đủ group/label/icon (không rỗng)", () => {
  for (const m of MODULES)
    for (const n of m.nav) {
      assert.ok(n.group.trim().length > 0, `${m.key}: nav thiếu group`);
      assert.ok(n.label.trim().length > 0, `${m.key}: nav thiếu label`);
      assert.ok(n.icon.trim().length > 0, `${m.key}: nav thiếu icon`);
    }
});

test("MODULES: mọi swExclude đều có thật trong public/sw.js", () => {
  // Cùng bất biến mà scripts/check-sw-exclude.ts gác ở CI — giữ luôn trong `npm test`
  // để lệch bị bắt ngay khi chạy test cục bộ, không phải đợi cổng CI riêng.
  const sw = readFileSync("public/sw.js", "utf8");
  const missing = MODULES.flatMap((m) => (m.swExclude ?? []).filter((p) => !sw.includes(p)));
  assert.deepEqual(missing, []);
});

test("MODULES: notificationTypes nằm trong 4 loại thật của /api/notifications", () => {
  const REAL = new Set(["delayed", "due_soon", "comment", "material_over"]);
  const bad = MODULES.flatMap((m) =>
    (m.notificationTypes ?? []).filter((t) => !REAL.has(t)).map((t) => `${m.key}:${t}`),
  );
  assert.deepEqual(bad, []);
});
