// Nền đa dự án (M22 PR1 — xem ADR-0004 + docs/nang-cap/M22-da-du-an.md). Dự án đang
// chọn = cookie `xboss_project`, đối chiếu quyền qua bảng `user_projects`. Route KHÔNG
// tin `project_id` client gửi qua body/query — luôn suy qua getCurrentProjectId(user).
import { cookies } from "next/headers";
import { query, queryOne, todayISO } from "@/lib/db";
import { patchRequestContext, getRequestContext } from "@/lib/nen/request-context";
import { strictMembershipEnabled } from "@/lib/nen/env";
import type { Role } from "@/lib/nen/roles";

export const PROJECT_COOKIE = "xboss_project";

type ProjectActor = { id: number; role: Role; orgId: number };

// ID từ client phải là số nguyên dương an toàn hoặc chuỗi thập phân chuẩn; không ép
// boolean/mảng/object, ký pháp mũ/hex thành một dự án hợp lệ (QUALITY-FINAL-1 D01).
function parseProjectId(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[1-9]\d*$/.test(value)))
    return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Admin thấy mọi dự án cùng tổ chức; vai trò khác theo `user_projects` trong tổ chức của
 *  mình. Cờ `XBOSS_STRICT_MEMBERSHIP` TẮT (mặc định): bảng `user_projects` rỗng toàn hệ thống =
 *  thấy mọi dự án CÙNG TỔ CHỨC (tương thích ngược mô hình 1 dự án — chỉ khoá khi bắt đầu cấu
 *  hình gán). Cờ BẬT (cutover D01/A1-AC02, AUDIT-S16): non-admin chỉ thấy dự án được gán, bảng
 *  rỗng không mở gì; admin cùng org vẫn thấy hết để gán lại (recovery). Bật theo runbook
 *  docs/nang-cap/AUDIT-S16-MEMBERSHIP-CUTOVER.md. Actor thiếu org bị từ chối ngay. */
