// M99 PR1 — Kiểm contract rule pack chuẩn hóa CAD.
// Route GET /api/engineering/cad/rule-pack gọi getCurrentUser() (next/headers) nên không gọi
// handler trực tiếp ngoài request scope thật của Next (đúng quy ước đã ghi ở tests/qr-resolve.test.ts,
// tests/permissions.test.ts) — kiểm 2 lớp:
//   (1) lib/cad/rule-pack.ts: cấu trúc field, ETag + If-None-Match — hàm thuần, không cần DB;
//   (2) lớp mỏng của route (auth 401/403, force-dynamic, 304) kiểm qua mã nguồn route.
// Kèm lớp (3) quan trọng nhất: đối chiếu rule pack với QUY TẮC CODE THẬT trong lib/cad/dxf-parser.ts —
// sai lệch ở đây nghĩa là plugin AutoCAD và web trôi khỏi nhau (ADR-0006 nguyên tắc 1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getCurrentRulePack,
  getRulePackEtag,
  matchesEtag,
  kiemCrossingPolicy,
  CURRENT_RULE_PACK_VERSION,
  type CrossingPolicy,
} from "@/lib/ky-thuat/cad/rule-pack";
import {
  normalizeCadLayers,
  convertTcvn3ToUnicode,
  convertVniToUnicode,
} from "@/lib/ky-thuat/cad/dxf-parser";

// ===== (1) Cấu trúc & ETag =====

test("rule pack: đủ 8 field theo API contract M99 §10 + 2 khối v4 + styleMap v5 + 3 khối v7 + 2 khối v8 + crossingPolicy v10, version = v10", () => {
  const pack = getCurrentRulePack();
  for (const field of [
    "version",
    "layerMap",
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "takeoff",
    "inspectionPolicy",
  ]) {
    assert.ok(field in pack, `Thiếu field ${field}`);
  }
  for (const field of ["drawTools", "sheetSetup"]) {
    assert.ok(field in pack, `Thiếu field v4 ${field}`);
  }
  assert.ok("styleMap" in pack, "Thiếu field v5 styleMap");
  for (const field of ["xrefPolicy", "hatchMap", "layoutPolicy"]) {
    assert.ok(field in pack, `Thiếu field v7 ${field}`);
  }
  for (const field of ["polylineClosePolicy", "blockMap"]) {
    assert.ok(field in pack, `Thiếu field v8 ${field}`);
  }
  assert.ok("crossingPolicy" in pack.drawTools, "Thiếu khối v10 drawTools.crossingPolicy");
  assert.equal(pack.version, "v10");
  assert.equal(CURRENT_RULE_PACK_VERSION, "v10");
});

test("rule pack v2 là mở rộng thuần của v1: 5 field cũ giữ nguyên nội dung", async () => {
  const v1 = (await import("@/lib/ky-thuat/cad/rule-packs/v1.json")).default;
  const v2 = (await import("@/lib/ky-thuat/cad/rule-packs/v2.json")).default;
  for (const field of [
    "layerMap",
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
  ] as const) {
    assert.deepEqual(
      v2[field],
      v1[field],
      `Field ${field} của v2 lệch v1 — v2 phải là mở rộng thuần`,
    );
  }
});

test("rule pack v3 là mở rộng thuần của v2: chỉ thêm fontMap.targetFont", async () => {
  const v2 = (await import("@/lib/ky-thuat/cad/rule-packs/v2.json")).default;
  const v3 = (await import("@/lib/ky-thuat/cad/rule-packs/v3.json")).default;

  for (const field of [
    "layerMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "takeoff",
    "inspectionPolicy",
  ] as const) {
    assert.deepEqual(
      v3[field],
      v2[field],
      `Field ${field} của v3 lệch v2 — v3 phải là mở rộng thuần`,
    );
  }

  // fontMap: giống hệt v2 ngoại trừ đúng một field mới.
  const { targetFont, ...conLai } = v3.fontMap;
  assert.deepEqual(conLai, v2.fontMap, "fontMap của v3 đổi nhiều hơn mỗi targetFont");
  assert.equal(targetFont.typeFace, "Arial");
  assert.ok(targetFont.note.length > 0, "targetFont phải có ghi chú giải thích vì sao tồn tại");
});

test("rule pack v4 là mở rộng thuần của v3: chỉ thêm drawTools + sheetSetup (M100 AC9)", async () => {
  const v3 = (await import("@/lib/ky-thuat/cad/rule-packs/v3.json")).default;
  const v4 = (await import("@/lib/ky-thuat/cad/rule-packs/v4.json")).default;

  for (const field of [
    "layerMap",
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "takeoff",
    "inspectionPolicy",
  ] as const) {
    assert.deepEqual(
      v4[field],
      v3[field],
      `Field ${field} của v4 lệch v3 — v4 phải là mở rộng thuần (lệnh M99 chạy với v4 không đổi hành vi)`,
    );
  }
  assert.deepEqual(
    Object.keys(v4).filter((k) => !(k in v3)),
    ["drawTools", "sheetSetup"],
    "v4 thêm nhiều hơn đúng 2 khối drawTools + sheetSetup",
  );
});

test("rule pack v5 là mở rộng thuần của v4: chỉ thêm styleMap + khóa mới trong inspectionPolicy (M101 FR1)", async () => {
  const v4 = (await import("@/lib/ky-thuat/cad/rule-packs/v4.json")).default;
  const v5 = (await import("@/lib/ky-thuat/cad/rule-packs/v5.json")).default;

  for (const field of [
    "layerMap",
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "takeoff",
    "drawTools",
    "sheetSetup",
  ] as const) {
    assert.deepEqual(
      v5[field],
      v4[field],
      `Field ${field} của v5 lệch v4 — v5 phải là mở rộng thuần (lệnh M99/M100 chạy với v5 không đổi hành vi)`,
    );
  }
  assert.deepEqual(
    Object.keys(v5).filter((k) => !(k in v4)),
    ["styleMap"],
    "v5 thêm nhiều hơn đúng 1 khối styleMap ở cấp gốc",
  );
  // inspectionPolicy: mọi khóa cũ giữ nguyên từng chữ, chỉ ĐƯỢC THÊM khóa mới.
  for (const [key, value] of Object.entries(v4.inspectionPolicy)) {
    assert.deepEqual(
      (v5.inspectionPolicy as Record<string, unknown>)[key],
      value,
      `inspectionPolicy.${key} của v5 lệch v4`,
    );
  }
});

