// Thu thập "sự thật" của một snapshot DB cho recovery manifest (A6-FR01/FR07) — DÙNG CHUNG
// giữa bộ sinh manifest (nguồn) và verifier (đích khôi phục) để hai phía tính bằng CÙNG
// thuật toán, CÙNG danh sách bảng. Chỉ SELECT/SET LOCAL; mọi hàm chạy trong transaction chỉ-đọc
// do caller mở (REPEATABLE READ READ ONLY, `row_security = off`).
//
// Tên bảng/cột dưới đây là allowlist TĨNH trong code — không bao giờ nhận từ request/env/
// manifest, nên nội suy vào SQL là an toàn (giá trị luôn đi qua placeholder `$n`).
import type {
  AuditWatermark,
  FinanceTotal,
  SchemaObjectsFact,
  TableFact,
} from "./recovery-manifest";

export type DrClient = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

// Bảng trọng yếu được đếm + băm digest. Căn cứ (docs/nang-cap/AUDIT-2026-09-25/SOURCE-MAP.md):
// - §2 chuỗi phạm vi: organizations → users/projects/user_projects/role_permissions →
//   towers → sheet_types → work_packages → tasks → progress_dimensions;
// - §2–§3 chuỗi tiền BOQ → hợp đồng → IPC → thanh toán + các bảng tiền numeric(15,2);
// - A6-FR03/FR07: tài liệu pháp lý có sha256 (migration 0050) + audit_log;
// - giữ lại các bảng verifier cũ đã đếm (materials, engineering core, import_batches).
export const DIGEST_TABLES = [
  "organizations",
  "users",
  "projects",
  "user_projects",
  "role_permissions",
  "towers",
  "sheet_types",
  "work_packages",
  "tasks",
  "progress_dimensions",
  "boq_items",
  "contracts",
  "contract_addenda",
  "variation_orders",
  "payment_certs",
  "payment_cert_items",
  "payment_bills",
  "invoices",
  "advances",
  "claims",
  "cash_transactions",
  "task_documents",
  "contract_documents",
  "vo_documents",
  "claim_documents",
  "materials",
  "engineering_objects",
  "engineering_object_relations",
  "engineering_workflows",
  "engineering_agent_sessions",
  "import_batches",
  "audit_log",
] as const;

// Tổng tiền exact (SOURCE-MAP §3): SUM trong SQL, ép ::text, so CHUỖI — không float JS (M45).
export const FINANCE_TOTALS = [
  { key: "contracts.value", table: "contracts", expr: "value" },
  { key: "contract_addenda.value_delta", table: "contract_addenda", expr: "value_delta" },
  { key: "boq_items.contract_amount", table: "boq_items", expr: "qty_contract * unit_price" },
  {
    key: "payment_cert_items.period_amount",
    table: "payment_cert_items",
    expr: "qty_period * unit_price",
  },
  { key: "payment_bills.amount", table: "payment_bills", expr: "amount" },
  { key: "invoices.net_amount", table: "invoices", expr: "net_amount" },
  { key: "invoices.vat_amount", table: "invoices", expr: "vat_amount" },
  { key: "advances.amount", table: "advances", expr: "amount" },
  { key: "advances.settled_amount", table: "advances", expr: "settled_amount" },
  { key: "claims.amount_requested", table: "claims", expr: "amount_requested" },
  { key: "claims.amount_settled", table: "claims", expr: "amount_settled" },
  { key: "cash_transactions.amount", table: "cash_transactions", expr: "amount" },
] as const;

// Tệp đính kèm CRITICAL = 4 bảng tài liệu pháp lý đã có cột sha256 từ migration 0050
// (biên bản nghiệm thu, hồ sơ hợp đồng, VO, claim). Ảnh hiện trường không thuộc nhóm này.
export const CRITICAL_ATTACHMENT_TABLES = [
  "task_documents",
  "contract_documents",
  "vo_documents",
  "claim_documents",
] as const;

export type IntegrityRule = { name: string; tables: readonly string[]; sql: string };

