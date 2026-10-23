import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

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

test("VPS_SSH_KNOWN_HOSTS đọc được từ secret HOẶC Actions variable (host key là dữ liệu công khai)", () => {
  assert.match(
    prepStep,
    /VPS_SSH_KNOWN_HOSTS: \$\{\{ secrets\.VPS_SSH_KNOWN_HOSTS \|\| vars\.VPS_SSH_KNOWN_HOSTS \}\}/,
  );
});

// Run 39899182765 đỏ: VPS_SSH_KNOWN_HOSTS có khoá nhưng không có dòng nào khớp VPS_HOST
// (dán khoá trần / nhãn domain trong khi VPS_HOST là IP / CRLF). Script chuẩn hoá gắn nhãn lại.
const KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
function chuanHoa(input: string, host = "203.0.113.7") {
  return spawnSync("bash", ["scripts/ops/chuan-hoa-known-hosts.sh", host], {
    input,
    encoding: "utf8",
  });
}

test("bước Chuẩn bị SSH chuẩn hoá known_hosts qua script trước khi kiểm host", () => {
  assert.match(
    prepStep,
    /bash scripts\/ops\/chuan-hoa-known-hosts\.sh "\$VPS_HOST" <<<"\$VPS_SSH_KNOWN_HOSTS" > ~\/\.ssh\/known_hosts/,
  );
  assert.match(prepStep, /ssh-keygen -lf ~\/\.ssh\/known_hosts/);
});

test("khoá trần (nội dung .pub) được gắn nhãn VPS_HOST", () => {
  const r = chuanHoa(`${KEY} root@vps\n`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `203.0.113.7 ${KEY}\n`);
});

test("dòng known_hosts nhãn domain khác VPS_HOST + CRLF + thụt đầu dòng vẫn ghim đúng khoá", () => {
  const r = chuanHoa(`  # ghi chú\r\n  vps.example.com ${KEY}\r\n\r\n`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `203.0.113.7 ${KEY}\n`);
});

test("VPS_HOST có khoảng trắng thừa được cắt", () => {
  const r = chuanHoa(KEY, " 203.0.113.7\n");
  assert.equal(r.stdout, `203.0.113.7 ${KEY}\n`);
});

test("fingerprint không phải khoá → bị bỏ (fail-closed ở bước kiểm), báo stderr", () => {
  const r = chuanHoa("256 SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG root@vps (ED25519)\n");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /không phải khoá công khai SSH/);
});

test("dòng @revoked/@cert-authority giữ nguyên, thiếu host → exit 2", () => {
  const revoked = `@revoked * ${KEY}`;
  assert.equal(chuanHoa(revoked).stdout, `${revoked}\n`);
  assert.equal(chuanHoa(KEY, "  ").status, 2);
});