test("rule pack v6 là mở rộng thuần của v5: chỉ thêm ghi chú khóa mới trong takeoff (M101 §6.3 FR4)", async () => {
  const v5 = (await import("@/lib/ky-thuat/cad/rule-packs/v5.json")).default;
  const v6 = (await import("@/lib/ky-thuat/cad/rule-packs/v6.json")).default;

  for (const field of [
    "layerMap",
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "inspectionPolicy",
    "styleMap",
    "drawTools",
    "sheetSetup",
  ] as const) {
    assert.deepEqual(
      v6[field],
      v5[field],
      `Field ${field} của v6 lệch v5 — v6 phải là mở rộng thuần (lệnh M99/M100/M101 chạy với v6 không đổi hành vi)`,
    );
  }
  assert.deepEqual(
    Object.keys(v6).filter((k) => !(k in v5)),
    [],
    "v6 không được thêm khối mới ở cấp gốc",
  );
  // takeoff: chỉ ĐƯỢC THÊM khóa mô tả; danh sách items (thứ tự + nội dung) không đổi một byte.
  assert.deepEqual(
    Object.keys(v6.takeoff).filter((k) => !(k in v5.takeoff)),
    ["itemOptionsV6"],
    "v6 thêm nhiều hơn đúng 1 khóa mô tả itemOptionsV6 trong takeoff",
  );
  assert.deepEqual(v6.takeoff.items, v5.takeoff.items, "items của v6 lệch v5 — bóc sẽ ra số khác");
});

test("rule pack v7 là mở rộng thuần của v6: 3 khối chính sách chuẩn hóa (M101 §6.2 FR3)", async () => {
  // v7 gộp bổ sung của HAI đợt làm song song: M101 PR2 (3 khối chính sách bước 9/10/11) và
  // M100 PR5 (2 item đếm giá đỡ/lỗ chờ + drawTools.heavyFittingIds). Test này canh phần M101;
  // phần M100 do test "v7 = v6 + 2 item đếm…" ở cuối file canh — nên `takeoff`/`drawTools`
  // KHÔNG nằm trong vòng deepEqual dưới đây.
  const v6 = (await import("@/lib/ky-thuat/cad/rule-packs/v6.json")).default;
  // Đọc THẲNG v7.json, không qua getCurrentRulePack(): rule pack đang phát hành đã là v8 (M102).
  const v7 = (await import("@/lib/ky-thuat/cad/rule-packs/v7.json")).default;

  for (const field of [
    "layerMap",
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "inspectionPolicy",
    "styleMap",
    "sheetSetup",
  ] as const) {
    assert.deepEqual(
      v7[field],
      v6[field],
      `Field ${field} của v7 lệch v6 — v7 phải là mở rộng thuần (chuẩn hóa bằng v7 không đổi hành vi)`,
    );
  }
  assert.deepEqual(
    Object.keys(v7).filter((k) => !(k in v6)),
    ["xrefPolicy", "hatchMap", "layoutPolicy"],
    "v7 thêm nhiều hơn đúng 3 khối chính sách của bước chuẩn hóa 9/10/11",
  );
});

test("v7: cả 4 bước chuẩn hóa mới đều TẮT mặc định (M101 §6.2 — v7 mặc định = v6)", () => {
  const pack = getCurrentRulePack();
  assert.equal(pack.xrefPolicy.enabled, false, "bước 9 phải mặc định tắt");
  assert.equal(pack.hatchMap.enabled, false, "bước 10 phải mặc định tắt");
  assert.equal(pack.layoutPolicy.enabled, false, "bước 11 phải mặc định tắt");
  // Bước 8 KHÔNG có cờ riêng (styleMap là dữ liệu, dùng chung với phép kiểm 14) — công tắc của nó
  // là inspectionPolicy.styleDeviation.enabled, cũng đang tắt.
  assert.equal(pack.inspectionPolicy.styleDeviation.enabled, false, "bước 8 phải mặc định tắt");

  // Tham số then chốt: bật lên là dùng được ngay, không phải phát hành lại.
  assert.equal(pack.xrefPolicy.pathPolicy, "relative");
  assert.deepEqual(
    pack.xrefPolicy.bindMatchAny,
    [],
    "bindMatchAny phải rỗng mặc định (không bind xref nào)",
  );
  assert.deepEqual(
    pack.hatchMap.byLayer,
    [],
    "byLayer để rỗng: bộ mẫu hatch là quy ước riêng từng công ty",
  );
  assert.equal(pack.layoutPolicy.removeEmpty, true);
  assert.equal(
    pack.layoutPolicy.renameLayouts,
    false,
    "đổi tên layout hàng loạt phải là quyết định của cả tổ",
  );
  assert.match(pack.layoutPolicy.namePattern, /\{seq\}/);

  // Mỗi khối mới phải tự tài liệu hóa bằng tiếng Việt ngay trong rule pack (M101 §18).
  for (const khoi of [pack.xrefPolicy, pack.hatchMap, pack.layoutPolicy] as { note: string }[]) {
    assert.ok(khoi.note.length > 0, "khối chính sách mới thiếu mô tả tiếng Việt");
  }
});

test("v7 (kế thừa v6): không item nào bật khóa bóc nâng cao (bóc bằng v7 = bóc bằng v5)", () => {
  const items = getCurrentRulePack().takeoff.items as unknown as Record<string, unknown>[];
  for (const item of items) {
    for (const khoa of [
      "groupBySize",
      "sizeFromNearbyText",
      "wastagePct",
      "perCountAdd",
      "derivedFrom",
      "formula",
    ]) {
      assert.equal(
        khoa in item,
        false,
        `item ${String(item.id)} khai sẵn "${khoa}" — v7 phải trung tính, hệ số do dự án chốt ở version sau`,
      );
    }
  }
  // Bộ khóa mới phải được tài liệu hóa tiếng Việt ngay trong rule pack (M101 §18 chống phình khó bảo trì).
  const doc = getCurrentRulePack().takeoff.itemOptionsV6 as Record<string, string>;
  for (const khoa of [
    "groupBySize",
    "sizeFromNearbyText",
    "wastagePct",
    "perCountAdd",
    "derivedFrom",
    "formula",
  ]) {
    assert.ok((doc[khoa] ?? "").length > 0, `itemOptionsV6 thiếu mô tả cho ${khoa}`);
  }
});

