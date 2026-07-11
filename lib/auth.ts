import { scryptSync, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { queryOne, run } from "@/lib/db";
import { ROLES, ROLE_LABELS, VIEW_ONLY_ROLES, PAYMENT_VIEW_ROLES, type Role } from "@/lib/roles";
export { ROLES, ROLE_LABELS, VIEW_ONLY_ROLES, PAYMENT_VIEW_ROLES, type Role };

export const COOKIE = "xboss_session";
const SESSION_DAYS = 7;

// Fallback chỉ dành cho dev — production bắt buộc đặt XBOSS_SECRET,
// nếu không ai cũng có thể tự ký cookie phiên (kể cả phiên admin).
// Kiểm tra lúc dùng (không phải lúc import) để next build không cần secret.
function getSecret(): string {
  const s = process.env.XBOSS_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production")
    throw new Error("XBOSS_SECRET chưa được cấu hình — bắt buộc khi chạy production.");
  return "xboss-dev-secret-change-me";
}

export type User = { id: number; name: string; email: string; role: Role };

// So sánh chuỗi chống timing-attack (dùng cho secret tĩnh: CRON_SECRET, bearer token).
// Khác độ dài → trả false ngay; cùng độ dài → so sánh constant-time.
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Xác thực header Authorization: Bearer <CRON_SECRET> theo kiểu constant-time.
export function checkCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;
  return safeEqual(authHeader.slice(prefix.length), secret);
}

// ===== Mật khẩu (scrypt) =====
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(pw, salt, 64);
  const ref = Buffer.from(hash, "hex");
  return test.length === ref.length && timingSafeEqual(test, ref);
}

// ===== Cookie phiên (stateless, ký HMAC) =====
// Token format: `userId.exp.pwFrag.HMAC(userId.exp.pwFrag)`
// pwFrag = 12 ký tự đầu của password_hash — đổi mật khẩu là token cũ tự hết hiệu lực.
function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}
export function makeToken(userId: number, passwordHash: string): string {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const pwFrag = passwordHash.slice(0, 12);
  const payload = `${userId}.${exp}.${pwFrag}`;
  return `${payload}.${sign(payload)}`;
}
function parseToken(token: string): { uid: number; pwFrag: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [uid, exp, pwFrag, mac] = parts;
  const expected = Buffer.from(sign(`${uid}.${exp}.${pwFrag}`), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(mac, "hex");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Number(exp) < Date.now()) return null;
  return { uid: Number(uid), pwFrag };
}

// ===== Người dùng hiện tại =====
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const parsed = parseToken(token);
  if (!parsed) return null;
  const u = await queryOne<User & { password_hash: string }>(
    `SELECT id, name, email, role, password_hash FROM users WHERE id = ?`,
    parsed.uid,
  );
  if (!u) return null;
  // Fragment không khớp → mật khẩu đã đổi, phiên cũ không còn hợp lệ.
  if (!u.password_hash.startsWith(parsed.pwFrag)) return null;
  const { password_hash: _, ...user } = u;
  return user as User;
}

export const COOKIE_MAX_AGE = SESSION_DAYS * 86400;

