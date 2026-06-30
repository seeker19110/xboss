// Chặn commit sai chuẩn conventional ngay ở commit-msg hook.
// Type cho phép: feat fix chore ci docs refactor test style perf build revert.
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Tiêu đề tiếng Việt: cho phép hoa/thường tự do (không ép case).
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
  },
};