test("v7 (kế thừa v5): 7 phép kiểm mới đều có enabled và đều TẮT mặc định (M101 AC(a))", () => {
  const ip = getCurrentRulePack().inspectionPolicy;
  const phepKiemMoi = [
    "overlapSameSystem",
    "clash2d",
    "titleblockFields",
    "viewportScale",
    "styleDeviation",
    "labelSizeMismatch",
    "strayObjects",
  ] as const;
  for (const ten of phepKiemMoi) {
    const khoi = ip[ten] as { enabled: boolean; note?: string };
    assert.equal(khoi.enabled, false, `Phép kiểm ${ten} phải mặc định tắt`);
    assert.ok((khoi.note ?? "").length > 0, `Phép kiểm ${ten} thiếu mô tả tiếng Việt`);
  }
  // Tham số then chốt của từng phép (bật lên là dùng được ngay, không phải phát hành lại).
  assert.ok(ip.overlapSameSystem.overlapToleranceMm > 0);
  assert.ok(ip.overlapSameSystem.overlapMinLengthMm > ip.overlapSameSystem.overlapToleranceMm);
  assert.deepEqual(ip.clash2d.clashPairs, [], "clashPairs phải rỗng mặc định (an toàn)");
  assert.ok(ip.titleblockFields.requiredAttributes.length > 0);
  assert.ok(ip.titleblockFields.titleblockNameMatchAny.length > 0);
  assert.ok(ip.strayObjects.strayDistanceFactor > 0);
  assert.ok(ip.strayObjects.minEntitiesForExtents >= 4);
});

test("v7 (kế thừa v5): viewportScale.scales khớp sheetSetup.scales (một bộ tỉ lệ duy nhất, chống trôi)", () => {
  const pack = getCurrentRulePack();
  assert.deepEqual(
    [...pack.inspectionPolicy.viewportScale.scales].sort((a, b) => a - b),
    [...pack.sheetSetup.scales].sort((a, b) => a - b),
    "Danh mục tỉ lệ của phép kiểm 13 đã trôi khỏi sheetSetup.scales",
  );
});

test("v7 (kế thừa v5): styleMap khai bộ style chuẩn dùng chung cho phép kiểm 14 và bước chuẩn hóa 8", () => {
  const sm = getCurrentRulePack().styleMap;
  assert.ok(sm.textStyle.name.length > 0 && sm.textStyle.fontFile.length > 0);
  assert.ok(sm.dimStyle.name.length > 0);
  // dimstyle chuẩn phải trỏ tới một textstyle được chấp nhận, không thì chuẩn hóa xong chữ
  // kích thước vẫn sai font.
  assert.ok(
    [sm.textStyle.name, ...sm.textStyle.acceptAlso].includes(sm.dimStyle.textStyleName),
    "styleMap.dimStyle.textStyleName không nằm trong bộ textStyle",
  );
});

// ===== (5) v4 — drawTools + sheetSetup (M100 §11, FR1/FR4) =====

test("drawTools: hệ khớp layerMap.groups, layer khớp branch target đúng nhóm, itemId có thật", () => {
  const pack = getCurrentRulePack();
  const dt = pack.drawTools;
  assert.ok(dt.baseFadePct > 0 && dt.baseFadePct <= 100);
  assert.equal(dt.labelStyle.layer, "G-ANNO-TEXT");
  const itemIds = new Set(pack.takeoff.items.map((i) => i.id));
  assert.ok(dt.systems.length >= 5, "phải khai đủ 5 hệ thao tác");
  for (const sys of dt.systems) {
    const group = pack.layerMap.groups.find((g) => g.id === sys.id);
    assert.ok(group, `hệ ${sys.id} không có nhóm layerMap tương ứng`);
    const targets = new Set(group.branches.map((b) => b.target));
    assert.ok(sys.lines.length > 0, `hệ ${sys.id} không khai tuyến nào`);
    for (const line of sys.lines) {
      assert.ok(targets.has(line.layer), `hệ ${sys.id}: layer ${line.layer} không thuộc nhóm này`);
      assert.ok(
        itemIds.has(line.itemId),
        `hệ ${sys.id}: itemId ${line.itemId} không có trong takeoff`,
      );
      assert.ok(["double", "none"].includes(line.edgeStyle), `edgeStyle lạ: ${line.edgeStyle}`);
      assert.ok(line.sizes.length > 0, `hệ ${sys.id}: ${line.itemId} không có size nào`);
    }
  }
});

test("drawTools: layer nét biên KHÔNG khớp takeoff.layerMatchAny nào (FR4 — chống bóc trùng)", () => {
  const pack = getCurrentRulePack();
  const suffix = pack.drawTools.edgeLayerSuffix;
  for (const sys of pack.drawTools.systems) {
    for (const line of sys.lines) {
      const bien = (line.layer + suffix).toUpperCase();
      for (const item of pack.takeoff.items) {
        for (const key of item.layerMatchAny) {
          assert.ok(
            !hasToken(bien, key.toUpperCase()),
            `Layer biên ${bien} khớp takeoff ${item.id} (${key}) — nét biên sẽ bị bóc trùng`,
          );
        }
      }
    }
  }
});

test("drawTools: thiết bị mỗi hệ là item takeoff measure=count có blockNameMatchAny", () => {
  const pack = getCurrentRulePack();
  for (const sys of pack.drawTools.systems) {
    for (const id of sys.equipment) {
      const item = pack.takeoff.items.find((i) => i.id === id);
      assert.ok(item, `hệ ${sys.id}: thiết bị ${id} không có trong takeoff.items`);
      assert.equal(item.measure, "count", `thiết bị ${id} phải là item count`);
      assert.ok(
        (item as { blockNameMatchAny?: string[] }).blockNameMatchAny?.length,
        `thiết bị ${id} thiếu blockNameMatchAny`,
      );
    }
  }
});

test("sheetSetup: đủ tham số trang in/mặt cắt/tag/bảng/slope theo M100 §11", () => {
  const s = getCurrentRulePack().sheetSetup;
  assert.ok(s.paperSizes.length > 0 && s.scales.length > 0);
  assert.match(s.layoutNamePattern, /\{system\}/);
  assert.ok(s.titleblockId.trim().length > 0);
  assert.ok(s.defaultElevations.length > 0);
  assert.match(s.tagPattern, /\{seq\}/);
  assert.ok(s.tableStyle.textHeightMm > 0);
  assert.ok(s.slopes.length > 0);
});

