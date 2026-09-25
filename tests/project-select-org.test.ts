import { HAS_TEST_DB } from "./setup"; // chỉ dùng DB test, rollback mọi fixture
import { test } from "node:test";
import assert from "node:assert/strict";
import { insertId, withTransaction } from "@/lib/db";
import { chotProjectIdChoDoc } from "@/lib/ha-tang/projects";

test(
  "project/select: chính sách đọc chặn dự án khác org kể cả admin",
  { skip: !HAS_TEST_DB },
  async () => {
    const rollback = new Error("rollback org fixture");
    await assert.rejects(
      withTransaction(async () => {
        const orgA = await insertId("INSERT INTO organizations (name) VALUES (?)", "Audit scope A");
        const orgB = await insertId("INSERT INTO organizations (name) VALUES (?)", "Audit scope B");
        const projectA = await insertId(
          "INSERT INTO projects (name, org_id) VALUES (?, ?)",
          "Audit project A",
          orgA,
        );
        const projectB = await insertId(
          "INSERT INTO projects (name, org_id) VALUES (?, ?)",
          "Audit project B",
          orgB,
        );
        const id = await insertId(
          "INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, ?, ?, ?)",
          "Audit admin",
          `audit-org-${orgA}@example.invalid`,
          "test-only-not-a-login-hash",
          "admin",
          orgA,
        );
        const user = { id, role: "admin" as const, orgId: orgA };
        const own = await chotProjectIdChoDoc(user, projectA);
        assert.equal(own.ok, true);
        if (own.ok) assert.equal(own.projectId, projectA);
        assert.equal((await chotProjectIdChoDoc(user, projectB)).ok, false);
        throw rollback;
      }),
      (error: unknown) => error === rollback,
    );
  },
);