// ===== Tạo user mặc định (chạy 1 lần nếu DB chưa có user) =====
const DEFAULTS: { name: string; email: string; pw: string; role: Role }[] = [
  { name: "Quản trị", email: "admin@xboss.vn", pw: "admin123", role: "admin" },
  { name: "Trưởng dự án", email: "pm@xboss.vn", pw: "pm123", role: "pm" },
  { name: "Kỹ sư", email: "engineer@xboss.vn", pw: "eng123", role: "engineer" },
  { name: "Thầu phụ", email: "subcon@xboss.vn", pw: "sub123", role: "subcon" },
];
// Đã xác nhận DB có user trong process này → khỏi query lại (hàm được gọi trên mọi
// request /api/auth/me, nhưng chỉ cần thật sự kiểm tra DB 1 lần lúc boot).
let defaultUsersEnsured = false;
// Chỉ dùng trong test: nhiều file test chạy chung 1 process (tsx --test nhiều file) nên
// cache này rò rỉ giữa các file — file khác lỡ tạo user trước sẽ khiến cờ bật sớm, làm
// test ensureDefaultUsers không bao giờ seed thật. Không dùng ở code sản phẩm.
export function _resetDefaultUsersCacheForTests(): void {
  defaultUsersEnsured = false;
}
export async function ensureDefaultUsers(): Promise<void> {
  if (defaultUsersEnsured) return;
  const c = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM users`);
  if (c && Number(c.n) > 0) {
    defaultUsersEnsured = true;
    return;
  }

  // Production: không seed 4 tài khoản mật khẩu yếu — chỉ tạo admin
  // với mật khẩu lấy từ XBOSS_ADMIN_PASSWORD (đặt trước khi deploy lần đầu).
  if (process.env.NODE_ENV === "production") {
    const pw = process.env.XBOSS_ADMIN_PASSWORD;
    if (!pw) {
      console.warn(
        "[xboss] DB chưa có user và XBOSS_ADMIN_PASSWORD chưa đặt — bỏ qua seed (không tạo tài khoản mặc định trong production).",
      );
      return;
    }
    await run(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO NOTHING`,
      "Quản trị",
      "admin@xboss.vn",
      hashPassword(pw),
      "admin",
    );
    defaultUsersEnsured = true;
    return;
  }

  for (const u of DEFAULTS) {
    await run(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO NOTHING`,
      u.name,
      u.email,
      hashPassword(u.pw),
      u.role,
    );
  }
  defaultUsersEnsured = true;
}

// Admin/PM là ngưỡng vai trò dùng lặp lại ở nhiều route không thuộc 1 quyền cụ thể
// trong CAN (vd sửa cấu hình dự án, tên cột vật tư, duyệt yêu cầu mua hàng).
export const isAdminOrPm = (r?: Role): boolean => r === "admin" || r === "pm";

// Quyền theo vai trò (rút gọn từ §8 spec).
export const CAN = {
  import: (r?: Role) => r === "admin" || r === "pm",
  export: (r?: Role) => r === "admin" || r === "pm",
  editProgress: (r?: Role) => r === "admin" || r === "pm" || r === "engineer" || r === "subcon",
  editStructure: (r?: Role) => r === "admin" || r === "pm", // sửa tên/code/trục/căn hộ
  viewDashboard: (r?: Role) => r !== "subcon",
  manageUsers: (r?: Role) => r === "admin",
  assign: (r?: Role) => r === "admin" || r === "pm", // gán task cho người làm
  approve: (r?: Role) => r === "admin" || r === "pm", // duyệt/huỷ nghiệm thu
  viewPayments: (r?: Role) => !!r && PAYMENT_VIEW_ROLES.includes(r), // xem trang thanh toán
  createInspectionRequest: (r?: Role) => r === "admin" || r === "pm" || r === "engineer", // tạo phiếu YCNT
  manageContracts: (r?: Role) => r === "admin" || r === "pm", // tạo/sửa hợp đồng, phụ lục (M16)
  // Xem phát sinh/VO (M6): loại cdt (không thấy giá trị VO — quyết 2026-07-04), subcon,
  // viewer — như /costs nhưng vẫn cho kỹ sư xem/tạo vì họ ghi nhận VO tại hiện trường.
  viewVariations: (r?: Role) => r === "admin" || r === "pm" || r === "engineer" || r === "bch",
  createVariation: (r?: Role) => r === "admin" || r === "pm" || r === "engineer", // tạo VO (M6)
  // Bản vẽ (M8): tạo drawing/upload rev mới — Admin/PM/engineer (xem thì mọi vai trò,
  // kể cả subcon, vì cần bản vẽ để thi công tại hiện trường).
  manageDrawings: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Đổi trạng thái duyệt rev (approved/rejected/...) — chỉ Admin/PM.
  decideDrawingRevision: (r?: Role) => r === "admin" || r === "pm",
  // Đấu thầu (M7): giá chào là thông tin thương mại nhạy cảm — xem như VO (loại
  // cdt/subcon/viewer); tạo gói/nhập giá chào/trao thầu chỉ Admin/PM.
  viewTenders: (r?: Role) => r === "admin" || r === "pm" || r === "engineer" || r === "bch",
  manageTenders: (r?: Role) => r === "admin" || r === "pm",
  // Sổ công văn/RFI (M10): nhạy cảm hợp đồng — xem mọi vai trò trừ subcon; tạo/sửa
  // Admin/PM/engineer (kỹ sư ghi nhận công văn tại hiện trường, giống VO).
  viewCorrespondence: (r?: Role) => r !== "subcon",
  manageCorrespondence: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Mặt bằng thi công (M14): xem mọi vai trò đăng nhập; đổi trạng thái/blocker Admin/PM/kỹ sư.
  manageWorkFronts: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Thiết bị/máy móc (M12): xem mọi vai trò; tạo/sửa sổ thiết bị Admin/PM/kỹ sư.
  manageEquipment: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Định mức thi công theo hạng mục (M18): tạo/sửa Admin/PM (đồng bộ editStructure).
  manageNorms: (r?: Role) => r === "admin" || r === "pm",
  // HSE (M11): mọi vai trò thao tác tạo được (kể cả subcon báo near-miss); sửa/đóng action Admin/PM/kỹ sư.
  manageHse: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Họp + action item (M13): tạo/sửa biên bản họp và action Admin/PM/kỹ sư
  // (xem thì mọi vai trò đăng nhập — subcon cũng có action được giao từ họp thầu phụ).
  manageMeetings: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Sổ rủi ro (M13): tạo/sửa Admin/PM/kỹ sư; xem mọi vai trò trừ subcon (nhạy cảm quản trị).
  viewRisks: (r?: Role) => !!r && r !== "subcon",
  manageRisks: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Bật/tắt mục hiển thị AppShell (M21 PR3, khu "Hiển thị AppShell" ở /admin) — Admin/PM.
  manageNav: (r?: Role) => r === "admin" || r === "pm",
  // Tạo/sửa/đóng dự án + gán user↔dự án (M22): chỉ Admin (nhạy cảm hơn manageUsers).
  manageProjects: (r?: Role) => r === "admin",
  // Khởi động & Pháp lý (M23): hồ sơ pháp lý + checklist huy động — xem mọi vai trò
  // đăng nhập, tạo/sửa/xoá Admin/PM.
  manageKickoff: (r?: Role) => r === "admin" || r === "pm",
  // Nhân sự & Tổ chức (M24): nhân sự/tổ đội/chứng chỉ/RACI — xem mọi vai trò đăng
  // nhập, tạo/sửa/xoá Admin/PM.
  manageHr: (r?: Role) => r === "admin" || r === "pm",
  // Chấm công (M24): ghi rộng hơn manageHr — cho phép kỹ sư (đội trưởng) ghi công tại
  // hiện trường, giống VO/công văn.
  recordAttendance: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Môi trường & Giấy phép (M25): hồ sơ MT/ĐTM/xả thải + quan trắc + chất thải — xem mọi
  // vai trò đăng nhập, ghi Admin/PM/kỹ sư (kỹ sư môi trường ghi kết quả quan trắc).
  manageEnv: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Quan hệ & Quan trắc (M26): mốc lún/chuyển vị + khiếu nại cộng đồng — xem mọi vai
  // trò đăng nhập, ghi Admin/PM/kỹ sư (đội hiện trường trực tiếp đo/ghi kỳ đo).
  manageMonitoring: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Bàn giao & Kết thúc (M29): T&C/commissioning, hạng mục bàn giao, punch list, demob,
  // bài học kinh nghiệm — xem mọi vai trò đăng nhập, ghi Admin/PM/kỹ sư. Đổi
  // result='passed'/'failed' (commissioning) và status='accepted' (handover-items) cần
  // CAN.approve (nhạy cảm hơn, giống nghiệm thu 2 bước).
  manageHandover: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Chuyển đổi số & Công nghệ (M31): link công cụ ngoài (BIM/P6/camera) + album ảnh
  // mốc tiến độ — xem mọi vai trò đăng nhập, tạo/sửa/xoá Admin/PM (panel "Hệ thống"
  // dung lượng/sao lưu chỉ Admin — kiểm riêng ở route /api/tech/system-status).
  manageTech: (r?: Role) => r === "admin" || r === "pm",
  // Tài chính & Kế toán (M27): quỹ tiền mặt/dòng tiền, tạm ứng, hoá đơn VAT, lương —
  // nhạy cảm tiền, ghi chỉ Admin/PM (xem: CAN.viewPayments, đã gồm bch).
  manageFinance: (r?: Role) => r === "admin" || r === "pm",
  // Bảo hành & Bảo trì (M30): hạng mục bảo hành + claim lỗi sau bàn giao + tài liệu O&M —
  // xem mọi vai trò đăng nhập, ghi Admin/PM/kỹ sư.
  manageWarranty: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Thay đổi thiết kế (M32): tiếp nhận/sửa Admin/PM/kỹ sư (kỹ sư hiện trường ghi nhận
  // yêu cầu); quyết định (duyệt/từ chối) vẫn qua CAN.approve như VO/đề xuất.
  manageDesignChanges: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
  // Hồ sơ năng lực NTP (M33): sửa subcontractor_profiles + upload/xoá subcon_documents —
  // Admin/PM (đánh giá subcon_evaluations dùng check riêng admin/pm/engineer, rộng hơn
  // — xem app/api/subcontractors/[supplierId]/evaluations/route.ts). Thêm vào map trung
  // tâm nhân dịp M33 dù app/api/suppliers/[id]/ratings/route.ts (M04) vẫn dùng canRate
  // cục bộ — không sửa lại chỗ đó (ngoài phạm vi M33).
  manageSuppliers: (r?: Role) => r === "admin" || r === "pm",
  // Claim chi phí & gia hạn EOT (M34): thông tin tranh chấp/thương mại nhạy cảm —
  // xem như VO/thanh toán KL (loại cdt/subcon/viewer); ghi nhận (tạo/sửa) Admin/PM/kỹ sư.
  viewClaims: (r?: Role) => r === "admin" || r === "pm" || r === "engineer" || r === "bch",
  manageClaims: (r?: Role) => r === "admin" || r === "pm" || r === "engineer",
};

// Sub-con chỉ được thao tác trên task được giao cho mình.
export async function canTouchTask(user: User, taskId: number): Promise<boolean> {
  if (user.role !== "subcon") return true;
  const t = await queryOne<{ assigned_to: number | null }>(
    `SELECT assigned_to FROM tasks WHERE id = ?`,
    taskId,
  );
  return t?.assigned_to === user.id;
}

// Sub-con chỉ được thao tác (bbnt/bản vẽ...) trên nhóm công việc được giao cho mình.
export async function canTouchPackage(user: User, packageId: number): Promise<boolean> {
  if (user.role !== "subcon") return true;
  const wp = await queryOne<{ assigned_to: number | null }>(
    `SELECT assigned_to FROM work_packages WHERE id = ?`,
    packageId,
  );
  return wp?.assigned_to === user.id;
}

// Sub-con chỉ được check-in/out xe (vehicle_logs) của đúng NCC mình (users.supplier_id,
// gán ở M1 system_contractors) — không phải xe của NCC khác.
export async function canTouchVehicle(user: User, vehicleId: number): Promise<boolean> {
  if (user.role !== "subcon") return true;
  const row = await queryOne<{ supplierId: number | null; userSupplierId: number | null }>(
    `SELECT v.supplier_id AS "supplierId", u.supplier_id AS "userSupplierId"
       FROM vehicle_logs v, users u WHERE v.id = ? AND u.id = ?`,
    vehicleId,
    user.id,
  );
  return !!row && row.supplierId != null && row.supplierId === row.userSupplierId;
}

// Sub-con chỉ được xem/nộp biên bản nghiệm thu tầng (floor_approvals) nếu có ít nhất 1
// nhóm công việc thuộc sheet + tầng đó được giao cho mình — floor_approvals không có
// assigned_to riêng nên phải suy ra qua work_packages cùng (sheet_type_id, floor_label).
export async function canTouchFloor(
  user: User,
  sheetTypeId: number,
  floorLabel: string,
): Promise<boolean> {
  if (user.role !== "subcon") return true;
  const wp = await queryOne<{ id: number }>(
    `SELECT id FROM work_packages WHERE sheet_type_id = ? AND floor_label = ? AND assigned_to = ? LIMIT 1`,
    sheetTypeId,
    floorLabel,
    user.id,
  );
  return !!wp;
}

// Sub-con chỉ được xem hồ sơ NTP (M33) của đúng mình (users.supplier_id, gán ở M15
// system_contractors) — vai trò khác xem được mọi NTP.
export async function canViewSubcontractor(user: User, supplierId: number): Promise<boolean> {
  if (user.role !== "subcon") return true;
  const row = await queryOne<{ supplierId: number | null }>(
    `SELECT supplier_id AS "supplierId" FROM users WHERE id = ?`,
    user.id,
  );
  return !!row && row.supplierId === supplierId;
}
