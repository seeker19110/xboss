import { HAS_TEST_DB } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";

test("OS-1: Lineage & Impact Analysis cho đối tượng kỹ thuật", { skip: !HAS_TEST_DB }, async () => {
  const { insertId, run, queryOne } = await import("@/lib/db");
  const { getObjectLineage, analyzeObjectImpact } =
    await import("@/lib/ky-thuat/engineering-graph");

  const projId = await insertId(`INSERT INTO projects (name) VALUES ('Lineage Proj')`);
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Lineage Tester', ?, 'x', 'admin')`,
    `lineage-test-${projId}@test.local`,
  );

  try {
    // 1. Source + Revision
    const src = await queryOne<{ id: string }>(
      `INSERT INTO engineering_sources (project_id, external_key, source_type, title, created_by)
       VALUES (?, 'DWG-M-01', 'drawing', 'Bản vẽ MEP Tầng 1', ?) RETURNING id`,
      projId,
      userId,
    );
    const srcRev = await queryOne<{ id: string }>(
      `INSERT INTO engineering_source_revisions (source_id, project_id, revision_no, created_by)
       VALUES (?, ?, 1, ?) RETURNING id`,
      src!.id,
      projId,
      userId,
    );

    // 2. Object + Object Revisions
    const obj = await queryOne<{ id: string }>(
      `INSERT INTO engineering_objects (project_id, source_revision_id, external_key, object_type, name, discipline, status, created_by, updated_by)
       VALUES (?, ?, 'PUMP-01', 'equipment', 'Bơm nước giải nhiệt', 'plumbing', 'approved', ?, ?) RETURNING id`,
      projId,
      srcRev!.id,
      userId,
      userId,
    );
    await run(
      `INSERT INTO engineering_object_revisions (object_id, project_id, revision_no, object_type, status, change_reason, created_by)
       VALUES (?, ?, 1, 'equipment', 'approved', 'Khởi tạo từ DWG-M-01', ?)`,
      obj!.id,
      projId,
      userId,
    );
    await run(
      `INSERT INTO engineering_object_revisions (object_id, project_id, revision_no, object_type, status, change_reason, created_by)
       VALUES (?, ?, 2, 'equipment', 'approved', 'Cập nhật công suất bơm 15kW', ?)`,
      obj!.id,
      projId,
      userId,
    );

    // 3. Không gian được phục vụ (Space)
    const space = await queryOne<{ id: string }>(
      `INSERT INTO engineering_objects (project_id, external_key, object_type, name, status, created_by, updated_by)
       VALUES (?, 'ROOM-TECH-01', 'space', 'Phòng bơm kỹ thuật B1', 'approved', ?, ?) RETURNING id`,
      projId,
      userId,
      userId,
    );
    await run(
      `INSERT INTO engineering_object_relations (project_id, from_object_id, to_object_id, relation_type, created_by)
       VALUES (?, ?, ?, 'LOCATED_IN', ?)`,
      projId,
      obj!.id,
      space!.id,
      userId,
    );

    // 4. Suggestion & Workflow
    const pkg = await queryOne<{ id: string }>(
      `INSERT INTO engineering_intelligence_packages (project_id, objective)
       VALUES (?, 'Kiểm tra lưu lượng') RETURNING id`,
      projId,
    );
    // engineering_suggestions liên kết object qua object_id (không phải target_object_id).
    const sug = await queryOne<{ id: string }>(
      `INSERT INTO engineering_suggestions (project_id, package_id, object_id, suggestion_class, title, priority, status)
       VALUES (?, ?, ?, 'mep', 'Tăng đường kính ống hút', 'quality', 'accepted') RETURNING id`,
      projId,
      pkg!.id,
      obj!.id,
    );
    // engineering_workflows không có cột object — nối tới object qua suggestion_id.
    await run(
      `INSERT INTO engineering_workflows (project_id, suggestion_id, title, profile, risk_class, state, created_by)
       VALUES (?, ?, 'Phê duyệt thay đổi bơm', 'B', 'medium', 'completed', ?)`,
      projId,
      sug!.id,
      userId,
    );

    // TEST LINEAGE
    const lineage = await getObjectLineage(projId, obj!.id);
    assert.equal(lineage.object?.externalKey, "PUMP-01");
    assert.equal(lineage.source?.externalKey, "DWG-M-01");
    assert.equal(lineage.revisions.length, 2);
    assert.equal(lineage.relations.outgoing.length, 1);
    assert.equal(lineage.relations.outgoing[0].target.externalKey, "ROOM-TECH-01");
    assert.equal(lineage.suggestions.length, 1);
    assert.equal(lineage.workflows.length, 1);

    // TEST IMPACT ANALYSIS
    const impact = await analyzeObjectImpact(projId, obj!.id);
    assert.equal(impact.targetObject.externalKey, "PUMP-01");
    assert.equal(impact.downstreamCount, 1);
    assert.ok(impact.criticalPathAlerts.some((a) => a.includes("không gian")));
  } finally {
    await run(`DELETE FROM projects WHERE id = ?`, projId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  }
});

test("OS-1: Data Quality Issue Scanner & Resolver", { skip: !HAS_TEST_DB }, async () => {
  const { insertId, run, queryOne } = await import("@/lib/db");
  const { detectDataQualityIssues, resolveDataQualityIssue } =
    await import("@/lib/ky-thuat/engineering-graph");

  const projId = await insertId(`INSERT INTO projects (name) VALUES ('DQ Proj')`);
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('DQ Tester', ?, 'x', 'admin')`,
    `dq-test-${projId}@test.local`,
  );

  try {
    // 1. Tạo 1 orphan object (không source_revision, không relations)
    const orp = await queryOne<{ id: string }>(
      `INSERT INTO engineering_objects (project_id, external_key, object_type, name, created_by, updated_by)
       VALUES (?, 'ORPHAN-01', 'component', 'Van mồ côi', ?, ?) RETURNING id`,
      projId,
      userId,
      userId,
    );

    // 2. Tạo 1 suggestion thiếu evidence
    const pkg = await queryOne<{ id: string }>(
      `INSERT INTO engineering_intelligence_packages (project_id, objective)
       VALUES (?, 'Gói rà soát') RETURNING id`,
      projId,
    );
    await run(
      `INSERT INTO engineering_suggestions (project_id, package_id, suggestion_class, title, priority, status)
       VALUES (?, ?, 'design', 'Đề xuất thiếu cơ sở', 'critical_safety', 'open')`,
      projId,
      pkg!.id,
    );

    // Quét issues
    const issues = await detectDataQualityIssues(projId);
    assert.ok(issues.length >= 2, "Phải quét ra ít nhất 2 issues (orphan + missing evidence)");
    const orphanIssue = issues.find(
      (i) => i.issueRule === "orphan_object" && i.entityId === orp!.id,
    );
    assert.ok(orphanIssue, "Phải có issue orphan_object cho ORPHAN-01");
    assert.equal(orphanIssue!.status, "open");

    // Xử lý / đóng issue
    const resolved = await resolveDataQualityIssue(
      projId,
      orphanIssue!.id,
      userId,
      "Đã bổ sung bản vẽ DWG-02 vào đợt review",
    );
    assert.equal(resolved, true);

    const issuesAfter = await detectDataQualityIssues(projId);
    const updated = issuesAfter.find((i) => i.id === orphanIssue!.id);
    assert.equal(updated?.status, "resolved");
    assert.equal(updated?.resolvedBy, userId);
    assert.ok(updated?.resolutionNote?.includes("DWG-02"));
  } finally {
    await run(`DELETE FROM projects WHERE id = ?`, projId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  }
});
