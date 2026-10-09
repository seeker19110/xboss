import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyEvidence,
  decide,
  parseRetentionArgs,
  runRetention,
} from "../scripts/lib/retention";

const NOW = Date.parse("2026-10-09T00:00:00Z");
const DAY = 86_400_000;
const LIMITS = {
  evidencePassDays: 35,
  evidenceFailDays: 365,
  drillPassDays: 7,
  drillFailDays: 35,
};

function ago(days: number): string {
  return new Date(NOW - days * DAY).toISOString();
}

test("A6-AC06: bảng quyết định PASS/FAIL x tuổi x ngưỡng", () => {
  assert.equal(decide("evidence", "PASS", 40, LIMITS).verdict, "delete");
  assert.equal(decide("evidence", "PASS", 10, LIMITS).verdict, "keep");
  assert.equal(decide("evidence", "FAIL", 40, LIMITS).verdict, "keep");
  assert.equal(decide("evidence", "FAIL", 400, LIMITS).verdict, "delete");
  assert.equal(decide("drill-run", "PASS", 8, LIMITS).verdict, "delete");
  assert.equal(decide("drill-run", "PASS", 6, LIMITS).verdict, "keep");
  assert.equal(decide("drill-run", "FAIL", 40, LIMITS).verdict, "delete");
  assert.equal(decide("drill-run", "FAIL", 10, LIMITS).verdict, "keep");
});

test("A6-AC06: JSON hỏng/thiếu cờ → không nhận (không đụng); cờ false → FAIL; true → PASS", () => {
  assert.equal(classifyEvidence("{không phải json").recognized, false);
  assert.equal(classifyEvidence("[]").recognized, false);
  assert.equal(classifyEvidence("{}").recognized, false);
  assert.equal(classifyEvidence('{"name":"xboss","version":"0.3.0"}').recognized, false);
  const fail = classifyEvidence('{"completeDrVerified":false}');
  assert.equal(fail.recognized, true);
  assert.equal(fail.outcome, "FAIL");
  assert.equal(classifyEvidence('{"completeDrVerified":true}').outcome, "PASS");
  const pitr = classifyEvidence(
    '{"completePitrVerified":true,"completedAt":"2026-10-01T00:00:00Z","drillRunDir":"run-1"}',
  );
  assert.equal(pitr.outcome, "PASS");
  assert.equal(pitr.drillRunDir, "run-1");
  assert.equal(pitr.timestampMs, Date.parse("2026-10-01T00:00:00Z"));
});

test("A6-AC06: --force-run chỉ áp đúng id, id sai mẫu bị từ chối", () => {
  const opts = parseRetentionArgs(
    ["--evidence-dir", "/x", "--drill-dir", "/y", "--force-run", "run-a"],
    NOW,
  );
  assert.deepEqual(opts.forceRuns, ["run-a"]);
  assert.equal(
    decide("drill-run", "FAIL", 1, LIMITS, opts.forceRuns.includes("run-a")).verdict,
    "delete",
  );
  assert.equal(
    decide("drill-run", "FAIL", 1, LIMITS, opts.forceRuns.includes("run-b")).verdict,
    "keep",
  );
  assert.throws(() => parseRetentionArgs(["--evidence-dir", "/x", "--force-run", "../etc"], NOW));
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "retention-"));
  const ev = join(root, "evidence");
  const drill = join(root, "drill");
  mkdirSync(ev);
  mkdirSync(drill);
  const put = (name: string, body: object | string) =>
    writeFileSync(join(ev, name), typeof body === "string" ? body : JSON.stringify(body));
  put("pass40.json", { completeDrVerified: true, completedAt: ago(40) });
  put("fail40.json", { completeDrVerified: false, completedAt: ago(40) });
  put("pass10.json", { completeDrVerified: true, completedAt: ago(10) });
  put("pitr-b.json", { completePitrVerified: true, completedAt: ago(10), drillRunDir: "run-b" });
  put("note.txt", "tệp lạ");
  // Không phải evidence (gõ nhầm --evidence-dir vào repo): JSON hợp lệ, rất cũ — KHÔNG được xoá.
  put("package.json", { name: "xboss", version: "0.3.0" });
  {
    const t = new Date(NOW - 900 * DAY);
    utimesSync(join(ev, "package.json"), t, t);
  }
  symlinkSync(join(ev, "pass40.json"), join(ev, "link.json"));
  for (const [name, days] of [
    ["run-a", 40],
    ["run-b", 5],
  ] as const) {
    mkdirSync(join(drill, name));
    writeFileSync(join(drill, name, "postgres.log"), "log");
    const t = new Date(NOW - days * DAY);
    utimesSync(join(drill, name), t, t);
  }
  mkdirSync(join(drill, "khac"));
  return { root, ev, drill };
}

