// Băm tệp trong một thư mục khôi phục (uploads/artifact) cho recovery manifest + verifier.
// Chỉ đọc; khoá phải là tên phẳng an toàn (isSafeObjectKey) và đường dẫn thực không được
// thoát khỏi thư mục gốc — cùng hàng rào path traversal với lib/nen/storage.ts.
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, readdirSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { isSafeObjectKey, type MigrationFact } from "./recovery-manifest";

export type FileDigest = { size: number; sha256: string };
export type FileHasher = (key: string) => Promise<FileDigest | null>;

/** Hasher theo thư mục: trả null khi tệp không tồn tại; ném lỗi khi khoá/tệp không an toàn. */
export function directoryHasher(dir: string): FileHasher {
  const root = resolve(dir);
  return async (key: string) => {
    if (!isSafeObjectKey(key)) throw new Error("Khoá tệp không an toàn.");
    const path = join(root, key);
    if (!path.startsWith(root + sep)) throw new Error("Khoá tệp thoát khỏi thư mục.");
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return null;
      throw error;
    }
    // Không theo symlink: tệp khôi phục phải là tệp thật trong thư mục được chỉ định.
    if (!info.isFile()) throw new Error("Khoá tệp không trỏ tới tệp thường.");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return { size: info.size, sha256: hash.digest("hex") };
  };
}

/** Tên + SHA-256 nội dung mọi migration của mã nguồn đang chạy (thư mục migrations/). */
export function readRepoMigrations(dir = join(process.cwd(), "migrations")): MigrationFact[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sha256: createHash("sha256")
        .update(readFileSync(join(dir, name)))
        .digest("hex"),
    }));
}
