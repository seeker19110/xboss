import { HAS_TEST_DB } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";

test(
  "OS-4: Controlled Autonomy Deny-by-default, Dry-run diff, Token Authorization & Kill Switch",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const {
      listAutonomyCapabilities,
      checkAutonomyAllowance,
      createExecutionRequest,
      authorizeExecutionRequest,
      executeExecutionRequest,
      toggleKillSwitch,
    } = await import("@/lib/engineering-autonomy");

    const projId = await insertId(`INSERT INTO projects (name) VALUES ('Autonomy Proj A')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Autonomy Tester', ?, 'x', 'admin')`,
      `autonomy-test-${projId}@test.local`,
    );

    try {
      // 1. Capabilities Catalog
      const caps = await listAutonomyCapabilities();
      assert.ok(caps.length >= 3);
      assert.ok(caps.some((c) => c.key === "cap_sync_twin_state"));

      // 2. Check Allowance (A1 allowed for admin, A3 rejected)
      const allowA1 = await checkAutonomyAllowance(projId, "cap_sync_twin_state", "A1", "admin");
      assert.equal(allowA1.allowed, true);

      const allowA3 = await checkAutonomyAllowance(projId, "cap_sync_twin_state", "A2", "viewer");
      assert.equal(allowA3.allowed, false, "Viewer không được phép A2");

      // 3. Create Execution Request with Dry-run Diff
      const req = await createExecutionRequest(projId, {
        capabilityKey: "cap_sync_twin_state",
        autonomyLevel: "A1",
        intent: "Đồng bộ snapshot Digital Twin",
        targetData: { objectId: "AHU-01", value: 3200 },
        createdBy: userId,
      });

      assert.equal(req.status, "dry_run_passed");
      assert.ok(req.dryRunDiff, "Phải có Dry-run Diff");

      // 4. Authorize Request (Generate Approval Token)
      const authResult = await authorizeExecutionRequest(projId, req.id, userId);
      assert.ok(authResult.token.startsWith("tok_"), "Token phải có tiền tố tok_");

      // 5. Execute Request
      const executed = await executeExecutionRequest(projId, req.id, authResult.token);
      assert.equal(executed.status, "completed");
      assert.ok(executed.executionResult);

      // 6. Test Kill Switch khẩn cấp
      await toggleKillSwitch(projId, null, true, "Sự cố an toàn diễn tập", userId);

      const allowAfterKill = await checkAutonomyAllowance(
        projId,
        "cap_sync_twin_state",
        "A1",
        "admin",
      );
      assert.equal(allowAfterKill.allowed, false, "Kill Switch bật phải chặn toàn bộ tự động hóa");

      // Hủy Kill Switch
      await toggleKillSwitch(projId, null, false, "Phục hồi", userId);
      const allowAfterRestore = await checkAutonomyAllowance(
        projId,
        "cap_sync_twin_state",
        "A1",
        "admin",
      );
      assert.equal(allowAfterRestore.allowed, true, "Kill Switch tắt phải phục hồi tự động hóa");
    } finally {
      await run(`DELETE FROM projects WHERE id = ?`, projId);
      await run(`DELETE FROM users WHERE id = ?`, userId);
    }
  },
);
