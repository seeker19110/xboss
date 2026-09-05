// lib/engineering-graph.ts — Phase OS-1 Engineering Knowledge Graph & System of Record Engine
// Đặc tả: docs/nang-cap/OS-1-engineering-system-of-record.md
import { query, queryOne, run, withProjectScope } from "@/lib/db";
import { loiKhongTimThay } from "@/lib/nen/loi";

export type GraphDirection = "out" | "in" | "both";

export interface GraphNode {
  id: string;
  externalKey: string;
  objectType: string;
  name: string | null;
  discipline: string | null;
  status: string;
  projectId: number;
}

export interface GraphEdge {
  id: string;
  fromObjectId: string;
  toObjectId: string;
  relationType: string;
  projectId: number;
}

export interface GraphTraversalResult {
  rootId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  depthReached: number;
  truncated: boolean;
}

export interface ObjectLineageResult {
  object: GraphNode | null;
  source: {
    id: string;
    sourceType: string;
    externalKey: string;
    revisionName: string | null;
    createdAt: string;
  } | null;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    changeSummary: string | null;
    createdAt: string;
  }>;
  relations: {
    outgoing: Array<{ relationType: string; target: GraphNode }>;
    incoming: Array<{ relationType: string; source: GraphNode }>;
  };
  suggestions: Array<{
    id: string;
    title: string;
    status: string;
    riskLevel: string;
  }>;
  workflows: Array<{
    id: string;
    title: string;
    state: string;
    riskClass: string;
  }>;
}

export interface ImpactAnalysisResult {
  targetObject: GraphNode;
  upstreamCount: number;
  downstreamCount: number;
  upstreamNodes: GraphNode[];
  downstreamNodes: GraphNode[];
  criticalPathAlerts: string[];
}

export interface DataQualityIssue {
  id: string;
  projectId: number;
  entityType: string;
  entityId: string;
  issueRule: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
  status: "open" | "investigating" | "resolved" | "ignored";
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: number | null;
  resolutionNote: string | null;
}

// 1. Taxonomy Registry
export async function getTaxonomy() {
  const objectTypes = await query<{
    key: string;
    label: string;
    discipline: string | null;
    schemaVersion: string;
    isActive: boolean;
  }>(`
    SELECT key, label, discipline, schema_version AS "schemaVersion", is_active AS "isActive"
    FROM engineering_object_types
    WHERE is_active = TRUE
    ORDER BY key ASC
  `);

  const relationTypes = await query<{
    key: string;
    label: string;
    allowedFromTypes: string[];
    allowedToTypes: string[];
    isDirected: boolean;
    isAcyclic: boolean;
    description: string | null;
  }>(`
    SELECT key, label, allowed_from_types AS "allowedFromTypes", allowed_to_types AS "allowedToTypes",
           is_directed AS "isDirected", is_acyclic AS "isAcyclic", description
    FROM engineering_relation_types
    ORDER BY key ASC
  `);

  return { objectTypes, relationTypes };
}