test("getRulePackEtag: ổn định giữa 2 lần gọi và có chứa version", () => {
  const a = getRulePackEtag();
  const b = getRulePackEtag();
  assert.equal(a, b);
  assert.match(a, new RegExp(`^"${CURRENT_RULE_PACK_VERSION}-[0-9a-f]{32}"$`));
});

test("matchesEtag: khớp đúng ETag, chấp nhận W/ và *, từ chối ETag lạ/rỗng", () => {
  const etag = getRulePackEtag();
  assert.equal(matchesEtag(etag, etag), true);
  assert.equal(matchesEtag(`W/${etag}`, etag), true);
  assert.equal(matchesEtag(`"v0-abc", ${etag}`, etag), true);
  assert.equal(matchesEtag("*", etag), true);
  assert.equal(matchesEtag('"v1-khongkhop"', etag), false);
  assert.equal(matchesEtag(null, etag), false);
  assert.equal(matchesEtag("", etag), false);
});

// ===== (2) Lớp mỏng của route =====

test("route rule-pack: có force-dynamic, chặn 401/403 và trả 304 theo If-None-Match", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "api", "engineering", "cad", "rule-pack", "route.ts"),
    "utf8",
  );
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /CAN\.viewEngineeringGraph/);
  assert.match(src, /status: 403/);
  assert.match(src, /if-none-match/);
  assert.match(src, /status: 304/);
  for (const field of [
    "version:",
    "layerMap:",
    "fontMap:",
    "purgePolicy:",
    "lineweightMap:",
    "flattenPolicy:",
    "takeoff:",
    "inspectionPolicy:",
    "drawTools:",
    "sheetSetup:",
    "styleMap:",
    "xrefPolicy:",
    "hatchMap:",
    "layoutPolicy:",
  ]) {
    assert.ok(src.includes(field), `Response thiếu ${field}`);
  }
});

// ===== (3) Đối chiếu với quy tắc code thật =====

type LayerBranch = { target: string; matchAny?: string[]; default?: boolean };

/** Nhánh mặc định không có `matchAny` → trả undefined. */
function branchKeys(branch: LayerBranch): string[] | undefined {
  return branch.matchAny;
}

/** Ký tự được coi là "trong từ" — khớp đúng `LAYER_WORD_CHAR` trong `lib/cad/dxf-parser.ts`. */
const LAYER_WORD_CHAR = /[A-Z0-9]/;

/**
 * Khớp `token` trong `l` theo RANH GIỚI TOKEN (không phải substring thô) — bản sao chính xác
 * của `hasToken()` trong `lib/cad/dxf-parser.ts`. Bắt buộc dùng đúng thuật toán này, không phải
 * `String.includes()`: layer như "04_P_CAP_THOAT_NUOC_THAI" chứa substring "OA" (trong "THOAT")
 * và "THAI" nguyên vẹn — nếu khớp thô, "OA"/"THAI" sẽ trúng nhầm nhóm HVAC (EA/OA/THAI) thay vì
 * đúng nhóm PIPING (THOAT là 1 token riêng). Đây chính là lỗi Việc 7.6 đã sửa trong code thật.
 */
function hasToken(l: string, token: string): boolean {
  let from = 0;
  for (;;) {
    const at = l.indexOf(token, from);
    if (at < 0) return false;
    const before = at > 0 ? (l[at - 1] ?? "") : "";
    const after = l[at + token.length] ?? "";
    if (!LAYER_WORD_CHAR.test(before) && !LAYER_WORD_CHAR.test(after)) return true;
    from = at + 1;
  }
}

/**
 * Bộ diễn giải tham chiếu của layerMap — chính là thứ plugin AutoCAD .NET sẽ cài lại.
 * Nếu nó lệch normalizeCadLayers() thì rule pack đã trôi khỏi code thật.
 *
 * Bước miễn trừ đầu tiên là **bất biến idempotent** (vá 2026-08-25): tên đã là một
 * `branches[].target` — hoặc layer nét biên `<target>+drawTools.edgeLayerSuffix` (M100 FR4) —
 * thì giữ nguyên. Danh sách lấy từ chính rule pack, không hard-code.
 */
function applyLayerMap(layer: string): string {
  const pack = getCurrentRulePack();
  const { groups, fallback } = pack.layerMap;
  const l = layer.toUpperCase();
  const hauToBien = pack.drawTools.edgeLayerSuffix.toUpperCase();
  const daChuan = new Set(
    groups.flatMap((g) =>
      g.branches.flatMap((b) => [b.target.toUpperCase(), b.target.toUpperCase() + hauToBien]),
    ),
  );
  if (daChuan.has(l)) return l;
  const hit = (keys: readonly string[]) => keys.some((k) => hasToken(l, k));
  for (const g of groups) {
    if (!hit(g.matchAny)) continue;
    for (const branch of g.branches) {
      const keys = branchKeys(branch);
      if (!keys || hit(keys)) return branch.target;
    }
  }
  assert.equal(fallback, "keep-original");
  return layer;
}

test("layerMap: diễn giải rule pack cho kết quả y hệt normalizeCadLayers() trên corpus rộng", () => {
  const { groups } = getCurrentRulePack().layerMap;
  const keywords = groups.flatMap((g) => [
    ...g.matchAny,
    ...g.branches.flatMap((b) => branchKeys(b) ?? []),
  ]);

  const samples = new Set<string>([
    // Tên layer thật từ bản vẽ mẫu MEPF trong lib/cad/dxf-parser.ts
    "01_M_ONG_GIO_CAP_CHINH",
    "02_M_ONG_GIO_HOI_AHU",
    "03_P_ONG_NUOC_LANH_CHW",
    "04_P_CAP_THOAT_NUOC_THAI",
    "05_E_DIEN_MANG_CAP_PWR",
    "06_F_PCCC_SPRINKLER",
    "07_S_TRUC_COT_KET_CAU",
    "08_G_GHI_CHU_DIM_TEXT",
    "0",
    "ZZZ_KHONG_KHOP_GI",
    // Tên ĐÃ chuẩn + layer nét biên: phải giữ nguyên ở cả 2 bộ (bất biến idempotent).
    ...groups.flatMap((g) =>
      g.branches.flatMap((b) => [
        b.target,
        b.target.toLowerCase(),
        b.target + getCurrentRulePack().drawTools.edgeLayerSuffix,
      ]),
    ),
  ]);
  // Mỗi từ khóa đứng một mình + ghép đôi để phủ cả thứ tự nhóm lẫn thứ tự nhánh.
  for (const a of keywords) {
    samples.add(`XX_${a}_01`);
    for (const b of keywords) samples.add(`XX_${a}_${b}_01`);
  }

  const names = [...samples];
  const mapping = normalizeCadLayers(names);
  for (const name of names) {
    assert.equal(applyLayerMap(name), mapping[name], `Layer "${name}" ánh xạ lệch rule pack`);
  }
});

