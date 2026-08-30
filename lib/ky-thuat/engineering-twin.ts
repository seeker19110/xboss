// lib/engineering-twin.ts — Phase OS-2 Digital Twin theo cấp độ L0–L3 Engine
// Đặc tả: docs/nang-cap/OS-2-digital-twin.md
import { query, queryOne, run, withProjectScope } from "@/lib/db";
import { traverseGraph, GraphNode } from "@/lib/ky-thuat/engineering-graph";

export type BindingType = "floor" | "zone" | "system" | "task" | "drawing" | "bim_element";
export type QualityLevel = "high" | "medium" | "low" | "unknown";
export type FreshnessStatus = "live" | "recent" | "stale" | "unknown";

export interface TwinBinding {
  id: string;
  projectId: number;
  objectId: string;
  bindingType: BindingType;
  targetKey: string;
  targetId: string | null;
  sourceRevisionId: string | null;
  authority: string;
  metadata: Record<string, unknown>;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
}

export interface TwinState {
  id: string;
  projectId: number;
  objectId: string;
  stateType: string;
  observedAt: string;
  ingestedAt: string;
  value: Record<string, unknown> | unknown;
  unit: string | null;
  schemaVersion: string;
  quality: QualityLevel;
  freshness: FreshnessStatus;
  source: string;
  supersedesId: string | null;
  createdAt: string;
}

export interface TwinSnapshotResult {
  object: GraphNode | null;
  bindings: TwinBinding[];
  latestStates: Record<string, TwinState>;
  primaryFreshness: FreshnessStatus;
  geometryRef: Record<string, unknown> | null;
  source: {
    id: string;
    sourceType: string;
    externalKey: string;
    revisionName: string | null;
  } | null;
}

export interface TwinImpactStatusResult {
  targetObject: GraphNode;
  targetStates: Record<string, TwinState>;
  downstreamImpactedNodes: Array<{
    node: GraphNode;
    states: Record<string, TwinState>;
    relationType: string;
  }>;
  operationalWarnings: string[];
}

export function computeFreshness(observedAtStr?: string | null): FreshnessStatus {
  if (!observedAtStr) return "unknown";
  const observed = new Date(observedAtStr).getTime();
  if (isNaN(observed)) return "unknown";

  const diffMs = Date.now() - observed;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return "live";
  if (diffHours < 24) return "recent";
  return "stale";
}

