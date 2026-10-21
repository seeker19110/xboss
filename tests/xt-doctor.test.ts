import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Gọi doctor thật đã cài, chỉ dựng phần hook cần kiểm; không sao chép regex hoặc logic quét.
const XT = join(process.cwd(), ".xtemplates/scripts/xt.py");
const KIEM_HOOK = `
import json
import runpy
import sys
from pathlib import Path

xt = runpy.run_path(sys.argv[1])
findings = xt["_doctor_hook_files"](Path(sys.argv[2]), json.loads(sys.argv[3]), deep=True)
print(json.dumps([{"code": f.code, "level": f.level, "msg": f.msg} for f in findings]))
`;

type Finding = { code: string; level: string; msg: string };

function chayDoctor(files: Record<string, string>, thuMuc: string[] = []): Finding[] {
  const goc = mkdtempSync(join(tmpdir(), "xboss-xt-doctor-"));
  try {
    const hooks = join(goc, ".claude/hooks");
    mkdirSync(hooks, { recursive: true });
    for (const ten of thuMuc) {
      mkdirSync(join(hooks, ten), { recursive: true });
    }
    for (const [ten, noiDung] of Object.entries(files)) {
      const file = join(hooks, ten);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, noiDung);
    }
    const settings = {
      PreToolUse: [{ hooks: [{ type: "command", command: "bash .claude/hooks/entry.sh" }] }],
    };
    const result = spawnSync("python3", ["-c", KIEM_HOOK, XT, goc, JSON.stringify(settings)], {
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout) as Finding[];
  } finally {
    rmSync(goc, { recursive: true, force: true });
  }
}

function kiemLoi(findings: Finding[], ten: string, noiDung: string): void {
  assert.equal(findings.length, 1, JSON.stringify(findings));
  const finding = findings[0];
  assert.equal(finding.code, "hooks");
  assert.equal(finding.level, "error");
  assert.ok(finding.msg.includes(`.claude/hooks/${ten}`), finding.msg);
  assert.ok(finding.msg.includes(noiDung), finding.msg);
}

test("doctor: ROOT dùng thư mục hiện tại không phải file sibling bị thiếu", () => {
  const findings = chayDoctor({
    "entry.sh": '#!/usr/bin/env bash\nROOT="$(cd "$(dirname "$0")/." && pwd)"\n',
  });
  assert.deepEqual(findings, []);
});

test("doctor: ROOT dùng thư mục cha như hook thật không phải file sibling bị thiếu", () => {
  const findings = chayDoctor({
    "entry.sh":
      '#!/usr/bin/env bash\nROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"\n',
  });
  assert.deepEqual(findings, []);
});

test("doctor: ROOT chỉ đi qua . và .. với dấu / lặp không phải file sibling", () => {
  assert.deepEqual(
    chayDoctor({
      "entry.sh": '#!/usr/bin/env bash\nROOT="$(cd "$(dirname "$0")//.//..///.." && pwd)"\n',
    }),
    [],
  );
});

const SIBLINGS: Record<string, string> = {
  "entry.sh":
    '#!/usr/bin/env bash\n. "$(dirname "$0")/_lib.sh"\npython3 "$(dirname "$0")/guard.py"\n',
  "_lib.sh": '#!/usr/bin/env bash\nprintf "%s" "hook"\n',
  "guard.py": 'print("hook")\n',
};

test("doctor: _lib.sh và guard.py có mặt, đúng cú pháp thì qua", () => {
  assert.deepEqual(chayDoctor(SIBLINGS), []);
});

for (const ten of ["_lib.sh", "guard.py"]) {
  test(`doctor: vẫn báo lỗi khi thiếu sibling ${ten}`, () => {
    const files = { ...SIBLINGS };
    delete files[ten];
    kiemLoi(chayDoctor(files), ten, "file không có");
  });
}

for (const [ten, noiDung] of [
  ["_lib.sh", "#!/usr/bin/env bash\nif then\n"],
  ["guard.py", "def guard(:\n"],
]) {
  test(`doctor: deep vẫn kiểm cú pháp sibling ${ten}`, () => {
    kiemLoi(chayDoctor({ ...SIBLINGS, [ten]: noiDung }), ten, "lỗi cú pháp");
  });
}

const HOOK_FILE_AN = '#!/usr/bin/env bash\npython3 "$(dirname "$0")/.guard.py"\n';

