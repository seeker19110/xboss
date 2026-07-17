// scripts/gen-erd.ts — Sinh docs/ERD.md TỰ ĐỘNG từ schema Postgres thật
// (information_schema + pg_indexes). Chạy: npm run gen:erd (cần DATABASE_URL).
//
// CI (.github/workflows/ci.yml) chạy script này sau bước test rồi
// `git diff --exit-code docs/ERD.md` → ERD lệch schema là CI đỏ. Không sửa tay.
import "./env";
import { query } from "../lib/db";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Nhóm bảng theo module (thứ tự hiển thị). Bảng không có trong map rơi vào "Khác".
const MODULES: { title: string; tables: string[] }[] = [
  {
    title: "WBS & tiến độ",
    tables: [
      "projects",
      "towers",
      "sheet_types",
      "work_packages",
      "tasks",
      "progress_dimensions",
      "task_history",
      "baselines",
      "baseline_tasks",
      "package_dependencies",
      "construction_stages",
    ],
  },
  {
    title: "Người dùng & phân quyền",
    tables: ["users", "user_projects", "login_rate_limits", "nav_settings", "role_permissions"],
  },
  {
    title: "Kèm task (ảnh/bình luận/tài liệu/nghiệm thu)",
    tables: [
      "task_photos",
      "task_comments",
      "task_documents",
      "progress_albums",
      "notifications",
      "notification_prefs",
      "push_subscriptions",
    ],
  },
  {
    title: "BOQ & khối lượng",
    tables: ["boq_items", "boq_norms", "boq_task_map", "boq_codes"],
  },
  {
    title: "Hợp đồng & tài chính",
    tables: [
      "contracts",
      "contract_addenda",
      "contract_documents",
      "variation_orders",
      "vo_documents",
      "payment_certs",
      "payment_cert_items",
      "payment_bills",
      "claims",
      "claim_documents",
      "invoices",
      "advances",
      "cash_transactions",
      "payroll",
      "attendance",
      "insurance_bonds",
    ],
  },
  {
    title: "Chi phí & mua sắm",
    tables: [
      "cost_settings",
      "purchase_requests",
      "purchase_orders",
      "po_items",
      "po_status_history",
      "warehouse_receipts",
      "receipt_items",
      "proposals",
      "proposal_documents",
    ],
  },
  {
    title: "Vật tư",
    tables: ["materials", "material_transactions", "material_sync", "sync_locks"],
  },
  {
    title: "Nhà thầu phụ & nhân sự",
    tables: [
      "suppliers",
      "supplier_ratings",
      "subcontractor_profiles",
      "subcon_documents",
      "subcon_evaluations",
      "system_contractors",
      "systems",
      "personnel",
      "crews",
      "crew_members",
      "certifications",
      "raci_matrix",
    ],
  },
  {
    title: "Chất lượng & an toàn",
    tables: [
      "qc_checklists",
      "qc_inspections",
      "inspection_requests",
      "inspection_request_tasks",
      "ncrs",
      "punch_list",
      "hse_records",
      "hse_photos",
      "risks",
      "env_monitoring",
      "env_permits",
      "monitoring_points",
      "monitoring_readings",
      "waste_logs",
    ],
  },
  {
    title: "Hiện trường & nhật ký",
    tables: [
      "site_diaries",
      "diary_manpower",
      "diary_photos",
      "diary_lock_history",
      "work_fronts",
      "work_front_history",
      "work_front_documents",
      "floor_stage_fronts",
      "floor_stage_front_documents",
      "floor_approvals",
      "floor_contracts",
      "equipment",
      "equipment_logs",
      "vehicle_logs",
      "warranty_items",
      "warranty_claims",
      "commissioning",
      "handover_items",
      "mobilization_items",
      "demob_items",
      "om_documents",
    ],
  },
  {
    title: "Bản vẽ & hồ sơ",
    tables: [
      "drawings",
      "drawing_revisions",
      "design_changes",
      "legal_documents",
      "project_documents",
      "correspondences",
      "correspondence_files",
      "meetings",
      "meeting_actions",
      "lessons_learned",
      "community_cases",
      "tech_links",
    ],
  },
  {
    title: "Đấu thầu",
    tables: ["tender_packages", "tender_items", "tender_bids", "tender_bid_prices"],
  },
  {
    title: "Phê duyệt (Approval Engine)",
    tables: ["approval_flows", "approval_steps", "approval_requests", "approval_actions"],
  },
  {
    title: "Tích hợp hệ ngoài (Integrations)",
    tables: ["integrations", "integration_runs", "sync_cursors", "remote_links"],
  },
  {
    title: "Hệ thống & audit",
    tables: ["audit_log", "assignment_log", "schema_migrations", "code_lists"],
  },
];

