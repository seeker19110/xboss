// scripts/lib/test-fk-ids-scan.ts — Hàm quét dùng chung cho lớp lỗi "hằng số nguyên nhỏ gán
// cứng vào vị trí id khoá ngoại tới `users` trong test" (Đợt 6 Việc D).
//
// LỊCH SỬ: xem PLAN.md Đợt 6 "Việc D" + PROGRESS.md "Đợt 5 chiến dịch coverage" mục "Bài học
// quy trình". Lớp lỗi này đã làm ĐỎ bộ test ở CẢ Đợt 4 lẫn Đợt 5, dù Đợt 5 đã ghi thành ràng
// buộc cứng trong PLAN.md kèm ví dụ chính xác: một hằng số id (thường `1`) được gán vào cột/
// tham số có khoá ngoại tới `users` (created_by, updated_by, actorId...) thay vì dùng id trả
// về từ hàm `tao*()` của chính file test — XANH khi chạy riêng file đó, ĐỎ khi chạy cả bộ vì
// file test khác đã `DELETE FROM users` xoá đúng id đó. Kết luận ghi trong PROGRESS.md: viết
// luật vào kế hoạch là CHƯA ĐỦ, phải có cổng tự động. Hai ca thật đã xảy ra:
//   - `INSERT INTO boq_norms (..., created_by) VALUES (..., 1)` — hằng NẰM TRONG chuỗi SQL
//     literal của test (không đi qua tham số `?`).
//   - `await setFlag(moduleKey, projectId, true, 1, 1)` — hằng truyền TRỰC TIẾP vào tham số
//     `actorId` của hàm lib (setFlag ký `(moduleKey, projectId, enabled, actorId, orgId)`).
//
// Heuristic TĨNH (đọc source, không cần DB), CHIA HAI LƯỢT — mỗi lượt bắt đúng một ca thật —
// CỘNG một bộ lọc chung: chỉ tính là "cột/tham số khoá ngoại tới users" khi tên khớp mẫu ĐẶT
// TÊN quy ước (created_by, updated_by, actorId…) VÀ cột cùng tên đó THẬT SỰ có
// `REFERENCES users(id)` trong `migrations/*.sql` (dò động, không hard-code danh sách — thêm
// migration mới có cột FK mới thì cổng tự nhận). Bộ lọc thứ hai này BẮT BUỘC để tránh nhiễu:
// nhiều hàm THUẦN không chạm DB (vd `kiemDieuKienKy`, `makeToken`, `generateFieldDynamicChallenge`
// — token/HMAC/so khớp object truyền vào, không INSERT/UPDATE gì) hay cột không có ràng buộc
// FK thật (`role_permissions.updated_by` là INT trần, không REFERENCES) đều KHÔNG có nguy cơ
// vỡ khi user bị xoá — gán hằng số ở đó không phải lớp lỗi đang chặn.
//
// Lượt 1 — SQL literal: parse `INSERT INTO <bảng> (<cột...>) VALUES (<giá trị...>)` trong
// chuỗi SQL của test theo VỊ TRÍ cột ↔ giá trị. Cột khớp mẫu FK-tới-user THẬT (xem trên) mà
// giá trị ở đúng vị trí đó là MỘT SỐ NGUYÊN LITERAL (không phải `?`) → vi phạm. `?` không bị
// coi là lỗi ở lượt này — nếu nơi GỌI truyền hằng số cho đúng vị trí tham số đó thì Lượt 2 bắt.
//
// Lượt 2 — tham số lời gọi: dựng bản đồ "tên hàm export trong lib/ → vị trí tham số có TÊN
// khớp mẫu FK-tới-user, KIỂU number, VÀ thân hàm có INSERT/UPDATE ghi vào một cột FK-tới-user
// THẬT" từ chính khai báo + thân hàm, rồi quét lời gọi hàm đó trong test — đối số ở đúng vị
// trí là số nguyên literal → vi phạm.
//
// CHẤP NHẬN false-negative (giống `project-scope-scan`/`db-params-scan`): mục tiêu là CHẶN
// TÁI PHÁT đúng dạng lỗi đã xảy ra 2 lần, không phải chứng minh mọi test đã dùng id động.
// Không bắt được: id truyền qua object literal (`{ actorId: 1 }`), gán qua biến trung gian
// (`const uid = 1; ...(uid)`), hàm không có kiểu tham số tường minh (`: any`), hay hàm ghi
// đúng cột FK nhưng bằng một biến KHÁC tên tham số đang xét (hiếm trong thực tế repo).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const GOC_MAC_DINH = join(import.meta.dirname, "..", "..");

