// lib/custom-fields.ts — M52 PR2: trường tuỳ biến (custom fields) cho 4 entity.
// Định nghĩa lưu bảng custom_field_defs; giá trị lưu cột JSONB `custom` trên từng
// entity, merge shallow khi PATCH. Đây là nơi tập trung logic validate giá trị theo
// định nghĩa (đúng type/options/required) để chặn rác lọt vào cột JSONB.
import { query } from "@/lib/db";

export const CUSTOM_ENTITY_TYPES = ["task", "contract", "material", "work_package"] as const;
export type CustomEntityType = (typeof CUSTOM_ENTITY_TYPES)[number];

export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "select", "checkbox"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export function isCustomEntityType(v: unknown): v is CustomEntityType {
  return typeof v === "string" && (CUSTOM_ENTITY_TYPES as readonly string[]).includes(v);
}

export function isCustomFieldType(v: unknown): v is CustomFieldType {
  return typeof v === "string" && (CUSTOM_FIELD_TYPES as readonly string[]).includes(v);
}

// Bảng lưu cột `custom` của từng entity. Khoá whitelist (không phải input) nên an toàn nội suy.
const ENTITY_TABLE: Record<CustomEntityType, string> = {
  task: "tasks",
  contract: "contracts",
  material: "materials",
  work_package: "work_packages",
};

// Có ít nhất 1 entity đang lưu giá trị cho `key` chưa? Dùng jsonb_exists thay toán tử
// `?` vì helper lib/db thay mọi '?' thành placeholder $n (không dùng được toán tử jsonb ?).
export async function keyInUse(entityType: CustomEntityType, key: string): Promise<boolean> {
  const row = await query<{ used: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM ${ENTITY_TABLE[entityType]} WHERE jsonb_exists(custom, ?)) AS used`,
    key,
  );
  return !!row[0]?.used;
}

export type CustomFieldDef = {
  id: number;
  projectId: number | null;
  entityType: CustomEntityType;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
  required: boolean;
  sort: number;
  active: boolean;
};

// key snake_case: chữ thường/số/gạch dưới, bắt đầu bằng chữ cái. Bất biến sau khi tạo.
export const CUSTOM_KEY_RE = /^[a-z][a-z0-9_]*$/;

// Đọc các định nghĩa đang bật cho 1 (entityType, dự án): gồm def áp mọi dự án
// (project_id IS NULL) và def riêng dự án; def riêng ghi đè theo key nếu trùng.
export async function getDefs(
  entityType: CustomEntityType,
  projectId: number | null,
  opts: { includeInactive?: boolean } = {},
): Promise<CustomFieldDef[]> {
  const rows = await query<{
    id: number;
    project_id: number | null;
    entity_type: CustomEntityType;
    key: string;
    label: string;
    type: CustomFieldType;
    options: string[] | null;
    required: boolean;
    sort: number;
    active: boolean;
  }>(
    `SELECT id, project_id, entity_type, key, label, type, options, required, sort, active
       FROM custom_field_defs
      WHERE entity_type = ?
        AND (project_id IS NULL OR project_id = ?)
        ${opts.includeInactive ? "" : "AND active = TRUE"}
      ORDER BY sort, id`,
    entityType,
    projectId,
  );
  // Def riêng dự án ưu tiên hơn def chung khi trùng key (project-scoped override).
  const byKey = new Map<string, CustomFieldDef>();
  for (const r of rows) {
    const def: CustomFieldDef = {
      id: r.id,
      projectId: r.project_id,
      entityType: r.entity_type,
      key: r.key,
      label: r.label,
      type: r.type,
      options: r.options,
      required: r.required,
      sort: r.sort,
      active: r.active,
    };
    const prev = byKey.get(r.key);
    if (!prev || (prev.projectId === null && def.projectId !== null)) byKey.set(r.key, def);
  }
  return [...byKey.values()].sort((a, b) => a.sort - b.sort || a.id - b.id);
}

// Ép 1 giá trị về đúng type của def; trả { ok, value } hoặc { ok:false, error }.
function coerceValue(
  def: CustomFieldDef,
  raw: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  // null/"" = xoá giá trị field (được phép trừ khi required — kiểm ở validateCustom).
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };

  switch (def.type) {
    case "text": {
      if (typeof raw !== "string") return { ok: false, error: `"${def.label}" phải là chuỗi` };
      return { ok: true, value: raw };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (typeof raw !== "number" && typeof raw !== "string")
        return { ok: false, error: `"${def.label}" phải là số` };
      if (!Number.isFinite(n)) return { ok: false, error: `"${def.label}" phải là số hợp lệ` };
      return { ok: true, value: n };
    }
    case "date": {
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw))
        return { ok: false, error: `"${def.label}" phải có dạng YYYY-MM-DD` };
      return { ok: true, value: raw };
    }
    case "select": {
      if (typeof raw !== "string")
        return { ok: false, error: `"${def.label}" phải là một lựa chọn` };
      if (!def.options || !def.options.includes(raw))
        return { ok: false, error: `"${def.label}" không nằm trong danh sách lựa chọn` };
      return { ok: true, value: raw };
    }
    case "checkbox": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true") return { ok: true, value: true };
      if (raw === "false") return { ok: true, value: false };
      return { ok: false, error: `"${def.label}" phải là true/false` };
    }
  }
}

export type ValidateResult =
  { ok: true; value: Record<string, unknown> } | { ok: false; error: string; status: 422 };

// Kiểm 1 patch `custom` (chỉ các key có trong patch) theo defs của (entityType, dự án).
// - Key không có def đang bật → 422 (chặn rác).
// - Sai type/options → 422.
// - required + đang set về null/"" → 422 (không cho xoá trường bắt buộc).
// Trả object đã ép kiểu để merge shallow vào cột `custom`.
export async function validateCustom(
  entityType: CustomEntityType,
  projectId: number | null,
  patch: unknown,
): Promise<ValidateResult> {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch))
    return { ok: false, error: "custom phải là object", status: 422 };

  const defs = await getDefs(entityType, projectId);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(patch as Record<string, unknown>)) {
    const def = byKey.get(key);
    if (!def)
      return {
        ok: false,
        error: `Trường tuỳ biến "${key}" chưa được định nghĩa`,
        status: 422,
      };
    const coerced = coerceValue(def, raw);
    if (!coerced.ok) return { ok: false, error: coerced.error, status: 422 };
    if (def.required && coerced.value === null)
      return { ok: false, error: `"${def.label}" là trường bắt buộc`, status: 422 };
    out[key] = coerced.value;
  }

  return { ok: true, value: out };
}
