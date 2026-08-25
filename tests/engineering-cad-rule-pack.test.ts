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
  CURRENT_RULE_PACK_VERSION,
} from "@/lib/ky-thuat/cad/rule-pack";
import {
  normalizeCadLayers,
  convertTcvn3ToUnicode,
  convertVniToUnicode,
} from "@/lib/ky-thuat/cad/dxf-parser";

// ===== (1) Cấu trúc & ETag =====

test("rule pack: đủ 8 field theo API contract M99 §10 + 2 khối v4 + styleMap v5 + 3 khối v7, version = v7", () => {
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
  assert.equal(pack.version, "v7");
  assert.equal(CURRENT_RULE_PACK_VERSION, "v7");
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

test("rule pack v7 là mở rộng thuần của v6: chỉ thêm 3 khối chính sách chuẩn hóa (M101 §6.2 FR3)", async () => {
  const v6 = (await import("@/lib/ky-thuat/cad/rule-packs/v6.json")).default;
  const v7 = getCurrentRulePack();

  for (const field of [
    "layerMap",
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "takeoff",
    "inspectionPolicy",
    "styleMap",
    "drawTools",
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
