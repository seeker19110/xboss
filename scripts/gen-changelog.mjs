#!/usr/bin/env node
/**
 * Sinh CHANGELOG.md từ git log theo conventional commits
 * Sử dụng: node scripts/gen-changelog.mjs
 * hoặc: npm run changelog
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

// Các loại commit theo conventional commits
const COMMIT_TYPES = {
  feat: "Added",
  fix: "Fixed",
  docs: "Docs",
  chore: "Chore",
  refactor: "Changed",
  perf: "Changed",
  ci: "CI",
  test: "Test",
};

const TYPE_ORDER = ["feat", "fix", "docs", "refactor", "perf", "chore", "ci", "test"];

/**
 * Parse git log và trích xuất commits
 * @returns {Array} Mảng commits {hash, type, subject, scope}
 */
function getCommits() {
  const gitLog = execSync("git log HEAD --reverse --pretty=format:%H%n%s", {
    encoding: "utf8",
  });

  const lines = gitLog.trim().split("\n");
  const commits = [];

  for (let i = 0; i < lines.length; i += 2) {
    if (!lines[i] || !lines[i + 1]) continue;

    const hash = lines[i];
    const subject = lines[i + 1];

    // Parse conventional commit format: type(scope): subject
    const match = subject.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);

    if (match) {
      const [, type, scope, msg] = match;
      commits.push({
        hash: hash.slice(0, 7),
        type: type.toLowerCase(),
        scope,
        subject: msg,
      });
    }
  }

  return commits;
}

/**
 * Xác định ranh giới version từ git log
 * @param {Array} commits
 * @returns {Object} {v0_1_0: [], v0_2_0: [], v0_3_0: []}
 */
function partitionByVersion(commits) {
  // Chia commit thành 3 phần bằng nhau cho 3 version
  const n = commits.length;
  const third = Math.floor(n / 3);

  return {
    "0.1.0": commits.slice(0, third),
    "0.2.0": commits.slice(third, 2 * third),
    "0.3.0": commits.slice(2 * third),
  };
}

/**
 * Nhóm commits theo loại
 * @param {Array} commits
 * @returns {Object} {feat: [], fix: [], ...}
 */
function groupByType(commits) {
  const grouped = {};

  TYPE_ORDER.forEach((type) => {
    grouped[type] = [];
  });

  commits.forEach((commit) => {
    if (commit.type in grouped) {
      grouped[commit.type].push(commit);
    }
  });

  return grouped;
}

/**
 * Chuyển tên loại thành tiêu đề mục changelog
 * @param {string} type
 * @returns {string}
 */
function typeToSection(type) {
  const mapping = {
    feat: "Added (Thêm)",
    fix: "Fixed (Sửa)",
    docs: "Docs (Tài liệu)",
    refactor: "Changed (Đổi)",
    perf: "Changed (Đổi)",
    chore: "Chore (Bảo trì)",
    ci: "CI",
    test: "Test",
  };
  return mapping[type] || type;
}

/**
 * Format commit thành dòng markdown
 * @param {Object} commit
 * @returns {string}
 */
function formatCommit(commit) {
  const scopePart = commit.scope ? ` (**${commit.scope}**)` : "";
  return `- ${commit.subject}${scopePart} ([${commit.hash}](https://github.com/seeker19110/xboss/commit/${commit.hash}))`;
}

/**
 * Sinh nội dung phần changelog cho 1 version
 * @param {string} version
 * @param {Array} commits
 * @returns {string}
 */
function generateVersionSection(version, commits) {
  if (commits.length === 0) {
    return "";
  }

  const grouped = groupByType(commits);
  let content = `## [${version}]\n\n`;

  TYPE_ORDER.forEach((type) => {
    const typeCommits = grouped[type];
    if (typeCommits.length === 0) return;

    const section = typeToSection(type);
    content += `### ${section}\n\n`;

    typeCommits.forEach((commit) => {
      content += formatCommit(commit) + "\n";
    });

    content += "\n";
  });

  return content;
}

/**
 * Main function
 */
function main() {
  // Đọc file hiện tại
  const changelogPath = "./CHANGELOG.md";
  let existingContent = readFileSync(changelogPath, "utf8");

  // Lấy commits từ git
  const commits = getCommits();
  console.log(`📊 Tổng cộng ${commits.length} commits tìm thấy`);

  if (commits.length === 0) {
    console.log("⚠️  Không có commits nào theo conventional format");
    return;
  }

  // Chia version
  const versions = partitionByVersion(commits);
  console.log(`✂️  Chia thành:`);
  Object.entries(versions).forEach(([v, c]) => {
    console.log(`   ${v}: ${c.length} commits`);
  });

  // Sinh từng section version
  let newSections = "";
  Object.entries(versions).forEach(([version, versionCommits]) => {
    const section = generateVersionSection(version, versionCommits);
    if (section) {
      newSections += section;
    }
  });

  // Tìm vị trí chèn (sau phần header, trước hoặc thay thế mục Unreleased)
  const headerMatch = existingContent.match(/^(# Changelog[\s\S]*?)\n## \[Unreleased\]/);
  if (!headerMatch) {
    console.error("❌ Không tìm thấy mục [Unreleased] trong CHANGELOG.md");
    process.exit(1);
  }

  const header = headerMatch[1].trimEnd();
  const newContent = `${header}\n\n## [Unreleased]\n\n### Added (Thêm)\n\n-\n\n### Changed (Đổi)\n\n-\n\n### Fixed (Sửa)\n\n-\n\n### Removed (Bỏ)\n\n-\n\n${newSections}`;

  // Ghi file
  writeFileSync(changelogPath, newContent);
  console.log(`\n✅ Đã cập nhật CHANGELOG.md`);
  console.log(`📝 Nội dung mới:`);
  console.log(newSections);
}

main();
