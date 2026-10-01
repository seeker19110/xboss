import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  bienDoi,
  doiMoTa,
  doiThamChieu,
  DUONG_LOCK,
  lapKeHoach,
  laFileVendor,
  sha256,
  tachFrontmatter,
  type ManifestEcc,
  type MucVendor,
} from "../scripts/lib/ecc-vendor";

// Lớp ECC vendor (ADR-0012): nội dung upstream được sinh bởi scripts/ecc-vendor.ts và KHÔNG
// được sửa tay — muốn đổi hành vi thì sửa lớp XBoss (.claude/rules/00-uu-tien-ecc.md) hoặc
// manifest rồi sinh lại. Test này là chốt chặn: sha256 từng file phải khớp lock.json, không có
// file ecc-* "mồ côi" ngoài lock, và phép biến đổi giữ đúng các bất biến định tuyến.

const GOC = process.cwd();
const manifest = JSON.parse(
  readFileSync(join(GOC, ".claude/ecc/manifest.json"), "utf8"),
) as ManifestEcc;
const lock = JSON.parse(readFileSync(join(GOC, DUONG_LOCK), "utf8")) as {
  commit: string;
  files: Record<string, string>;
};

function lietKe(thuMuc: string): string[] {
  if (!existsSync(thuMuc)) return [];
  const ra: string[] = [];
  for (const ten of readdirSync(thuMuc)) {
    const day = join(thuMuc, ten);
    if (statSync(day).isDirectory()) ra.push(...lietKe(day));
    else ra.push(relative(GOC, day).split("\\").join("/"));
  }
  return ra;
}

test("lock.json ghim đúng commit trong manifest", () => {
  assert.equal(lock.commit, manifest.upstream.commit);
});

test("mọi file vendor khớp sha256 trong lock (không sửa tay)", () => {
  const sai: string[] = [];
  for (const [duong, bam] of Object.entries(lock.files)) {
    const day = join(GOC, duong);
    if (!existsSync(day)) sai.push(`${duong}: thiếu file`);
    else if (sha256(readFileSync(day, "utf8")) !== bam) sai.push(`${duong}: nội dung lệch lock`);
  }
  assert.deepEqual(
    sai,
    [],
    "File ECC vendor bị sửa tay hoặc thiếu — sinh lại bằng `npx tsx scripts/ecc-vendor.ts --src <checkout ECC>`",
  );
});

test("không có file ecc-* mồ côi ngoài lock", () => {
  const trenDia = [
    ".claude/agents",
    ".claude/commands",
    ".claude/skills",
    ".claude/rules",
    ".claude/ecc",
  ]
    .flatMap((t) => lietKe(join(GOC, t)))
    .filter((f) => laFileVendor(f, manifest.prefix));
  const moCoi = trenDia.filter((f) => !(f in lock.files));
  assert.deepEqual(moCoi, [], "Thêm mục vào manifest.json rồi sinh lại, đừng chép tay");
});

test("manifest ↔ lock: mọi mục khai báo đều đã sinh", () => {
  const p = manifest.prefix;
  const thieu: string[] = [];
  for (const a of manifest.agents) if (!lock.files[`.claude/agents/${p}${a}.md`]) thieu.push(a);
  for (const s of manifest.skills)
    if (!lock.files[`.claude/skills/${p}${s}/SKILL.md`]) thieu.push(s);
  for (const c of manifest.commands) if (!lock.files[`.claude/commands/${p}${c}.md`]) thieu.push(c);
  for (const r of manifest.rules) if (!lock.files[`.claude/rules/ecc/${r}`]) thieu.push(r);
  assert.deepEqual(thieu, []);
});

test("chỉ vendor markdown (+ LICENSE) — không mã thực thi bên thứ ba", () => {
  const la = Object.keys(lock.files).filter(
    (f) => !f.endsWith(".md") && f !== ".claude/ecc/LICENSE",
  );
  assert.deepEqual(la, []);
});

