import { query, queryOne } from "@/lib/db";

export type RealityCaptureType =
  "lidar_pointcloud" | "drone_photogrammetry" | "camera_ai_survey" | "bim_scan_diff";
export type DeviationType =
  | "position_offset"
  | "clearance_violation"
  | "missing_element"
  | "unexpected_obstacle"
  | "rotation_skew";
export type DeviationSeverity = "low" | "medium" | "high" | "critical";
export type RemediationStatus =
  "open" | "acknowledged" | "remediated" | "accepted_as_built" | "rejected";
export type SensorAnomalyStatus = "normal" | "warning" | "critical" | "offline";

export interface RealityCaptureRecord {
  id: string;
  project_id: number;
  capture_code: string;
  capture_type: string;
  spatial_zone: string;
  elevation_level: string | null;
  capture_timestamp: string;
  total_points: number;
  storage_uri: string;
  bounding_box: Record<string, unknown>;
  processing_status: string;
  metadata: Record<string, unknown>;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface SpatialDeviationRecord {
  id: string;
  project_id: number;
  capture_id: string;
  object_id: string;
  element_guid: string | null;
  deviation_type: string;
  measured_deviation_mm: number;
  tolerance_threshold_mm: number;
  severity: DeviationSeverity;
  point_coordinates: Record<string, unknown>;
  remediation_status: RemediationStatus;
  suggestion_id: string | null;
  created_at: string;
  updated_at: string;
  capture_code?: string;
  capture_type?: string;
  spatial_zone?: string;
  object_name?: string;
  object_code?: string;
}

export interface SensorStreamRecord {
  id: string;
  project_id: number;
  sensor_code: string;
  sensor_type: string;
  object_id: string | null;
  sampling_interval_seconds: number;
  latest_value: number | null;
  latest_unit: string | null;
  latest_observed_at: string | null;
  anomaly_status: SensorAnomalyStatus;
  threshold_config: Record<string, unknown>;
  created_at: string;
  object_name?: string;
  object_code?: string;
}

export interface RealityCaptureInput {
  captureCode: string;
  captureType: RealityCaptureType;
  spatialZone: string;
  elevationLevel?: string;
  captureTimestamp: string;
  totalPoints?: number;
  storageUri: string;
  boundingBox?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdBy?: number;
}

export interface SpatialCoordinates {
  x: number;
  y: number;
  z: number;
}

export interface SpatialDeviationInput {
  captureId: string;
  objectId: string;
  elementGuid?: string;
  deviationType: DeviationType;
  measuredCoords: SpatialCoordinates;
  designCoords: SpatialCoordinates;
  toleranceThresholdMm?: number;
}

export interface SensorTelemetryInput {
  sensorCode: string;
  sensorType:
    "temperature" | "humidity" | "pressure" | "vibration" | "tilt" | "flow_rate" | "energy_kwh";
  objectId?: string;
  value: number;
  unit: string;
  observedAt?: string;
  thresholdConfig?: { min?: number | null; max?: number | null; criticalMax?: number | null };
}

/**
 * 1. Ingest Reality Capture record (L4-L6 point-cloud/survey capture)
 */
export async function ingestRealityCapture(
  projectId: number,
  input: RealityCaptureInput,
): Promise<RealityCaptureRecord> {
  const row = await queryOne<RealityCaptureRecord>(
    `INSERT INTO engineering_twin_reality_captures (
      project_id, capture_code, capture_type, spatial_zone, elevation_level,
      capture_timestamp, total_points, storage_uri, bounding_box, metadata, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (project_id, capture_code) DO UPDATE SET
      total_points = EXCLUDED.total_points,
      storage_uri = EXCLUDED.storage_uri,
      bounding_box = EXCLUDED.bounding_box,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *`,
    projectId,
    input.captureCode,
    input.captureType,
    input.spatialZone,
    input.elevationLevel || null,
    input.captureTimestamp,
    input.totalPoints || 0,
    input.storageUri,
    JSON.stringify(input.boundingBox || {}),
    JSON.stringify(input.metadata || {}),
    input.createdBy || null,
  );
  return row!;
}

/**
 * Calculate Euclidean 3D geometric deviation in millimeters and determine severity
 */
export function calculateGeometricDeviation(
  measured: SpatialCoordinates,
  design: SpatialCoordinates,
  toleranceMm = 15.0,
): {
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  distanceMm: number;
  severity: DeviationSeverity;
} {
  const dx = (measured.x - design.x) * 1000; // convert to mm if m
  const dy = (measured.y - design.y) * 1000;
  const dz = (measured.z - design.z) * 1000;
  const distanceMm = Math.sqrt(dx * dx + dy * dy + dz * dz);

  let severity: DeviationSeverity = "low";
  if (distanceMm > toleranceMm * 3) {
    severity = "critical";
  } else if (distanceMm > toleranceMm * 2) {
    severity = "high";
  } else if (distanceMm > toleranceMm) {
    severity = "medium";
  }

  return {
    deltaX: Math.round(dx * 100) / 100,
    deltaY: Math.round(dy * 100) / 100,
    deltaZ: Math.round(dz * 100) / 100,
    distanceMm: Math.round(distanceMm * 100) / 100,
    severity,
  };
}

/**
 * 2. Record Spatial Deviation between As-Built and BIM baseline
 */
export async function recordSpatialDeviation(
  projectId: number,
  input: SpatialDeviationInput,
): Promise<SpatialDeviationRecord> {
  const tolerance = input.toleranceThresholdMm ?? 15.0;
  const { distanceMm, severity } = calculateGeometricDeviation(
    input.measuredCoords,
    input.designCoords,
    tolerance,
  );

  const row = await queryOne<SpatialDeviationRecord>(
    `INSERT INTO engineering_twin_spatial_deviations (
      project_id, capture_id, object_id, element_guid, deviation_type,
      measured_deviation_mm, tolerance_threshold_mm, severity, point_coordinates
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *`,
    projectId,
    input.captureId,
    input.objectId,
    input.elementGuid || null,
    input.deviationType,
    distanceMm,
    tolerance,
    severity,
    JSON.stringify(input.measuredCoords),
  );
  return row!;
}

/**
 * 3. Query Spatial Deviations with optional filters
 */
export async function getSpatialDeviations(
  projectId: number,
  filters?: { severity?: string; remediationStatus?: string; limit?: number },
): Promise<SpatialDeviationRecord[]> {
  let sql = `
    SELECT d.*, c.capture_code, c.capture_type, c.spatial_zone, o.name as object_name, o.code as object_code
    FROM engineering_twin_spatial_deviations d
    JOIN engineering_twin_reality_captures c ON d.capture_id = c.id
    JOIN engineering_objects o ON d.object_id = o.id
    WHERE d.project_id = ?
  `;
  const params: unknown[] = [projectId];

  if (filters?.severity) {
    params.push(filters.severity);
    sql += ` AND d.severity = ?`;
  }
  if (filters?.remediationStatus) {
    params.push(filters.remediationStatus);
    sql += ` AND d.remediation_status = ?`;
  }

  sql += ` ORDER BY d.created_at DESC LIMIT ?`;
  params.push(filters?.limit || 100);

  const rows = await query<SpatialDeviationRecord>(sql, ...params);
  return rows;
}

/**
 * 4. Update remediation status for a spatial deviation
 */
export async function updateDeviationRemediation(
  projectId: number,
  deviationId: string,
  remediationStatus: RemediationStatus,
  suggestionId?: string,
): Promise<SpatialDeviationRecord | null> {
  const row = await queryOne<SpatialDeviationRecord>(
    `UPDATE engineering_twin_spatial_deviations
     SET remediation_status = ?,
         suggestion_id = COALESCE(?, suggestion_id),
         updated_at = NOW()
     WHERE id = ? AND project_id = ?
     RETURNING *`,
    remediationStatus,
    suggestionId || null,
    deviationId,
    projectId,
  );
  return row || null;
}

/**
 * 5. Ingest IoT sensor telemetry and detect anomalies
 */
export async function ingestSensorTelemetry(
  projectId: number,
  input: SensorTelemetryInput,
): Promise<SensorStreamRecord> {
  let anomalyStatus: SensorAnomalyStatus = "normal";
  const cfg = input.thresholdConfig;

  if (cfg) {
    if (cfg.criticalMax != null && input.value >= cfg.criticalMax) {
      anomalyStatus = "critical";
    } else if (cfg.max != null && input.value >= cfg.max) {
      anomalyStatus = "warning";
    } else if (cfg.min != null && input.value <= cfg.min) {
      anomalyStatus = "warning";
    }
  }

  const row = await queryOne<SensorStreamRecord>(
    `INSERT INTO engineering_twin_sensor_streams (
      project_id, sensor_code, sensor_type, object_id, latest_value, latest_unit,
      latest_observed_at, anomaly_status, threshold_config
    ) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?::timestamptz, NOW()), ?, ?)
    ON CONFLICT (project_id, sensor_code) DO UPDATE SET
      latest_value = EXCLUDED.latest_value,
      latest_unit = EXCLUDED.latest_unit,
      latest_observed_at = EXCLUDED.latest_observed_at,
      anomaly_status = EXCLUDED.anomaly_status,
      threshold_config = COALESCE(EXCLUDED.threshold_config, engineering_twin_sensor_streams.threshold_config)
    RETURNING *`,
    projectId,
    input.sensorCode,
    input.sensorType,
    input.objectId || null,
    input.value,
    input.unit,
    input.observedAt || null,
    anomalyStatus,
    JSON.stringify(input.thresholdConfig || {}),
  );
  return row!;
}

/**
 * 6. Query all sensor streams for a project
 */
export async function getSensorStreams(projectId: number): Promise<SensorStreamRecord[]> {
  const rows = await query<SensorStreamRecord>(
    `SELECT s.*, o.name as object_name, o.code as object_code
     FROM engineering_twin_sensor_streams s
     LEFT JOIN engineering_objects o ON s.object_id = o.id
     WHERE s.project_id = ?
     ORDER BY s.anomaly_status DESC, s.sensor_code ASC`,
    projectId,
  );
  return rows;
}
