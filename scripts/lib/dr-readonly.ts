// Primitive kiểm khôi phục: connection riêng, snapshot chỉ-đọc, không gọi migration.
import { verifyAuditChain } from "@/lib/bao-mat/merkle-audit-ledger";

export type DrCheck = {
  name: string;
  status: "PASS" | "FAIL" | "NOT_RUN";
  details: string;
};
export type DrClient = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};
export type DrTarget = {
  connectionString: string;
  expectedDatabase: string;
  expectedUser: string;
};

export function readDrTarget(env: Record<string, string | undefined>): DrTarget {
  const connectionString = env.DR_VERIFY_DATABASE_URL;
  const expectedDatabase = env.DR_VERIFY_EXPECTED_DATABASE;
  const expectedUser = env.DR_VERIFY_EXPECTED_USER;
  if (!connectionString || !expectedDatabase?.trim() || !expectedUser?.trim()) {
    throw new Error(
      "Cần DR_VERIFY_DATABASE_URL, DR_VERIFY_EXPECTED_DATABASE và DR_VERIFY_EXPECTED_USER.",
    );
  }
  const identity = (raw: string) => {
    const url = new URL(raw);
    if (!/^postgres(ql)?:$/.test(url.protocol) || !url.hostname || url.pathname.length < 2) {
      throw new Error("Đích kiểm tra phải là PostgreSQL URL có hostname và database.");
    }
    return `${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname}`;
  };
  try {
    const target = identity(connectionString);
    for (const source of [env.DATABASE_URL, env.MIGRATE_DATABASE_URL]) {
      if (source && identity(source) === target) {
        throw new Error("Đích kiểm tra trùng nguồn ứng dụng.");
      }
    }
  } catch {
    // Không đưa URI, username/password hoặc thông điệp lỗi parser ra log.
    throw new Error("Đích DR không hợp lệ hoặc trùng database ứng dụng; cần bản sao cách ly.");
  }
  return { connectionString, expectedDatabase, expectedUser };
}

const CORE_TABLES = [
  "users",
  "projects",
  "towers",
  "sheet_types",
  "work_packages",
  "tasks",
  "materials",
  "audit_log",
  "engineering_objects",
  "engineering_relations",
  "engineering_workflows",
  "engineering_agent_sessions",
  "import_batches",
] as const;

function countValue(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("Kết quả COUNT không hợp lệ.");
  }
  return BigInt(value);
}

export async function runDrChecks(
  client: DrClient,
  target: Pick<DrTarget, "expectedDatabase" | "expectedUser">,
  migrationNames: readonly string[],
): Promise<DrCheck[]> {
  const results: DrCheck[] = [];
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const identity = await client.query(
      `SELECT current_database() AS db, current_user AS usr,
              current_setting('transaction_read_only') AS readonly`,
    );
    const actual = identity.rows[0];
    if (
      actual?.db !== target.expectedDatabase ||
      actual?.usr !== target.expectedUser ||
      actual?.readonly !== "on"
    ) {
      return [{ name: "target", status: "FAIL", details: "Sai đích hoặc chế độ chỉ-đọc." }];
    }
    results.push({ name: "target", status: "PASS", details: "Đích khớp và transaction chỉ-đọc." });
    // Không cho RLS lọc về tập rỗng rồi diễn giải nhầm là toàn bộ dữ liệu hợp lệ.
    // Đây không phải bypass: PostgreSQL báo lỗi nếu policy sẽ lọc dữ liệu của role này.
    await client.query("SET LOCAL row_security = off");

    const check = async (name: string, fn: () => Promise<Omit<DrCheck, "name">>) => {
      const savepoint = `dr_check_${results.length}`; // Nội bộ, không nhận tên từ request/env.
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        results.push({ name, ...(await fn()) });
      } catch {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        results.push({ name, status: "FAIL", details: "Không kiểm chứng được; không tự sửa." });
      } finally {
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      }
    };

    await check("migration-names", async () => {
      if (!migrationNames.length || new Set(migrationNames).size !== migrationNames.length) {
        return { status: "FAIL", details: "Danh sách migration rỗng hoặc trùng tên." };
      }
      const { rows } = await client.query("SELECT name FROM schema_migrations ORDER BY name ASC");
      const applied = new Set(rows.map((row) => row.name));
      const expected = new Set(migrationNames);
      const missing = migrationNames.filter((name) => !applied.has(name)).length;
      const extraNames = [...applied].filter((name) => {
        return typeof name !== "string" || !expected.has(name);
      });
      const extra = extraNames.length;
      const ok = !missing && !extra && applied.size === rows.length;
      return {
        status: ok ? "PASS" : "FAIL",
        details: `Thiếu ${missing}, thừa ${extra}; đây là đối chiếu tên, chưa kiểm checksum.`,
      };
    });

    await check("table-counts", async () => {
      for (const table of CORE_TABLES) {
        // Tên bảng thuộc allowlist tĩnh; tuyệt đối không nối tên bảng từ client.
        const { rows } = await client.query(`SELECT COUNT(*)::text AS cnt FROM ${table}`);
        countValue(rows[0]?.cnt);
      }
      return {
        status: "PASS",
        details: `Đọc được ${CORE_TABLES.length} bảng; chưa đối soát manifest.`,
      };
    });

    await check("audit-chain", async () => {
      const readRows = async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
        let parameter = 0;
        const { rows } = await client.query(sql.replace(/\?/g, () => `$${++parameter}`), params);
        return rows as T[];
      };
      const chain = await verifyAuditChain(readRows);
      if (!chain.ok) return { status: "FAIL", details: "Chuỗi audit có hash không hợp lệ." };
      if (!chain.total || chain.checked !== chain.total) {
        return {
          status: "NOT_RUN",
          details: `Chưa đủ bằng chứng coverage: ${chain.checked}/${chain.total} dòng có hash.`,
        };
      }
      return { status: "PASS", details: `Đối chiếu ${chain.checked} dòng audit có hash.` };
    });
    await check("engineering-relations", async () => {
      const { rows } = await client.query(
        `SELECT COUNT(*)::text AS cnt FROM engineering_relations r
         LEFT JOIN engineering_objects f ON f.id = r.from_object_id
         LEFT JOIN engineering_objects t ON t.id = r.to_object_id
         WHERE f.id IS NULL OR t.id IS NULL OR r.project_id IS NULL
            OR r.project_id IS DISTINCT FROM f.project_id
            OR r.project_id IS DISTINCT FROM t.project_id`,
      );
      const count = countValue(rows[0]?.cnt);
      return {
        status: count === 0n ? "PASS" : "FAIL",
        details: `${count} liên kết mồ côi hoặc lệch dự án; chưa phủ toàn bộ FK/miền.`,
      };
    });
    return results;
  } finally {
    await client.query("ROLLBACK");
  }
}
