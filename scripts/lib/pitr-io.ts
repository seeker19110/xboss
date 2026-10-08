// Đọc archive WAL + thư mục base backup từ đĩa cho verifier PITR (S14). CHỈ ĐỌC: không ghi,
// không xoá, không theo symlink. Phân tích nằm ở pitr-archive.ts (thuần, test bằng fixture).
import {
  existsSync,
  lstatSync,
  openSync,
  readSync,
  closeSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_WAL_SEGMENT_BYTES,
  readBackupManifest,
  scanArchive,
  type ArchiveEntry,
  type ArchiveScan,
  type BaseBackupInput,
} from "./pitr-archive";

const SMALL_FILE_LIMIT = 64 * 1024;
const BASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TABLESPACE_TAR = /^\d+\.tar(\.gz)?$/;

/** Tệp thường trong archive (bỏ symlink/thư mục con — không phải đoạn WAL hợp lệ). */
export function listArchive(dir: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  for (const name of readdirSync(dir)) {
    const info = lstatSync(join(dir, name));
    if (info.isFile()) entries.push({ name, size: info.size, mtimeMs: info.mtimeMs });
  }
  return entries;
}

function readSmall(path: string): string {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(SMALL_FILE_LIMIT);
    const length = readSync(fd, buffer, 0, SMALL_FILE_LIMIT, 0);
    return buffer.subarray(0, length).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

export function scanArchiveDir(dir: string, segBytes = DEFAULT_WAL_SEGMENT_BYTES): ArchiveScan {
  return scanArchive(listArchive(dir), (name) => readSmall(join(dir, name)), segBytes);
}

/** Mỗi thư mục con của `root` là một lần pg_basebackup (-Fp hoặc -Ft), tên = baseBackupId. */
export function readBaseBackups(root: string): BaseBackupInput[] {
  const bases: BaseBackupInput[] = [];
  for (const id of readdirSync(root).sort()) {
    const dir = join(root, id);
    if (!BASE_ID.test(id) || !lstatSync(dir).isDirectory()) continue;
    const files = readdirSync(dir);
    const plain = files.includes("backup_label") && files.includes("PG_VERSION");
    const tar = files.includes("base.tar") || files.includes("base.tar.gz");
    const manifestPath = join(dir, "backup_manifest");
    const manifest = existsSync(manifestPath)
      ? readBackupManifest(readFileSync(manifestPath, "utf8"))
      : { ...readBackupManifest(""), issue: "thiếu backup_manifest" };
    bases.push({
      id,
      format: plain ? "plain" : tar ? "tar" : "unknown",
      hasTablespaces: files.some((name) => TABLESPACE_TAR.test(name)),
      manifest,
    });
  }
  return bases;
}