test("layerMap: fallback giữ nguyên tên khi không khớp nhóm nào", () => {
  assert.equal(getCurrentRulePack().layerMap.fallback, "keep-original");
  const mapping = normalizeCadLayers(["ZZZ_KHONG_KHOP_GI"]);
  assert.equal(mapping["ZZZ_KHONG_KHOP_GI"], "ZZZ_KHONG_KHOP_GI");
});

test("fontMap.tcvn3: mọi ký tự khớp đúng convertTcvn3ToUnicode()", () => {
  const chars = getCurrentRulePack().fontMap.tcvn3.chars as Record<string, string>;
  const entries = Object.entries(chars);
  assert.ok(entries.length > 60, "Bảng TCVN3 quá ít mục — nghi trích thiếu");
  for (const [legacy, unicode] of entries) {
    assert.equal(convertTcvn3ToUnicode(legacy), unicode, `TCVN3 "${legacy}" lệch`);
  }
});

test("fontMap.vni: mọi cặp khớp đúng convertVniToUnicode()", () => {
  const pairs = getCurrentRulePack().fontMap.vni.pairs;
  assert.ok(pairs.length > 100, "Bảng VNI quá ít mục — nghi trích thiếu");
  for (const [legacy, unicode] of pairs) {
    assert.equal(convertVniToUnicode(legacy), unicode, `VNI "${legacy}" lệch`);
  }
});

test("purgePolicy: đúng các lệnh purge/audit đang sinh trong kịch bản .SCR", () => {
  const p = getCurrentRulePack().purgePolicy;
  assert.deepEqual(p.autocadCommands, ["-PURGE LA * N", "-PURGE B * N", "AUDIT Y"]);
  assert.equal(p.keepReferenced, true);
  assert.equal(p.deepPurge.zeroLengthToleranceMm, 1);
});

test("lineweightMap: bảng CTB theo ACI, màu khớp ACI_TO_HEX", async () => {
  const { ACI_TO_HEX } = await import("@/lib/ky-thuat/cad/dxf-parser");
  const lw = getCurrentRulePack().lineweightMap;
  assert.equal(lw.unit, "mm");
  assert.deepEqual(
    lw.byAci.map((c) => c.aci),
    [1, 2, 3, 4, 7, 8],
  );
  for (const c of lw.byAci) {
    assert.equal(c.colorHex, ACI_TO_HEX[c.aci], `Màu ACI ${c.aci} lệch ACI_TO_HEX`);
    assert.ok(c.lineweightMm > 0);
  }
});

// ===== (4) v2 — takeoff + inspectionPolicy (M99 PR-A) =====

test("takeoff: cấu trúc đúng M99 §11 — items hợp lệ, layer đích tồn tại trong layerMap", () => {
  const pack = getCurrentRulePack();
  const t = pack.takeoff;
  assert.equal(t.drawingUnitAssumption, "mm");
  assert.equal(t.xdataAppName, "XBOSS_BOCKL");
  assert.ok(t.markColorAci >= 1 && t.markColorAci <= 255, "markColorAci phải là ACI hợp lệ");
  for (const k of ["length", "area", "count"] as const) {
    assert.equal(typeof t.rounding[k], "number", `rounding.${k} thiếu`);
  }
  // Mọi layer target chuẩn hóa được tham chiếu bởi item length phải là target thật của layerMap.
  const targets = new Set(pack.layerMap.groups.flatMap((g) => g.branches.map((b) => b.target)));
  assert.ok(t.items.length > 0, "takeoff.items rỗng");
  const ids = new Set<string>();
  for (const item of t.items) {
    assert.ok(!ids.has(item.id), `takeoff item id trùng: ${item.id}`);
    ids.add(item.id);
    assert.ok(["length", "area", "count"].includes(item.measure), `measure lạ: ${item.measure}`);
    assert.ok(item.factor > 0, `factor phải dương (${item.id})`);
    assert.ok(item.unit.length > 0 && item.name.length > 0, `item ${item.id} thiếu tên/đơn vị`);
    if (item.measure === "length") {
      assert.equal(item.factor, 0.001, `item length ${item.id}: bản vẽ mm → m phải factor 0.001`);
      for (const layer of item.layerMatchAny) {
        assert.ok(
          targets.has(layer),
          `item ${item.id} tham chiếu layer "${layer}" không phải target của layerMap`,
        );
      }
    }
    if (item.layerMatchAny.length === 0) {
      // layerMatchAny rỗng = mọi layer — chỉ hợp lệ cho count theo block.
      assert.equal(
        item.measure,
        "count",
        `item ${item.id}: layerMatchAny rỗng chỉ dành cho measure=count`,
      );
      assert.ok(
        (item as { blockNameMatchAny?: string[] }).blockNameMatchAny?.length,
        `item ${item.id}: layerMatchAny rỗng thì phải có blockNameMatchAny`,
      );
    }
  }
});

test("inspectionPolicy: dung sai Z + chính sách polyline hở đúng M99 §6.4", () => {
  const p = getCurrentRulePack().inspectionPolicy;
  assert.ok(p.zToleranceMm > 0 && p.zToleranceMm < 1);
  assert.equal(p.openPolyline.checkLayersFromAreaTakeoff, true);
  assert.ok(p.openPolyline.nearGapToleranceMm > 0);
  assert.equal(p.openPolyline.reportNearClosedOnAllLayers, true);
  assert.ok(Array.isArray(p.openPolyline.extraLayersMatchAny));
});

