// M109 §9 — đối chứng 2 tầng cho validator `drawTools.crossingPolicy`.
//
// Bộ ca viết tay ở `plugin-autocad/doi-chung/crossing-doi-chung.json` là dữ liệu VÀO duy nhất:
// test này canh tầng 3 (TS, `kiemCrossingPolicy`), `XBoss.Cad.Tests/CrossingDoiChungTests.cs` canh
// tầng 2 (C#, `DrawToolsConfig.ValidateCrossingPolicy`). Một tầng nới lỏng/siết chặt luật mà tầng
// kia không đổi theo là đỏ ngay — rủi ro số 1 của M99 (trôi quy tắc giữa 2 tầng).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getCurrentRulePack,
  kiemCrossingPolicy,
  CURRENT_RULE_PACK_VERSION,
  type CrossingPolicy,
} from "@/lib/ky-thuat/cad/rule-pack";

const bo = JSON.parse(
  readFileSync(
    join(process.cwd(), "plugin-autocad", "doi-chung", "crossing-doi-chung.json"),
    "utf8",
  ),
) as {
  rulePackVersion: string;
  systemIds: string[];
  cases: { ma: string; khoaLoi: string | null; crossingPolicy: CrossingPolicy }[];
};

test("đối chứng crossingPolicy bám đúng rule pack đang phát hành", () => {
  assert.equal(bo.rulePackVersion, CURRENT_RULE_PACK_VERSION);
  assert.deepEqual(
    [...bo.systemIds].sort(),
    getCurrentRulePack()
      .drawTools.systems.map((h) => h.id)
      .sort(),
    "systemIds của bộ đối chứng lệch tập hệ thật trong rule pack",
  );
  assert.ok(bo.cases.length > 0);
});

test("tầng 3 cho kết quả đúng như khai ở từng ca đối chứng", () => {
  const systems = bo.systemIds.map((id) => ({ id }));
  for (const ca of bo.cases) {
    const loi = kiemCrossingPolicy({ systems, crossingPolicy: ca.crossingPolicy });
    if (ca.khoaLoi === null) {
      assert.deepEqual(loi, [], `Ca "${ca.ma}" phải hợp lệ nhưng validator báo lỗi`);
      continue;
    }
    assert.equal(loi.length, 1, `Ca "${ca.ma}" phải cho đúng 1 lỗi (tầng C# ném ở lỗi đầu tiên)`);
    assert.ok(
      loi[0].includes(ca.khoaLoi),
      `Ca "${ca.ma}": thông báo lỗi không nhắc khóa "${ca.khoaLoi}" — ${loi[0]}`,
    );
  }
});
