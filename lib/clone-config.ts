// Template dự án (M51 PR3) — sao chép phần CẤU HÌNH của một dự án nguồn sang dự án mới,
// KHÔNG sao chép dữ liệu giao dịch (tasks/contracts/work_packages/transactions...). Toàn bộ
// chạy trong 1 withTransaction; map id cũ→mới giữ trong biến JS cục bộ (không bảng mapping).
// Xem docs/nang-cap/M51-da-du-an-rls.md mục "PR3 — Template dự án".
import { query, queryOne, run, insertId, withTransaction } from "@/lib/db";
import { toSlug, SLUG_RE } from "@/lib/sheets";

export type NewProjectInput = {
  name: string;
  code?: string | null;
  investor?: string | null;
  contractor?: string | null;
  color?: string | null;
};

// Số bản ghi đã sao chép mỗi nhóm cấu hình — dùng cho phản hồi API + kiểm thử.
export type CloneResult = {
  projectId: number;
  towers: number;
  sheetTypes: number;
  navSettings: number;
  approvalFlows: number;
  approvalSteps: number;
  alertRules: number;
};

// Nhóm cấu hình được sao chép (chỉ bảng THỰC SỰ tồn tại — kiểm migrations/):
//   - towers (project_id trực tiếp)
//   - sheet_types (theo tower nguồn, giữ system_id/hệ, code, name, responsible)
//   - nav_settings (project_id trực tiếp)
//   - approval_flows + approval_steps (M46, chỉ flow gắn dự án nguồn — flow project_id NULL
//     là toàn cục, đã áp mọi dự án nên KHÔNG nhân bản)
//   - alert_rules (M47, tương tự: chỉ rule gắn dự án nguồn)
// KHÔNG sao chép: role_permissions (toàn cục, M50) + mọi dữ liệu giao dịch. "Cost codes/
// norms mẫu" trong đặc tả không có bảng tương ứng: `boq_norms` gắn với `boq_items`
// (dữ liệu BOQ theo dự án — giao dịch, cấm sao chép) nên bỏ qua nhóm này.
//
// Không nhóm nào ở trên tham gia registry BOQCODE toàn hệ (boq_codes chỉ bám tasks/
// work_packages/materials/boq_items — migrations/0029). sheet_types.code chỉ unique theo
// tower (UNIQUE(tower_id, code)) nên tower mới → không đụng mã; clone-config không thể gây
// trùng BOQCODE toàn hệ.
// Sinh slug UNIQUE toàn hệ cho 1 sheet clone. Base ưu tiên slug nguồn (đã hợp lệ), rồi
// toSlug(code)/toSlug(name); trùng (trong DB hoặc trong lượt clone này) thì thêm suffix
// "-N". Cắt còn ≤50 ký tự chừa chỗ suffix để luôn khớp SLUG_RE.
async function pickUniqueSlug(
  sourceSlug: string | null,
  code: string,
  name: string,
  used: Set<string>,
): Promise<string> {
  const raw = sourceSlug && SLUG_RE.test(sourceSlug) ? sourceSlug : toSlug(code) || toSlug(name);
  const base = SLUG_RE.test(raw) ? raw : "sheet";
  let candidate = base;
  let n = 1;
  while (
    used.has(candidate) ||
    (await queryOne(`SELECT id FROM sheet_types WHERE slug = ?`, candidate))
  ) {
    n++;
    const suffix = `-${n}`;
    candidate = base.slice(0, 50 - suffix.length) + suffix;
  }
  used.add(candidate);
  return candidate;
}