test("flattenPolicy: ép Z về 0 trong WCS, giữ nguyên hình chiếu XY (AC3)", () => {
  const f = getCurrentRulePack().flattenPolicy;
  assert.equal(f.targetElevation, 0);
  assert.equal(f.preserveXyProjection, true);
  assert.equal(f.coordinateSystem, "WCS");
  // Ghi rõ đây là chuẩn đích cho plugin, chưa có triển khai ép Z phía server.
  assert.match(f.note, /CHƯA CHẮC/);
});

test("rule pack v7 = v6 + 2 item đếm giá đỡ/lỗ chờ + heavyFittingIds (M100 AC12/§6.7)", async () => {
  const v6 = (await import("@/lib/ky-thuat/cad/rule-packs/v6.json")).default;
  // Đọc THẲNG v7.json (rule pack đang phát hành đã là v8 — M102).
  const v7 = (await import("@/lib/ky-thuat/cad/rule-packs/v7.json")).default;

  // v7 KHÔNG đụng 11 khối còn lại — chỉ takeoff + drawTools được phép đổi.
  for (const field of [
    "layerMap",
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "inspectionPolicy",
    "styleMap",
    "sheetSetup",
  ] as const) {
    assert.deepEqual(
      v7[field],
      v6[field],
      `Field ${field} của v7 lệch v6 — v7 chỉ được đụng takeoff/drawTools`,
    );
  }
  // 3 khối gốc mới là phần của M101 PR2 (bước chuẩn hóa 9/10/11), đã có test riêng ở trên;
  // ở đây chỉ khẳng định đợt M100 PR5 KHÔNG thêm khối gốc nào ngoài 3 khối đó.
  assert.deepEqual(
    Object.keys(v7).filter((k) => !(k in v6)),
    ["xrefPolicy", "hatchMap", "layoutPolicy"],
    "v7 chỉ được thêm 3 khối chính sách chuẩn hóa ở cấp gốc",
  );

  // takeoff: giữ nguyên toàn bộ item cũ (đúng thứ tự) + CỘNG THÊM đúng 2 item đếm ở CUỐI
  // (first-match: item cũ vẫn giành trước ⇒ bản vẽ không có giá đỡ/sleeve bóc y hệt v6).
  assert.deepEqual(
    Object.keys(v7.takeoff).filter((k) => !(k in v6.takeoff)),
    ["itemsCountV7"],
    "v7 thêm nhiều hơn đúng 1 khóa mô tả itemsCountV7 trong takeoff",
  );
  const items7 = v7.takeoff.items as unknown as Record<string, unknown>[];
  const items6 = v6.takeoff.items as unknown as Record<string, unknown>[];
  assert.deepEqual(
    items7.slice(0, items6.length),
    items6,
    "v7 đã sửa item cũ — khối lượng bóc sẽ đổi",
  );
  assert.deepEqual(
    items7.slice(items6.length).map((i) => i.id),
    ["support-hanger", "sleeve-opening"],
    "v7 phải thêm ĐÚNG 2 item đếm ở cuối danh sách",
  );
  for (const item of items7.slice(items6.length)) {
    assert.equal(
      item.measure,
      "count",
      `item ${String(item.id)} phải là measure=count mới đếm block được`,
    );
    assert.deepEqual(
      item.layerMatchAny,
      [],
      `item ${String(item.id)} phải để layerMatchAny rỗng — giá đỡ/sleeve nằm trên chính layer tuyến`,
    );
    assert.ok(
      (item.blockNameMatchAny as string[]).length > 0,
      `item ${String(item.id)} thiếu blockNameMatchAny — XBOSS_BOCKL không biết đếm block tên gì`,
    );
  }

  // drawTools: chỉ thêm heavyFittingIds (+ ghi chú), id phải có thật trong fittings của một hệ.
  assert.deepEqual(
    Object.keys(v7.drawTools).filter((k) => !(k in v6.drawTools)),
    ["heavyFittingIds", "heavyFittingIdsNote"],
    "v7 thêm khóa lạ vào drawTools",
  );
  const moiPhuKien = new Set(v7.drawTools.systems.flatMap((s) => s.fittings));
  assert.ok(
    v7.drawTools.heavyFittingIds.length > 0,
    "heavyFittingIds rỗng — XBOSS_VE_GIADO lại phải hỏi kỹ sư",
  );
  for (const id of v7.drawTools.heavyFittingIds) {
    assert.ok(
      moiPhuKien.has(id),
      `heavyFittingIds["${id}"] đã trôi khỏi drawTools.systems[].fittings`,
    );
  }
  assert.ok(
    (v7.drawTools.heavyFittingIdsNote ?? "").length > 0,
    "heavyFittingIds thiếu mô tả tiếng Việt",
  );
});

// ===== v8 (M102) — 2 khối chính sách bước chuẩn hóa 12/13 + 2 phép kiểm mới =====

test("rule pack v8 là mở rộng thuần của v7: chỉ thêm polylineClosePolicy + blockMap (M102 §4)", async () => {
  const v7 = (await import("@/lib/ky-thuat/cad/rule-packs/v7.json")).default;
  // So THẲNG tệp v8.json, không qua getCurrentRulePack() — rule pack hiện hành đã là v9
  // (M105), so nhầm sẽ bắt v9 phải giống v7 ở khối drawTools vốn đã có thêm jointRules.
  const v8 = (await import("@/lib/ky-thuat/cad/rule-packs/v8.json")).default;

  // Mọi khối cũ giữ nguyên TRỪ layerMap (v8 sửa knownIssues — nợ đã đóng ở M101 PR2, xem test dưới)
  // và inspectionPolicy (thêm 2 phép kiểm mới, đều tắt).
  for (const field of [
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "takeoff",
    "styleMap",
    "drawTools",
    "sheetSetup",
    "xrefPolicy",
    "hatchMap",
    "layoutPolicy",
  ] as const) {
    assert.deepEqual(
      v8[field],
      v7[field],
      `Field ${field} của v8 lệch v7 — v8 phải là mở rộng thuần (kiểm/chuẩn hóa/bóc bằng v8 không đổi hành vi)`,
    );
  }
  assert.deepEqual(
    Object.keys(v8).filter((k) => !(k in v7)),
    ["polylineClosePolicy", "blockMap"],
    "v8 thêm nhiều hơn đúng 2 khối chính sách của bước chuẩn hóa 12/13",
  );
  // layerMap: chỉ knownIssues được phép đổi — quy tắc ánh xạ layer phải y nguyên, nếu không
  // cùng một bản vẽ chuẩn hóa bằng v8 sẽ ra layer khác v7.
  const { knownIssues: _bo8, ...layerMap8 } = v8.layerMap;
  const { knownIssues: _bo7, ...layerMap7 } = v7.layerMap;
  assert.deepEqual(layerMap8, layerMap7, "v8 đụng quy tắc layerMap chứ không chỉ knownIssues");
});