test("doctor: file ẩn .guard.py có mặt, đúng cú pháp thì qua", () => {
  assert.deepEqual(chayDoctor({ "entry.sh": HOOK_FILE_AN, ".guard.py": 'print("hook")\n' }), []);
});

test("doctor: vẫn báo thiếu file ẩn .guard.py", () => {
  kiemLoi(chayDoctor({ "entry.sh": HOOK_FILE_AN }), ".guard.py", "file không có");
});

test("doctor: deep vẫn kiểm cú pháp file ẩn .guard.py", () => {
  kiemLoi(
    chayDoctor({ "entry.sh": HOOK_FILE_AN, ".guard.py": "def guard(:\n" }),
    ".guard.py",
    "lỗi cú pháp",
  );
});

for (const [duongDan, tenFile] of [
  ["./guard.py", "guard.py"],
  [".//guard.py", "guard.py"],
  ["/guard.py", "guard.py"],
  ["nested/guard.py", "nested/guard.py"],
  ["nested//guard.py", "nested/guard.py"],
  ["../guard.py", "../guard.py"],
]) {
  const hook = `#!/usr/bin/env bash\npython3 "$(dirname "$0")/${duongDan}"\n`;

  test(`doctor: sibling ${duongDan} có mặt, đúng cú pháp thì qua`, () => {
    assert.deepEqual(chayDoctor({ "entry.sh": hook, [tenFile]: 'print("hook")\n' }), []);
  });

  test(`doctor: vẫn báo thiếu sibling ${duongDan}`, () => {
    kiemLoi(chayDoctor({ "entry.sh": hook }), duongDan, "file không có");
  });

  test(`doctor: deep vẫn kiểm cú pháp sibling ${duongDan}`, () => {
    kiemLoi(chayDoctor({ "entry.sh": hook, [tenFile]: "def guard(:\n" }), duongDan, "lỗi cú pháp");
  });
}

for (const duongDan of ["guard.py/", "guard.py/."]) {
  test(`doctor: ${duongDan} không phải file dù guard.py có tồn tại`, () => {
    kiemLoi(
      chayDoctor({
        "entry.sh": `#!/usr/bin/env bash\npython3 "$(dirname "$0")/${duongDan}"\n`,
        "guard.py": 'print("hook")\n',
      }),
      duongDan,
      "file không có",
    );
  });
}

test("doctor: thiếu thư mục trung gian vẫn lỗi dù file sau ../ có tồn tại", () => {
  kiemLoi(
    chayDoctor({
      "entry.sh": '#!/usr/bin/env bash\npython3 "$(dirname "$0")/missing/../guard.py"\n',
      "guard.py": 'print("hook")\n',
    }),
    "missing/../guard.py",
    "file không có",
  );
});

test("doctor: thư mục trung gian có thật và ../ dẫn tới file hợp lệ thì qua", () => {
  assert.deepEqual(
    chayDoctor(
      {
        "entry.sh": '#!/usr/bin/env bash\npython3 "$(dirname "$0")/nested/../guard.py"\n',
        "guard.py": 'print("hook")\n',
      },
      ["nested"],
    ),
    [],
  );
});

test("doctor: deep kiểm cú pháp qua thư mục trung gian có thật và ../", () => {
  kiemLoi(
    chayDoctor(
      {
        "entry.sh": '#!/usr/bin/env bash\npython3 "$(dirname "$0")/nested/../guard.py"\n',
        "guard.py": "def guard(:\n",
      },
      ["nested"],
    ),
    "nested/../guard.py",
    "lỗi cú pháp",
  );
});

test("doctor: đường dẫn kết thúc bằng .. vẫn lỗi nếu có tên thư mục trung gian bị thiếu", () => {
  kiemLoi(
    chayDoctor({
      "entry.sh": '#!/usr/bin/env bash\npython3 "$(dirname "$0")/missing/.."\n',
    }),
    "missing/..",
    "file không có",
  );
});

test("doctor: vẫn báo thiếu hook settings trỏ trực tiếp", () => {
  kiemLoi(chayDoctor({}), "entry.sh", "file không có");
});

test("doctor: deep vẫn kiểm cú pháp hook settings trỏ trực tiếp", () => {
  kiemLoi(chayDoctor({ "entry.sh": "#!/usr/bin/env bash\nif then\n" }), "entry.sh", "lỗi cú pháp");
});