// 2. Recursive Graph Traversal (PostgreSQL BFS Traversal)
export async function traverseGraph(
  projectId: number,
  params: {
    objectId?: string;
    externalKey?: string;
    direction?: GraphDirection;
    relationTypes?: string[];
    depth?: number;
    maxNodes?: number;
  },
): Promise<GraphTraversalResult> {
  return withProjectScope(projectId, async () => {
    const depthCap = Math.min(Math.max(params.depth ?? 2, 1), 5); // Tối đa 5 tầng
    const maxNodes = Math.min(Math.max(params.maxNodes ?? 100, 1), 500); // Tối đa 500 nodes
    const direction = params.direction ?? "both";

    let rootObj: GraphNode | null = null;
    if (params.objectId) {
      rootObj =
        (await queryOne<GraphNode>(
          `SELECT id, external_key AS "externalKey", object_type AS "objectType",
                name, discipline, status, project_id AS "projectId"
         FROM engineering_objects
         WHERE id = ? AND project_id = ?`,
          params.objectId,
          projectId,
        )) ?? null;
    } else if (params.externalKey) {
      rootObj =
        (await queryOne<GraphNode>(
          `SELECT id, external_key AS "externalKey", object_type AS "objectType",
                name, discipline, status, project_id AS "projectId"
         FROM engineering_objects
         WHERE external_key = ? AND project_id = ?`,
          params.externalKey,
          projectId,
        )) ?? null;
    }

    if (!rootObj) {
      throw loiKhongTimThay("Không tìm thấy đối tượng gốc trong dự án");
    }

    // Traversal sử dụng BFS trên mảng nodes
    const nodesMap = new Map<string, GraphNode>();
    const edgesMap = new Map<string, GraphEdge>();
    nodesMap.set(rootObj.id, rootObj);

    let currentLevelIds = [rootObj.id];
    let depthReached = 0;
    let truncated = false;

    for (let d = 1; d <= depthCap; d++) {
      if (currentLevelIds.length === 0 || nodesMap.size >= maxNodes) break;
      depthReached = d;

      // Tìm quan hệ theo direction
      const placeholders = currentLevelIds.map(() => "?").join(",");
      let relSql = "";
      const relArgs: unknown[] = [projectId, ...currentLevelIds];

      if (direction === "out") {
        relSql = `SELECT id, from_object_id AS "fromObjectId", to_object_id AS "toObjectId",
                         relation_type AS "relationType", project_id AS "projectId"
                  FROM engineering_object_relations
                  WHERE project_id = ? AND from_object_id IN (${placeholders})`;
      } else if (direction === "in") {
        relSql = `SELECT id, from_object_id AS "fromObjectId", to_object_id AS "toObjectId",
                         relation_type AS "relationType", project_id AS "projectId"
                  FROM engineering_object_relations
                  WHERE project_id = ? AND to_object_id IN (${placeholders})`;
      } else {
        relSql = `SELECT id, from_object_id AS "fromObjectId", to_object_id AS "toObjectId",
                         relation_type AS "relationType", project_id AS "projectId"
                  FROM engineering_object_relations
                  WHERE project_id = ? AND (from_object_id IN (${placeholders}) OR to_object_id IN (${placeholders}))`;
        relArgs.push(...currentLevelIds);
      }

      if (params.relationTypes && params.relationTypes.length > 0) {
        const typePlaceholders = params.relationTypes.map(() => "?").join(",");
        relSql += ` AND relation_type IN (${typePlaceholders})`;
        relArgs.push(...params.relationTypes);
      }

      const foundEdges = await query<GraphEdge>(relSql, ...relArgs);
      const nextLevelIds = new Set<string>();

      for (const edge of foundEdges) {
        edgesMap.set(edge.id, edge);
        if (!nodesMap.has(edge.fromObjectId)) nextLevelIds.add(edge.fromObjectId);
        if (!nodesMap.has(edge.toObjectId)) nextLevelIds.add(edge.toObjectId);
      }

      if (nextLevelIds.size > 0) {
        const nextArr = Array.from(nextLevelIds);
        const nextPlaceholders = nextArr.map(() => "?").join(",");
        const foundNodes = await query<GraphNode>(
          `SELECT id, external_key AS "externalKey", object_type AS "objectType",
                  name, discipline, status, project_id AS "projectId"
           FROM engineering_objects
           WHERE project_id = ? AND id IN (${nextPlaceholders})`,
          projectId,
          ...nextArr,
        );

        for (const node of foundNodes) {
          if (nodesMap.size >= maxNodes) {
            truncated = true;
            break;
          }
          nodesMap.set(node.id, node);
        }

        currentLevelIds = foundNodes.map((n) => n.id);
      } else {
        break;
      }
    }

    return {
      rootId: rootObj.id,
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
      depthReached,
      truncated,
    };
  });
}