type Col = {
  table: string;
  column: string;
  dataType: string;
  charLen: number | null;
  numPrec: number | null;
  numScale: number | null;
  udt: string;
  nullable: string;
  def: string | null;
};

function formatType(c: Col): string {
  const t = c.dataType;
  if (t === "character varying") return c.charLen ? `varchar(${c.charLen})` : "varchar";
  if (t === "character") return c.charLen ? `char(${c.charLen})` : "char";
  if (t === "numeric")
    return c.numPrec != null ? `numeric(${c.numPrec},${c.numScale ?? 0})` : "numeric";
  if (t === "double precision") return "float8";
  if (t === "timestamp with time zone") return "timestamptz";
  if (t === "timestamp without time zone") return "timestamp";
  if (t === "ARRAY") return `${c.udt.replace(/^_/, "")}[]`;
  if (t === "USER-DEFINED") return c.udt;
  return t;
}

async function main() {
  const cols = await query<Col>(
    `SELECT table_name AS "table", column_name AS "column", data_type AS "dataType",
            character_maximum_length AS "charLen", numeric_precision AS "numPrec",
            numeric_scale AS "numScale", udt_name AS "udt", is_nullable AS "nullable",
            column_default AS "def"
       FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,
  );

  const fks = await query<{ table: string; column: string; refTable: string; refColumn: string }>(
    `SELECT tc.table_name AS "table", kcu.column_name AS "column",
            ccu.table_name AS "refTable", ccu.column_name AS "refColumn"
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name`,
  );

  const idx = await query<{ table: string; name: string; def: string }>(
    `SELECT tablename AS "table", indexname AS "name", indexdef AS "def"
       FROM pg_indexes WHERE schemaname = 'public'
      ORDER BY tablename, indexname`,
  );

  const colsByTable = new Map<string, Col[]>();
  for (const c of cols)
    (colsByTable.get(c.table) ?? colsByTable.set(c.table, []).get(c.table)!).push(c);
  const fkByTable = new Map<string, typeof fks>();
  for (const f of fks) (fkByTable.get(f.table) ?? fkByTable.set(f.table, []).get(f.table)!).push(f);
  const idxByTable = new Map<string, typeof idx>();
  for (const i of idx)
    (idxByTable.get(i.table) ?? idxByTable.set(i.table, []).get(i.table)!).push(i);

  // Bảng chưa được gán module → nhóm "Khác".
  const mapped = new Set(MODULES.flatMap((m) => m.tables));
  const others = [...colsByTable.keys()].filter((t) => !mapped.has(t)).sort();
  const modules = others.length
    ? [...MODULES, { title: "Khác (chưa gán module)", tables: others }]
    : MODULES;

  const out: string[] = [
    "# XBoss — Database ERD",
    "",
    "> **SINH TỰ ĐỘNG** từ schema Postgres (`information_schema` + `pg_indexes`) —",
    "> **KHÔNG sửa tay**. Chạy `npm run gen:erd` để cập nhật (CI kiểm bằng `git diff`).",
    "",
  ];

  for (const mod of modules) {
    const present = mod.tables.filter((t) => colsByTable.has(t));
    if (!present.length) continue;
    out.push(`## ${mod.title}`, "");
    for (const table of present) {
      out.push(`### ${table}`, "");
      out.push("| Cột | Kiểu | Null | Default |", "| --- | --- | --- | --- |");
      for (const c of colsByTable.get(table)!) {
        const def = c.def ? `\`${c.def.replace(/\|/g, "\\|")}\`` : "";
        out.push(
          `| ${c.column} | ${formatType(c)} | ${c.nullable === "YES" ? "✓" : ""} | ${def} |`,
        );
      }
      out.push("");
      const tfks = fkByTable.get(table);
      if (tfks?.length) {
        out.push("**Khóa ngoại:**");
        for (const f of tfks) out.push(`- \`${f.column}\` → \`${f.refTable}(${f.refColumn})\``);
        out.push("");
      }
      const tidx = idxByTable.get(table);
      if (tidx?.length) {
        out.push("**Index:**");
        for (const i of tidx) out.push(`- \`${i.name}\`: ${i.def.replace(/^CREATE /, "")}`);
        out.push("");
      }
    }
  }

  writeFileSync(join(process.cwd(), "docs", "ERD.md"), out.join("\n") + "\n");
  console.log(`✅ docs/ERD.md — ${colsByTable.size} bảng.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ gen-erd lỗi:", e);
  process.exit(1);
});
