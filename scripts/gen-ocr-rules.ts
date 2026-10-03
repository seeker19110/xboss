// scripts/gen-ocr-rules.ts — Sinh `.opencodereview/rule.json` (file OCR đọc) từ
// `.opencodereview/rules/manifest.json` + các mảnh `.opencodereview/rules/*.md` (ADR-0012).
// Nguồn sự thật là manifest + mảnh; rule.json là file sinh — `tests/ocr-rules.test.ts` so khớp.
//
// Chạy: npm run gen:ocr-rules  (idempotent — chạy lại không đổi file nếu nguồn không đổi)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOcrRuleFile, serializeOcrRuleFile, type OcrManifest } from "./lib/ocr-rules";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULES_DIR = path.join(ROOT, ".opencodereview", "rules");
const OUT = path.join(ROOT, ".opencodereview", "rule.json");

const manifest = JSON.parse(
  fs.readFileSync(path.join(RULES_DIR, "manifest.json"), "utf8"),
) as OcrManifest;

function readFragment(name: string): string {
  const file = path.join(RULES_DIR, `${name}.md`);
  if (!fs.existsSync(file)) {
    throw new Error(`Thiếu mảnh luật "${name}" (${path.relative(ROOT, file)})`);
  }
  return fs.readFileSync(file, "utf8");
}

const out = buildOcrRuleFile(manifest, readFragment);
fs.writeFileSync(OUT, serializeOcrRuleFile(out));
console.log(`[OK] Đã sinh ${path.relative(ROOT, OUT)} — ${out.rules.length} mục luật.`);
