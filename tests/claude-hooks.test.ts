import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Hook Claude Code của XBoss (ADR-0013 — port từ ECC, viết lại theo luật dự án). Hook là lớp
// THI HÀNH thật cho các luật trước đây chỉ nằm trong văn bản (migration append-only, không sửa
// tay lớp vendor, vùng rủi ro §8, PROGRESS.md trước push, cổng CI tĩnh trước khi dừng lượt) —
// hook hỏng im lặng (thiếu jq, sai đường dẫn, sai định dạng JSON) là luật biến mất mà không ai
// biết. Test chạy từng hook thật bằng bash trên một repo git fixture dựng riêng.

const GOC = process.cwd();
const HOOKS = join(GOC, ".claude/hooks");

function coJq(): boolean {
  return spawnSync("jq", ["--version"]).status === 0;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Repo fixture: 1 migration đã có trên origin/main + danh sách vùng rủi ro thật. */
function dungRepo(): string {
  const r = mkdtempSync(join(tmpdir(), "xboss-hooks-"));
  git(r, "init", "-q", "-b", "main");
  git(r, "config", "user.email", "t@example.test");
  git(r, "config", "user.name", "t");
  mkdirSync(join(r, "migrations"));
  mkdirSync(join(r, ".claude/hooks"), { recursive: true });
  mkdirSync(join(r, "lib/nen"), { recursive: true });
  writeFileSync(join(r, "migrations/0001_a.sql"), "SELECT 1;\n");
  writeFileSync(join(r, "PROGRESS.md"), "# PROGRESS\n");
  writeFileSync(join(r, "lib/nen/a.ts"), "export const a = 1;\n");
  copyFileSync(join(HOOKS, "risk-zones.txt"), join(r, ".claude/hooks/risk-zones.txt"));
  git(r, "add", "-A");
  git(r, "commit", "-qm", "init");
  git(r, "update-ref", "refs/remotes/origin/main", "HEAD");
  return r;
}

function chay(hook: string, repo: string, input: unknown, env: Record<string, string> = {}) {
  const tmp = mkdtempSync(join(tmpdir(), "xboss-hook-state-"));
  const res = spawnSync("bash", [join(HOOKS, hook)], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, TMPDIR: tmp, ...env },
  });
  const out = res.stdout.trim();
  return {
    code: res.status,
    stderr: res.stderr,
    json: out ? (JSON.parse(out) as Record<string, any>) : null,
    tmp,
  };
}

const quyet = (r: ReturnType<typeof chay>) => r.json?.hookSpecificOutput?.permissionDecision;

test("môi trường có jq (thiếu jq thì mọi hook thành no-op âm thầm)", () => {
  assert.ok(coJq(), "Cài jq — hook .claude/hooks/*.sh dựa vào jq để đọc input");
});

test("settings.json đăng ký đủ hook, file tồn tại và chạy được", () => {
  const s = JSON.parse(readFileSync(join(GOC, ".claude/settings.json"), "utf8"));
  const lenh = JSON.stringify(s.hooks);
  for (const h of [
    "session-resume.sh",
    "block-dangerous-git.sh",
    "pre-commit-gate.sh",
    "pre-push-gate.sh",
    "protect-config.sh",
    "risk-zone-gate.sh",
    "stop-static-checks.sh",
  ]) {
    assert.ok(lenh.includes(`/.claude/hooks/${h}`), `settings.json chưa đăng ký ${h}`);
    const st = statSync(join(HOOKS, h));
    assert.ok(st.mode & 0o111, `${h} thiếu quyền thực thi (chmod +x)`);
  }
  const edit = s.hooks.PreToolUse.find((m: { matcher: string }) => m.matcher.includes("Edit"));
  assert.ok(edit && /Write/.test(edit.matcher) && /MultiEdit/.test(edit.matcher));
  assert.ok(s.hooks.Stop?.length, "thiếu hook Stop");
});