// Cột SQL snake_case coi là ỨNG VIÊN khoá ngoại tới `users` (còn phải khớp thêm
// `taoTapCotFkThat` mới bị tính là vi phạm — xem ghi chú đầu file).
const FK_COT_MAU =
  /^(created_by|updated_by|approved_by|reviewed_by|requested_by|granted_by|killed_by|deleted_by|closed_by|resolved_by|reported_by|submitted_by|uploaded_by|verified_by|assigned_to|owner_id|owner|assignee|approver_id|reviewer_id|assignee_id|actor_id|user_id|manager_id|inspected_by|scanned_by|logged_by|locked_by|installed_by|published_by|rated_by|received_by|recorded_by|imported_by|initiated_by|evaluated_by|decided_by|confirmed_by|changed_by|audited_by|activated_by|settled_by|assigned_inspector|action_assignee|prev_user_id|new_user_id)$/i;

// Tham số TS camelCase coi là ỨNG VIÊN khoá ngoại tới `users`.
const FK_THAM_SO_MAU =
  /^(createdBy|updatedBy|approvedBy|reviewedBy|requestedBy|grantedBy|killedBy|deletedBy|closedBy|resolvedBy|reportedBy|submittedBy|uploadedBy|verifiedBy|assignedTo|ownerId|owner|assignee|approverId|reviewerId|assigneeId|actorId|userId|managerId|inspectedBy|scannedBy|loggedBy|lockedBy|installedBy|publishedBy|ratedBy|receivedBy|recordedBy|importedBy|initiatedBy|evaluatedBy|decidedBy|confirmedBy|changedBy|auditedBy|activatedBy|settledBy)$/;

/** snake_case → camelCase (để đối chiếu tên cột SQL với tên tham số TS). */
function snakeSangCamel(s: string): string {
  return s.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Dò ĐỘNG trong `migrations/*.sql` các cột thật sự có `REFERENCES users(id)` — không
 * hard-code danh sách để migration mới tự động được cổng nhận diện. Trả về set gồm CẢ tên
 * snake_case lẫn camelCase tương ứng, dùng chung cho cả 2 lượt quét.
 */
// Khoá tra cứu "<bảng>.<cột>" — BẮT BUỘC gắn theo bảng cụ thể (không chỉ theo TÊN cột): cùng
// tên cột `updated_by` là FK thật ở `feature_flags` nhưng CHỈ là INT trần (không REFERENCES)
// ở `role_permissions` — nếu tra theo tên cột không thôi sẽ báo nhầm mọi INSERT
// `role_permissions.updated_by` là vi phạm (đã bắt được false-positive này lúc code, xem
// commit sửa kèm test). "*" làm khoá bảng khi không xác định được tên bảng của statement.
function khoaBangCot(bang: string, cot: string): string {
  return `${bang.toLowerCase()}.${cot.toLowerCase()}`;
}

/**
 * Tách file SQL thành các câu lệnh theo dấu `;` Ở TẦNG NGOÀI CÙNG — bỏ qua `;` nằm trong
 * chuỗi/comment VÀ trong khối dollar-quote (`$$...$$`/`$tag$...$tag$`, dùng cho thân hàm
 * trigger) vì các khối này không liên quan cột FK và có thể chứa `;` riêng của nó.
 */
function tachCauLenhSql(src: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"') {
      const start = i;
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") i += 2;
        else if (src[i] === q) {
          i++;
          break;
        } else i++;
      }
      cur += src.slice(start, i);
      continue;
    }
    if (c === "-" && src[i + 1] === "-") {
      const start = i;
      while (i < src.length && src[i] !== "\n") i++;
      cur += src.slice(start, i);
      continue;
    }
    if (c === "$") {
      const mTag = /^\$[a-zA-Z_]*\$/.exec(src.slice(i));
      if (mTag) {
        const tag = mTag[0];
        const dong = src.indexOf(tag, i + tag.length);
        const het = dong < 0 ? src.length : dong + tag.length;
        cur += src.slice(i, het);
        i = het;
        continue;
      }
    }
    if (c === ";") {
      out.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim().length) out.push(cur);
  return out;
}

