// Kiểm kê qua client riêng: không import ứng dụng, không migrate hay tự sửa dữ liệu.
export type InventoryScope = { org: string; project: string };
export type InventoryClient = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};
export type InventoryRow = {
  table: string;
  state: "known" | "missing" | "unknown";
  count: string | null;
  reason: string;
};
export type InventoryReport = {
  scope: InventoryScope;
  scopeVerified: boolean;
  complete: boolean;
  reason: string;
  rows: InventoryRow[];
};

export const ENGINEERING_GROUPS = [
  {
    name: "Đấu thầu",
    base: ["tender_packages", "tender_bids"],
    engineering: ["engineering_bidding_packages", "engineering_bidding_vendor_quotes"],
  },
  {
    name: "Dòng tiền",
    base: ["invoices"],
    engineering: ["engineering_cashflow_forecast_runs", "engineering_cashflow_period_projections"],
  },
  {
    name: "Thầu phụ (đã nối 0137)",
    base: ["subcontractor_profiles"],
    engineering: ["engineering_subcon_profiles"],
  },
] as const;

const DEFAULT_TABLES = ENGINEERING_GROUPS.flatMap((group) => [...group.base, ...group.engineering]);
const ID = /^[1-9]\d*$/;
class InventoryInputError extends Error {}

export function readInventoryInput(args: string[], env: Record<string, string | undefined>) {
  const scope = { org: "", project: "" };
  let all = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--tat-ca" && !all) all = true;
    else if (
      (arg === "--org" || arg === "--project") &&
      !scope[arg.slice(2) as keyof typeof scope]
    ) {
      scope[arg.slice(2) as keyof typeof scope] = args[++i] ?? "";
    } else
      throw new InventoryInputError(
        "Tham số không hợp lệ; dùng --org <id> --project <id> [--tat-ca].",
      );
  }
  if (!validId(scope.org) || !validId(scope.project)) {
    throw new InventoryInputError(
      "Cần --org và --project là ID nguyên dương; không dùng phạm vi '*'.",
    );
  }
  const connectionString = env.INVENTORY_DATABASE_URL;
  if (!connectionString) {
    throw new InventoryInputError(
      "Cần INVENTORY_DATABASE_URL riêng cho kiểm kê; không tự dùng DATABASE_URL.",
    );
  }
  try {
    const url = new URL(connectionString);
    if (!/^postgres(ql)?:$/.test(url.protocol) || !url.hostname || url.pathname.length < 2) {
      throw new Error();
    }
  } catch {
    throw new InventoryInputError("INVENTORY_DATABASE_URL phải là PostgreSQL URL hợp lệ.");
  }
  return { scope, all, connectionString };
}

function validId(value: string) {
  return ID.test(value) && BigInt(value) <= 2_147_483_647n;
}

/** Chỉ identifier đơn; schema cố định public, không nhận SQL/đường dẫn từ CLI. */
export function quoteInventoryIdentifier(name: string) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name))
    throw new InventoryInputError("Identifier bảng không hợp lệ.");
  return `"${name}"`;
}

export function inventoryErrorReason(error: unknown): string {
  if (error instanceof InventoryInputError) return error.message;
  const code = (error as { code?: string } | null)?.code;
  if (code === "42501") return "Không kiểm chứng được toàn bộ dữ liệu: quyền SELECT hoặc RLS.";
  if (code === "42P01") return "Bảng không tồn tại trong snapshot này.";
  if (code === "57014") return "Truy vấn hết thời gian; chưa xác định được số dòng.";
  return "Không kiểm kê được; kiểm tra kết nối, schema và quyền của role kiểm kê.";
}

