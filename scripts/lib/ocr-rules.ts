// scripts/lib/ocr-rules.ts — Hàm thuần cho bộ luật review OpenCodeReview (ADR-0012):
// dựng `.opencodereview/rule.json` từ manifest + mảnh luật, và giả lập đúng cách OCR
// (bản 1.12.11) chọn luật theo đường dẫn để `tests/ocr-rules.test.ts` canh thứ tự luật.
// Dùng chung giữa `scripts/gen-ocr-rules.ts` và test (không I/O ngoài tham số).
import path from "node:path";

export type OcrManifestRule = {
  id: string;
  path: string;
  fragments: string[];
  mergeSystemRule?: boolean;
};

export type OcrManifest = {
  include: string[];
  exclude: string[];
  rules: OcrManifestRule[];
};

export type OcrRuleEntry = { path: string; rule: string; merge_system_rule?: true };
export type OcrRuleFile = { include: string[]; exclude: string[]; rules: OcrRuleEntry[] };

const BOI_CANH = "_boi-canh";

/** Dựng nội dung rule.json: mảnh `_boi-canh` luôn đứng đầu mỗi luật, ngăn bằng `---`. */
export function buildOcrRuleFile(
  manifest: OcrManifest,
  readFragment: (name: string) => string,
): OcrRuleFile {
  return {
    include: manifest.include,
    exclude: manifest.exclude,
    rules: manifest.rules.map((r) => {
      const rule = [BOI_CANH, ...r.fragments]
        // Chuẩn hoá CRLF: máy Windows checkout autocrlf sẽ sinh rule.json khác bản Linux → test đỏ.
        .map((name) => readFragment(name).replace(/\r\n/g, "\n").trim())
        .join("\n\n---\n\n");
      const entry: OcrRuleEntry = { path: r.path, rule };
      if (r.mergeSystemRule) entry.merge_system_rule = true;
      return entry;
    }),
  };
}

/** Chuỗi ghi ra đĩa — cố định định dạng để so khớp từng byte trong test. */
export function serializeOcrRuleFile(file: OcrRuleFile): string {
  return JSON.stringify(file, null, 2) + "\n";
}

/**
 * Giống `expandBraces` của OCR: CHỈ tách cặp `{...}` đầu tiên (không lồng, không cặp thứ hai)
 * — nên manifest phải tuân giới hạn này, test canh.
 */
export function expandFirstBrace(pattern: string): string[] {
  const open = pattern.indexOf("{");
  if (open < 0) return [pattern];
  const close = pattern.indexOf("}", open + 1);
  if (close < 0) return [pattern];
  const prefix = pattern.slice(0, open);
  const suffix = pattern.slice(close + 1);
  return pattern
    .slice(open + 1, close)
    .split(",")
    .map((opt) => prefix + opt + suffix);
}

/**
 * So khớp doublestar không phân biệt hoa thường, như OCR (`Match(lower(p), lower(path))`).
 * Khác biệt đã biết: `path.matchesGlob` (minimatch) không cho `*`/`**` khớp segment bắt đầu bằng
 * `.` còn doublestar thì có — manifest hiện chỉ viết thư mục ẩn tường minh (`.github/...`).
 */
export function matchesOcrGlob(pattern: string, filePath: string): boolean {
  const target = filePath.toLowerCase();
  return expandFirstBrace(pattern).some((p) => path.matchesGlob(target, p.toLowerCase()));
}

/** Id của mục đầu tiên khớp (OCR: mục khớp đầu tiên thắng) hoặc null nếu không mục nào khớp. */
export function resolveRuleId(manifest: OcrManifest, filePath: string): string | null {
  for (const r of manifest.rules) {
    if (matchesOcrGlob(r.path, filePath)) return r.id;
  }
  return null;
}
