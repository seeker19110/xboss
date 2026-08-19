import { HAS_TEST_DB } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";

test("PIN-1: calculateGeometricDeviation tính toán chính xác sai lệch 3D và xếp hạng mức độ", async () => {
  const { calculateGeometricDeviation } = await import("@/lib/engineering-twin-pinnacle");

  // 1. Trùng khớp hoàn hảo (0 mm)
  const dev0 = calculateGeometricDeviation(
    { x: 10.0, y: 20.0, z: 5.0 },
    { x: 10.0, y: 20.0, z: 5.0 },
    15.0,
  );
  assert.equal(dev0.distanceMm, 0);
  assert.equal(dev0.severity, "low");

  // 2. Sai lệch nhỏ trong dung sai (10 mm <= 15 mm)
  const dev1 = calculateGeometricDeviation(
    { x: 10.01, y: 20.0, z: 5.0 },
    { x: 10.0, y: 20.0, z: 5.0 },
    15.0,
  );
  assert.equal(dev1.distanceMm, 10);
  assert.equal(dev1.severity, "low");

  // 3. Sai lệch vượt ngưỡng trung bình (20 mm > 15 mm && <= 30 mm)
  const dev2 = calculateGeometricDeviation(
    { x: 10.02, y: 20.0, z: 5.0 },
    { x: 10.0, y: 20.0, z: 5.0 },
    15.0,
  );
  assert.equal(dev2.distanceMm, 20);
  assert.equal(dev2.severity, "medium");

  // 4. Sai lệch cao (35 mm > 30 mm && <= 45 mm)
  const dev3 = calculateGeometricDeviation(
    { x: 10.035, y: 20.0, z: 5.0 },
    { x: 10.0, y: 20.0, z: 5.0 },
    15.0,
  );
  assert.equal(dev3.distanceMm, 35);
  assert.equal(dev3.severity, "high");

  // 5. Sai lệch nghiêm trọng (> 45 mm)
  const dev4 = calculateGeometricDeviation(
    { x: 10.06, y: 20.0, z: 5.0 },
    { x: 10.0, y: 20.0, z: 5.0 },
    15.0,
  );
  assert.equal(dev4.distanceMm, 60);
  assert.equal(dev4.severity, "critical");
});

test(
  "PIN-1: Living Digital Twin Reality Capture, Spatial Deviations & Sensor Telemetry",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const {
      ingestRealityCapture,
      recordSpatialDeviation,
      getSpatialDeviations,
      updateDeviationRemediation,
      ingestSensorTelemetry,
      getSensorStreams,
    } = await import("@/lib/engineering-twin-pinnacle");

    const projId = await insertId(`INSERT INTO projects (name) VALUES ('Living Twin Project A')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Pinnacle Tester', ?, 'x', 'admin')`,
      `pinnacle-test-${projId}@test.local`,
    );

    try {
      // 1. Tạo đối tượng Canonical MEPF Pipe
      const obj = await queryOne<{ id: string }>(
        `INSERT INTO engineering_objects (project_id, external_key, object_type, name, discipline, status, created_by, updated_by)
         VALUES (?, 'PIPE-CHW-01', 'element', 'Ống Chilled Water Trục Đứng T2', 'hvac', 'approved', ?, ?) RETURNING id`,
        projId,
        userId,
        userId,
      );
      assert.ok(obj?.id);

      // 2. Nạp Reality Capture
      const capture = await ingestRealityCapture(projId, {
        captureCode: "SCAN-LIDAR-01",
        captureType: "lidar_pointcloud",
        spatialZone: "Shaft MEPF Zone 1",
        elevationLevel: "FL03-FL04",
        captureTimestamp: new Date().toISOString(),
        totalPoints: 2500000,
        storageUri: "s3://xboss-scans/pipe-chw-01.las",
        createdBy: userId,
      });
      assert.equal(capture.capture_code, "SCAN-LIDAR-01");
      assert.equal(capture.processing_status, "completed");

      // 3. Ghi nhận Spatial Deviation giữa As-Built và BIM
      const deviation = await recordSpatialDeviation(projId, {
        captureId: capture.id,
        objectId: obj!.id,
        elementGuid: "BIM-ELEM-GUID-CHW-99",
        deviationType: "position_offset",
        measuredCoords: { x: 12.05, y: 15.0, z: 9.0 },
        designCoords: { x: 12.0, y: 15.0, z: 9.0 },
        toleranceThresholdMm: 15.0,
      });
      assert.equal(deviation.measured_deviation_mm, 50); // 0.05m = 50mm
      assert.equal(deviation.severity, "critical");
      assert.equal(deviation.remediation_status, "open");

      // 4. Truy vấn danh sách sai lệch
      const devList = await getSpatialDeviations(projId, { severity: "critical" });
      assert.equal(devList.length, 1);
      assert.equal(devList[0].object_name, "Ống Chilled Water Trục Đứng T2");

      // 5. Cập nhật xử lý sai lệch (Remediation)
      const remediated = await updateDeviationRemediation(
        projId,
        deviation.id,
        "accepted_as_built",
      );
      assert.ok(remediated);
      assert.equal(remediated.remediation_status, "accepted_as_built");

      // 6. Ingest IoT Sensor Telemetry Stream & Anomaly Detection
      const sensorNormal = await ingestSensorTelemetry(projId, {
        sensorCode: "TEMP-CHW-SUP-01",
        sensorType: "temperature",
        objectId: obj!.id,
        value: 7.2,
        unit: "°C",
        thresholdConfig: { min: 5.0, max: 12.0, criticalMax: 15.0 },
      });
      assert.equal(sensorNormal.anomaly_status, "normal");

      const sensorCritical = await ingestSensorTelemetry(projId, {
        sensorCode: "TEMP-CHW-RET-01",
        sensorType: "temperature",
        objectId: obj!.id,
        value: 18.5,
        unit: "°C",
        thresholdConfig: { min: 8.0, max: 14.0, criticalMax: 16.0 },
      });
      assert.equal(sensorCritical.anomaly_status, "critical");

      const allSensors = await getSensorStreams(projId);
      assert.equal(allSensors.length, 2);
    } finally {
      // Clean up project
    }
  },
);
