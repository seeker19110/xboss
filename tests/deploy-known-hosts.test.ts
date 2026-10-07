import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Workflow deploy phải ghim host key VPS (fail-closed): không TOFU, không tắt kiểm host key.
const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const stepStart = workflow.indexOf("      - name: Chuẩn bị SSH\n");
const stepEnd = workflow.indexOf("      - name:", stepStart + 1);
const prepStep = workflow.slice(stepStart, stepEnd);

test("deploy.yml không còn ssh-keyscan (không tin lần đầu)", () => {
  assert.ok(stepStart > 0, "Không tìm thấy bước Chuẩn bị SSH");
  assert.doesNotMatch(workflow.replace(/^\s*#.*$/gm, ""), /ssh-keyscan/);
});

test("deploy.yml không tắt kiểm host key", () => {
  assert.doesNotMatch(workflow, /StrictHostKeyChecking[=\s]+(no|accept-new|off)/i);
  assert.doesNotMatch(workflow, /UserKnownHostsFile[=\s]+\/dev\/null/);
});

test("bước Chuẩn bị SSH dừng (exit 1) trước SSH khi thiếu VPS_SSH_KNOWN_HOSTS", () => {
  assert.match(prepStep, /if \[ -z "\$VPS_SSH_KNOWN_HOSTS" \]/);
  const missing = prepStep.slice(prepStep.indexOf('-z "$VPS_SSH_KNOWN_HOSTS"'));
  assert.match(missing.split("fi")[0], /::error::[\s\S]*exit 1/);
  assert.match(prepStep, /ssh-keygen -F "\$VPS_HOST" -f ~\/\.ssh\/known_hosts/);
  assert.match(prepStep, /chmod 600 ~\/\.ssh\/known_hosts/);
});

test("mọi lệnh ssh dùng StrictHostKeyChecking=yes", () => {
  const sshCalls = workflow.match(/ssh -i [^\n]*/g) ?? [];
  assert.ok(sshCalls.length >= 3, "Phải có các lệnh ssh trong workflow");
  for (const c of sshCalls) assert.match(c, /StrictHostKeyChecking=yes/, c);
});