test("risk-zones.txt: mỗi mẫu khớp ít nhất 1 file thật (không trôi khỏi code)", () => {
  const tatCa = execFileSync("git", ["ls-files"], { cwd: GOC, encoding: "utf8" }).split("\n");
  const mau = readFileSync(join(HOOKS, "risk-zones.txt"), "utf8")
    .split("\n")
    .map((d) => d.replace(/#.*/, "").trim())
    .filter(Boolean);
  const chet = mau.filter((m) => {
    const re = new RegExp("^" + m.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return !tatCa.some((f) => re.test(f));
  });
  assert.deepEqual(chet, [], "Mẫu không còn khớp file nào — cập nhật theo docs/audit.md §8");
});

test("protect-config: migration đã có trên origin/main → deny; migration mới → cho phép", () => {
  const r = dungRepo();
  const cu = chay("protect-config.sh", r, {
    tool_input: { file_path: join(r, "migrations/0001_a.sql") },
  });
  assert.equal(quyet(cu), "deny");
  assert.match(cu.json!.hookSpecificOutput.permissionDecisionReason, /APPEND-ONLY/);
  const moi = chay("protect-config.sh", r, {
    tool_input: { file_path: join(r, "migrations/0002_b.sql") },
  });
  assert.equal(moi.json, null);
  assert.equal(moi.code, 0);
});

test("protect-config: file ECC vendor → deny; cấu hình cổng → ask; file thường → cho phép", () => {
  const r = dungRepo();
  const p = (f: string) => ({ tool_input: { file_path: join(r, f) } });
  assert.equal(
    quyet(chay("protect-config.sh", r, p(".claude/skills/ecc-council/SKILL.md"))),
    "deny",
  );
  assert.equal(
    quyet(chay("protect-config.sh", r, p(".claude/rules/ecc/common/testing.md"))),
    "deny",
  );
  assert.equal(quyet(chay("protect-config.sh", r, p("eslint.config.mjs"))), "ask");
  assert.equal(quyet(chay("protect-config.sh", r, p("scripts/test-skip-allowlist.json"))), "ask");
  assert.equal(quyet(chay("protect-config.sh", r, p(".github/workflows/ci.yml"))), "ask");
  assert.equal(chay("protect-config.sh", r, p("lib/nen/a.ts")).json, null);
  assert.equal(chay("protect-config.sh", r, p(".claude/rules/xboss/ui.md")).json, null);
  // Biến bỏ qua có chủ đích.
  const bo = chay("protect-config.sh", r, p("eslint.config.mjs"), {
    XBOSS_ALLOW_PROTECTED_EDIT: "1",
  });
  assert.equal(bo.json, null);
});

test("risk-zone-gate: lần đầu mỗi phiên deny kèm danh sách dữ kiện, lần hai cho phép", () => {
  const r = dungRepo();
  const tmp = mkdtempSync(join(tmpdir(), "xboss-risk-"));
  const goi = (session: string, f: string) =>
    chay(
      "risk-zone-gate.sh",
      r,
      { session_id: session, tool_input: { file_path: join(r, f) } },
      { TMPDIR: tmp },
    );
  const lan1 = goi("s1", "app/api/tasks/[id]/approve/route.ts");
  assert.equal(quyet(lan1), "deny");
  assert.match(lan1.json!.hookSpecificOutput.permissionDecisionReason, /VÙNG RỦI RO CAO/);
  assert.equal(goi("s1", "app/api/tasks/[id]/approve/route.ts").json, null);
  // Phiên khác phải nêu lại; file ngoài vùng không bị chặn.
  assert.equal(quyet(goi("s2", "app/api/tasks/[id]/approve/route.ts")), "deny");
  assert.equal(goi("s1", "lib/nen/a.ts").json, null);
  assert.equal(quyet(goi("s1", "lib/tien-do/recompute.ts")), "deny");
});

test("pre-push-gate: nhánh đổi lib/ mà không đổi PROGRESS.md → chặn (exit 2); có PROGRESS → cho qua", () => {
  const r = dungRepo();
  mkdirSync(join(r, "scripts"));
  for (const f of ["check-progress-freshness.ts", "check-migration-numbers.ts"]) {
    copyFileSync(join(GOC, "scripts", f), join(r, "scripts", f));
  }
  symlinkSync(join(GOC, "node_modules"), join(r, "node_modules"));
  git(r, "checkout", "-qb", "feat");
  writeFileSync(join(r, "lib/nen/a.ts"), "export const a = 2;\n");
  git(r, "commit", "-qam", "đổi lib");

  const push = { tool_input: { command: "git push -u origin feat" } };
  const chan = chay("pre-push-gate.sh", r, push);
  assert.equal(chan.code, 2, chan.stderr);
  assert.match(chan.stderr, /PROGRESS\.md/);

  // Lệnh không phải push, hoặc dry-run → không chặn.
  assert.equal(chay("pre-push-gate.sh", r, { tool_input: { command: "git status" } }).code, 0);
  assert.equal(
    chay("pre-push-gate.sh", r, { tool_input: { command: "git push --dry-run" } }).code,
    0,
  );

  writeFileSync(join(r, "PROGRESS.md"), "# PROGRESS\n\n- đổi a\n");
  git(r, "commit", "-qam", "progress");
  const qua = chay("pre-push-gate.sh", r, push);
  assert.equal(qua.code, 0, qua.stderr);

  // Trùng số migration cũng chặn.
  writeFileSync(join(r, "migrations/0001_trung.sql"), "SELECT 2;\n");
  git(r, "add", "-A");
  git(r, "commit", "-qm", "trùng số");
  const trung = chay("pre-push-gate.sh", r, push);
  assert.equal(trung.code, 2);
});

test("stop-static-checks: console.log mới trong lib/ → block; stop_hook_active → bỏ qua; sạch → im", () => {
  const r = dungRepo();
  const sach = chay("stop-static-checks.sh", r, { session_id: "s", stop_hook_active: false });
  assert.equal(sach.json, null);

  writeFileSync(join(r, "lib/nen/b.ts"), 'export const b = 1;\nconsole.log("x");\n');
  const ban = chay("stop-static-checks.sh", r, { session_id: "s", stop_hook_active: false });
  assert.equal(ban.json?.decision, "block");
  assert.match(ban.json?.reason, /console\.log/);

  const lap = chay("stop-static-checks.sh", r, { session_id: "s", stop_hook_active: true });
  assert.equal(lap.json, null, "không được chặn lại khi đang trong vòng do chính hook gây ra");
});

test("không còn file hook mồ côi (mọi *.sh trong .claude/hooks đều được đăng ký)", () => {
  const s = readFileSync(join(GOC, ".claude/settings.json"), "utf8");
  const moCoi = readdirSync(HOOKS).filter((f) => f.endsWith(".sh") && !s.includes(f));
  assert.deepEqual(moCoi, []);
  assert.ok(existsSync(join(HOOKS, "risk-zones.txt")));
});