export function taoTapCotFkThat(gocMigrations: string): Set<string> {
  const cap = new Set<string>();
  let entries: string[];
  try {
    entries = readdirSync(gocMigrations);
  } catch {
    return cap;
  }
  const RE_COT_FK =
    /\b([a-z_][a-z0-9_]*)\s+(?:BIGINT|INTEGER|INT)\b[^,;()]*REFERENCES\s+users\s*\(\s*id\s*\)/gi;
  const RE_CREATE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/i;
  const RE_ALTER = /ALTER\s+TABLE\s+(?:ONLY\s+)?([a-z_][a-z0-9_]*)/i;
  for (const f of entries) {
    if (!f.endsWith(".sql")) continue;
    const src = readFileSync(join(gocMigrations, f), "utf8");
    // Mỗi câu lệnh DDL biết TÊN BẢNG của chính nó (CREATE TABLE <bảng> (...) hoặc
    // ALTER TABLE <bảng> ...), tránh gán nhầm cột FK của bảng này cho bảng khác đứng cạnh
    // trong cùng file migration.
    for (const cauLenh of tachCauLenhSql(src)) {
      const mCreate = RE_CREATE.exec(cauLenh);
      const mAlter = !mCreate ? RE_ALTER.exec(cauLenh) : null;
      const bang = (mCreate?.[1] ?? mAlter?.[1] ?? "*").toLowerCase();
      RE_COT_FK.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = RE_COT_FK.exec(cauLenh)) !== null) {
        const ten = m[1].toLowerCase();
        cap.add(khoaBangCot(bang, ten));
        cap.add(khoaBangCot(bang, snakeSangCamel(ten)));
      }
    }
  }
  return cap;
}