// 1. Get Twin Snapshot (L0 Asset, L1 Bindings, L3 Latest Field States)
export async function getTwinSnapshot(
  projectId: number,
  objectId: string,
): Promise<TwinSnapshotResult> {
  return withProjectScope(projectId, async () => {
    // L0: Object info
    const object =
      (await queryOne<GraphNode>(
        `SELECT id, external_key AS "externalKey", object_type AS "objectType",
              name, discipline, status, project_id AS "projectId"
       FROM engineering_objects
       WHERE id = ? AND project_id = ?`,
        objectId,
        projectId,
      )) ?? null;

    if (!object) {
      throw new Error("Không tìm thấy đối tượng trong dự án");
    }

    // Geometry Ref and Source info
    const srcRow = await queryOne<{
      geometryRef: Record<string, unknown> | null;
      srcId: string | null;
      srcType: string | null;
      srcExternalKey: string | null;
      srcRevName: string | null;
    }>(
      `SELECT o.geometry_ref AS "geometryRef",
              s.id AS "srcId", s.source_type AS "srcType",
              -- Không có cột tên bản sửa đổi; nhãn dựng từ revision_no thật (xem engineering-graph.ts).
              s.external_key AS "srcExternalKey", ('Rev ' || sr.revision_no) AS "srcRevName"
       FROM engineering_objects o
       LEFT JOIN engineering_source_revisions sr ON o.source_revision_id = sr.id
       LEFT JOIN engineering_sources s ON sr.source_id = s.id
       WHERE o.id = ? AND o.project_id = ?`,
      objectId,
      projectId,
    );

    // L1: Bindings
    const rawBindings = await query<{
      id: string;
      projectId: number;
      objectId: string;
      bindingType: BindingType;
      targetKey: string;
      targetId: string | null;
      sourceRevisionId: string | null;
      authority: string;
      metadata: Record<string, unknown>;
      validFrom: string;
      validTo: string | null;
      createdAt: string;
    }>(
      `SELECT id, project_id AS "projectId", object_id AS "objectId",
              binding_type AS "bindingType", target_key AS "targetKey", target_id AS "targetId",
              source_revision_id AS "sourceRevisionId", authority, metadata,
              valid_from AS "validFrom", valid_to AS "validTo", created_at AS "createdAt"
       FROM engineering_twin_bindings
       WHERE object_id = ? AND project_id = ? AND (valid_to IS NULL OR valid_to > NOW())
       ORDER BY created_at DESC`,
      objectId,
      projectId,
    );

    // L3: Distinct Latest States per state_type
    const rawStates = await query<{
      id: string;
      projectId: number;
      objectId: string;
      stateType: string;
      observedAt: string;
      ingestedAt: string;
      value: Record<string, unknown> | unknown;
      unit: string | null;
      schemaVersion: string;
      quality: QualityLevel;
      source: string;
      supersedesId: string | null;
      createdAt: string;
    }>(
      `SELECT DISTINCT ON (state_type)
              id, project_id AS "projectId", object_id AS "objectId",
              state_type AS "stateType", observed_at AS "observedAt",
              ingested_at AS "ingestedAt", value, unit,
              schema_version AS "schemaVersion", quality, source,
              supersedes_id AS "supersedesId", created_at AS "createdAt"
       FROM engineering_twin_states
       WHERE object_id = ? AND project_id = ?
       ORDER BY state_type, observed_at DESC`,
      objectId,
      projectId,
    );

    const latestStates: Record<string, TwinState> = {};
    let hasLive = false;
    let hasRecent = false;

    for (const st of rawStates) {
      const freshness = computeFreshness(st.observedAt);
      if (freshness === "live") hasLive = true;
      if (freshness === "recent") hasRecent = true;

      latestStates[st.stateType] = {
        ...st,
        freshness,
      };
    }

    const primaryFreshness: FreshnessStatus =
      rawStates.length === 0 ? "unknown" : hasLive ? "live" : hasRecent ? "recent" : "stale";

    const source = srcRow?.srcId
      ? {
          id: srcRow.srcId,
          sourceType: srcRow.srcType ?? "unknown",
          externalKey: srcRow.srcExternalKey ?? "",
          revisionName: srcRow.srcRevName,
        }
      : null;

    return {
      object,
      bindings: rawBindings,
      latestStates,
      primaryFreshness,
      geometryRef: srcRow?.geometryRef ?? null,
      source,
    };
  });
}

// 2. Get Twin Timeline
export async function getTwinTimeline(
  projectId: number,
  objectId: string,
  options?: { stateType?: string; limit?: number; offset?: number },
): Promise<{ total: number; states: TwinState[] }> {
  return withProjectScope(projectId, async () => {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
    const offset = Math.max(options?.offset ?? 0, 0);

    let sql = `SELECT id, project_id AS "projectId", object_id AS "objectId",
                      state_type AS "stateType", observed_at AS "observedAt",
                      ingested_at AS "ingestedAt", value, unit,
                      schema_version AS "schemaVersion", quality, source,
                      supersedes_id AS "supersedesId", created_at AS "createdAt"
               FROM engineering_twin_states
               WHERE object_id = ? AND project_id = ?`;
    const args: unknown[] = [objectId, projectId];

    if (options?.stateType) {
      sql += ` AND state_type = ?`;
      args.push(options.stateType);
    }

    sql += ` ORDER BY observed_at DESC LIMIT ? OFFSET ?`;
    args.push(limit, offset);

    const states = await query<{
      id: string;
      projectId: number;
      objectId: string;
      stateType: string;
      observedAt: string;
      ingestedAt: string;
      value: Record<string, unknown> | unknown;
      unit: string | null;
      schemaVersion: string;
      quality: QualityLevel;
      source: string;
      supersedesId: string | null;
      createdAt: string;
    }>(sql, ...args);

    let countSql = `SELECT COUNT(*)::int AS n FROM engineering_twin_states WHERE object_id = ? AND project_id = ?`;
    const countArgs: unknown[] = [objectId, projectId];
    if (options?.stateType) {
      countSql += ` AND state_type = ?`;
      countArgs.push(options.stateType);
    }
    const countRow = await queryOne<{ n: number }>(countSql, ...countArgs);

    return {
      total: countRow?.n ?? 0,
      states: states.map((s) => ({
        ...s,
        freshness: computeFreshness(s.observedAt),
      })),
    };
  });
}

