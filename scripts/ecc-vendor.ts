// scripts/ecc-vendor.ts — Sinh lớp ECC vendor trong .claude/ từ một checkout ECC (ADR-0012).
//
// Chạy:
//   git clone https://github.com/affaan-m/ECC /tmp/ecc && git -C /tmp/ecc checkout <commit>
//   npx tsx scripts/ecc-vendor.ts --src /tmp/ecc
//
// Lên phiên bản ECC mới: đổi `upstream.commit` (+ `version`) trong .claude/ecc/manifest.json,
// checkout đúng commit đó, chạy lại lệnh trên, đọc `git diff` của .claude/ trước khi commit
// (nội dung vendor là chỉ dẫn cho agent — phải đọc như đọc code).
//
// Script CHỈ đọc file markdown của checkout và ghi vào .claude/ — không chạy bất kỳ mã nào
// của ECC. Xoá sạch rồi sinh lại toàn bộ file `ecc-*` để mục bị gỡ khỏi manifest không còn sót.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  bienDoi,
  DUONG_LICENSE,
  DUONG_LOCK,
  lapKeHoach,
  sha256,
  type ManifestEcc,
} from "./lib/ecc-vendor";

const GOC = process.cwd();
const DUONG_MANIFEST = ".claude/ecc/manifest.json";

function doiSo(ten: string): string | undefined {
  const i = process.argv.indexOf(ten);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function lietKeDeQuy(thuMuc: string): string[] {
  const ra: string[] = [];
  for (const ten of readdirSync(thuMuc)) {
    const day = join(thuMuc, ten);
    if (statSync(day).isDirectory()) ra.push(...lietKeDeQuy(day).map((f) => join(ten, f)));
    else ra.push(ten);
  }
  return ra.sort();
}

function xoaVendorCu(prefix: string): void {
  for (const thu of [".claude/agents", ".claude/commands", ".claude/skills"]) {
    const day = join(GOC, thu);
    if (!existsSync(day)) continue;
    for (const ten of readdirSync(day)) {
      if (ten.startsWith(prefix)) rmSync(join(day, ten), { recursive: true, force: true });
    }
  }
  rmSync(join(GOC, ".claude/rules/ecc"), { recursive: true, force: true });
}

function main(): void {
  const src = doiSo("--src");
  if (!src) {
    console.error("Thiếu --src <đường dẫn checkout ECC>. Xem hướng dẫn ở đầu file.");
    process.exit(1);
  }
  const m = JSON.parse(readFileSync(join(GOC, DUONG_MANIFEST), "utf8")) as ManifestEcc;

  const head = execFileSync("git", ["-C", src, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== m.upstream.commit) {
    console.error(
      `[LỖI] Checkout ECC đang ở ${head}, manifest ghim ${m.upstream.commit}. ` +
        "Checkout đúng commit, hoặc đổi manifest trước nếu chủ đích lên phiên bản.",
    );
    process.exit(1);
  }

  const keHoach = lapKeHoach(m, (ten) => lietKeDeQuy(join(src, "skills", ten)));
  xoaVendorCu(m.prefix);

  const lock: Record<string, string> = {};
  for (const muc of keHoach) {
    const noiDung = bienDoi(readFileSync(join(src, muc.src), "utf8"), muc, m);
    const dich = join(GOC, muc.dest);
    mkdirSync(dirname(dich), { recursive: true });
    writeFileSync(dich, noiDung);
    lock[muc.dest] = sha256(noiDung);
  }
  const license = readFileSync(join(src, "LICENSE"), "utf8");
  writeFileSync(join(GOC, DUONG_LICENSE), license);
  lock[DUONG_LICENSE] = sha256(license);

  const sapXep = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    join(GOC, DUONG_LOCK),
    JSON.stringify({ commit: m.upstream.commit, files: sapXep }, null, 2) + "\n",
  );

  const dem = (loai: string) => keHoach.filter((k) => k.loai === loai).length;
  console.log(
    `OK — ${m.agents.length} agent, ${m.skills.length} skill (${dem("skill")} file), ` +
      `${m.commands.length} command, ${m.rules.length} rule từ ECC@${head.slice(0, 7)}. ` +
      `Lock: ${relative(GOC, join(GOC, DUONG_LOCK))}.`,
  );
}

main();