// 3. Object Lineage Resolution
export async function getObjectLineage(
  projectId: number,
  objectId: string,
): Promise<ObjectLineageResult> {
  return withProjectScope(projectId, async () => {
    const object = await queryOne<GraphNode>(
      `SELECT id, external_key AS "externalKey", object_type AS "objectType",
              name, discipline, status, project_id AS "projectId"
       FROM engineering_objects
       WHERE id = ? AND project_id = ?`,
      objectId,
      projectId,
    );

    if (!object) {
      throw loiKhongTimThay("Không tìm thấy đối tượng trong dự án");
    }

    // Source info
    const source = await queryOne<{
      id: string;
      sourceType: string;
      externalKey: string;
      revisionName: string | null;
      createdAt: string;
    }>(
      `SELECT s.id, s.source_type AS "sourceType", s.external_key AS "externalKey",
              -- engineering_source_revisions chỉ có revision_no (INTEGER), không có cột tên —
              -- dựng nhãn hiển thị từ số hiệu thật thay vì cột không tồn tại.
              ('Rev ' || sr.revision_no) AS "revisionName", s.created_at AS "createdAt"
       FROM engineering_objects o
       JOIN engineering_source_revisions sr ON o.source_revision_id = sr.id
       JOIN engineering_sources s ON sr.source_id = s.id
       WHERE o.id = ? AND o.project_id = ?`,
      objectId,
      projectId,
    );

    // Object Revisions History
    const revisions = await query<{
      id: string;
      revisionNumber: number;
      changeSummary: string | null;
      createdAt: string;
    }>(
      `SELECT id, revision_no AS "revisionNumber", change_reason AS "changeSummary", created_at AS "createdAt"
       FROM engineering_object_revisions
       WHERE object_id = ? AND project_id = ?
       ORDER BY revision_no DESC`,
      objectId,
      projectId,
    );

    // Outgoing Relations
    const outgoing = await query<{
      relationType: string;
      targetId: string;
      targetExternalKey: string;
      targetObjectType: string;
      targetName: string | null;
      targetDiscipline: string | null;
      targetStatus: string;
      targetProjectId: number;
    }>(
      `SELECT r.relation_type AS "relationType",
              o.id AS "targetId", o.external_key AS "targetExternalKey", o.object_type AS "targetObjectType",
              o.name AS "targetName", o.discipline AS "targetDiscipline", o.status AS "targetStatus",
              o.project_id AS "targetProjectId"
       FROM engineering_object_relations r
       JOIN engineering_objects o ON r.to_object_id = o.id
       WHERE r.from_object_id = ? AND r.project_id = ?`,
      objectId,
      projectId,
    );

    // Incoming Relations
    const incoming = await query<{
      relationType: string;
      sourceId: string;
      sourceExternalKey: string;
      sourceObjectType: string;
      sourceName: string | null;
      sourceDiscipline: string | null;
      sourceStatus: string;
      sourceProjectId: number;
    }>(
      `SELECT r.relation_type AS "relationType",
              o.id AS "sourceId", o.external_key AS "sourceExternalKey", o.object_type AS "sourceObjectType",
              o.name AS "sourceName", o.discipline AS "sourceDiscipline", o.status AS "sourceStatus",
              o.project_id AS "sourceProjectId"
       FROM engineering_object_relations r
       JOIN engineering_objects o ON r.from_object_id = o.id
       WHERE r.to_object_id = ? AND r.project_id = ?`,
      objectId,
      projectId,
    );

    // Suggestions
    const suggestions = await query<{
      id: string;
      title: string;
      status: string;
      riskLevel: string;
    }>(
      // Cột thật là object_id (không phải target_object_id); mức rủi ro dùng severity.
      `SELECT id, title, status, severity AS "riskLevel"
       FROM engineering_suggestions
       WHERE object_id = ? AND project_id = ?`,
      objectId,
      projectId,
    );

    // Workflows
    const workflows = await query<{
      id: string;
      title: string;
      state: string;
      riskClass: string;
    }>(
      // engineering_workflows không tham chiếu object trực tiếp — nối qua suggestion.
      `SELECT w.id, w.title, w.state, w.risk_class AS "riskClass"
       FROM engineering_workflows w
       JOIN engineering_suggestions s ON s.id = w.suggestion_id
       WHERE s.object_id = ? AND w.project_id = ?`,
      objectId,
      projectId,
    );

    return {
      object,
      source: source ?? null,
      revisions,
      relations: {
        outgoing: outgoing.map((r) => ({
          relationType: r.relationType,
          target: {
            id: r.targetId,
            externalKey: r.targetExternalKey,
            objectType: r.targetObjectType,
            name: r.targetName,
            discipline: r.targetDiscipline,
            status: r.targetStatus,
            projectId: r.targetProjectId,
          },
        })),
        incoming: incoming.map((r) => ({
          relationType: r.relationType,
          source: {
            id: r.sourceId,
            externalKey: r.sourceExternalKey,
            objectType: r.sourceObjectType,
            name: r.sourceName,
            discipline: r.sourceDiscipline,
            status: r.sourceStatus,
            projectId: r.sourceProjectId,
          },
        })),
      },
      suggestions,
      workflows,
    };
  });
}

// 4. Impact Analysis
export async function analyzeObjectImpact(
  projectId: number,
  objectId: string,
  options?: { relationTypes?: string[]; depth?: number },
): Promise<ImpactAnalysisResult> {
  return withProjectScope(projectId, async () => {
    const depth = options?.depth ?? 3;

    const [upstream, downstream] = await Promise.all([
      traverseGraph(projectId, {
        objectId,
        direction: "in",
        depth,
        relationTypes: options?.relationTypes,
      }),
      traverseGraph(projectId, {
        objectId,
        direction: "out",
        depth,
        relationTypes: options?.relationTypes,
      }),
    ]);

    const targetObject = upstream.nodes.find((n) => n.id === objectId)!;
    const upstreamNodes = upstream.nodes.filter((n) => n.id !== objectId);
    const downstreamNodes = downstream.nodes.filter((n) => n.id !== objectId);

    const criticalPathAlerts: string[] = [];
    if (downstreamNodes.some((n) => n.objectType === "space")) {
      criticalPathAlerts.push("Ảnh hưởng trực tiếp đến không gian / căn hộ sử dụng.");
    }
    if (downstreamNodes.some((n) => n.objectType === "equipment" && n.status === "approved")) {
      criticalPathAlerts.push("Ảnh hưởng tới thiết bị đã duyệt nghiệm thu downstream.");
    }

    return {
      targetObject,
      upstreamCount: upstreamNodes.length,
      downstreamCount: downstreamNodes.length,
      upstreamNodes,
      downstreamNodes,
      criticalPathAlerts,
    };
  });
}