// FK/mồ côi + lệch org/project trên bảng trọng yếu (SOURCE-MAP §2). Mỗi câu trả về số vi
// phạm ở cột `violations`. FK ràng buộc trong schema KHÔNG thay được phép kiểm này: restore
// data-only/tắt trigger hoặc sửa tay vẫn có thể để lại dòng mồ côi.
export const INTEGRITY_RULES: readonly IntegrityRule[] = [
  orphan("tasks-package", "tasks", "package_id", "work_packages"),
  orphan("work_packages-sheet", "work_packages", "sheet_type_id", "sheet_types"),
  orphan("sheet_types-tower", "sheet_types", "tower_id", "towers"),
  orphan("towers-project", "towers", "project_id", "projects"),
  orphan("progress_dimensions-task", "progress_dimensions", "task_id", "tasks"),
  orphan("projects-org", "projects", "org_id", "organizations"),
  orphan("users-org", "users", "org_id", "organizations"),
  orphan("contracts-project", "contracts", "project_id", "projects"),
  orphan("payment_certs-contract", "payment_certs", "contract_id", "contracts"),
  orphan("task_documents-task", "task_documents", "task_id", "tasks"),
  orphan("contract_documents-contract", "contract_documents", "contract_id", "contracts"),
  orphan("vo_documents-vo", "vo_documents", "vo_id", "variation_orders"),
  orphan("claim_documents-claim", "claim_documents", "claim_id", "claims"),
  {
    name: "user_projects-cross-org",
    tables: ["user_projects", "users", "projects"],
    sql: `SELECT COUNT(*)::text AS violations FROM user_projects up
          LEFT JOIN users u ON u.id = up.user_id
          LEFT JOIN projects p ON p.id = up.project_id
          WHERE u.id IS NULL OR p.id IS NULL OR u.org_id IS DISTINCT FROM p.org_id`,
  },
  {
    name: "role_permissions-cross-org",
    tables: ["role_permissions", "organizations", "projects"],
    sql: `SELECT COUNT(*)::text AS violations FROM role_permissions rp
          LEFT JOIN organizations o ON o.id = rp.org_id
          LEFT JOIN projects p ON p.id = rp.project_id
          WHERE o.id IS NULL
             OR (rp.project_id IS NOT NULL AND (p.id IS NULL OR p.org_id <> rp.org_id))`,
  },
  {
    name: "boq_items-scope",
    tables: ["boq_items", "contracts", "projects"],
    sql: `SELECT COUNT(*)::text AS violations FROM boq_items b
          LEFT JOIN contracts c ON c.id = b.contract_id
          LEFT JOIN projects p ON p.id = b.project_id
          WHERE (b.contract_id IS NOT NULL AND c.id IS NULL)
             OR (b.project_id IS NOT NULL AND p.id IS NULL)
             OR (b.project_id IS NOT NULL AND c.project_id IS NOT NULL
                 AND b.project_id <> c.project_id)`,
  },
  {
    // Cùng bất biến checkCertLinesBelongToContract: dòng BOQ phải thuộc đúng hợp đồng của IPC.
    name: "payment_cert_items-scope",
    tables: ["payment_cert_items", "payment_certs", "boq_items"],
    sql: `SELECT COUNT(*)::text AS violations FROM payment_cert_items i
          LEFT JOIN payment_certs pc ON pc.id = i.cert_id
          LEFT JOIN boq_items b ON b.id = i.boq_item_id
          WHERE pc.id IS NULL OR b.id IS NULL OR b.contract_id IS DISTINCT FROM pc.contract_id`,
  },
  {
    // Q-AC05: project trực tiếp của payment_bills phải khớp mọi cha có giá trị.
    name: "payment_bills-scope",
    tables: ["payment_bills", "contracts", "payment_certs", "sheet_types", "towers"],
    sql: `SELECT COUNT(*)::text AS violations FROM payment_bills pb
          LEFT JOIN contracts c ON c.id = pb.contract_id
          LEFT JOIN payment_certs pc ON pc.id = pb.payment_cert_id
          LEFT JOIN contracts cc ON cc.id = pc.contract_id
          LEFT JOIN sheet_types s ON s.id = pb.sheet_type_id
          LEFT JOIN towers tw ON tw.id = s.tower_id
          WHERE (pb.contract_id IS NOT NULL AND c.id IS NULL)
             OR (pb.payment_cert_id IS NOT NULL AND pc.id IS NULL)
             OR (pb.sheet_type_id IS NOT NULL AND s.id IS NULL)
             OR (pb.contract_id IS NOT NULL AND pc.contract_id IS NOT NULL
                 AND pb.contract_id <> pc.contract_id)
             OR (pb.project_id IS NOT NULL AND c.project_id IS NOT NULL
                 AND pb.project_id <> c.project_id)
             OR (pb.project_id IS NOT NULL AND cc.project_id IS NOT NULL
                 AND pb.project_id <> cc.project_id)
             OR (pb.project_id IS NOT NULL AND tw.project_id IS NOT NULL
                 AND pb.project_id <> tw.project_id)`,
  },
  {
    name: "invoices-scope",
    tables: ["invoices", "contracts", "payment_bills"],
    sql: `SELECT COUNT(*)::text AS violations FROM invoices iv
          LEFT JOIN contracts c ON c.id = iv.contract_id
          LEFT JOIN payment_bills pb ON pb.id = iv.payment_bill_id
          WHERE (iv.contract_id IS NOT NULL AND c.id IS NULL)
             OR (iv.payment_bill_id IS NOT NULL AND pb.id IS NULL)
             OR (iv.project_id IS NOT NULL AND c.project_id IS NOT NULL
                 AND iv.project_id <> c.project_id)
             OR (iv.project_id IS NOT NULL AND pb.project_id IS NOT NULL
                 AND iv.project_id <> pb.project_id)`,
  },
  contractScope("claims-scope", "claims"),
  contractScope("variation_orders-scope", "variation_orders"),
  contractScope("cash_transactions-scope", "cash_transactions"),
  orphan("advances-project", "advances", "project_id", "projects"),
  {
    // Giữ phép kiểm của verifier cũ (trước đây trỏ nhầm bảng không tồn tại
    // `engineering_relations`): quan hệ phải nối 2 object có thật, cùng project.
    name: "engineering_object_relations-scope",
    tables: ["engineering_object_relations", "engineering_objects"],
    sql: `SELECT COUNT(*)::text AS violations FROM engineering_object_relations r
          LEFT JOIN engineering_objects f ON f.id = r.from_object_id
          LEFT JOIN engineering_objects t ON t.id = r.to_object_id
          WHERE f.id IS NULL OR t.id IS NULL OR r.project_id IS NULL
             OR r.project_id IS DISTINCT FROM f.project_id
             OR r.project_id IS DISTINCT FROM t.project_id`,
  },
];