/** RLS off không bypass policy: PostgreSQL báo lỗi nếu role sẽ bị lọc, thay vì trả 0 giả. */
export async function collectEngineeringInventory(
  client: InventoryClient,
  scope: InventoryScope,
  all = false,
): Promise<InventoryReport> {
  if (!validId(scope.org) || !validId(scope.project))
    throw new InventoryInputError("Thiếu scope org/project hợp lệ.");
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query(
      "SELECT set_config('app.org_id', $1, true), set_config('app.project_id', $2, true)",
      [scope.org, scope.project],
    );
    await client.query("SET LOCAL row_security = off");
    const mode = await client.query("SELECT current_setting('transaction_read_only') AS readonly");
    if (mode.rows[0]?.readonly !== "on") throw new Error("readonly");
    const project = await client.query(
      'SELECT id FROM "public"."projects" WHERE id = $1 AND org_id = $2',
      [scope.project, scope.org],
    );
    if (project.rows.length !== 1) {
      throw new InventoryInputError(
        "Chưa xác nhận được dự án thuộc tổ chức đã chọn; không đếm dữ liệu.",
      );
    }
    // Catalog không giấu bảng thiếu SELECT như information_schema.tables.
    const catalog = await client.query(
      `SELECT c.relname AS name, c.relkind AS kind,
              ARRAY(SELECT a.attname::text FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND (c.relname = ANY($1::text[]) OR ($2 AND c.relname LIKE 'engineering!_%' ESCAPE '!'))
        ORDER BY c.relname`,
      [DEFAULT_TABLES, all],
    );
    const metadata = new Map(catalog.rows.map((row) => [String(row.name), row]));
    const names = [...new Set([...DEFAULT_TABLES, ...(all ? metadata.keys() : [])])];
    const rows: InventoryRow[] = [];
    for (const table of names) {
      const meta = metadata.get(table);
      if (!meta) {
        rows.push({
          table,
          state: "missing",
          count: null,
          reason: "Không có bảng trong snapshot này.",
        });
        continue;
      }
      // View/foreign table có thể chạy hàm hoặc nguồn ngoài; không dùng làm bằng chứng đếm.
      if (meta.kind !== "r" && meta.kind !== "p") {
        rows.push({
          table,
          state: "unknown",
          count: null,
          reason: "Không phải bảng nội bộ; chưa kiểm chứng được nguồn đọc.",
        });
        continue;
      }
      await client.query("SAVEPOINT inventory_table");
      try {
        const quoted = quoteInventoryIdentifier(table);
        const columns = Array.isArray(meta.columns) ? meta.columns : [];
        let sql: string;
        if (columns.includes("project_id")) {
          sql = `SELECT COUNT(*)::text AS n FROM "public".${quoted} t
                   JOIN "public"."projects" p ON p.id = t.project_id
                  WHERE t.project_id = $1 AND p.org_id = $2${columns.includes("org_id") ? " AND t.org_id = $2" : ""}`;
        } else if (table === "tender_bids" && columns.includes("tender_id")) {
          sql = `SELECT COUNT(*)::text AS n FROM "public".${quoted} t
                   JOIN "public"."tender_packages" tp ON tp.id = t.tender_id
                   JOIN "public"."projects" p ON p.id = tp.project_id
                  WHERE tp.project_id = $1 AND p.org_id = $2`;
        } else {
          rows.push({
            table,
            state: "unknown",
            count: null,
            reason: "Chưa có đường lọc dự án/tổ chức được kiểm chứng.",
          });
          continue;
        }
        const counted = await client.query(sql, [scope.project, scope.org]);
        const count = counted.rows[0]?.n;
        if (typeof count !== "string" || !/^\d+$/.test(count)) throw new Error("count");
        rows.push({
          table,
          state: "known",
          count,
          reason: "Số dòng trong scope đã chọn, không phải số người dùng/traffic.",
        });
      } catch (error) {
        rows.push({ table, state: "unknown", count: null, reason: inventoryErrorReason(error) });
      } finally {
        // Lỗi một bảng không làm những bảng sau trả kết quả giả trong transaction đã hỏng.
        await client.query("ROLLBACK TO SAVEPOINT inventory_table");
        await client.query("RELEASE SAVEPOINT inventory_table");
      }
    }
    return {
      scope,
      scopeVerified: true,
      complete: rows.every((row) => row.state === "known"),
      reason: "Chỉ thống kê scope được chọn.",
      rows,
    };
  } catch (error) {
    const reason = inventoryErrorReason(error);
    return {
      scope,
      scopeVerified: false,
      complete: false,
      reason,
      rows: DEFAULT_TABLES.map((table) => ({ table, state: "unknown", count: null, reason })),
    };
  } finally {
    await client.query("ROLLBACK");
  }
}

export function inventoryTotal(rows: InventoryRow[], names: readonly string[]): string {
  let total = 0n;
  for (const name of names) {
    const row = rows.find((item) => item.table === name);
    if (row?.state !== "known" || row.count === null) return "unknown";
    total += BigInt(row.count);
  }
  return total.toString();
}
