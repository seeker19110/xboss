import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M108 PR5 — gợi ý ánh xạ layerMap + boqCode (tái dùng cỗ máy ngữ nghĩa của tầng 2).
//
// Không gọi mạng: phủ hàng rào lọc đích bịa, hành vi khi AI tắt, và hai ranh giới KHÔNG ĐƯỢC PHÁ —
// route gợi ý không ghi rule pack (AC10) và không đụng cột tiền (AC11).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function voiAiTat<T>(fn: () => Promise<T>): Promise<T> {
  const cu = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const { _resetAiClient } = await import("@/lib/nen/ai");
  _resetAiClient();
  try {
    return await fn();
  } finally {
    if (cu !== undefined) process.env.ANTHROPIC_API_KEY = cu;
    _resetAiClient();
  }
}

test("layer đã đúng chuẩn thì không hỏi ai, không tốn một lượt gọi nào", async () => {
  const { goiYLayerMap } = await import("@/lib/dich-vu/cad-goi-y-anh-xa");
  const { tapLayerDaChuan } = await import("@/lib/ky-thuat/cad/dxf-parser");
  const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
  const daChuan = [...tapLayerDaChuan(getCurrentRulePack())].slice(0, 3);

  const kq = await goiYLayerMap(daChuan);
  assert.deepEqual(kq.goiY, []);
  assert.equal(kq.lyDoAiKhongChay, null, "không phải 'AI tắt' — đơn giản là không có gì để hỏi");
  assert.equal(kq.jsonDeDan, "");
});

test("AI tắt → trả danh sách rỗng kèm lý do, không ném lỗi", async () => {
  const { goiYLayerMap } = await import("@/lib/dich-vu/cad-goi-y-anh-xa");
  await voiAiTat(async () => {
    const kq = await goiYLayerMap(["LAYER-LA-HOAN-TOAN"]);
    assert.deepEqual(kq.goiY, []);
    assert.match(kq.lyDoAiKhongChay ?? "", /ANTHROPIC_API_KEY/);
  });
});

test("AC10: không có đường nào trong luồng gợi ý ghi vào rule pack", () => {
  const lib = readFileSync(join(process.cwd(), "lib/dich-vu/cad-goi-y-anh-xa.ts"), "utf8");
  const route = readFileSync(
    join(process.cwd(), "app/api/engineering/cad/layer-map-suggest/route.ts"),
    "utf8",
  );
  for (const [ten, src] of [
    ["lib", lib],
    ["route", route],
  ] as const) {
    assert.doesNotMatch(src, /writeFile|rule-packs\//, `${ten}: không được ghi tệp rule pack`);
    assert.doesNotMatch(src, /\bUPDATE\b|\bINSERT\b/, `${ten}: gợi ý không được ghi DB`);
  }
  assert.match(lib, /jsonDeDan/, "phải trả đoạn JSON để người tự dán");
});

test("AC11: luồng gợi ý mã BOQ không đọc một cột tiền nào", () => {
  const lib = readFileSync(join(process.cwd(), "lib/dich-vu/cad-goi-y-anh-xa.ts"), "utf8");
  const boq = readFileSync(join(process.cwd(), "lib/khoi-luong/boq.ts"), "utf8");
  const danhMuc = boq.slice(boq.indexOf("export async function danhMucBoqTheoDuAn"));
  for (const cotTien of ["unit_price", "sub_unit_price", "amount", "thanh_tien"]) {
    assert.ok(!lib.includes(cotTien), `lib gợi ý không được đụng cột "${cotTien}"`);
    assert.ok(!danhMuc.includes(cotTien), `danhMucBoqTheoDuAn không được đụng cột "${cotTien}"`);
  }
  // Đường ghi vẫn phải là đường cũ — route gợi ý không được tự ghi map.
  const route = readFileSync(
    join(process.cwd(), "app/api/engineering/cad/boq-map/suggest/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(route, /ghiMapBoqTheoDuAn/, "route gợi ý không được tự ghi map");
  assert.match(route, /export const dynamic = "force-dynamic";/);
  assert.match(route, /await getCurrentUser\(\)/);
  assert.match(route, /hitRateLimit/);
});

test("danhMucBoqTheoDuAn lọc project_id ở tầng app và báo khi cắt bớt", () => {
  const boq = readFileSync(join(process.cwd(), "lib/khoi-luong/boq.ts"), "utf8");
  const danhMuc = boq.slice(boq.indexOf("export async function danhMucBoqTheoDuAn"));
  assert.match(danhMuc, /withProjectScope/, "phải bọc phạm vi dự án");
  assert.match(danhMuc, /WHERE project_id = \?/, "RLS chỉ là phòng tuyến thứ hai");
  assert.match(danhMuc, /daCatBot/, "cắt bớt phải nói ra, không im lặng");
});

test("panel mã BOQ: gợi ý chỉ điền sẵn, đường ghi vẫn là nút Lưu", () => {
  const src = readFileSync(
    join(process.cwd(), "app/engineering/chuan-hoa-ban-ve/components/MaBoqDuAnPanel.tsx"),
    "utf8",
  );
  const xin = src.slice(src.indexOf("async function xinGoiY"), src.indexOf("async function luu"));
  assert.doesNotMatch(xin, /method: "PUT"/, "xin gợi ý không được tự lưu");
  assert.match(xin, /if \(!\(moi\[g\.tu\] \?\? ""\)\.trim\(\)\)/, "không đè lên mã người đã gõ");
  assert.match(src, /Máy đề xuất/, "phải đánh dấu rõ dòng nào do máy đề xuất");
});