function orphan(name: string, child: string, column: string, parent: string): IntegrityRule {
  return {
    name,
    tables: [child, parent],
    sql: `SELECT COUNT(*)::text AS violations FROM ${child} ch
          LEFT JOIN ${parent} pa ON pa.id = ch.${column}
          WHERE ch.${column} IS NOT NULL AND pa.id IS NULL`,
  };
}

function contractScope(name: string, table: string): IntegrityRule {
  return {
    name,
    tables: [table, "contracts", "projects"],
    sql: `SELECT COUNT(*)::text AS violations FROM ${table} x
          LEFT JOIN contracts c ON c.id = x.contract_id
          LEFT JOIN projects p ON p.id = x.project_id
          WHERE (x.contract_id IS NOT NULL AND c.id IS NULL)
             OR (x.project_id IS NOT NULL AND p.id IS NULL)
             OR (x.project_id IS NOT NULL AND c.project_id IS NOT NULL
                 AND x.project_id <> c.project_id)`,
  };
}

/** Mọi bảng verifier/bộ sinh manifest sẽ đọc — dùng cho preflight quyền đọc/RLS. */
export const READ_TABLES: readonly string[] = [
  ...new Set<string>([
    "schema_migrations",
    ...DIGEST_TABLES,
    ...FINANCE_TOTALS.map((item) => item.table),
    ...CRITICAL_ATTACHMENT_TABLES,
    ...INTEGRITY_RULES.flatMap((rule) => rule.tables),
  ]),
].sort();

export function text(value: unknown, what: string): string {
  if (typeof value !== "string") throw new Error(`Kết quả ${what} không phải chuỗi.`);
  return value;
}

export function countValue(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("Kết quả COUNT không hợp lệ.");
  }
  return BigInt(value);
}

// Định dạng text của dòng phải ổn định giữa nguồn và đích để digest so được: cố định múi
// giờ, kiểu ngày, số chữ số float, bytea. Caller gọi trong savepoint/transaction của mình;
// SET LOCAL hết hiệu lực khi rollback savepoint/transaction (không ảnh hưởng check khác).
export async function applyStableTextFormat(client: DrClient): Promise<void> {
  await client.query("SET LOCAL TimeZone = 'UTC'");
  await client.query("SET LOCAL DateStyle = 'ISO, YMD'");
  await client.query("SET LOCAL IntervalStyle = 'postgres'");
  await client.query("SET LOCAL extra_float_digits = 1");
  await client.query("SET LOCAL bytea_output = 'hex'");
  await client.query("SET LOCAL search_path = public");
}

/** Số dòng + digest (DIGEST_ALGORITHM) của từng bảng trọng yếu. */
export async function collectTableFacts(client: DrClient): Promise<TableFact[]> {
  const facts: TableFact[] = [];
  for (const table of DIGEST_TABLES) {
    // Băm từng dòng rồi sắp xếp COLLATE "C" → không phụ thuộc thứ tự vật lý, collation hay
    // khoá chính; giới hạn: string_agg tối đa ~1GB (≈16 triệu dòng/bảng) — vượt thì query lỗi
    // và check FAIL đóng, không PASS giả.
    const { rows } = await client.query(
      `SELECT COUNT(*)::text AS cnt,
              encode(sha256(convert_to(COALESCE(string_agg(h, '' ORDER BY h COLLATE "C"), ''),
                                       'UTF8')), 'hex') AS digest
       FROM (SELECT encode(sha256(convert_to(t::text, 'UTF8')), 'hex') AS h
             FROM ${table} AS t) s`,
    );
    countValue(rows[0]?.cnt);
    facts.push({
      table,
      rowCount: text(rows[0]?.cnt, "COUNT"),
      digest: text(rows[0]?.digest, "digest"),
    });
  }
  return facts;
}