test("agent/skill vendor mang tên ecc-* và mô tả (ECC); agent không còn cụm giành việc", () => {
  const loi: string[] = [];
  const fileChinh = Object.keys(lock.files).filter(
    (f) =>
      /^\.claude\/agents\/ecc-.*\.md$/.test(f) ||
      /^\.claude\/skills\/ecc-[^/]+\/SKILL\.md$/.test(f),
  );
  assert.equal(fileChinh.length, manifest.agents.length + manifest.skills.length);
  for (const f of fileChinh) {
    const { fm } = tachFrontmatter(readFileSync(join(GOC, f), "utf8"));
    if (!fm) {
      loi.push(`${f}: thiếu frontmatter`);
      continue;
    }
    if (!/^name: ecc-[a-z0-9-]+$/m.test(fm)) loi.push(`${f}: name không có tiền tố ecc-`);
    if (!/^description: "?\(ECC\) /m.test(fm)) loi.push(`${f}: description thiếu (ECC)`);
    if (
      f.startsWith(".claude/agents/") &&
      /PROACTIVELY|MUST BE USED|Automatically activated/.test(fm)
    )
      loi.push(`${f}: description còn cụm giành việc khỏi luồng 3 tầng`);
  }
  assert.deepEqual(loi, []);
});

// ── Phép biến đổi (fixture, không cần checkout ECC) ──

const mFake: ManifestEcc = {
  upstream: {
    repo: "https://example.test/ecc",
    commit: "abcdef0123",
    version: "0",
    license: "MIT",
  },
  prefix: "ecc-",
  agents: ["planner"],
  skills: ["tdd"],
  commands: ["plan"],
  rules: ["common/testing.md"],
};

test("doiMoTa: agent gỡ cụm giành việc, giữ ngoặc kép, chặn YAML vỡ", () => {
  assert.equal(
    doiMoTa(" Planner. Use PROACTIVELY when asked. MUST BE USED for all code.", "agent"),
    "(ECC) Planner. Use when asked. Gọi theo bảng định tuyến ECC trong CLAUDE.md, không thay luồng 3 tầng XBoss.",
  );
  assert.equal(doiMoTa(' "TDD: write tests first"', "skill"), '"(ECC) TDD: write tests first"');
  assert.throws(() => doiMoTa(" a: b", "skill"), /YAML sẽ vỡ/);
  assert.throws(() => doiMoTa(" >", "skill"), /khối YAML/);
});

test("doiThamChieu: ecc:<tên> → ecc-<tên>, không đụng ecc@ecc", () => {
  assert.equal(
    doiThamChieu("dùng ecc:planner rồi ecc:tdd-guide; plugin ecc@ecc", "ecc-"),
    "dùng ecc-planner rồi ecc-tdd-guide; plugin ecc@ecc",
  );
});

test("lapKeHoach: từ chối skill chứa file không phải markdown", () => {
  assert.throws(
    () => lapKeHoach(mFake, () => ["SKILL.md", "scripts/run.js"]),
    /không phải markdown/,
  );
  const ke = lapKeHoach(mFake, () => ["SKILL.md", "references/a.md"]);
  assert.deepEqual(
    ke.map((k) => [k.loai, k.dest, k.laFileChinh]),
    [
      ["agent", ".claude/agents/ecc-planner.md", true],
      ["skill", ".claude/skills/ecc-tdd/SKILL.md", true],
      ["skill", ".claude/skills/ecc-tdd/references/a.md", false],
      ["command", ".claude/commands/ecc-plan.md", true],
      ["rule", ".claude/rules/ecc/common/testing.md", false],
    ],
  );
});

test("bienDoi: đổi name/description file chính, chèn nguồn, giữ frontmatter rule", () => {
  const agent: MucVendor = {
    loai: "agent",
    src: "agents/planner.md",
    dest: ".claude/agents/ecc-planner.md",
    ten: "ecc-planner",
    laFileChinh: true,
  };
  const ra = bienDoi(
    "---\r\nname: planner\r\ndescription: Plans. Use PROACTIVELY.\r\nmodel: opus\r\n---\r\nGọi ecc:architect.\r\n",
    agent,
    mFake,
  );
  assert.match(ra, /^---\nname: ecc-planner\ndescription: \(ECC\) Plans\. Use\. Gọi theo/);
  assert.match(
    ra,
    /\nmodel: opus\n---\n<!-- ECC vendor: https:\/\/example\.test\/ecc @ abcdef0 · agents\/planner\.md/,
  );
  assert.match(ra, /Gọi ecc-architect\./);

  const rule: MucVendor = {
    loai: "rule",
    src: "rules/common/testing.md",
    dest: ".claude/rules/ecc/common/testing.md",
    ten: "",
    laFileChinh: false,
  };
  assert.match(bienDoi("# Testing\n", rule, mFake), /^<!-- ECC vendor: .*-->\n\n# Testing\n$/);
  const coPaths = bienDoi('---\npaths:\n  - "**/*.ts"\n---\n# TS\n', rule, mFake);
  assert.match(coPaths, /^---\npaths:\n {2}- "\*\*\/\*\.ts"\n---\n<!-- ECC vendor/);
});
