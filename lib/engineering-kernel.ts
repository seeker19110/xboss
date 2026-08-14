import { z } from "zod";
import { query, queryOne, withProjectScope } from "@/lib/db";

export const engineeringObjectTypeSchema = z.string().trim().min(1).max(80);
export const disciplineSchema = z.string().trim().max(80).nullable().optional();

export const engineeringObjectInputSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  objectType: engineeringObjectTypeSchema,
  discipline: disciplineSchema,
  externalKey: z.string().trim().max(255).nullable().optional(),
  name: z.string().trim().max(500).nullable().optional(),
  properties: z.record(z.string(), z.unknown()).default({}),
  geometryRef: z.record(z.string(), z.unknown()).default({}),
  sourceRevisionId: z.string().uuid().nullable().optional(),
});

export const engineeringObjectRevisionInputSchema = z.object({
  objectId: z.string().uuid(),
  sourceRevisionId: z.string().uuid().nullable().optional(),
  changeReason: z.string().trim().max(1000).nullable().optional(),
});

export const engineeringRelationInputSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  fromObjectId: z.string().uuid(),
  toObjectId: z.string().uuid(),
  relationType: z.string().trim().min(1).max(100),
  properties: z.record(z.string(), z.unknown()).default({}),
  sourceRevisionId: z.string().uuid().nullable().optional(),
});

