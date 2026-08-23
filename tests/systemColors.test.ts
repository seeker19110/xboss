import { test } from "node:test";
import assert from "node:assert/strict";
import { systemColorClasses } from "@/lib/nen/systemColors";

test("systemColorClasses: trả đúng bộ class cho từng khoá màu đã biết", () => {
  assert.deepEqual(systemColorClasses("zinc"), {
    dot: "bg-zinc-400",
    border: "border-zinc-400",
    text: "text-zinc-300",
  });
  assert.deepEqual(systemColorClasses("amber"), {
    dot: "bg-amber-400",
    border: "border-amber-400",
    text: "text-amber-300",
  });
  assert.deepEqual(systemColorClasses("sky"), {
    dot: "bg-sky-400",
    border: "border-sky-400",
    text: "text-sky-300",
  });
  assert.deepEqual(systemColorClasses("violet"), {
    dot: "bg-violet-400",
    border: "border-violet-400",
    text: "text-violet-300",
  });
  assert.deepEqual(systemColorClasses("emerald"), {
    dot: "bg-emerald-400",
    border: "border-emerald-400",
    text: "text-emerald-300",
  });
  assert.deepEqual(systemColorClasses("rose"), {
    dot: "bg-rose-400",
    border: "border-rose-400",
    text: "text-rose-300",
  });
});

test("systemColorClasses: màu không xác định/null/undefined đều fallback về zinc", () => {
  const zinc = systemColorClasses("zinc");
  assert.deepEqual(systemColorClasses("khong-ton-tai"), zinc);
  assert.deepEqual(systemColorClasses(null), zinc);
  assert.deepEqual(systemColorClasses(undefined), zinc);
  assert.deepEqual(systemColorClasses(), zinc);
});
