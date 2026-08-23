import { HAS_TEST_DB } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";

test(
  "OS-1: Taxonomy registry trả về đầy đủ loại đối tượng & quan hệ MEP chuẩn",
  { skip: !HAS_TEST_DB },
  async () => {
    const { getTaxonomy } = await import("@/lib/ky-thuat/engineering-graph");
    const taxonomy = await getTaxonomy();

    assert.ok(taxonomy.objectTypes.length >= 7, "Phải có ít nhất 7 loại đối tượng chuẩn");
    const objKeys = taxonomy.objectTypes.map((o) => o.key);
    assert.ok(objKeys.includes("equipment"));
    assert.ok(objKeys.includes("component"));
    assert.ok(objKeys.includes("duct"));
    assert.ok(objKeys.includes("pipe"));
    assert.ok(objKeys.includes("cable_tray"));
    assert.ok(objKeys.includes("space"));
    assert.ok(objKeys.includes("system"));

    assert.ok(taxonomy.relationTypes.length >= 5, "Phải có ít nhất 5 loại quan hệ chuẩn");
    const relKeys = taxonomy.relationTypes.map((r) => r.key);
    assert.ok(relKeys.includes("SERVES"));
    assert.ok(relKeys.includes("CONTAINS"));
    assert.ok(relKeys.includes("CONNECTED_TO"));
    assert.ok(relKeys.includes("FEEDS"));
    assert.ok(relKeys.includes("LOCATED_IN"));
  },
);

test(
  "OS-1: Graph traversal BFS, lọc hướng, độ sâu và cô lập theo project",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, queryOne } = await import("@/lib/db");
    const { traverseGraph } = await import("@/lib/ky-thuat/engineering-graph");

    // Dựng 2 dự án A và B
    const projA = await insertId(`INSERT INTO projects (name) VALUES ('Graph Proj A')`);
    const projB = await insertId(`INSERT INTO projects (name) VALUES ('Graph Proj B')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Graph Tester', ?, 'x', 'admin')`,
      `graph-test-${projA}@test.local`,
    );

    try {
      // Dự án A: Chiller -> AHU-01 -> Duct-01 -> Space-Room101
      const nChiller = await queryOne<{ id: string }>(
        `INSERT INTO engineering_objects (project_id, external_key, object_type, name, discipline, status, created_by, updated_by)
       VALUES (?, 'CHILLER-01', 'equipment', 'Chiller Trung tâm', 'hvac', 'approved', ?, ?) RETURNING id`,
        projA,
        userId,
        userId,
      );
      const nAhu = await queryOne<{ id: string }>(
        `INSERT INTO engineering_objects (project_id, external_key, object_type, name, discipline, status, created_by, updated_by)
       VALUES (?, 'AHU-01', 'equipment', 'AHU Tầng 1', 'hvac', 'approved', ?, ?) RETURNING id`,
        projA,
        userId,
        userId,
      );
      const nDuct = await queryOne<{ id: string }>(
        `INSERT INTO engineering_objects (project_id, external_key, object_type, name, discipline, status, created_by, updated_by)
       VALUES (?, 'DUCT-01', 'duct', 'Ống cấp gió tươi', 'hvac', 'approved', ?, ?) RETURNING id`,
        projA,
        userId,
        userId,
      );
      const nSpace = await queryOne<{ id: string }>(
        `INSERT INTO engineering_objects (project_id, external_key, object_type, name, discipline, status, created_by, updated_by)
       VALUES (?, 'ROOM-101', 'space', 'Phòng họp VIP', 'architecture', 'approved', ?, ?) RETURNING id`,
        projA,
        userId,
        userId,
      );

      // Relations: Chiller FEEDS Ahu -> Ahu FEEDS Duct -> Duct SERVES Space
      await run(
        `INSERT INTO engineering_object_relations (project_id, from_object_id, to_object_id, relation_type, created_by)
       VALUES (?, ?, ?, 'FEEDS', ?)`,
        projA,
        nChiller!.id,
        nAhu!.id,
        userId,
      );
      await run(
        `INSERT INTO engineering_object_relations (project_id, from_object_id, to_object_id, relation_type, created_by)
       VALUES (?, ?, ?, 'FEEDS', ?)`,
        projA,
        nAhu!.id,
        nDuct!.id,
        userId,
      );
      await run(
        `INSERT INTO engineering_object_relations (project_id, from_object_id, to_object_id, relation_type, created_by)
       VALUES (?, ?, ?, 'SERVES', ?)`,
        projA,
        nDuct!.id,
        nSpace!.id,
        userId,
      );

      // 1. Traversal từ AHU-01 depth=1 direction='both' -> Thấy 3 nodes (Chiller, AHU, Duct)
      const tAhu1 = await traverseGraph(projA, { objectId: nAhu!.id, depth: 1, direction: "both" });
      assert.equal(tAhu1.nodes.length, 3, "AHU depth=1 phải thấy Chiller, AHU, Duct");
      assert.equal(tAhu1.edges.length, 2, "AHU depth=1 phải có 2 edges");

      // 2. Traversal từ AHU-01 direction='out' depth=2 -> Thấy AHU, Duct, Room-101
      const tAhuOut = await traverseGraph(projA, {
        objectId: nAhu!.id,
        depth: 2,
        direction: "out",
      });
      const outKeys = tAhuOut.nodes.map((n) => n.externalKey);
      assert.ok(outKeys.includes("AHU-01"));
      assert.ok(outKeys.includes("DUCT-01"));
      assert.ok(outKeys.includes("ROOM-101"));
      assert.ok(!outKeys.includes("CHILLER-01"), "direction out không được thấy upstream Chiller");

      // 3. Traversal từ Space direction='in' depth=3 -> Thấy Space, Duct, AHU, Chiller
      const tSpaceIn = await traverseGraph(projA, {
        externalKey: "ROOM-101",
        depth: 3,
        direction: "in",
      });
      assert.equal(
        tSpaceIn.nodes.length,
        4,
        "Từ space upstream depth=3 phải thấy trọn vẹn 4 nodes",
      );

      // 4. Lọc theo relationTypes
      const tRelFiltered = await traverseGraph(projA, {
        objectId: nAhu!.id,
        depth: 3,
        direction: "both",
        relationTypes: ["SERVES"],
      });
      // AHU nối FEEDS nên không có quan hệ SERVES nào trực tiếp từ AHU
      assert.equal(
        tRelFiltered.nodes.length,
        1,
        "Chỉ tìm thấy root vì không có cạnh SERVES chạm AHU",
      );

      // 5. Cô lập đa dự án: Dự án B không được thấy nodes của dự án A
      await assert.rejects(
        () => traverseGraph(projB, { objectId: nAhu!.id }),
        /Không tìm thấy đối tượng gốc trong dự án/,
        "Dự án B không được phép truy vấn đối tượng của Dự án A",
      );
    } finally {
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
      await run(`DELETE FROM users WHERE id = ?`, userId);
    }
  },
);

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