export const engineeringSourceInputSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  sourceType: z.enum(["drawing", "document", "bim", "cad", "model", "photo", "spreadsheet", "other"]),
  title: z.string().trim().min(1).max(500),
  objectKey: z.string().trim().max(2000).nullable().optional(),
  mimeType: z.string().trim().max(255).nullable().optional(),
  sha256: z.string().trim().regex(/^[a-f0-9]{64}$/i).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const engineeringSourceRevisionInputSchema = z.object({
  sourceId: z.string().uuid(),
  revisionNo: z.coerce.number().int().positive(),
  objectKey: z.string().trim().max(2000).nullable().optional(),
  sha256: z.string().trim().regex(/^[a-f0-9]{64}$/i).nullable().optional(),
  parserName: z.string().trim().max(255).nullable().optional(),
  parserVersion: z.string().trim().max(255).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type EngineeringObjectInput = z.infer<typeof engineeringObjectInputSchema>;
export type EngineeringRelationInput = z.infer<typeof engineeringRelationInputSchema>;
export type EngineeringSourceInput = z.infer<typeof engineeringSourceInputSchema>;
export type EngineeringSourceRevisionInput = z.infer<typeof engineeringSourceRevisionInputSchema>;

export async function listEngineeringObjects(projectId: number, opts?: { objectType?: string; limit?: number }) {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  return withProjectScope(projectId, () =>
    query(
      `SELECT id, project_id AS "projectId", object_type AS "objectType", discipline,
              external_key AS "externalKey", name, status, properties, geometry_ref AS "geometryRef",
              source_revision_id AS "sourceRevisionId", created_by AS "createdBy", updated_by AS "updatedBy",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM engineering_objects
       WHERE project_id = ? AND status <> 'void'
         AND (? IS NULL OR object_type = ?)
       ORDER BY created_at DESC
       LIMIT ?`,
      projectId,
      opts?.objectType ?? null,
      opts?.objectType ?? null,
      limit,
    ),
  );
}

export async function getEngineeringObject(projectId: number, id: string) {
  return withProjectScope(projectId, () =>
    queryOne(
      `SELECT id, project_id AS "projectId", object_type AS "objectType", discipline,
              external_key AS "externalKey", name, status, properties, geometry_ref AS "geometryRef",
              source_revision_id AS "sourceRevisionId", created_by AS "createdBy", updated_by AS "updatedBy",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM engineering_objects
       WHERE project_id = ? AND id = ?`,
      projectId,
      id,
    ),
  );
}

export async function getEngineeringRelations(projectId: number, objectId: string) {
  return withProjectScope(projectId, () =>
    query(
      `SELECT id, project_id AS "projectId", from_object_id AS "fromObjectId",
              to_object_id AS "toObjectId", relation_type AS "relationType", properties,
              source_revision_id AS "sourceRevisionId", created_by AS "createdBy", created_at AS "createdAt"
       FROM engineering_object_relations
       WHERE project_id = ? AND (from_object_id = ? OR to_object_id = ?)
       ORDER BY created_at DESC`,
      projectId,
      objectId,
      objectId,
    ),
  );
}

export async function listEngineeringSources(projectId: number, limit = 100) {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  return withProjectScope(projectId, () =>
    query(
      `SELECT id, project_id AS "projectId", source_type AS "sourceType", title,
              object_key AS "objectKey", mime_type AS "mimeType", sha256, metadata,
              created_by AS "createdBy", created_at AS "createdAt"
       FROM engineering_sources
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      projectId,
      safeLimit,
    ),
  );
}

export async function getEngineeringSource(projectId: number, id: string) {
  return withProjectScope(projectId, () =>
    queryOne(
      `SELECT id, project_id AS "projectId", source_type AS "sourceType", title,
              object_key AS "objectKey", mime_type AS "mimeType", sha256, metadata,
              created_by AS "createdBy", created_at AS "createdAt"
       FROM engineering_sources
       WHERE project_id = ? AND id = ?`,
      projectId,
      id,
    ),
  );
}

export async function listSourceRevisions(projectId: number, sourceId: string) {
  return withProjectScope(projectId, () =>
    query(
      `SELECT r.id, r.source_id AS "sourceId", r.revision_no AS "revisionNo", r.object_key AS "objectKey",
              r.sha256, r.parser_name AS "parserName", r.parser_version AS "parserVersion",
              r.metadata, r.created_by AS "createdBy", r.created_at AS "createdAt"
       FROM engineering_source_revisions r
       JOIN engineering_sources s ON s.id = r.source_id
       WHERE s.project_id = ? AND r.source_id = ?
       ORDER BY r.revision_no DESC`,
      projectId,
      sourceId,
    ),
  );
}

export async function createEngineeringObject(input: EngineeringObjectInput, userId: number) {
  return queryOne(
    `INSERT INTO engineering_objects
       (project_id, object_type, discipline, external_key, name, properties, geometry_ref, source_revision_id, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?)
     RETURNING id, project_id AS "projectId", object_type AS "objectType", discipline,
               external_key AS "externalKey", name, status, properties, geometry_ref AS "geometryRef",
               source_revision_id AS "sourceRevisionId", created_by AS "createdBy", updated_by AS "updatedBy",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    input.projectId,
    input.objectType,
    input.discipline ?? null,
    input.externalKey ?? null,
    input.name ?? null,
    JSON.stringify(input.properties),
    JSON.stringify(input.geometryRef),
    input.sourceRevisionId ?? null,
    userId,
    userId,
  );
}

export async function createEngineeringSource(input: EngineeringSourceInput, userId: number) {
  return queryOne(
    `INSERT INTO engineering_sources
       (project_id, source_type, title, object_key, mime_type, sha256, metadata, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?)
     RETURNING id, project_id AS "projectId", source_type AS "sourceType", title,
               object_key AS "objectKey", mime_type AS "mimeType", sha256, metadata,
               created_by AS "createdBy", created_at AS "createdAt"`,
    input.projectId,
    input.sourceType,
    input.title,
    input.objectKey ?? null,
    input.mimeType ?? null,
    input.sha256 ?? null,
    JSON.stringify(input.metadata),
    userId,
  );
}

export async function createSourceRevision(input: EngineeringSourceRevisionInput, userId: number) {
  return queryOne(
    `INSERT INTO engineering_source_revisions
       (source_id, revision_no, object_key, sha256, parser_name, parser_version, metadata, created_by)
     SELECT ?, ?, ?, ?, ?, ?, ?::jsonb, ?
     WHERE EXISTS (SELECT 1 FROM engineering_sources s WHERE s.id = ?)
     RETURNING id, source_id AS "sourceId", revision_no AS "revisionNo", object_key AS "objectKey",
               sha256, parser_name AS "parserName", parser_version AS "parserVersion", metadata,
               created_by AS "createdBy", created_at AS "createdAt"`,
    input.sourceId,
    input.revisionNo,
    input.objectKey ?? null,
    input.sha256 ?? null,
    input.parserName ?? null,
    input.parserVersion ?? null,
    JSON.stringify(input.metadata),
    userId,
    input.sourceId,
  );
}

export async function createEngineeringRelation(input: EngineeringRelationInput, userId: number) {
  return queryOne(
    `INSERT INTO engineering_object_relations
       (project_id, from_object_id, to_object_id, relation_type, properties, source_revision_id, created_by)
     VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)
     RETURNING id, project_id AS "projectId", from_object_id AS "fromObjectId",
               to_object_id AS "toObjectId", relation_type AS "relationType", properties,
               source_revision_id AS "sourceRevisionId", created_by AS "createdBy", created_at AS "createdAt"`,
    input.projectId,
    input.fromObjectId,
    input.toObjectId,
    input.relationType,
    JSON.stringify(input.properties),
    input.sourceRevisionId ?? null,
    userId,
  );
}

export async function createObjectRevision(input: z.infer<typeof engineeringObjectRevisionInputSchema>, userId: number) {
  return queryOne(
    `INSERT INTO engineering_object_revisions
       (object_id, revision_no, source_revision_id, object_type, discipline, name, status, properties, geometry_ref, change_reason, created_by)
     SELECT o.id,
            COALESCE((SELECT MAX(r.revision_no) FROM engineering_object_revisions r WHERE r.object_id = o.id), 0) + 1,
            ?, o.object_type, o.discipline, o.name, o.status, o.properties, o.geometry_ref, ?, ?
     FROM engineering_objects o
     WHERE o.id = ?
     RETURNING id, object_id AS "objectId", revision_no AS "revisionNo", source_revision_id AS "sourceRevisionId",
               object_type AS "objectType", discipline, name, status, properties, geometry_ref AS "geometryRef",
               change_reason AS "changeReason", created_by AS "createdBy", created_at AS "createdAt"`,
    input.sourceRevisionId ?? null,
    input.changeReason ?? null,
    userId,
    input.objectId,
  );
}