export async function visibleProjectIds(user: ProjectActor): Promise<number[]> {
  if (parseProjectId(user.orgId) == null) return [];
  const duAnCungOrg = async () => {
    const rows = await query<{ id: number }>(
      `SELECT id FROM projects WHERE org_id = ? ORDER BY id`,
      user.orgId,
    );
    return rows.map((r) => r.id);
  };
  if (user.role === "admin") return duAnCungOrg();

  if (!strictMembershipEnabled()) {
    const [{ n }] = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM user_projects`);
    if (Number(n) === 0) return duAnCungOrg();
  }

  const rows = await query<{ projectId: number }>(
    `SELECT up.project_id AS "projectId" FROM user_projects up
       JOIN projects p ON p.id = up.project_id
      WHERE up.user_id = ? AND p.org_id = ? ORDER BY up.project_id`,
    user.id,
    user.orgId,
  );
  return rows.map((r) => r.projectId);
}

/** Logic thuần (không đụng cookie/DB) — tách riêng để test được: cookie hợp lệ (nằm trong
 *  dự án user thấy) → dùng; else dự án đầu user thấy (mặc định, đã giới hạn trong tổ chức).
 *  Không có dự án nào → null. Client gửi id lạ/không thấy được → bỏ, không tin.
 *  Giữ mặc định "dự án đầu" có chủ đích: nhiều route còn coi null là "không lọc dự án", nên
 *  trả null cho cookie sai/thiếu sẽ mở dữ liệu toàn hệ (audit PR #544). Cờ
 *  XBOSS_STRICT_MEMBERSHIP KHÔNG đổi hàm này: AUDIT-S16 rà lại và vẫn còn route coi null =
 *  không lọc (danh sách trong docs/nang-cap/AUDIT-S16-MEMBERSHIP-CUTOVER.md §3) — phải chuyển
 *  hết sang fail-closed trước khi cookie sai được phép thành null. */
export function resolveProjectId(
  visible: number[],
  rawCookieValue: string | undefined,
): number | null {
  if (visible.length === 0) return null;
  const requested = parseProjectId(rawCookieValue);
  return requested != null && visible.includes(requested) ? requested : visible[0];
}

/** Dự án đang chọn của request hiện tại — đọc cookie `xboss_project` + đối chiếu quyền. */
export async function getCurrentProjectId(user: {
  id: number;
  role: Role;
  orgId: number;
}): Promise<number | null> {
  // Không tái dùng projectId chỉ theo số: actor/org/cookie có thể đã đổi trong cùng
  // context. Luôn đối chiếu danh sách hiện hành trước khi patch quyền theo dự án.
  const context = getRequestContext();
  if (context?.projectId != null) patchRequestContext({ projectId: undefined });
  const visible = await visibleProjectIds(user);
  const store = await cookies();
  const projectId = resolveProjectId(visible, store.get(PROJECT_COOKIE)?.value);
  if (projectId == null) return null;
  // Phòng thủ thêm khi org dự án đổi giữa hai query.
  const row = await queryOne<{ orgId: number }>(
    `SELECT org_id AS "orgId" FROM projects WHERE id = ?`,
    projectId,
  );
  if (!row || row.orgId !== user.orgId) return null;
  patchRequestContext({ projectId });
  return projectId;
}

/** Dự án đang chọn, KHÔNG fallback khi cookie sai: cookie không hợp lệ/không được cấp → null
 *  (route trả 404), chỉ khi chưa có cookie mới lấy dự án khả kiến đầu tiên. Luôn đối chiếu org.
 *  Dùng cho route tài chính đã chuyển sang fail-closed (S02a — tiền lệ GET /api/payments/bills). */
export async function getCurrentProjectIdStrict(user: ProjectActor): Promise<number | null> {
  if (parseProjectId(user.orgId) == null) return null;
  const visible = await visibleProjectIds(user);
  const raw = (await cookies()).get(PROJECT_COOKIE)?.value;
  let projectId: number | null = null;
  if (raw == null) projectId = visible[0] ?? null;
  else {
    const parsed = parseProjectId(raw);
    if (parsed != null && visible.includes(parsed)) projectId = parsed;
  }
  if (projectId == null) return null;
  const project = await queryOne<{ id: number }>(
    `SELECT id FROM projects WHERE id = ? AND org_id = ?`,
    projectId,
    user.orgId,
  );
  return project?.id ?? null;
}

export type ProjectListItem = {
  id: number;
  name: string;
  code: string | null;
  status: "active" | "handover" | "closed";
  color: string | null;
  orgId: number | null;
  progressPercent: number;
  delayedCount: number;
};

/** Task có progress hợp lệ (A4-FR08): NULL/ngoài [0,1] là lỗi dữ liệu — loại khỏi mẫu số,
 *  báo qua coverage, không sửa dữ liệu nguồn. */
const TASK_HOP_LE = `t.progress_percent IS NOT NULL AND t.progress_percent BETWEEN 0 AND 1`;
/** Việc trễ: ngày VN (todayISO), task thiếu ngày kế thừa ngày KT nhóm, chưa xong/nghiệm thu. */
const TASK_TRE = `COALESCE(t.end_date, wp.end_date) < ? AND t.progress_percent < 1
                  AND t.status NOT IN ('hoan_thanh','nghiem_thu')`;
/** Nguồn dự án + task dùng CHUNG cho list và KPI (cùng org/visibility). Không join
 *  progress_dimensions nên mỗi task đúng 1 dòng; đếm vẫn theo t.id cho chắc. */
const NGUON_DU_AN_TASK = `FROM projects p
       LEFT JOIN towers tw ON tw.project_id = p.id
       LEFT JOIN sheet_types st ON st.tower_id = tw.id
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id`;

/** Dự án actor thấy, đã áp filter org — `null` = không có dự án nào trong phạm vi. */
async function phamViDuAn(user: ProjectActor, orgId?: number | null): Promise<number[] | null> {
  if (orgId != null && orgId !== user.orgId) return null;
  const visible = await visibleProjectIds(user);
  return visible.length === 0 ? null : visible;
}

/** Danh sách dự án user thấy + % tiến độ (TB task hợp lệ) + số việc trễ — dùng chung
 *  cho project switcher lẫn trang Portfolio. `orgId` (M51 PR4): lọc theo tổ chức khi có
 *  giá trị; NULL/undefined = không lọc (mọi dự án user thấy). */
export async function listProjects(
  user: ProjectActor,
  orgId?: number | null,
): Promise<ProjectListItem[]> {
  const visible = await phamViDuAn(user, orgId);
  if (!visible) return [];
  const placeholders = visible.map(() => "?").join(",");
  return query<ProjectListItem>(
    `SELECT p.id, p.name, p.code, p.status, p.color, p.org_id AS "orgId",
            COALESCE(AVG(t.progress_percent) FILTER (WHERE ${TASK_HOP_LE}), 0) AS "progressPercent",
            COUNT(DISTINCT t.id) FILTER (WHERE ${TASK_TRE}) AS "delayedCount"
       ${NGUON_DU_AN_TASK}
      WHERE p.id IN (${placeholders}) AND p.org_id = ?
      GROUP BY p.id, p.name, p.code, p.status, p.color, p.org_id
      ORDER BY p.id`,
    todayISO(),
    ...visible,
    user.orgId,
  );
}

export type OrganizationItem = { id: number; name: string };

/** Tổ chức có ít nhất 1 dự án user thấy — dùng để trang Portfolio quyết định có hiện
 *  select tổ chức hay không (chỉ hiện khi >1 org). M54 GĐ1 PR1: projects.org_id nay NOT
 *  NULL DEFAULT 1 nên dự án không gán tổ chức thuộc org mặc định 1 (không còn NULL). */
export async function listOrganizations(user: ProjectActor): Promise<OrganizationItem[]> {
  const visible = await visibleProjectIds(user);
  if (visible.length === 0) return [];
  const placeholders = visible.map(() => "?").join(",");
  return query<OrganizationItem>(
    `SELECT DISTINCT o.id, o.name
       FROM organizations o
       JOIN projects p ON p.org_id = o.id
      WHERE p.id IN (${placeholders}) AND o.id = ?
      ORDER BY o.name`,
    ...visible,
    user.orgId,
  );
}

export type PortfolioKpi = {
  totalProjects: number;
  activeCount: number;
  handoverCount: number;
  closedCount: number;
  totalDelayed: number;
  /** Tiến độ theo công việc (A4-FR08): tổng progress task / số task hợp lệ của mọi dự án
   *  trong phạm vi — KHÔNG trung bình theo dự án, không phải tiến độ tiền/EVM. Không có task
   *  hợp lệ nào → null. */
  avgProgress: number | null;
  progressAvailable: boolean;
  /** Số task hợp lệ (= mẫu số). */
  taskCount: number;
  coverage: { validTasks: number; excludedTasks: number };
};

/** KPI gộp cross-project cho trang Portfolio — cùng phạm vi/filter với listProjects,
 *  tổng hợp trong 1 câu SQL (không lặp theo số dự án). */
export async function portfolioKpi(
  user: ProjectActor,
  orgId?: number | null,
): Promise<PortfolioKpi> {
  const visible = await phamViDuAn(user, orgId);
  const rong: PortfolioKpi = {
    totalProjects: 0,
    activeCount: 0,
    handoverCount: 0,
    closedCount: 0,
    totalDelayed: 0,
    avgProgress: null,
    progressAvailable: false,
    taskCount: 0,
    coverage: { validTasks: 0, excludedTasks: 0 },
  };
  if (!visible) return rong;
  const placeholders = visible.map(() => "?").join(",");
  const row = await queryOne<{
    totalProjects: number;
    activeCount: number;
    handoverCount: number;
    closedCount: number;
    totalDelayed: number;
    avgProgress: number | null;
    validTasks: number;
    excludedTasks: number;
  }>(
    `SELECT COUNT(DISTINCT p.id) AS "totalProjects",
            COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'active') AS "activeCount",
            COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'handover') AS "handoverCount",
            COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'closed') AS "closedCount",
            COUNT(DISTINCT t.id) FILTER (WHERE ${TASK_TRE}) AS "totalDelayed",
            SUM(t.progress_percent) FILTER (WHERE ${TASK_HOP_LE})
              / NULLIF(COUNT(DISTINCT t.id) FILTER (WHERE ${TASK_HOP_LE}), 0) AS "avgProgress",
            COUNT(DISTINCT t.id) FILTER (WHERE ${TASK_HOP_LE}) AS "validTasks",
            COUNT(DISTINCT t.id) FILTER (WHERE t.id IS NOT NULL AND NOT (${TASK_HOP_LE})) AS "excludedTasks"
       ${NGUON_DU_AN_TASK}
      WHERE p.id IN (${placeholders}) AND p.org_id = ?`,
    todayISO(),
    ...visible,
    user.orgId,
  );
  if (!row) return rong;
  const validTasks = Number(row.validTasks);
  return {
    totalProjects: Number(row.totalProjects),
    activeCount: Number(row.activeCount),
    handoverCount: Number(row.handoverCount),
    closedCount: Number(row.closedCount),
    totalDelayed: Number(row.totalDelayed),
    avgProgress: validTasks > 0 && row.avgProgress != null ? Number(row.avgProgress) : null,
    progressAvailable: validTasks > 0,
    taskCount: validTasks,
    coverage: { validTasks, excludedTasks: Number(row.excludedTasks) },
  };
}

/**
 * Chốt `project_id` cho một thao tác GHI khi route có nhận `projectId` từ body.
 *
 * Quy ước ở đầu file này là "route KHÔNG tin project_id client gửi". Thực tế vẫn có route cần cho
 * phép chỉ định dự án (vd lưu bản vẽ vào dự án khác dự án đang chọn), nên thay vì tin hoặc cấm
 * hẳn, hàm này đối chiếu với `visibleProjectIds` — đúng danh sách user được thấy.
 *
 * Lỗi thật đã gặp hai lần: `/api/payment-certs` quên scope hoàn toàn, và
 * `/api/engineering/cad/save-drawing` viết `inputProjectId || getCurrentProjectId(user)` nên chỉ
 * cần sửa một con số trong request là ghi được vào dự án mình không thuộc (audit 2026-08-24).
 *
 * `projectHienTai` truyền vào qua tham số chứ không gọi `getCurrentProjectId()` bên trong: hàm đó
 * đọc `cookies()` của Next nên chỉ chạy được trong phạm vi một request, khiến phần QUYẾT ĐỊNH
 * phân quyền — thứ đáng test nhất ở đây — không viết test được.
 */
export async function chotProjectIdChoGhi(
  user: ProjectActor,
  inputProjectId: unknown,
  projectHienTai: number | null,
): Promise<{ ok: true; projectId: number } | { ok: false }> {
  // Không gửi dự án = dùng dự án đang chọn; không có dự án đang chọn thì từ chối (không còn
  // fallback dự án 1 — dự án 1 có thể thuộc tổ chức khác).
  const khongGui = inputProjectId == null || inputProjectId === "";
  const muonDung = khongGui ? projectHienTai : parseProjectId(inputProjectId);
  if (muonDung == null) return { ok: false };
  const duocPhep = await visibleProjectIds(user);
  return duocPhep.includes(muonDung) ? { ok: true, projectId: muonDung } : { ok: false };
}

export type ChotDocKetQua =
  | { ok: true; projectId: number }
  | { ok: false; lyDo: "khong-thay"; duAn?: undefined }
  | { ok: false; lyDo: "phai-chon"; duAn: { id: number; name: string }[] };

/**
 * Chốt `project_id` cho một thao tác ĐỌC khi client gửi `?project=` (M101 PR4).
 *
 * Khác `chotProjectIdChoGhi` ở hai điểm, đều vì đường vào khác nhau:
 *   1. KHÔNG có "dự án đang chọn" để rơi về — plugin AutoCAD gọi bằng Bearer token thiết bị,
 *      không mang cookie `xboss_project`. Không truyền `project` mà user chỉ thấy đúng 1 dự án
 *      thì suy ra dự án đó; thấy nhiều dự án thì TRẢ VỀ DANH SÁCH để người dùng chọn, chứ không
 *      tự đoán một cái (đoán = đưa nhầm khối lượng BOQ của dự án khác cho QS).
 *   2. Có kiểm ORG ở truy vấn cuối để giữ phạm vi khi org dự án đổi sau lúc lấy danh sách
 *      `visibleProjectIds`. Bảng đối chiếu BOQ là dữ liệu thương mại — không nới quy tắc này.
 *
 * Không đọc `cookies()` nên gọi được cả ngoài phạm vi request (test gọi thẳng route handler).
 */
export async function chotProjectIdChoDoc(
  user: { id: number; role: Role; orgId: number },
  inputProjectId: unknown,
): Promise<ChotDocKetQua> {
  const visible = await visibleProjectIds(user);
  if (visible.length === 0) return { ok: false, lyDo: "khong-thay" };

  const placeholders = visible.map(() => "?").join(",");
  const duAn = await query<{ id: number; name: string }>(
    `SELECT id, name FROM projects WHERE id IN (${placeholders}) AND org_id = ? ORDER BY id`,
    ...visible,
    user.orgId,
  );
  if (duAn.length === 0) return { ok: false, lyDo: "khong-thay" };

  if (inputProjectId == null || inputProjectId === "") {
    return duAn.length === 1
      ? { ok: true, projectId: duAn[0].id }
      : { ok: false, lyDo: "phai-chon", duAn };
  }

  const muonDung = parseProjectId(inputProjectId);
  if (muonDung == null) return { ok: false, lyDo: "khong-thay" };
  return duAn.some((d) => d.id === muonDung)
    ? { ok: true, projectId: muonDung }
    : { ok: false, lyDo: "khong-thay" };
}
