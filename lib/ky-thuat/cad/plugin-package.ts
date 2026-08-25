// lib/ky-thuat/cad/plugin-package.ts — Thông tin gói cài plugin AutoCAD lộ ra web (§13 P8).
//
// Vì sao cần: kỹ sư tải gói cài về (qua XBOSS_PLUGIN_URL, xem route dashboard) không có cách
// nào tự xác minh mình tải đúng bản — nguồn sự thật của version là thẻ <Version> trong
// plugin-autocad/Directory.Build.props (dong-goi.ps1 đọc đúng thẻ này lúc đóng gói), sha256
// chỉ có khi quản trị khai kèm biến môi trường XBOSS_PLUGIN_SHA256 (đi kèm XBOSS_PLUGIN_URL,
// vì gói KHÔNG build trong CI/không nhúng nhị phân vào repo — không có nơi nào trong repo tự
// tính được sha256 của gói đang phát hành).
//
// Đọc TỆP TRÊN ĐĨA nên chỉ dùng được ở phía server (route API) — đọc lỗi/thiếu tệp thì trả
// null, KHÔNG bịa số (fail mềm, UI tự ẩn mục tương ứng).
import { readFile } from "node:fs/promises";
import path from "node:path";

const DUONG_DAN_PROPS = path.join(process.cwd(), "plugin-autocad", "Directory.Build.props");

/** Hàm thuần: bóc version từ nội dung Directory.Build.props. null nếu không có thẻ `<Version>`. */
export function bocVersionTuNoiDung(noiDung: string): string | null {
  const khop = noiDung.match(/<Version>([^<]+)<\/Version>/);
  const version = khop?.[1]?.trim();
  return version || null;
}

/** Đọc version gói cài từ thẻ `<Version>` trong Directory.Build.props. null nếu thiếu tệp/thẻ. */
export async function docVersionGoiCai(): Promise<string | null> {
  try {
    const noiDung = await readFile(DUONG_DAN_PROPS, "utf-8");
    return bocVersionTuNoiDung(noiDung);
  } catch {
    return null;
  }
}

/** Thông tin gói cài để lộ ra web: version (đọc từ tệp) + sha256 (chỉ có khi khai qua biến môi trường). */
export type ThongTinGoiCai = {
  version: string | null;
  sha256: string | null;
};

export async function layThongTinGoiCai(): Promise<ThongTinGoiCai> {
  const version = await docVersionGoiCai();
  const sha256Raw = process.env.XBOSS_PLUGIN_SHA256?.trim().toLowerCase() || null;
  // Chỉ hiện sha256 hợp lệ (64 ký tự hex) — biến môi trường gõ nhầm không nên hiện ra như
  // một checksum thật để kỹ sư đối chiếu nhầm.
  const sha256 = sha256Raw && /^[0-9a-f]{64}$/.test(sha256Raw) ? sha256Raw : null;
  return { version, sha256 };
}
