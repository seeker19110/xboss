// Canh bộ luật review OpenCodeReview (ADR-0012): rule.json khớp nguồn, mảnh luật đủ,
// và mỗi đường dẫn trọng yếu RESOLVE đúng luật theo ngữ nghĩa "mục khớp đầu tiên thắng".
// Không chạm DB nên không import ./setup.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildOcrRuleFile,
  serializeOcrRuleFile,
  expandFirstBrace,
  matchesOcrGlob,
  resolveRuleId,
  type OcrManifest,
} from "../scripts/lib/ocr-rules";

const ROOT = path.join(import.meta.dirname, "..");
const RULES_DIR = path.join(ROOT, ".opencodereview", "rules");
const RULE_JSON = path.join(ROOT, ".opencodereview", "rule.json");

const manifest = JSON.parse(
  fs.readFileSync(path.join(RULES_DIR, "manifest.json"), "utf8"),
) as OcrManifest;

const readFragment = (name: string) => fs.readFileSync(path.join(RULES_DIR, `${name}.md`), "utf8");

/** Đọc `package.json` lấy phiên bản OCR ghim trong script `ocr` (Việc B đối chiếu với workflow). */
function layPhienBanOcr(): string | null {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const m = /@alibaba-group\/open-code-review@(\d+\.\d+\.\d+)/.exec(pkg.scripts.ocr ?? "");
  return m ? m[1] : null;
}

test("rule.json trên đĩa khớp đúng bản sinh từ manifest + mảnh luật", () => {
  const mong = serializeOcrRuleFile(buildOcrRuleFile(manifest, readFragment));
  const thuc = fs.readFileSync(RULE_JSON, "utf8");
  assert.equal(
    thuc,
    mong,
    ".opencodereview/rule.json lệch nguồn — chạy `npm run gen:ocr-rules` rồi commit file sinh ra (đừng sửa tay rule.json).",
  );
});

test("mọi mảnh được tham chiếu đều tồn tại", () => {
  const ten = new Set<string>(["_boi-canh"]);
  for (const r of manifest.rules) for (const f of r.fragments) ten.add(f);
  for (const f of ten) {
    assert.ok(
      fs.existsSync(path.join(RULES_DIR, `${f}.md`)),
      `Thiếu mảnh .opencodereview/rules/${f}.md — tạo file hoặc bỏ "${f}" khỏi manifest.json.`,
    );
  }
});

test("mọi mảnh *.md (trừ _boi-canh) được ít nhất 1 mục luật dùng", () => {
  const dung = new Set(manifest.rules.flatMap((r) => r.fragments));
  for (const file of fs.readdirSync(RULES_DIR)) {
    if (!file.endsWith(".md") || file === "_boi-canh.md") continue;
    const ten = file.slice(0, -3);
    assert.ok(
      dung.has(ten),
      `Mảnh ${file} không mục nào trong manifest.json dùng — thêm vào fragments của một mục hoặc xoá file.`,
    );
  }
});

test("id luật không trùng nhau", () => {
  const thay = new Set<string>();
  for (const r of manifest.rules) {
    assert.ok(!thay.has(r.id), `id "${r.id}" bị trùng trong manifest.json — đặt id khác nhau.`);
    thay.add(r.id);
  }
});

test("path chỉ có tối đa 1 cặp {} và không lồng nhau (OCR chỉ tách cặp đầu)", () => {
  for (const r of manifest.rules) {
    const mo = (r.path.match(/\{/g) ?? []).length;
    const dong = (r.path.match(/\}/g) ?? []).length;
    assert.ok(
      mo <= 1 && dong <= 1 && mo === dong,
      `path của "${r.id}" (${r.path}) có brace lồng/nhiều cặp — OCR chỉ mở rộng cặp {} đầu tiên; tách thành các mục luật riêng.`,
    );
    if (mo === 1) {
      assert.ok(
        r.path.indexOf("{") < r.path.indexOf("}"),
        `path của "${r.id}" có "}" đứng trước "{" — sửa lại cặp ngoặc.`,
      );
    }
  }
});