// 3. Bind Twin Target (L1)
export async function bindTwinTarget(
  projectId: number,
  payload: {
    objectId: string;
    bindingType: BindingType;
    targetKey: string;
    targetId?: string;
    sourceRevisionId?: string;
    authority?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<TwinBinding> {
  return withProjectScope(
    projectId,
    async () => {
      const res =
        (await queryOne<TwinBinding>(
          `INSERT INTO engineering_twin_bindings
         (project_id, object_id, binding_type, target_key, target_id, source_revision_id, authority, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id, project_id AS "projectId", object_id AS "objectId",
                   binding_type AS "bindingType", target_key AS "targetKey",
                   target_id AS "targetId", source_revision_id AS "sourceRevisionId",
                   authority, metadata, valid_from AS "validFrom", valid_to AS "validTo",
                   created_at AS "createdAt"`,
          projectId,
          payload.objectId,
          payload.bindingType,
          payload.targetKey,
          payload.targetId ?? null,
          payload.sourceRevisionId ?? null,
          payload.authority ?? "primary_spec",
          JSON.stringify(payload.metadata ?? {}),
        )) ?? null;

      if (!res) {
        throw new Error("Không thể tạo liên kết Digital Twin");
      }
      return res;
    },
    { readOnly: false },
  );
}

// 4. Record Twin State Snapshot (L3)
export async function recordTwinState(
  projectId: number,
  payload: {
    objectId: string;
    stateType: string;
    observedAt: string;
    value: Record<string, unknown> | unknown;
    unit?: string;
    schemaVersion?: string;
    quality?: QualityLevel;
    source: string;
    supersedesId?: string;
  },
): Promise<TwinState> {
  return withProjectScope(
    projectId,
    async () => {
      const res =
        (await queryOne<{
          id: string;
          projectId: number;
          objectId: string;
          stateType: string;
          observedAt: string;
          ingestedAt: string;
          value: Record<string, unknown> | unknown;
          unit: string | null;
          schemaVersion: string;
          quality: QualityLevel;
          source: string;
          supersedesId: string | null;
          createdAt: string;
        }>(
          `INSERT INTO engineering_twin_states
         (project_id, object_id, state_type, observed_at, value, unit, schema_version, quality, source, supersedes_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id, project_id AS "projectId", object_id AS "objectId",
                   state_type AS "stateType", observed_at AS "observedAt",
                   ingested_at AS "ingestedAt", value, unit,
                   schema_version AS "schemaVersion", quality, source,
                   supersedes_id AS "supersedesId", created_at AS "createdAt"`,
          projectId,
          payload.objectId,
          payload.stateType,
          payload.observedAt,
          JSON.stringify(payload.value),
          payload.unit ?? null,
          payload.schemaVersion ?? "1.0",
          payload.quality ?? "high",
          payload.source,
          payload.supersedesId ?? null,
        )) ?? null;

      if (!res) {
        throw new Error("Không thể lưu trạng thái Digital Twin");
      }

      return {
        ...res,
        freshness: computeFreshness(res.observedAt),
      };
    },
    { readOnly: false },
  );
}

// 5. Get Combined Twin & Graph Impact Status
export async function getTwinImpactStatus(
  projectId: number,
  objectId: string,
): Promise<TwinImpactStatusResult> {
  return withProjectScope(projectId, async () => {
    // 1. Get Target Snapshot
    const snapshot = await getTwinSnapshot(projectId, objectId);
    if (!snapshot.object) {
      throw new Error("Không tìm thấy đối tượng");
    }

    // 2. Traversal Downstream in Graph
    const traversal = await traverseGraph(projectId, {
      objectId,
      direction: "out",
      depth: 3,
    });

    const downstreamNodes = traversal.nodes.filter((n) => n.id !== objectId);
    const downstreamIds = downstreamNodes.map((n) => n.id);

    // 3. Batch query latest states for downstream nodes
    const downstreamImpacted: TwinImpactStatusResult["downstreamImpactedNodes"] = [];
    const operationalWarnings: string[] = [];

    if (downstreamIds.length > 0) {
      const placeholders = downstreamIds.map(() => "?").join(",");
      const statesRows = await query<{
        objectId: string;
        stateType: string;
        observedAt: string;
        value: unknown;
        quality: QualityLevel;
      }>(
        `SELECT DISTINCT ON (object_id, state_type)
                object_id AS "objectId", state_type AS "stateType",
                observed_at AS "observedAt", value, quality
         FROM engineering_twin_states
         WHERE project_id = ? AND object_id IN (${placeholders})
         ORDER BY object_id, state_type, observed_at DESC`,
        projectId,
        ...downstreamIds,
      );

      const statesByObject = new Map<string, Record<string, TwinState>>();
      for (const r of statesRows) {
        if (!statesByObject.has(r.objectId)) {
          statesByObject.set(r.objectId, {});
        }
        statesByObject.get(r.objectId)![r.stateType] = {
          id: "",
          projectId,
          objectId: r.objectId,
          stateType: r.stateType,
          observedAt: r.observedAt,
          ingestedAt: r.observedAt,
          value: r.value,
          unit: null,
          schemaVersion: "1.0",
          quality: r.quality,
          freshness: computeFreshness(r.observedAt),
          source: "twin",
          supersedesId: null,
          createdAt: r.observedAt,
        };
      }

      for (const node of downstreamNodes) {
        const edge = traversal.edges.find(
          (e) => e.fromObjectId === objectId || e.toObjectId === node.id,
        );
        downstreamImpacted.push({
          node,
          states: statesByObject.get(node.id) ?? {},
          relationType: edge?.relationType ?? "RELATED_TO",
        });
      }
    }

    // Check operating warnings
    const targetOp = snapshot.latestStates["operating_status"]?.value;
    if (targetOp === "fault" || targetOp === "stopped" || targetOp === "alarm") {
      operationalWarnings.push(
        `Đối tượng gốc [${snapshot.object.externalKey}] đang ở trạng thái bất thường (${String(
          targetOp,
        )}). Có ${downstreamNodes.length} đối tượng hạ nguồn bị gián đoạn hoạt động.`,
      );
    }

    const spaceDownstream = downstreamNodes.filter((n) => n.objectType === "space");
    if (spaceDownstream.length > 0) {
      operationalWarnings.push(
        `Tác động trực tiếp đến ${spaceDownstream.length} không gian / phòng kỹ thuật (${spaceDownstream
          .map((s) => s.externalKey)
          .slice(0, 3)
          .join(", ")}${spaceDownstream.length > 3 ? "..." : ""}).`,
      );
    }

    return {
      targetObject: snapshot.object,
      targetStates: snapshot.latestStates,
      downstreamImpactedNodes: downstreamImpacted,
      operationalWarnings,
    };
  });
}