function duyetTepTs(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) duyetTepTs(p, out);
    else if (ent.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Tìm vị trí dấu đóng khớp dấu mở tại `batDau` (bỏ qua nội dung trong chuỗi/comment). */
function timDauDong(src: string, batDau: number): number {
  const cap: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const ngan: string[] = [src[batDau]];
  let i = batDau + 1;
  while (i < src.length && ngan.length > 0) {
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
    if (cap[c]) {
      ngan.push(c);
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      if (cap[ngan[ngan.length - 1]] !== c) return -1;
      ngan.pop();
      i++;
      continue;
    }
    i++;
  }
  return ngan.length > 0 ? -1 : i - 1;
}

/** Tách theo dấu phẩy Ở TẦNG NGOÀI CÙNG, bỏ qua dấu phẩy trong `(){}[]`/chuỗi. */
function tachTangNgoai(s: string): string[] {
  const out: string[] = [];
  let sau = 0;
  let cur = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"' || c === "`") {
      const start = i;
      const q = c;
      i++;
      while (i < s.length) {
        if (s[i] === "\\") {
          i += 2;
          continue;
        }
        if (s[i] === q) {
          i++;
          break;
        }
        i++;
      }
      cur += s.slice(start, i);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      sau++;
      cur += c;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      sau--;
      cur += c;
      i++;
      continue;
    }
    if (c === "," && sau === 0) {
      out.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim().length) out.push(cur);
  return out.map((x) => x.trim());
}

export type ViPhamFkId = { tep: string; dong: number; chiTiet: string };

/** Lượt 1: `INSERT INTO <bảng> (cột FK-tới-user THẬT...) VALUES (..., <số nguyên literal>)`. */
export function timViPhamSql(
  tepTuongDoi: string,
  src: string,
  cotFkThat: Set<string>,
): ViPhamFkId[] {
  const viPham: ViPhamFkId[] = [];
  const RE_INSERT = /INSERT\s+INTO\s+(\w+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = RE_INSERT.exec(src)) !== null) {
    const bang = m[1].toLowerCase();
    const moCot = m.index + m[0].length - 1;
    const dongCot = timDauDong(src, moCot);
    if (dongCot < 0) continue;
    const cols = tachTangNgoai(src.slice(moCot + 1, dongCot));

    let i = dongCot + 1;
    const mVal = /^\s*VALUES\s*\(/i.exec(src.slice(i, i + 200));
    if (!mVal) continue;
    const moVal = i + mVal[0].length - 1;
    const dongVal = timDauDong(src, moVal);
    if (dongVal < 0) continue;
    const vals = tachTangNgoai(src.slice(moVal + 1, dongVal));

    for (let idx = 0; idx < cols.length && idx < vals.length; idx++) {
      const ten = cols[idx].trim();
      if (!FK_COT_MAU.test(ten) || !cotFkThat.has(khoaBangCot(bang, ten))) continue;
      const gt = vals[idx].trim();
      if (/^-?\d+$/.test(gt)) {
        viPham.push({
          tep: tepTuongDoi,
          dong: src.slice(0, m.index).split("\n").length,
          chiTiet: `INSERT ...(${ten}) VALUES (..., ${gt}) — hằng số cứng thay vì tham số ? hay id từ tao*()`,
        });
      }
    }
  }
  return viPham;
}

/**
 * Thân hàm `than` có GHI (INSERT/UPDATE qua query/queryOne/run/insertId) vào một cột FK-tới-
 * user THẬT (`cotFkThat`) mà đúng vị trí placeholder `?` của cột đó được truyền bằng đối số
 * chứa định danh `tenThamSo` hay không — đối chiếu THEO VỊ TRÍ (thứ tự cột trong danh sách ↔
 * thứ tự đối số sau chuỗi SQL, đúng quy ước viết SQL của repo — xem `CLAUDE.md`).
 */
function thanHamGhiCotFkThat(than: string, tenThamSo: string, cotFkThat: Set<string>): boolean {
  const RE_CALL = /(^|[^.\w$])(query|queryOne|run|insertId)\s*(<[^(]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = RE_CALL.exec(than)) !== null) {
    const mo = m.index + m[0].length - 1;
    const dong = timDauDong(than, mo);
    if (dong < 0) continue;
    const doiSo = tachTangNgoai(than.slice(mo + 1, dong));
    const sqlRaw = doiSo[0]?.trim();
    if (!sqlRaw || !/^[`'"]/.test(sqlRaw)) continue;
    const sql = sqlRaw.slice(1, -1);

    let bang = "*";
    let cols: string[] = [];
    let vals: string[] = [];
    const mIns = /INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i.exec(sql);
    if (mIns) {
      bang = mIns[1].toLowerCase();
      cols = tachTangNgoai(mIns[2]);
      vals = tachTangNgoai(mIns[3]);
    } else {
      const mUpd = /UPDATE\s+(\w+)\s+SET\s+([\s\S]*?)(?:WHERE|$)/i.exec(sql);
      if (mUpd) {
        bang = mUpd[1].toLowerCase();
        for (const phan of tachTangNgoai(mUpd[2])) {
          const mm = /^([a-z_][a-z0-9_]*)\s*=\s*(.+)$/i.exec(phan.trim());
          if (mm) {
            cols.push(mm[1]);
            vals.push(mm[2]);
          }
        }
      }
    }
    if (!cols.length) continue;

    let ptr = 0; // đếm placeholder `?` đã gặp để khớp với đối số sau chuỗi SQL (đối số 0)
    for (let idx = 0; idx < cols.length; idx++) {
      // `?` có thể kèm ép kiểu Postgres (`?::date`, `?::jsonb`...) — vẫn tiêu thụ đúng 1 đối
      // số vị trí; chỉ literal thật ('submitted', số cứng...) mới KHÔNG tiêu thụ đối số nào.
      const laPlaceholder = /^\?/.test(vals[idx]?.trim() ?? "");
      if (!laPlaceholder) continue;
      const viTriDoiSo = 1 + ptr;
      ptr++;
      const ten = cols[idx].trim().toLowerCase();
      if (!cotFkThat.has(khoaBangCot(bang, ten))) continue;
      const arg = doiSo[viTriDoiSo]?.trim();
      if (arg && new RegExp(`\\b${tenThamSo}\\b`).test(arg)) return true;
    }
  }
  return false;
}

/**
 * Tìm dấu `{` mở THÂN HÀM ngay sau `)` của tham số — PHẢI bỏ qua kiểu trả về ở giữa (`:
 * Promise<{ id: string }>`), nếu không dấu `{` của OBJECT TYPE LITERAL trong kiểu trả về sẽ
 * bị nhầm là thân hàm (đã bắt được lỗi này lúc code: `saveFidicTiaClaim` trả về
 * `Promise<{ id: string }>` làm `indexOf("{", ...)` ngây thơ dừng quá sớm, cắt cụt thân hàm
 * nên không thấy INSERT bên trong). Theo dõi ĐỘ SÂU ngoặc gộp `(){}[]<>` bắt đầu từ 0 ngay
 * sau `)`; gặp `{` khi độ sâu đang là 0 (chưa lồng trong gì) mới là thân hàm thật.
 */
