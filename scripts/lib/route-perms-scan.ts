// scripts/lib/route-perms-scan.ts — Hàm quét dùng chung cho cổng CI `check:route-perms` (W2.1).
//
// VÌ SAO: đợt audit "nâng tầm dự án" phát hiện 14 route ghi (POST/PATCH/PUT/DELETE) trong
// `app/api/engineering/**` KHÔNG kiểm quyền qua `CAN.*`/`canTouchTask`/`canTouchPackage` trước
// khi ghi dữ liệu — bất kỳ ai đăng nhập (kể cả `viewer`) cũng gọi được. Lớp lỗi "route mới quên
// kiểm quyền" đã lặp ≥3 đợt audit. Cổng này biến checklist đó thành máy: mọi handler ghi mới
// PHẢI tham chiếu ít nhất một cơ chế kiểm quyền đã biết, nếu không thì đỏ ngay ở CI.
//
// Heuristic TĨNH: với mỗi `route.ts` dưới `app/api/**`, tìm các khai báo
// `export async function POST|PATCH|PUT|DELETE(...)`, cắt lấy đúng THÂN hàm đó (khớp dấu
// ngoặc nhọn), rồi kiểm thân hàm có nhắc tới một trong bốn cơ chế: `CAN.`, `canTouchTask`,
// `canTouchPackage`, `requireApiKey`. Route không có bất kỳ cơ chế nào → vi phạm, trừ khi nằm
// trong WHITELIST của người gọi (mỗi mục whitelist đi kèm lý do, xem `check-route-perms.ts`).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const GOC_MAC_DINH = join(import.meta.dirname, "..", "..");
export const THU_MUC_QUET_MAC_DINH = join("app", "api");

const PHUONG_THUC = ["POST", "PATCH", "PUT", "DELETE"] as const;
export type PhuongThucGhi = (typeof PHUONG_THUC)[number];

// Bốn cơ chế "chính thức" theo đặc tả (CAN., canTouchTask, canTouchPackage, requireApiKey)
// CỘNG hai lớp quy ước đã có sẵn khắp `app/api/**` mà việc bỏ sót sẽ tạo hàng chục dương tính
// giả vô nghĩa (đã kiểm chứng thủ công từng mẫu trước khi thêm, không phải nới lỏng tuỳ tiện):
//  - `isAdminOrPm(` — helper export thẳng từ `lib/bao-mat/auth.ts` cạnh `CAN`, dùng ở hàng chục
//    route thay cho `CAN.approve` khi điều kiện là "Admin hoặc PM".
//  - Lời gọi hàm đặt tên theo quy ước `can<Việc gì đó>(`/`require<Việc gì đó>(` — quy ước đặt
//    tên nhất quán cho các hàm kiểm quyền theo miền (`canLockDiary`, `canDecideDesignChange`,
//    `canEditClaim`...), thường định nghĩa ở `lib/<miền>/*.ts` và bọc chính `CAN.xxx` bên
//    trong (đã kiểm vài mẫu: `canDecideDesignChange` → `CAN.approve`). KHÔNG dùng tiền tố
//    `is[A-Z]` chung chung vì nó khớp cả `isArray`/`isNaN`/`isFinite` (dương tính giả thật).
//  - So sánh `.role === "..."`/`.role !== "..."` trực tiếp — mẫu kiểm quyền nội tuyến không
//    qua helper, vẫn là kiểm quyền thật (đã kiểm hse/route.ts, presence/route.ts...).
const MAU_KIEM_QUYEN =
  /\bCAN\.|canTouchTask|canTouchPackage|requireApiKey|isAdminOrPm\(|\b(?:can|require)[A-Z]\w*\(|\.role\s*(?:===|!==)\s*["']/;

function duyetRouteFiles(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) duyetRouteFiles(p, out);
    else if (ent.name === "route.ts") out.push(p);
  }
  return out;
}

// Tìm vị trí `}` khớp với `{` tại `batDau`, bỏ qua nội dung trong chuỗi/comment/regex đơn giản.
function timDauDongNgoacNhon(src: string, batDau: number): number {
  let depth = 0;
  let i = batDau;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") i += 2;
        else if (src[i] === q) {
          i++;
          break;
        } else i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i) + 2;
      continue;
    }
    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      i++;
      if (depth === 0) return i - 1;
      continue;
    }
    i++;
  }
  return -1;
}

export type RoutePermViPham = { key: string; method: PhuongThucGhi };

// Tìm vị trí `)` khớp với `(` tại `batDau` — dùng để nhảy qua danh sách tham số của handler
// (có thể chứa `{ params: paramsP }: { params: Promise<{ id: string }> }` — nhiều dấu `{`
// lồng nhau KHÔNG phải thân hàm) trước khi tìm dấu `{` mở thân hàm thật sự.
function timDauDongNgoacDon(src: string, batDau: number): number {
  let depth = 0;
  let i = batDau;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") i += 2;
        else if (src[i] === q) {
          i++;
          break;
        } else i++;
      }
      continue;
    }
    if (c === "(") {
      depth++;
      i++;
      continue;
    }
    if (c === ")") {
      depth--;
      i++;
      if (depth === 0) return i - 1;
      continue;
    }
    i++;
  }
  return -1;
}

const MAU_HANDLER = new RegExp(
  `export\\s+async\\s+function\\s+(${PHUONG_THUC.join("|")})\\s*\\(`,
  "g",
);

/** Route ghi (POST/PATCH/PUT/DELETE) không tham chiếu bất kỳ cơ chế kiểm quyền nào đã biết. */
export function timRoutePermViPham(
  goc: string = GOC_MAC_DINH,
  thuMuc: string = THU_MUC_QUET_MAC_DINH,
): RoutePermViPham[] {
  const viPham: RoutePermViPham[] = [];
  for (const tep of duyetRouteFiles(join(goc, thuMuc))) {
    const src = readFileSync(tep, "utf8");
    MAU_HANDLER.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MAU_HANDLER.exec(src)) !== null) {
      const method = m[1] as PhuongThucGhi;
      // m[0] kết thúc ở dấu `(` mở danh sách tham số — nhảy qua toàn bộ tham số (khớp ngoặc
      // đơn) rồi mới tìm `{` mở thân hàm, tránh nhầm với `{` của kiểu/destructure tham số.
      const dongThamSo = timDauDongNgoacDon(src, m.index + m[0].length - 1);
      if (dongThamSo < 0) continue;
      const moThan = src.indexOf("{", dongThamSo + 1);
      if (moThan < 0) continue;
      const dongThan = timDauDongNgoacNhon(src, moThan);
      const than = dongThan > moThan ? src.slice(moThan + 1, dongThan) : "";
      if (MAU_KIEM_QUYEN.test(than)) continue;
      // key = đường dẫn thư mục route tính từ app/api (khớp quy ước whitelist của
      // tests/engineering-project-scope-invariant.test.ts), vd "tasks/[id]".
      const relTep = relative(join(goc, thuMuc), tep);
      const key = relTep.slice(0, -"/route.ts".length);
      viPham.push({ key, method });
    }
  }
  return viPham;
}