test("v8: cả 2 bước chuẩn hóa mới đều TẮT mặc định, blockMap còn mặc định chỉ-báo (M102 AC7)", () => {
  const pack = getCurrentRulePack();

  assert.equal(pack.polylineClosePolicy.enabled, false);
  assert.ok(
    pack.polylineClosePolicy.gapCloseToleranceMm > 0,
    "ngưỡng phải khai sẵn để bật lên là dùng được ngay",
  );
  assert.equal(pack.blockMap.enabled, false);
  assert.equal(pack.blockMap.reportOnly, true, "bản đầu chỉ BÁO block lạc chuẩn, không tự thay");
  assert.deepEqual(pack.blockMap.rules, []);
});

test("v8: 2 phép kiểm mới có enabled và đều TẮT mặc định (M102 AC7)", () => {
  const ip = getCurrentRulePack().inspectionPolicy as unknown as Record<
    string,
    { enabled?: boolean }
  >;
  for (const phep of ["tagDuplicate", "boqCodeMissing"]) {
    assert.ok(phep in ip, `inspectionPolicy thiếu phép kiểm mới ${phep}`);
    assert.equal(ip[phep].enabled, false, `phép kiểm ${phep} phải tắt mặc định`);
  }
});

test("v8: knownIssues không còn ghi nợ 'không idempotent' — nợ đã đóng ở M101 PR2", () => {
  const known = getCurrentRulePack().layerMap.knownIssues;

  assert.ok(
    !known.some((d) => d.includes("Không idempotent")),
    "tài liệu rule pack còn ghi nợ đã đóng — đúng lớp lỗi tài liệu lệch code",
  );
  assert.ok(
    known.some((d) => d.includes("Idempotent")),
    "phải ghi rõ hiện trạng đã idempotent để người sau không sửa lại lần nữa",
  );
});

test("v8: ánh xạ layer idempotent — áp lại lên tên đã chuẩn không đổi gì (M102 §6.3)", () => {
  // Bằng chứng ở mức PIPELINE (trước đây chỉ có test ở mức LayerMapper của tầng 2).
  const goc = ["ONG_GIO_THAI", "PCCC_SPK", "CHILLER_CHW", "DIEN_CHIEU_SANG"];

  const lan1 = normalizeCadLayers(goc);
  const lan2 = normalizeCadLayers(Object.values(lan1));

  // Lần 2 áp lên chính KẾT QUẢ của lần 1: mỗi tên đích phải ánh xạ về chính nó.
  for (const dich of Object.values(lan1)) {
    assert.equal(
      lan2[dich],
      dich,
      `layer đã chuẩn "${dich}" bị ánh xạ tiếp thành "${lan2[dich]}" — chuẩn hóa lần 2 làm gộp nhầm hệ`,
    );
  }
});

// ===== v9 (M105) — jointRules: tham số chia đốt MEPF theo kiểu kết nối =====

test("rule pack v9 là mở rộng thuần của v8: chỉ thêm jointRules + jointRulesNote (M105 §12)", async () => {
  const v8 = (await import("@/lib/ky-thuat/cad/rule-packs/v8.json")).default;
  // So THẲNG tệp v9.json, không qua getCurrentRulePack() — rule pack hiện hành đã là v10 (M109).
  const v9 = (await import("@/lib/ky-thuat/cad/rule-packs/v9.json")).default;

  // Mọi khối ngoài drawTools phải y nguyên — kiểm/chuẩn hóa/bóc bằng v9 không đổi hành vi.
  for (const field of [
    "layerMap",
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "takeoff",
    "inspectionPolicy",
    "styleMap",
    "sheetSetup",
    "xrefPolicy",
    "hatchMap",
    "layoutPolicy",
    "polylineClosePolicy",
    "blockMap",
  ] as const) {
    assert.deepEqual(
      v9[field],
      v8[field],
      `Field ${field} của v9 lệch v8 — v9 phải là mở rộng thuần (M105 chỉ thêm tham số chia đốt)`,
    );
  }
  assert.deepEqual(
    Object.keys(v9).filter((k) => !(k in v8)),
    [],
    "v9 không được thêm khối cấp cao nào — jointRules nằm trong drawTools",
  );

  // drawTools: chỉ được thêm jointRulesNote ở cấp khối và jointRules trong từng tuyến.
  const { jointRulesNote: _bo, systems: heV9, ...drawToolsV9 } = v9.drawTools;
  const { systems: heV8, ...drawToolsV8 } = v8.drawTools;
  assert.deepEqual(drawToolsV9, drawToolsV8, "v9 đụng tham số drawTools ngoài jointRules");
  assert.equal(heV9.length, heV8.length, "v9 thêm/bớt hệ so với v8");
  for (let i = 0; i < heV9.length; i++) {
    const tuyenV9 = heV9[i].lines.map(({ jointRules: _jr, ...con }) => con);
    assert.deepEqual(
      { ...heV9[i], lines: tuyenV9 },
      heV8[i],
      `Hệ ${heV9[i].id} của v9 đụng khóa cũ chứ không chỉ thêm jointRules`,
    );
  }
});

