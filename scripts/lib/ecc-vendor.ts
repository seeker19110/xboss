// scripts/lib/ecc-vendor.ts — Logic thuần của bộ vendor ECC (ADR-0012).
//
// VÌ SAO TÁCH RIÊNG: CLI `scripts/ecc-vendor.ts` (ghi file từ checkout ECC) và test
// `tests/ecc-vendor.test.ts` (kiểm lock + phép biến đổi trên fixture) DÙNG CHUNG một cài đặt —
// cùng mẫu với `scripts/lib/test-fk-ids-scan.ts`.
//
// Phép biến đổi CỐ Ý tối thiểu, chỉ để nội dung upstream sống chung được với cấu hình XBoss:
//   1. Tên agent/skill/command thêm tiền tố `ecc-` — tránh đụng skill built-in (`security-review`,
//      `code-review`) và agent XBoss; nhìn tên là biết nguồn.
//   2. Mô tả thêm `(ECC) ` và — riêng AGENT — gỡ các cụm "Use PROACTIVELY" / "MUST BE USED" /
//      "Automatically activated": để nguyên thì agent ECC tự giành việc khỏi luồng 3 tầng XBoss
//      (CLAUDE.md "Lập kế hoạch → điều phối → thi hành"). Không viết dạng `[ECC]` vì YAML hiểu
//      scalar mở đầu bằng `[` là mảng.
//   3. Tham chiếu namespace plugin `ecc:<tên>` → `ecc-<tên>` (vendor không có namespace plugin).
//   4. Chèn 1 dòng HTML comment ghi nguồn + commit ngay sau frontmatter.
// Mọi thứ khác giữ nguyên văn upstream — sửa nội dung thì sửa ở lớp XBoss (.claude/rules/
// 00-uu-tien-ecc.md), không sửa file vendor.
import { createHash } from "node:crypto";

export type LoaiMuc = "agent" | "skill" | "command" | "rule";

export interface ManifestEcc {
  upstream: { repo: string; commit: string; version: string; license: string };
  prefix: string;
  agents: string[];
  skills: string[];
  commands: string[];
  rules: string[];
}

/** Một file cần sinh: `src` tương đối gốc checkout ECC, `dest` tương đối gốc repo XBoss. */
export interface MucVendor {
  loai: LoaiMuc;
  src: string;
  dest: string;
  /** Tên sau tiền tố (agent/skill/command) — rỗng với rule. */
  ten: string;
  /** File chính mang frontmatter cần đổi `name`/`description` (SKILL.md, agent, command). */
  laFileChinh: boolean;
}

export const DUONG_LOCK = ".claude/ecc/lock.json";
export const DUONG_LICENSE = ".claude/ecc/LICENSE";

/** Glob thư mục/file do bộ vendor SỞ HỮU — bị xoá và sinh lại mỗi lần chạy. */
export function laFileVendor(duong: string, prefix = "ecc-"): boolean {
  return (
    (duong.startsWith(".claude/agents/" + prefix) && duong.endsWith(".md")) ||
    (duong.startsWith(".claude/commands/" + prefix) && duong.endsWith(".md")) ||
    duong.startsWith(".claude/skills/" + prefix) ||
    duong.startsWith(".claude/rules/ecc/") ||
    duong === DUONG_LICENSE
  );
}

/**
 * Lập danh sách file cần sinh. `liệtKêSkill(tenSkill)` trả các file (tương đối thư mục skill)
 * trong `skills/<ten>/` của checkout — tách ra để test không cần đĩa thật.
 */
export function lapKeHoach(m: ManifestEcc, lietKeSkill: (ten: string) => string[]): MucVendor[] {
  const p = m.prefix;
  const ke: MucVendor[] = [];
  for (const a of m.agents) {
    ke.push({
      loai: "agent",
      src: `agents/${a}.md`,
      dest: `.claude/agents/${p}${a}.md`,
      ten: p + a,
      laFileChinh: true,
    });
  }
  for (const s of m.skills) {
    for (const f of lietKeSkill(s)) {
      if (!f.endsWith(".md")) {
        throw new Error(
          `Skill ${s} chứa file không phải markdown (${f}) — manifest chỉ nhận skill thuần markdown (không vendor mã thực thi bên thứ ba).`,
        );
      }
      ke.push({
        loai: "skill",
        src: `skills/${s}/${f}`,
        dest: `.claude/skills/${p}${s}/${f}`,
        ten: p + s,
        laFileChinh: f === "SKILL.md",
      });
    }
  }
  for (const c of m.commands) {
    ke.push({
      loai: "command",
      src: `commands/${c}.md`,
      dest: `.claude/commands/${p}${c}.md`,
      ten: p + c,
      laFileChinh: true,
    });
  }
  for (const r of m.rules) {
    ke.push({
      loai: "rule",
      src: `rules/${r}`,
      dest: `.claude/rules/ecc/${r}`,
      ten: "",
      laFileChinh: false,
    });
  }
  return ke;
}

