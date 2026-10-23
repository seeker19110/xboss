import { HAS_TEST_DB } from "./setup"; // phải đầu tiên: không dùng DB ứng dụng thật
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { Client } from "pg";
import {
  collectEngineeringInventory,
  type InventoryClient,
  type InventoryReport,
} from "@/scripts/lib/engineering-inventory";

// Client riêng, không import lib/db hay chạy migration. Runner phải migrate DB disposable trước.
describe("M136: kiểm kê trên PostgreSQL thật", { skip: !HAS_TEST_DB, concurrency: false }, () => {
  const suffix = randomUUID();
  const orgs: number[] = [];
  const projects: number[] = [];
  let owner: Client;
  const scope = () => ({ org: String(orgs[0]), project: String(projects[0]) });
  const row = (report: InventoryReport, table: string) => {
    const found = report.rows.find((entry) => entry.table === table);
    assert.ok(found, `Báo cáo phải có ${table}`);
    return found;
  };

  before(async () => {
    owner = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await owner.connect();
    for (const name of ["A", "B"]) {
      const inserted = await owner.query<{ id: number }>(
        "INSERT INTO organizations(name, slug) VALUES ($1, $2) RETURNING id",
        [`Kiểm kê M136 ${name}`, `m136-inventory-${name.toLowerCase()}-${suffix}`],
      );
      orgs.push(inserted.rows[0].id);
    }
    // A và B cùng org; C khác org. Mỗi dự án có số bản ghi khác nhau để bắt scope rộng.
    for (const [index, org] of [orgs[0], orgs[0], orgs[1]].entries()) {
      const inserted = await owner.query<{ id: number }>(
        "INSERT INTO projects(name, code, org_id) VALUES ($1, $2, $3) RETURNING id",
        [`Kiểm kê M136 ${index}`, `M136-${suffix}-${index}`, org],
      );
      const project = inserted.rows[0].id;
      projects.push(project);
      for (let n = 0; n <= index; n++) {
        await owner.query(
          "INSERT INTO tender_packages(code, name, project_id) VALUES ($1, $2, $3)",
          [`M136-${suffix}-${index}-${n}`, "Gói fixture kiểm kê", project],
        );
        await owner.query(
          "INSERT INTO invoices(invoice_no, project_id, direction, net_amount, vat_amount) VALUES ($1, $2, 'in', 100, 10)",
          [`M136-${suffix}-${index}-${n}`, project],
        );
      }
    }
  });

  after(async () => {
    if (!owner) return;
    try {
      // Chỉ dọn ID được tạo trong file này, theo FK; không xóa bảng/schema/role hay dữ liệu khác.
      await owner.query("ROLLBACK");
      await owner.query("RESET ROLE");
      await owner.query("DELETE FROM invoices WHERE project_id = ANY($1::int[])", [projects]);
      await owner.query("DELETE FROM tender_packages WHERE project_id = ANY($1::int[])", [
        projects,
      ]);
      await owner.query("DELETE FROM projects WHERE id = ANY($1::int[])", [projects]);
      await owner.query("DELETE FROM organizations WHERE id = ANY($1::int[])", [orgs]);
    } finally {
      await owner.end();
    }
  });

  test("scope tách dự án cùng org, khác org và từ chối project/org không khớp", async () => {
    for (let index = 0; index < projects.length; index++) {
      const report = await collectEngineeringInventory(owner, {
        org: String(index < 2 ? orgs[0] : orgs[1]),
        project: String(projects[index]),
      });
      assert.equal(report.scopeVerified, true);
      assert.equal(row(report, "tender_packages").count, String(index + 1));
      assert.equal(row(report, "invoices").count, String(index + 1));
      assert.equal(row(report, "engineering_bidding_packages").state, "known");
      assert.equal(
        row(report, "engineering_bidding_packages").count,
        "0",
        "0 thật phân biệt với unknown",
      );
    }
    const mismatched = await collectEngineeringInventory(owner, {
      org: String(orgs[1]),
      project: String(projects[0]),
    });
    assert.equal(mismatched.scopeVerified, false);
    assert.equal(mismatched.complete, false);
    assert.ok(mismatched.rows.every((entry) => entry.state === "unknown" && entry.count === null));
    assert.equal((await owner.query("SELECT 1 AS ok")).rows[0].ok, 1);
  });

  test("READ ONLY được Postgres cưỡng chế, snapshot có scope và không giữ transaction sau trả về", async () => {
    let checked = false;
    const reader: InventoryClient = {
      async query(sql, values) {
        if (!checked && sql.startsWith("SELECT COUNT")) {
          checked = true;
          const settings = await owner.query(
            `SELECT current_setting('transaction_read_only') AS ro,
                    current_setting('transaction_isolation') AS isolation,
                    current_setting('app.org_id') AS org,
                    current_setting('app.project_id') AS project`,
          );
          assert.deepEqual(settings.rows[0], {
            ro: "on",
            isolation: "repeatable read",
            ...scope(),
          });
          await owner.query("SAVEPOINT inventory_readonly_probe");
          await assert.rejects(
            () => owner.query("UPDATE projects SET name = name WHERE id = $1", [projects[0]]),
            (error: unknown) => (error as { code?: string }).code === "25006",
            "PostgreSQL phải chặn ghi bằng chính transaction do collector mở",
          );
          await owner.query("ROLLBACK TO SAVEPOINT inventory_readonly_probe");
          await owner.query("RELEASE SAVEPOINT inventory_readonly_probe");
        }
        return owner.query(sql, values);
      },
    };
    const report = await collectEngineeringInventory(reader, scope());
    assert.equal(checked, true);
    assert.equal(report.complete, true);
    assert.equal(row(report, "invoices").count, "1");
    const settings = await owner.query(
      `SELECT current_setting('transaction_read_only') AS ro,
              current_setting('app.org_id', true) AS org,
              current_setting('app.project_id', true) AS project,
              current_setting('row_security') AS rls`,
    );
    assert.equal(settings.rows[0].ro, "off");
    assert.equal(settings.rows[0].rls, "on");
    assert.ok([null, ""].includes(settings.rows[0].org));
    assert.ok([null, ""].includes(settings.rows[0].project));
  });

  test("query lỗi là unknown, savepoint phục hồi bảng kế tiếp và rollback cuối transaction", async () => {
    let failed = false;
    const reader: InventoryClient = {
      async query(sql, values) {
        if (!failed && sql.startsWith("SELECT COUNT") && sql.includes('"tender_packages"')) {
          failed = true;
          // Lỗi SQL thật làm transaction abort; collector phải rollback tới savepoint.
          return owner.query("SELECT upgrade_ops_column_does_not_exist FROM projects");
        }
        return owner.query(sql, values);
      },
    };
    const report = await collectEngineeringInventory(reader, scope());
    assert.equal(failed, true);
    assert.equal(report.scopeVerified, true);
    assert.equal(report.complete, false);
    assert.equal(row(report, "tender_packages").state, "unknown");
    assert.equal(row(report, "tender_packages").count, null);
    assert.equal(row(report, "invoices").state, "known");
    assert.equal(row(report, "invoices").count, "1");
    const afterError = await owner.query(
      "SELECT 1 AS ok, current_setting('transaction_read_only') AS ro",
    );
    assert.deepEqual(afterError.rows[0], { ok: 1, ro: "off" });
  });

  test("role xboss_app thấy dữ liệu khi có RLS scope; kiểm kê không coi RLS lọc là số 0", async () => {
    const app = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await app.connect();
    try {
      // Dùng role migration đã tạo, không CREATE ROLE/GRANT hay đổi policy toàn cục.
      await app.query("SET ROLE xboss_app");
      const role = await app.query(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
      );
      assert.deepEqual(role.rows[0], { rolsuper: false, rolbypassrls: false });
      await app.query("BEGIN READ ONLY");
      await app.query(
        "SELECT set_config('app.org_id', $1, true), set_config('app.project_id', $2, true)",
        [scope().org, scope().project],
      );
      const visible = await app.query("SELECT id FROM projects WHERE id = $1", [projects[0]]);
      assert.equal(
        visible.rows.length,
        1,
        "positive control: role có quyền SELECT dự án của scope",
      );
      const foreign = await app.query("SELECT id FROM projects WHERE id = $1", [projects[2]]);
      assert.equal(foreign.rows.length, 0);
      await app.query("ROLLBACK");

      const report = await collectEngineeringInventory(app, scope());
      assert.equal(
        report.scopeVerified,
        false,
        "row_security=off phải phát hiện RLS có thể lọc kết quả",
      );
      assert.equal(report.complete, false);
      assert.match(report.reason, /RLS/);
      assert.ok(report.rows.every((entry) => entry.state === "unknown" && entry.count === null));
      assert.deepEqual(
        (await app.query("SELECT 1 AS ok, current_setting('transaction_read_only') AS ro")).rows[0],
        { ok: 1, ro: "off" },
      );
    } finally {
      await app.query("ROLLBACK").catch(() => {});
      await app.query("RESET ROLE").catch(() => {});
      await app.end();
    }
  });
});