test("v9: MỌI tuyến đều khai jointRules đủ dùng, dải chọn kiểu nối phủ kín (M105 FR1/§12)", () => {
  const pack = getCurrentRulePack();
  assert.ok(
    (pack.drawTools.jointRulesNote ?? "").length > 0,
    "jointRules thiếu mô tả tiếng Việt cho người phát hành rule pack sau",
  );

  for (const he of pack.drawTools.systems) {
    for (const tuyen of he.lines) {
      const jr = tuyen.jointRules;
      assert.ok(jr, `Tuyến ${tuyen.itemId} thiếu jointRules — lệnh chia đốt sẽ bỏ qua tuyến này`);
      assert.ok(jr.selection.length > 0, `Tuyến ${tuyen.itemId} có bảng chọn kiểu nối rỗng`);
      assert.ok(
        ["deu", "cay_nguyen"].includes(jr.divideMode),
        `Tuyến ${tuyen.itemId} khai divideMode lạ "${jr.divideMode}"`,
      );

      // Mục cuối phải bắt hết phần còn lại, nếu không có cỡ rơi ra ngoài mọi dải.
      const cuoi = jr.selection[jr.selection.length - 1] as {
        maxSideMm?: number | null;
        maxDn?: number | null;
      };
      assert.ok(
        (cuoi.maxSideMm ?? null) === null && (cuoi.maxDn ?? null) === null,
        `Tuyến ${tuyen.itemId}: mục cuối của selection phải bắt hết (maxSideMm/maxDn = null)`,
      );

      for (const muc of jr.selection) {
        assert.ok(
          muc.maxLenMm > jr.minPieceLenMm,
          `Tuyến ${tuyen.itemId} kiểu ${muc.jointType}: maxLenMm phải lớn hơn minPieceLenMm`,
        );
        assert.ok(
          muc.jointGapMm >= 0,
          `Tuyến ${tuyen.itemId} kiểu ${muc.jointType}: khe mối nối không được âm`,
        );
        assert.ok(
          muc.jointType in jr.hardware,
          `Tuyến ${tuyen.itemId}: kiểu nối ${muc.jointType} thiếu định mức phụ kiện`,
        );
      }
    }
  }
});

// ===== v10 (M109) — crossingPolicy: chính sách ngắt nét giao chéo =====

test("rule pack v10 là mở rộng thuần của v9: chỉ thêm drawTools.crossingPolicy (M109 §5)", async () => {
  const v9 = (await import("@/lib/ky-thuat/cad/rule-packs/v9.json")).default;
  const v10 = getCurrentRulePack();

  for (const field of [
    "layerMap",
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "takeoff",
    "inspectionPolicy",
    "styleMap",
    "sheetSetup",
    "xrefPolicy",
    "hatchMap",
    "layoutPolicy",
    "polylineClosePolicy",
    "blockMap",
  ] as const) {
    assert.deepEqual(
      v10[field],
      v9[field],
      `Field ${field} của v10 lệch v9 — v10 phải là mở rộng thuần (M109 chỉ thêm ngắt nét giao chéo)`,
    );
  }
  assert.deepEqual(
    Object.keys(v10).filter((k) => !(k in v9)),
    [],
    "v10 không được thêm khối cấp cao nào — crossingPolicy nằm trong drawTools",
  );

  const { crossingPolicy: _bo, ...drawToolsV10 } = v10.drawTools;
  assert.deepEqual(drawToolsV10, v9.drawTools, "v10 đụng tham số drawTools ngoài crossingPolicy");
});

test("v10: crossingPolicy khai đủ nhưng TẮT sẵn, priority chỉ chứa id hệ có thật (M109 §5/AC8)", () => {
  const pack = getCurrentRulePack();
  const cp = pack.drawTools.crossingPolicy;

  assert.equal(cp.enabled, false, "Khóa mới phải mặc định tắt — nạp v10 không đổi hành vi (AC8)");
  assert.equal(cp.gapMode, "wipeout");
  assert.ok(cp.clearanceMm > 0 && cp.jogRadiusMm > 0);
  assert.ok(cp.layerSuffix.length > 0);
  assert.ok(cp.minAngleDeg > 0 && cp.minAngleDeg < 90);
  assert.ok(
    /^[A-Z0-9]/.test(cp.layerSuffix),
    "layerSuffix phải bắt đầu bằng [A-Z0-9] như edgeLayerSuffix",
  );

  const heThat = new Set(pack.drawTools.systems.map((h) => h.id));
  for (const id of cp.priority) {
    assert.ok(heThat.has(id), `priority chứa id hệ lạ "${id}" — phải là drawTools.systems[].id`);
  }
  assert.deepEqual(
    kiemCrossingPolicy(pack.drawTools),
    [],
    "Rule pack phát hành phải qua validator",
  );
});

test("v10: validator crossingPolicy bắt đủ 3 lỗi của M109 §5 + minAngleDeg/gapMode vô nghĩa", () => {
  const goc = getCurrentRulePack().drawTools;
  const voi = (chinh: Partial<CrossingPolicy>) => ({
    systems: goc.systems,
    crossingPolicy: { ...goc.crossingPolicy, ...chinh },
  });

  // (1) priority chứa id hệ lạ ("duct" là không gian id khác, không có trong drawTools.systems).
  const loiPriority = kiemCrossingPolicy(voi({ priority: ["duct", "PIPING"] }));
  assert.equal(loiPriority.length, 1);
  assert.match(loiPriority[0], /duct/);

  // (2) clearanceMm / jogRadiusMm phải dương.
  assert.match(kiemCrossingPolicy(voi({ clearanceMm: 0 }))[0], /clearanceMm/);
  assert.match(kiemCrossingPolicy(voi({ jogRadiusMm: -1 }))[0], /jogRadiusMm/);

  // (2b) minAngleDeg là ngưỡng lọc góc giao (0..90] — âm/NaN làm mọi góc đều "đủ lớn".
  assert.match(kiemCrossingPolicy(voi({ minAngleDeg: -5 }))[0], /minAngleDeg/);
  assert.match(kiemCrossingPolicy(voi({ minAngleDeg: 91 }))[0], /minAngleDeg/);
  assert.match(kiemCrossingPolicy(voi({ minAngleDeg: Number.NaN }))[0], /minAngleDeg/);

  // (2c) gapMode chỉ nhận wipeout | jog — sai thì chặn ngay, không để lọt tới adapter.
  assert.match(kiemCrossingPolicy(voi({ gapMode: "xoa-net" }))[0], /gapMode/);
  assert.deepEqual(kiemCrossingPolicy(voi({ gapMode: "jog" })), []);

  // (3) layerSuffix rỗng khi enabled — còn tắt thì chưa gây hại.
  assert.match(kiemCrossingPolicy(voi({ enabled: true, layerSuffix: "  " }))[0], /layerSuffix/);
  assert.deepEqual(kiemCrossingPolicy(voi({ enabled: false, layerSuffix: "" })), []);

  // Rule pack cũ chưa khai khóa này thì không phải lỗi.
  assert.deepEqual(kiemCrossingPolicy({ systems: goc.systems }), []);
});
