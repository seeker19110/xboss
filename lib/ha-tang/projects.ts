// Nền đa dự án (M22 PR1 — xem ADR-0004 + docs/nang-cap/M22-da-du-an.md). Dự án đang
// chọn = cookie `xboss_project`, đối chiếu quyền qua bảng `user_projects`. Route KHÔNG
// tin `project_id` client gửi qua body/query — luôn suy qua getCurrentProjectId(user).
import { cookies } from "next/headers";
import { query, queryOne, todayISO } from "@/lib/db";
import { patchRequestContext, getRequestContext } from "@/lib/nen/request-context";
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

/** Admin chỉ thấy dự án cùng tổ chức; vai trò khác luôn cần membership tường minh.
 *  Bảng user_projects rỗng không mở quyền. Actor thiếu org bị từ chối ngay. */
export async function visibleProjectIds(user: ProjectActor): Promise<number[]> {
  if (parseProjectId(user.orgId) == null) return [];
  if (user.role === "admin") {
    const rows = await query<{ id: number }>(
      `SELECT id FROM projects WHERE org_id = ? ORDER BY id`,
      user.orgId,
    );
    return rows.map((r) => r.id);
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

/** Cookie sai/ngoài quyền không được âm thầm đổi dự án. Thiếu cookie chỉ suy dự án
 *  khi duy nhất một dự án hợp lệ; nhiều dự án cần người dùng chọn rõ. */
export function resolveProjectId(
  visible: number[],
  rawCookieValue: string | undefined,
): number | null {
  if (rawCookieValue === undefined) return visible.length === 1 ? visible[0] : null;
  const requested = parseProjectId(rawCookieValue);
  return requested != null && visible.includes(requested) ? requested : null;
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

/** Danh sách dự án user thấy + % tiến độ (TB task qua tower) + số việc trễ — dùng chung
 *  cho project switcher lẫn trang Portfolio. `orgId` (M51 PR4): lọc theo tổ chức khi có
 *  giá trị; NULL/undefined = không lọc (mọi dự án user thấy). */
export async function listProjects(
  user: ProjectActor,
  orgId?: number | null,
): Promise<ProjectListItem[]> {
  if (orgId != null && orgId !== user.orgId) return [];
  const visible = await visibleProjectIds(user);
  if (visible.length === 0) return [];
  const placeholders = visible.map(() => "?").join(",");
  // COALESCE(t.end_date, wp.end_date): task.end_date NULL = kế thừa ngày KT nhóm (lib/recompute.ts).
  const rows = await query<ProjectListItem>(
    `SELECT p.id, p.name, p.code, p.status, p.color, p.org_id AS "orgId",
            COALESCE(AVG(t.progress_percent), 0) AS "progressPercent",
            COALESCE(SUM(CASE WHEN COALESCE(t.end_date, wp.end_date) IS NOT NULL AND COALESCE(t.end_date, wp.end_date) < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS "delayedCount"
       FROM projects p
       LEFT JOIN towers tw ON tw.project_id = p.id
       LEFT JOIN sheet_types st ON st.tower_id = tw.id
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      WHERE p.id IN (${placeholders}) AND p.org_id = ?
      GROUP BY p.id, p.name, p.code, p.status, p.color, p.org_id
      ORDER BY p.id`,
    todayISO(),
    ...visible,
    user.orgId,
  );
  return rows;
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
  avgProgress: number; // trung bình có trọng số theo số task mỗi dự án
};

/** KPI gộp cross-project cho trang Portfolio — không đụng cache dữ liệu 1 dự án. */
export async function portfolioKpi(user: ProjectActor): Promise<PortfolioKpi> {
  const projects = await listProjects(user);
  const totalDelayed = projects.reduce((s, p) => s + p.delayedCount, 0);
  const avgProgress =
    projects.length === 0
      ? 0
      : projects.reduce((s, p) => s + p.progressPercent, 0) / projects.length;
  return {
    totalProjects: projects.length,
    activeCount: projects.filter((p) => p.status === "active").length,
    handoverCount: projects.filter((p) => p.status === "handover").length,
    closedCount: projects.filter((p) => p.status === "closed").length,
    totalDelayed,
    avgProgress,
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
  const muonDung = parseProjectId(inputProjectId == null ? projectHienTai : inputProjectId);
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

  if (inputProjectId == null) {
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