function timMoThanHam(src: string, tuViTri: number): number {
  let depth = 0;
  let i = tuViTri;
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
    if (c === "{" && depth === 0) return i;
    if (c === "(" || c === "[" || c === "<") {
      depth++;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === ">") {
      depth--;
      i++;
      continue;
    }
    if (c === "{" || c === "}") {
      depth += c === "{" ? 1 : -1;
      i++;
      continue;
    }
    i++;
  }
  return -1;
}

/** Bản đồ "tên hàm export trong lib/ → các vị trí (0-based) tham số nghi FK-tới-user". */
export type BanDoThamSoFk = Map<string, number[]>;

export function dungBanDoThamSoFk(gocLib: string, cotFkThat: Set<string>): BanDoThamSoFk {
  const map: BanDoThamSoFk = new Map();
  const RE_FUNC = /export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^(]*>)?\s*\(/g;
  for (const tep of duyetTepTs(gocLib)) {
    const src = readFileSync(tep, "utf8");
    RE_FUNC.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_FUNC.exec(src)) !== null) {
      const ten = m[1];
      const moThamSo = m.index + m[0].length - 1;
      const dongThamSo = timDauDong(src, moThamSo);
      if (dongThamSo < 0) continue;
      const params = tachTangNgoai(src.slice(moThamSo + 1, dongThamSo));

      // Thân hàm: từ dấu `{` mở thật (bỏ qua kiểu trả về ở giữa) tới dấu `}` khớp.
      const moThan = timMoThanHam(src, dongThamSo + 1);
      const dongThan = moThan >= 0 ? timDauDong(src, moThan) : -1;
      if (dongThan < 0) continue;
      const than = src.slice(moThan, dongThan + 1);

      const viTri: number[] = [];
      params.forEach((p, idx) => {
        const mTen = /^([A-Za-z_$][\w$]*)\??\s*:\s*([\s\S]+)$/.exec(p.trim());
        if (!mTen) return;
        const [, tenTs, kieu] = mTen;
        if (
          FK_THAM_SO_MAU.test(tenTs) &&
          /^number\b/.test(kieu.trim()) &&
          thanHamGhiCotFkThat(than, tenTs, cotFkThat)
        ) {
          viTri.push(idx);
        }
      });
      if (viTri.length) {
        const cu = map.get(ten) ?? [];
        map.set(ten, [...new Set([...cu, ...viTri])]);
      }
    }
  }
  return map;
}

/** Lượt 2: lời gọi hàm trong `banDo` với đối số ở đúng vị trí FK là số nguyên literal. */
export function timViPhamGoi(
  tepTuongDoi: string,
  src: string,
  banDo: BanDoThamSoFk,
): ViPhamFkId[] {
  const viPham: ViPhamFkId[] = [];
  for (const [ten, viTriList] of banDo) {
    const RE = new RegExp(`(^|[^.\\w$])${ten}\\s*\\(`, "g");
    let m: RegExpExecArray | null;
    while ((m = RE.exec(src)) !== null) {
      const mo = m.index + m[0].length - 1;
      const dong = timDauDong(src, mo);
      if (dong < 0) continue;
      const args = tachTangNgoai(src.slice(mo + 1, dong));
      for (const viTri of viTriList) {
        const a = args[viTri]?.trim();
        if (a && /^-?\d+$/.test(a)) {
          viPham.push({
            tep: tepTuongDoi,
            dong: src.slice(0, m.index).split("\n").length,
            chiTiet: `${ten}(...) — đối số vị trí ${viTri} (tham số FK-tới-user) = ${a}, phải là id từ tao*()`,
          });
        }
      }
    }
  }
  return viPham;
}

/** Quét toàn bộ `tests/**\/*.test.ts`, gộp cả 2 lượt. */
export function quetTests(
  goc: string = GOC_MAC_DINH,
  thuMucTests = "tests",
  thuMucLib = "lib",
  thuMucMigrations = "migrations",
): ViPhamFkId[] {
  const cotFkThat = taoTapCotFkThat(join(goc, thuMucMigrations));
  const banDo = dungBanDoThamSoFk(join(goc, thuMucLib), cotFkThat);
  const viPham: ViPhamFkId[] = [];
  for (const tep of duyetTepTs(join(goc, thuMucTests))) {
    if (!tep.endsWith(".test.ts")) continue;
    const rel = relative(goc, tep);
    const src = readFileSync(tep, "utf8");
    viPham.push(...timViPhamSql(rel, src, cotFkThat));
    viPham.push(...timViPhamGoi(rel, src, banDo));
  }
  return viPham;
}