const BANG_ANH_XA: [string, string][] = [
  ["lib/tien-do/recompute.ts", "tien-do"],
  ["lib/tien-do/status.ts", "tien-do"],
  ["app/api/tasks/[id]/approve/route.ts", "nghiem-thu"],
  ["app/api/approvals/route.ts", "nghiem-thu"],
  ["app/api/tasks/[id]/progress/route.ts", "tick-tien-do"],
  ["app/api/tasks/[id]/dimensions/route.ts", "tick-tien-do"],
  ["app/api/dimensions/[id]/route.ts", "tick-tien-do"],
  ["lib/bao-mat/auth.ts", "phien-quyen"],
  ["lib/bao-mat/session-token.ts", "phien-quyen"],
  ["lib/nen/roles.ts", "phien-quyen"],
  ["proxy.ts", "phien-quyen"],
  ["lib/bao-mat/ratelimit.ts", "bao-mat-lib"],
  ["app/api/auth/login/route.ts", "bao-mat-route"],
  ["lib/vat-tu/material-sync.ts", "dong-bo-sheet-lib"],
  ["app/api/materials/sync/route.ts", "dong-bo-sheet-route"],
  ["app/api/cron/sync-sheets/route.ts", "dong-bo-sheet-route"],
  ["lib/khoi-luong/boq.ts", "boq-lib"],
  ["app/api/boq/export/route.ts", "boq-route"],
  ["app/api/cron/daily-report/route.ts", "cron"],
  ["lib/tai-chinh/contracts.ts", "tai-chinh-lib"],
  ["app/api/payment-certs/[id]/excel/route.ts", "tai-chinh-route"],
  ["app/api/costs/route.ts", "tai-chinh-route"],
  ["app/api/v1/payment-certs/route.ts", "tai-chinh-route"],
  ["lib/dich-vu/thong-bao.ts", "thong-bao-lib"],
  ["lib/van-hanh/push.ts", "thong-bao-lib"],
  ["app/api/notifications/route.ts", "thong-bao-route"],
  ["app/api/export/excel/route.ts", "xuat-file"],
  ["app/api/admin/audit-log/export/route.ts", "xuat-file"],
  ["app/api/dashboard/route.ts", "route-api"],
  ["app/api/v1/tasks/route.ts", "route-api"],
  ["lib/db/index.ts", "lib"],
  ["scripts/check-db-params.ts", "scripts"],
  ["migrations/0001_baseline.sql", "migration"],
  ["public/sw.js", "offline-pwa"],
  ["app/components/offlineQueue/index.ts", "offline-pwa"],
  ["app/tracking/[sheet]/TrackingGrid.tsx", "giao-dien"],
  ["app/globals.css", "giao-dien"],
  ["tests/recompute.test.ts", "test"],
  ["e2e/authed/approvals.spec.ts", "e2e"],
  [".github/workflows/ci.yml", "workflow"],
  ["lib/dich-vu/luong.ts", "dich-vu"],
];

test("bảng ánh xạ đường dẫn → luật: file tồn tại và resolve đúng id", () => {
  for (const [file, id] of BANG_ANH_XA) {
    assert.ok(
      fs.existsSync(path.join(ROOT, file)),
      `Đường dẫn ${file} trong bảng ánh xạ không còn tồn tại — file bị đổi tên/xoá: cập nhật bảng ở tests/ocr-rules.test.ts và path trong manifest.json.`,
    );
    assert.equal(
      resolveRuleId(manifest, file),
      id,
      `${file} phải dùng luật "${id}" nhưng resolve ra "${resolveRuleId(manifest, file)}" — kiểm thứ tự/path trong .opencodereview/rules/manifest.json (mục cụ thể phải đứng trước mục rộng).`,
    );
  }
});