const base = (f: { ev: string; drill: string }, extra: string[] = []) => [
  "--evidence-dir",
  f.ev,
  "--drill-dir",
  f.drill,
  ...extra,
];

test("A6-AC06: dry-run mặc định không xoá gì", () => {
  const f = fixture();
  const lines: string[] = [];
  assert.equal(
    runRetention(base(f), {}, (l) => lines.push(l), NOW),
    0,
  );
  for (const p of [
    join(f.ev, "pass40.json"),
    join(f.ev, "fail40.json"),
    join(f.drill, "run-a"),
    join(f.drill, "run-b"),
  ]) {
    assert.ok(existsSync(p), p);
  }
  assert.match(lines.join("\n"), /DRY-RUN/);
});

test("A6-AC06: --apply xoá đúng {PASS 40 ngày, run-a}, idempotent, tệp lạ/symlink còn", () => {
  const f = fixture();
  const lines: string[] = [];
  assert.equal(
    runRetention(base(f, ["--apply"]), {}, (l) => lines.push(l), NOW),
    0,
  );
  assert.equal(existsSync(join(f.ev, "pass40.json")), false);
  assert.equal(existsSync(join(f.drill, "run-a")), false);
  for (const p of [
    join(f.ev, "fail40.json"),
    join(f.ev, "pass10.json"),
    join(f.ev, "pitr-b.json"),
    join(f.ev, "note.txt"),
    join(f.drill, "run-b"),
    join(f.drill, "khac"),
    join(f.ev, "package.json"),
  ]) {
    assert.ok(existsSync(p), p);
  }
  // Symlink phải còn nguyên (đích pass40.json đã xoá nên existsSync trả false → kiểm bằng lstat).
  assert.ok(lstatSync(join(f.ev, "link.json")).isSymbolicLink());
  assert.match(lines.join("\n"), /Đã xoá 1 tệp evidence, 1 thư mục run-\*/);
  const lan2: string[] = [];
  assert.equal(
    runRetention(base(f, ["--apply"]), {}, (l) => lan2.push(l), NOW),
    0,
  );
  assert.match(lan2.join("\n"), /Đã xoá 0 tệp evidence, 0 thư mục run-\*/);
});

test("A6-AC06: --force-run xoá sớm đúng run chỉ định; --json có đủ trường", () => {
  const f = fixture();
  const out: string[] = [];
  runRetention(base(f, ["--json", "--force-run", "run-b"]), {}, (l) => out.push(l), NOW);
  const data = JSON.parse(out.join(""));
  assert.equal(data.dryRun, true);
  const runB = data.items.find((i: { path: string }) => i.path.endsWith("run-b"));
  assert.equal(runB.verdict, "delete");
  assert.ok(existsSync(join(f.drill, "run-b")));
  runRetention(base(f, ["--apply", "--force-run", "run-b"]), {}, () => {}, NOW);
  assert.equal(existsSync(join(f.drill, "run-b")), false);
  assert.ok(existsSync(join(f.ev, "pitr-b.json")));
});

test("A6-AC06: từ chối thư mục nguy hiểm (exit 2, không xoá)", () => {
  const f = fixture();
  const backup = join(f.root, "backups");
  mkdirSync(backup);
  const sub = join(backup, "ev");
  mkdirSync(sub);
  writeFileSync(join(sub, "x.json"), "{}");
  const old = new Date(NOW - 999 * DAY);
  utimesSync(join(sub, "x.json"), old, old);
  const env = { BACKUP_DIR: backup };
  assert.equal(
    runRetention(["--evidence-dir", backup, "--apply"], env, () => {}),
    2,
  );
  assert.equal(
    runRetention(["--evidence-dir", sub, "--apply"], env, () => {}),
    2,
  );
  assert.equal(
    runRetention(["--evidence-dir", "/", "--apply"], {}, () => {}),
    2,
  );
  assert.equal(
    runRetention(["--evidence-dir", process.env.HOME ?? "/root", "--apply"], {}, () => {}),
    2,
  );
  assert.equal(
    runRetention(["--apply"], {}, () => {}),
    2,
  );
  // Thư mục CHA của kho backup (quét run-* ở đó có thể chạm kho) và --now đi cùng --apply.
  assert.equal(
    runRetention(["--evidence-dir", sub, "--drill-dir", f.root, "--apply"], env, () => {}),
    2,
  );
  assert.equal(
    runRetention(
      ["--evidence-dir", sub, "--apply", "--now", new Date(NOW).toISOString()],
      {},
      () => {},
    ),
    2,
  );
  assert.ok(existsSync(join(sub, "x.json")));
  assert.ok(existsSync(join(sub, "x.json")));
});