/** Tách frontmatter YAML (giữa 2 dòng `---`). Không có → `fm = null`. */
export function tachFrontmatter(text: string): { fm: string | null; than: string } {
  if (!text.startsWith("---\n")) return { fm: null, than: text };
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return { fm: null, than: text };
  return { fm: text.slice(4, end), than: text.slice(end + 5) };
}

const CUM_GIANH_VIEC: [RegExp, string][] = [
  [/\s*MUST BE USED[^.]*\./g, ""],
  [/\s*Automatically activated[^.]*\./g, ""],
  [/\bUse PROACTIVELY\b/g, "Use"],
  [/\bUse immediately\b/g, "Use"],
  [/\bProactively reviews\b/g, "Reviews"],
];

const DUOI_AGENT = " Gọi theo bảng định tuyến ECC trong CLAUDE.md, không thay luồng 3 tầng XBoss.";

/** Đổi giá trị `description` (1 dòng, trần hoặc trong ngoặc kép). */
export function doiMoTa(giaTri: string, loai: LoaiMuc): string {
  const v = giaTri.trim();
  const ngoacKep = v.startsWith('"') && v.endsWith('"') && v.length >= 2;
  let noi = ngoacKep ? v.slice(1, -1) : v;
  if (/^[>|]/.test(noi))
    throw new Error(`description dạng khối YAML chưa hỗ trợ: ${v.slice(0, 40)}`);
  if (loai === "agent") {
    for (const [re, thay] of CUM_GIANH_VIEC) noi = noi.replace(re, thay);
    noi = noi.trim() + DUOI_AGENT;
  }
  noi = "(ECC) " + noi;
  if (!ngoacKep && /: | #/.test(noi)) {
    throw new Error(
      `description trần chứa ': ' hoặc ' #' sau biến đổi — YAML sẽ vỡ: ${noi.slice(0, 60)}`,
    );
  }
  return ngoacKep ? `"${noi}"` : noi;
}

/** Đổi `name:` + `description:` trong frontmatter của file chính. */
export function doiFrontmatter(fm: string, muc: MucVendor): string {
  const dong = fm.split("\n");
  let coName = false;
  const ra = dong.map((d) => {
    if (d.startsWith("name:")) {
      coName = true;
      return `name: ${muc.ten}`;
    }
    if (d.startsWith("description:")) return `description: ${doiMoTa(d.slice(12), muc.loai)}`;
    return d;
  });
  // Agent/skill bắt buộc có `name` để tên gọi khớp tiền tố; command lấy tên từ tên file.
  if (!coName && muc.loai !== "command") ra.unshift(`name: ${muc.ten}`);
  return ra.join("\n");
}

/** `ecc:planner` → `ecc-planner` (vendor không có namespace plugin). */
export function doiThamChieu(text: string, prefix: string): string {
  return text.replace(/\becc:([a-z0-9][a-z0-9-]*)/g, (_m, ten: string) => prefix + ten);
}

export function dongNguon(m: ManifestEcc, src: string): string {
  return `<!-- ECC vendor: ${m.upstream.repo} @ ${m.upstream.commit.slice(0, 7)} · ${src} · ${m.upstream.license} · sinh bởi scripts/ecc-vendor.ts — KHÔNG sửa tay, xem .claude/ecc/manifest.json -->`;
}

/** Biến đổi trọn 1 file theo 4 bước ở đầu file. */
export function bienDoi(text: string, muc: MucVendor, m: ManifestEcc): string {
  const chuan = text.replace(/\r\n/g, "\n");
  const { fm, than } = tachFrontmatter(chuan);
  const nguon = dongNguon(m, muc.src);
  const thanMoi = doiThamChieu(than, m.prefix);
  if (fm === null) return `${nguon}\n\n${thanMoi}`;
  const fmMoi = muc.laFileChinh ? doiFrontmatter(fm, muc) : fm;
  return `---\n${doiThamChieu(fmMoi, m.prefix)}\n---\n${nguon}\n${thanMoi}`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