test("tiền tố tĩnh của mọi path trong manifest còn tồn tại", () => {
  for (const r of manifest.rules) {
    for (const p of expandFirstBrace(r.path)) {
      const idx = p.search(/[*?[{]/);
      if (idx < 0) {
        assert.ok(
          fs.existsSync(path.join(ROOT, p)),
          `Luật "${r.id}": file ${p} không còn tồn tại — đổi tên/xoá mà quên cập nhật manifest.json.`,
        );
        continue;
      }
      const truoc = p.slice(0, idx);
      const thuMuc = truoc.slice(0, truoc.lastIndexOf("/"));
      if (!thuMuc) continue;
      assert.ok(
        fs.existsSync(path.join(ROOT, thuMuc)),
        `Luật "${r.id}": thư mục ${thuMuc} (từ path "${p}") không còn tồn tại — cập nhật manifest.json.`,
      );
    }
  }
});

// Route dùng nghiệp vụ tài chính mà không nhận luật `tai-chinh` (chỉ `route-api`) là lỗ hổng phủ
// luật âm thầm — danh sách thư mục tài chính trong manifest liệt kê tay nên dễ sót khi thêm route.
const KHONG_PHAI_ROUTE_TAI_CHINH: Record<string, string> = {
  "app/api/vehicles":
    "logistics xe — chỉ dùng helper danh sách/trạng thái xe trong lib/tai-chinh/procurement, không tính tiền",
};

test("mọi route import @/lib/tai-chinh/ đều nhận luật tai-chinh-route", () => {
  const thieu: string[] = [];
  const duyet = (thuMuc: string) => {
    for (const muc of fs.readdirSync(path.join(ROOT, thuMuc), { withFileTypes: true })) {
      const rel = `${thuMuc}/${muc.name}`;
      if (muc.isDirectory()) duyet(rel);
      else if (/\.tsx?$/.test(muc.name)) {
        const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
        if (!src.includes("@/lib/tai-chinh/")) continue;
        if (Object.keys(KHONG_PHAI_ROUTE_TAI_CHINH).some((g) => rel.startsWith(`${g}/`))) continue;
        if (resolveRuleId(manifest, rel) !== "tai-chinh-route") thieu.push(rel);
      }
    }
  };
  duyet("app/api");
  assert.deepEqual(
    thieu,
    [],
    "Route dùng lib/tai-chinh nhưng không nhận luật tài chính — thêm thư mục vào path của mục `tai-chinh-route` trong .opencodereview/rules/manifest.json (rồi `npm run gen:ocr-rules`), hoặc vào KHONG_PHAI_ROUTE_TAI_CHINH kèm lý do nếu thật sự không phải nghiệp vụ tiền.",
  );
});

test("include/exclude khớp đúng các file mong đợi", () => {
  const khop = (mau: string[], f: string) => mau.some((m) => matchesOcrGlob(m, f));
  assert.ok(khop(manifest.include, "tests/recompute.test.ts"), "include phải khớp tests/**.");
  assert.ok(khop(manifest.include, "e2e/authed/approvals.spec.ts"), "include phải khớp e2e/**.");
  assert.ok(khop(manifest.exclude, ".opencodereview/rule.json"), "exclude phải loại rule.json.");
  assert.ok(khop(manifest.exclude, "package-lock.json"), "exclude phải loại package-lock.json.");
});

test("expandFirstBrace: chỉ tách cặp đầu, không brace thì giữ nguyên", () => {
  assert.deepEqual(expandFirstBrace("a/b.ts"), ["a/b.ts"]);
  assert.deepEqual(expandFirstBrace("a/{x,y}/**"), ["a/x/**", "a/y/**"]);
  assert.deepEqual(expandFirstBrace("{a,b}/{c,d}"), ["a/{c,d}", "b/{c,d}"]);
});

test("script ocr ghim phiên bản semver hợp lệ", () => {
  const v = layPhienBanOcr();
  assert.ok(
    v && /^\d+\.\d+\.\d+$/.test(v),
    'Script "ocr" trong package.json phải ghim @alibaba-group/open-code-review@<major.minor.patch>.',
  );
});

test("phiên bản OCR ghim khớp nhau: package.json = ocr_version workflow = comment # vX", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ocr-review.yml"), "utf8");
  const dong = /uses:\s*alibaba\/open-code-review@([0-9a-f]+)\s*#\s*v(\d+\.\d+\.\d+)/.exec(wf);
  assert.ok(
    dong,
    "Workflow ocr-review.yml phải có `uses: alibaba/open-code-review@<sha> # vX.Y.Z`.",
  );
  assert.match(dong[1], /^[0-9a-f]{40}$/, "Action phải pin SHA đầy đủ 40 ký tự hex.");
  const ocrVersion = /ocr_version:\s*"(\d+\.\d+\.\d+)"/.exec(wf);
  assert.ok(ocrVersion, 'Workflow phải khai `ocr_version: "X.Y.Z"`.');
  const pkg = layPhienBanOcr();
  assert.equal(
    ocrVersion[1],
    pkg,
    "ocr_version trong workflow lệch phiên bản script `ocr` ở package.json.",
  );
  assert.equal(
    dong[2],
    pkg,
    "Comment `# vX` sau SHA action lệch phiên bản script `ocr` ở package.json.",
  );
});
