// Trích số liệu coverage cho phạm vi lib/** + app/api/** từ output TAP của
// `node --experimental-test-coverage` (coverage built-in node:test, không dùng c8/istanbul).
//
// Vì `scripts/run-tests.mjs` chạy MỖI file test trong 1 tiến trình Node riêng (lý do cách ly DB,
// xem comment trong file đó), coverage built-in của node:test chỉ báo cáo theo TỪNG tiến trình —
// không có cơ chế merge nhiều tiến trình sẵn có (đó là việc c8 làm, dự án cố tình không dùng thêm
// công cụ ngoài). Script này gom coverage của tất cả tiến trình lại: với mỗi file nguồn, lấy % lớn
// nhất từng đo được ở bất kỳ tiến trình nào chạm tới file đó (xấp xỉ hợp lý — trong thực tế mỗi
// file lib/**/app/api/** chủ yếu chỉ được đúng 1 file test tương ứng chạm tới), rồi lấy trung bình
// không trọng số trên các file trong phạm vi. Đây là mốc đo tương đối (ratchet), KHÔNG phải số
// tuyệt đối chính xác kiểu c8 merge nhiều tiến trình — đủ dùng để theo dõi xu hướng tăng/giảm.

const COVERAGE_ROW_RE = /^# ( *)(\S.*?)\s+\|\s*([\d.]*)\s*\|\s*([\d.]*)\s*\|\s*([\d.]*)\s*\|(.*)$/;

const SCOPE_PREFIXES = ["lib/", "app/api/"];

/** Parse 1 khối "start/end of coverage report" trong output TAP, trả về Map(path -> {line,branch,funcs}) */
export function parseCoverageTable(output) {
  const lines = output.split("\n");
  const results = new Map();
  const stack = []; // ngăn xếp thư mục theo indent: [{indent, name}]
  let inTable = false;

  for (const raw of lines) {
    if (raw.includes("start of coverage report")) {
      inTable = true;
      continue;
    }
    if (raw.includes("end of coverage report")) {
      inTable = false;
      continue;
    }
    if (!inTable) continue;
    if (/^# -+$/.test(raw)) continue;
    if (/^# {3}file\s+\|/.test(raw)) continue; // dòng tiêu đề bảng

    const m = COVERAGE_ROW_RE.exec(raw);
    if (!m) continue;
    const indent = m[1].length;
    const name = m[2].trim();
    if (name === "all files") continue;

    const lineCov = m[3] === "" ? null : parseFloat(m[3]);
    const branchCov = m[4] === "" ? null : parseFloat(m[4]);
    const funcsCov = m[5] === "" ? null : parseFloat(m[5]);

    // Rút ngăn xếp về đúng cấp indent hiện tại
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

    if (lineCov === null) {
      // dòng thư mục (không có số liệu) — đẩy vào ngăn xếp, không phải file lá
      stack.push({ indent, name });
      continue;
    }

    const path = [...stack.map((s) => s.name), name].join("/");
    results.set(path, { line: lineCov, branch: branchCov, funcs: funcsCov });
  }

  return results;
}

export function isInScope(path) {
  return SCOPE_PREFIXES.some((p) => path.startsWith(p));
}

/**
 * Gộp coverage từ nhiều tiến trình (nhiều lần gọi parseCoverageTable) vào 1 Map duy nhất,
 * mỗi file lấy % lớn nhất đo được (xem giải thích ở đầu file).
 */
export function mergeCoverageMaps(maps) {
  const merged = new Map();
  for (const map of maps) {
    for (const [path, cov] of map) {
      if (!isInScope(path)) continue;
      const prev = merged.get(path);
      if (!prev) {
        merged.set(path, { ...cov });
        continue;
      }
      merged.set(path, {
        line: Math.max(prev.line, cov.line),
        branch: Math.max(prev.branch ?? 0, cov.branch ?? 0),
        funcs: Math.max(prev.funcs ?? 0, cov.funcs ?? 0),
      });
    }
  }
  return merged;
}

/** Trung bình không trọng số trên các file trong phạm vi — trả về null nếu không có file nào. */
export function aggregate(mergedMap) {
  const entries = [...mergedMap.values()];
  if (entries.length === 0) return null;
  const sum = entries.reduce(
    (acc, cov) => ({
      line: acc.line + cov.line,
      branch: acc.branch + (cov.branch ?? 0),
      funcs: acc.funcs + (cov.funcs ?? 0),
    }),
    { line: 0, branch: 0, funcs: 0 },
  );
  const n = entries.length;
  return {
    files: n,
    line: sum.line / n,
    branch: sum.branch / n,
    funcs: sum.funcs / n,
  };
}
