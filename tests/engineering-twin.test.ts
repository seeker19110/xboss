import { HAS_TEST_DB } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";

test("OS-2: computeFreshness tính toán chính xác độ tươi mới dữ liệu hiện trường", async () => {
  const { computeFreshness } = await import("@/lib/engineering-twin");

  assert.equal(computeFreshness(null), "unknown");
  assert.equal(computeFreshness("invalid-date"), "unknown");

  const now = new Date();
  const liveDate = new Date(now.getTime() - 10 * 60 * 1000).toISOString(); // 10 phút trước
  assert.equal(computeFreshness(liveDate), "live");

  const recentDate = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(); // 5 giờ trước
  assert.equal(computeFreshness(recentDate), "recent");

  const staleDate = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(); // 2 ngày trước
  assert.equal(computeFreshness(staleDate), "stale");
});

test(
  "OS-2: Digital Twin L1 Bindings, L3 State Snapshots và Timeline",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, queryOne } = await import("@/lib/db");
    const { bindTwinTarget, recordTwinState, getTwinSnapshot, getTwinTimeline } =
      await import("@/lib/engineering-twin");

    const projId = await insertId(`INSERT INTO projects (name) VALUES ('Twin Proj A')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Twin Tester', ?, 'x', 'admin')`,
      `twin-test-${projId}@test.local`,
    );

    try {
      // 1. Tạo đối tượng canonical AHU-01
      const obj = await queryOne<{ id: string }>(
        `INSERT INTO engineering_objects (project_id, external_key, object_type, name, discipline, status, created_by, updated_by)
       VALUES (?, 'AHU-TWIN-01', 'equipment', 'AHU Phòng mổ', 'hvac', 'approved', ?, ?) RETURNING id`,
        projId,
        userId,
        userId,
      );

      // 2. Gán L1 Bindings (Tầng, Khu vực, BIM)
      await bindTwinTarget(projId, {
        objectId: obj!.id,
        bindingType: "floor",
        targetKey: "FLOOR-03",
        authority: "primary_spec",
      });
      await bindTwinTarget(projId, {
        objectId: obj!.id,
        bindingType: "bim_element",
        targetKey: "BIM-GUID-998877",
        metadata: { revitCategory: "Mechanical Equipment", family: "AHU_AirHandler" },
      });

      // 3. Ghi nhận L3 Field States (Áp suất, Lưu lượng, Trạng thái vận hành)
      const t0 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h trước (recent)
      const t1 = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5m trước (live)

      await recordTwinState(projId, {
        objectId: obj!.id,
        stateType: "airflow_cfm",
        observedAt: t0,
        value: 3200,
        unit: "CFM",
        quality: "high",
        source: "tab_balancer",
      });

      await recordTwinState(projId, {
        objectId: obj!.id,
        stateType: "operating_status",
        observedAt: t1,
        value: "normal",
        quality: "high",
        source: "bms_snapshot",
      });

      // TEST SNAPSHOT
      const snapshot = await getTwinSnapshot(projId, obj!.id);
      assert.equal(snapshot.object?.externalKey, "AHU-TWIN-01");
      assert.equal(snapshot.bindings.length, 2);
      assert.equal(snapshot.bindings.find((b) => b.bindingType === "floor")?.targetKey, "FLOOR-03");
      assert.equal(
        snapshot.bindings.find((b) => b.bindingType === "bim_element")?.targetKey,
        "BIM-GUID-998877",
      );

      assert.equal(snapshot.latestStates["airflow_cfm"]?.value, 3200);
      assert.equal(snapshot.latestStates["operating_status"]?.value, "normal");
      assert.equal(
        snapshot.primaryFreshness,
        "live",
        "Có ít nhất 1 state ghi nhận 5 phút trước -> live",
      );

      // TEST TIMELINE
      const timeline = await getTwinTimeline(projId, obj!.id);
      assert.equal(timeline.total, 2);
      assert.equal(timeline.states[0].stateType, "operating_status");
      assert.equal(timeline.states[1].stateType, "airflow_cfm");
    } finally {
      await run(`DELETE FROM projects WHERE id = ?`, projId);
      await run(`DELETE FROM users WHERE id = ?`, userId);
    }
  },
);

test(
  "OS-2: Twin Impact Integration kết hợp Knowledge Graph & Cảnh báo vận hành",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, run, queryOne } = await import("@/lib/db");
    const { recordTwinState, getTwinImpactStatus } = await import("@/lib/engineering-twin");

    const projA = await insertId(`INSERT INTO projects (name) VALUES ('Twin Impact A')`);
    const projB = await insertId(`INSERT INTO projects (name) VALUES ('Twin Impact B')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Twin Impact Tester', ?, 'x', 'admin')`,
      `twin-impact-${projA}@test.local`,
    );

    try {
      // Dự án A: Chiller -> AHU -> Room 101
      const nChiller = await queryOne<{ id: string }>(
        `INSERT INTO engineering_objects (project_id, external_key, object_type, name, status, created_by, updated_by)
       VALUES (?, 'CHILLER-01', 'equipment', 'Chiller 1', 'approved', ?, ?) RETURNING id`,
        projA,
        userId,
        userId,
      );
      const nAhu = await queryOne<{ id: string }>(
        `INSERT INTO engineering_objects (project_id, external_key, object_type, name, status, created_by, updated_by)
       VALUES (?, 'AHU-01', 'equipment', 'AHU 1', 'approved', ?, ?) RETURNING id`,
        projA,
        userId,
        userId,
      );
      const nSpace = await queryOne<{ id: string }>(
        `INSERT INTO engineering_objects (project_id, external_key, object_type, name, status, created_by, updated_by)
       VALUES (?, 'ROOM-101', 'space', 'Phòng Cấp cứu', 'approved', ?, ?) RETURNING id`,
        projA,
        userId,
        userId,
      );

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
       VALUES (?, ?, ?, 'SERVES', ?)`,
        projA,
        nAhu!.id,
        nSpace!.id,
        userId,
      );

      // Ghi nhận Chiller bị sự cố (fault)
      await recordTwinState(projA, {
        objectId: nChiller!.id,
        stateType: "operating_status",
        observedAt: new Date().toISOString(),
        value: "fault",
        source: "alarm_system",
      });

      // TEST TWIN IMPACT
      const impact = await getTwinImpactStatus(projA, nChiller!.id);
      assert.equal(
        impact.downstreamImpactedNodes.length,
        2,
        "Chiller downstream phải chạm AHU-01 và ROOM-101",
      );
      assert.ok(
        impact.operationalWarnings.some((w) => w.includes("bất thường (fault)")),
        "Phải có cảnh báo vận hành do trạng thái fault của Chiller",
      );
      assert.ok(
        impact.operationalWarnings.some((w) => w.includes("không gian")),
        "Phải có cảnh báo tác động tới không gian ROOM-101",
      );

      // TEST MULTI-PROJECT ISOLATION
      await assert.rejects(
        () => getTwinImpactStatus(projB, nChiller!.id),
        /Không tìm thấy đối tượng/,
        "Dự án B không được phép đọc Digital Twin của Dự án A",
      );
    } finally {
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, projA, projB);
      await run(`DELETE FROM users WHERE id = ?`, userId);
    }
  },
);