// 5. Data Quality Issue Scanner
export async function detectDataQualityIssues(projectId: number): Promise<DataQualityIssue[]> {
  return withProjectScope(
    projectId,
    async () => {
      const issues: Omit<
        DataQualityIssue,
        "id" | "detectedAt" | "resolvedAt" | "resolvedBy" | "resolutionNote"
      >[] = [];

      // A. Orphan Objects (không có quan hệ nào và không có source revision)
      const orphans = await query<{ id: string; externalKey: string; name: string | null }>(
        `SELECT o.id, o.external_key AS "externalKey", o.name
       FROM engineering_objects o
       WHERE o.project_id = ?
         AND o.source_revision_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM engineering_object_relations r
           WHERE r.project_id = o.project_id AND (r.from_object_id = o.id OR r.to_object_id = o.id)
         )
       LIMIT 50`,
        projectId,
      );

      for (const orp of orphans) {
        issues.push({
          projectId,
          entityType: "object",
          entityId: orp.id,
          issueRule: "orphan_object",
          severity: "medium",
          description: `Đối tượng [${orp.externalKey}] (${orp.name ?? "Chưa đặt tên"}) không có bản vẽ nguồn và không liên kết với đối tượng nào.`,
          status: "open",
        });
      }

      // B. Suggestions thiếu bằng chứng (missing evidence)
      const missingEv = await query<{ id: string; title: string }>(
        `SELECT s.id, s.title
       FROM engineering_suggestions s
       WHERE s.project_id = ?
         AND s.status = 'open'
         AND NOT EXISTS (
           SELECT 1 FROM engineering_evidence e
           WHERE e.project_id = s.project_id AND e.suggestion_id = s.id
         )
       LIMIT 50`,
        projectId,
      );

      for (const s of missingEv) {
        issues.push({
          projectId,
          entityType: "suggestion",
          entityId: s.id,
          issueRule: "missing_evidence",
          severity: "high",
          description: `Đề xuất [${s.title}] đang mở nhưng thiếu bằng chứng kỹ thuật (evidence) đính kèm.`,
          status: "open",
        });
      }

      // Lưu vào database nếu chưa có issue đang open
      for (const iss of issues) {
        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM engineering_data_quality_issues
         WHERE project_id = ? AND entity_type = ? AND entity_id = ? AND issue_rule = ? AND status = 'open'`,
          iss.projectId,
          iss.entityType,
          iss.entityId,
          iss.issueRule,
        );

        if (!existing) {
          await run(
            `INSERT INTO engineering_data_quality_issues
           (project_id, entity_type, entity_id, issue_rule, severity, description, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
            iss.projectId,
            iss.entityType,
            iss.entityId,
            iss.issueRule,
            iss.severity,
            iss.description,
            iss.status,
          );
        }
      }

      return query<DataQualityIssue>(
        `SELECT id, project_id AS "projectId", entity_type AS "entityType", entity_id AS "entityId",
              issue_rule AS "issueRule", severity, description, status,
              detected_at AS "detectedAt", resolved_at AS "resolvedAt",
              resolved_by AS "resolvedBy", resolution_note AS "resolutionNote"
       FROM engineering_data_quality_issues
       WHERE project_id = ?
       ORDER BY CASE severity
         WHEN 'critical' THEN 1
         WHEN 'high' THEN 2
         WHEN 'medium' THEN 3
         WHEN 'low' THEN 4
         ELSE 5 END ASC, detected_at DESC`,
        projectId,
      );
    },
    { readOnly: false },
  );
}

// 6. Resolve Data Quality Issue
export async function resolveDataQualityIssue(
  projectId: number,
  issueId: string,
  userId: number,
  note: string,
): Promise<boolean> {
  return withProjectScope(
    projectId,
    async () => {
      const res = await run(
        `UPDATE engineering_data_quality_issues
       SET status = 'resolved', resolved_at = NOW(), resolved_by = ?, resolution_note = ?
       WHERE id = ? AND project_id = ?`,
        userId,
        note,
        issueId,
        projectId,
      );
      return (res.changes ?? 0) > 0;
    },
    { readOnly: false },
  );
}