export async function cloneProjectConfig(
  sourceProjectId: number,
  input: NewProjectInput,
  actorId: number,
): Promise<CloneResult> {
  return withTransaction(async () => {
    // 1) Tạo dự án mới.
    const projectId = await insertId(
      `INSERT INTO projects (name, code, investor, contractor, color) VALUES (?, ?, ?, ?, ?) RETURNING id`,
      input.name,
      input.code ?? null,
      input.investor ?? null,
      input.contractor ?? null,
      input.color ?? null,
    );

    // 2) towers — map id cũ→mới.
    const towers = await query<{ id: number; name: string; description: string | null }>(
      `SELECT id, name, description FROM towers WHERE project_id = ? ORDER BY id`,
      sourceProjectId,
    );
    const towerMap = new Map<number, number>();
    for (const t of towers) {
      const newTowerId = await insertId(
        `INSERT INTO towers (project_id, name, description) VALUES (?, ?, ?) RETURNING id`,
        projectId,
        t.name,
        t.description,
      );
      towerMap.set(t.id, newTowerId);
    }

    // 3) sheet_types của các tower nguồn — giữ hệ (system_id), code, name, responsible.
    //    slug là khoá routing UNIQUE toàn hệ (uniq_sheet_slug), KHÔNG chép nguyên: sinh
    //    slug MỚI cho từng sheet clone (base = slug nguồn / toSlug(name)), thêm suffix -N
    //    khi trùng — cùng cơ chế đảm bảo unique như POST /api/sheets, nhưng không 409 mà
    //    tự đổi để clone luôn ra dự án dùng được. Set cục bộ chặn trùng giữa các sheet
    //    trong chính lượt clone này (song song với check DB, phòng read-your-writes lỡ sót).
    let sheetTypes = 0;
    if (towerMap.size > 0) {
      const oldTowerIds = [...towerMap.keys()];
      const placeholders = oldTowerIds.map(() => "?").join(",");
      const sheets = await query<{
        tower_id: number;
        code: string;
        name: string;
        responsible: string | null;
        system_id: number | null;
        slug: string | null;
      }>(
        `SELECT tower_id, code, name, responsible, system_id, slug
           FROM sheet_types WHERE tower_id IN (${placeholders}) ORDER BY id`,
        ...oldTowerIds,
      );
      const usedSlugs = new Set<string>();
      for (const s of sheets) {
        const slug = await pickUniqueSlug(s.slug, s.code, s.name, usedSlugs);
        await run(
          `INSERT INTO sheet_types (tower_id, code, name, responsible, system_id, slug) VALUES (?, ?, ?, ?, ?, ?)`,
          towerMap.get(s.tower_id),
          s.code,
          s.name,
          s.responsible,
          s.system_id,
          slug,
        );
        sheetTypes++;
      }
    }

    // 4) nav_settings gắn dự án nguồn → gắn dự án mới (updated_by = người sao chép).
    const nav = await run(
      `INSERT INTO nav_settings (node_key, project_id, enabled, updated_by)
       SELECT node_key, ?, enabled, ? FROM nav_settings WHERE project_id = ?`,
      projectId,
      actorId,
      sourceProjectId,
    );

    // 5) approval_flows (chỉ flow gắn dự án nguồn) + approval_steps con — map flow id.
    const flows = await query<{
      id: number;
      entity_type: string;
      name: string;
      active: boolean;
    }>(
      `SELECT id, entity_type, name, active FROM approval_flows WHERE project_id = ? ORDER BY id`,
      sourceProjectId,
    );
    let approvalSteps = 0;
    for (const f of flows) {
      const newFlowId = await insertId(
        `INSERT INTO approval_flows (project_id, entity_type, name, active) VALUES (?, ?, ?, ?) RETURNING id`,
        projectId,
        f.entity_type,
        f.name,
        f.active,
      );
      // Chép step bằng INSERT...SELECT — min_amount (tiền, NUMERIC) giữ nguyên trong SQL,
      // KHÔNG roundtrip qua float JS (quy ước tiền M45).
      const steps = await run(
        `INSERT INTO approval_steps (flow_id, seq, role, min_amount, sla_days)
         SELECT ?, seq, role, min_amount, sla_days FROM approval_steps WHERE flow_id = ?`,
        newFlowId,
        f.id,
      );
      approvalSteps += steps.changes;
    }

    // 6) alert_rules gắn dự án nguồn → gắn dự án mới (created_by = người sao chép).
    const alerts = await run(
      `INSERT INTO alert_rules (project_id, metric, operator, threshold, channel, active, created_by)
       SELECT ?, metric, operator, threshold, channel, active, ? FROM alert_rules WHERE project_id = ?`,
      projectId,
      actorId,
      sourceProjectId,
    );

    return {
      projectId,
      towers: towers.length,
      sheetTypes,
      navSettings: nav.changes,
      approvalFlows: flows.length,
      approvalSteps,
      alertRules: alerts.changes,
    };
  });
}