export async function collectFinanceTotals(client: DrClient): Promise<FinanceTotal[]> {
  const totals: FinanceTotal[] = [];
  for (const item of FINANCE_TOTALS) {
    const { rows } = await client.query(
      `SELECT COUNT(*)::text AS cnt, COALESCE(SUM(${item.expr}), 0)::text AS total
       FROM ${item.table}`,
    );
    totals.push({
      key: item.key,
      rowCount: text(rows[0]?.cnt, "COUNT"),
      sum: text(rows[0]?.total, "SUM"),
    });
  }
  return totals;
}

// Ràng buộc, policy RLS, cờ RLS, trigger, hàm và extension trong schema public — bắt bản
// khôi phục mất FK/policy, trigger audit bị tắt hoặc hàm audit bị thay. Ràng buộc được mô tả
// bằng loại/cột/bảng đích/hành động/validated thay vì pg_get_constraintdef: văn bản CHECK có
// ARRAY[...] bị PostgreSQL deparse khác đi sau một vòng dump/restore dù ngữ nghĩa y hệt.
export async function collectSchemaObjects(client: DrClient): Promise<SchemaObjectsFact> {
  const { rows } = await client.query(
    `SELECT COUNT(*)::text AS cnt,
            encode(sha256(convert_to(COALESCE(string_agg(line, E'\\n' ORDER BY line COLLATE "C"),
                                              ''), 'UTF8')), 'hex') AS digest
     FROM (
       SELECT 'c|' || conrelid::regclass::text || '|' || conname || '|' || contype::text || '|'
              || COALESCE(conkey::text, '') || '|' || COALESCE(confrelid::regclass::text, '')
              || '|' || COALESCE(confkey::text, '') || '|' || confupdtype::text
              || confdeltype::text || '|' || convalidated::text AS line
       FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conrelid <> 0
       UNION ALL
       SELECT 'p|' || tablename || '|' || policyname || '|' || permissive || '|' || cmd || '|'
              || array_to_string(roles, ',') || '|' || COALESCE(qual, '') || '|'
              || COALESCE(with_check, '')
       FROM pg_policies WHERE schemaname = 'public'
       UNION ALL
       SELECT 'r|' || relname || '|' || relrowsecurity::text || '|' || relforcerowsecurity::text
       FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')
       UNION ALL
       SELECT 't|' || tgrelid::regclass::text || '|' || tgname || '|' || tgenabled::text
       FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
       WHERE NOT tg.tgisinternal AND c.relnamespace = 'public'::regnamespace
       UNION ALL
       SELECT 'f|' || p.oid::regprocedure::text || '|' || encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex')
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
       UNION ALL
       SELECT 'e|' || extname || '|' || extversion FROM pg_extension
     ) s`,
  );
  return { count: text(rows[0]?.cnt, "COUNT"), digest: text(rows[0]?.digest, "digest") };
}

export async function collectAuditWatermark(client: DrClient): Promise<AuditWatermark> {
  const { rows } = await client.query(
    `SELECT COUNT(*)::text AS total, COUNT(row_hash)::text AS hashed, MAX(id)::text AS max_id,
            (SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1) AS last_hash
     FROM audit_log`,
  );
  const row = rows[0] ?? {};
  return {
    totalRows: text(row.total, "COUNT"),
    hashedRows: text(row.hashed, "COUNT"),
    maxId: row.max_id == null ? null : text(row.max_id, "MAX"),
    lastRowHash: row.last_hash == null ? null : text(row.last_hash, "row_hash"),
  };
}

export type AttachmentRef = {
  table: string;
  id: string;
  key: string;
  size: number | null;
  sha256: string | null;
};

/** Mọi tệp critical mà DB tham chiếu (bỏ dòng chỉ có link ngoài, file_name rỗng). */
export async function collectAttachmentRefs(client: DrClient): Promise<AttachmentRef[]> {
  const { rows } = await client.query(
    CRITICAL_ATTACHMENT_TABLES.map(
      (table) =>
        `SELECT '${table}' AS tbl, id::text AS id, file_name AS key,
                size_bytes::text AS size, sha256
         FROM ${table} WHERE COALESCE(file_name, '') <> ''`,
    ).join(" UNION ALL ") + " ORDER BY 1, 2",
  );
  return rows.map((row) => ({
    table: text(row.tbl, "bảng"),
    id: text(row.id, "id"),
    key: text(row.key, "file_name"),
    size: row.size == null ? null : Number(text(row.size, "size_bytes")),
    sha256: row.sha256 == null ? null : text(row.sha256, "sha256"),
  }));
}
