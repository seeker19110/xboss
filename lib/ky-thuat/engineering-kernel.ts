import { z } from "zod";
import { query, queryOne, run, withProjectScope, withTransaction } from "@/lib/db";
import { loiKhongTimThay, loiXungDot } from "@/lib/nen/loi";

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
  sourceType: z.enum([
    "drawing",
    "document",
    "bim",
    "cad",
    "model",
    "photo",
    "spreadsheet",
    "other",
  ]),
  title: z.string().trim().min(1).max(500),
  objectKey: z.string().trim().max(2000).nullable().optional(),
  mimeType: z.string().trim().max(255).nullable().optional(),
  sha256: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i)
    .nullable()
    .optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const engineeringSourceRevisionInputSchema = z.object({
  sourceId: z.string().uuid(),
  revisionNo: z.coerce.number().int().positive(),
  objectKey: z.string().trim().max(2000).nullable().optional(),
  sha256: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i)
    .nullable()
    .optional(),
  parserName: z.string().trim().max(255).nullable().optional(),
  parserVersion: z.string().trim().max(255).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type EngineeringObjectInput = z.infer<typeof engineeringObjectInputSchema>;
export type EngineeringRelationInput = z.infer<typeof engineeringRelationInputSchema>;
export type EngineeringSourceInput = z.infer<typeof engineeringSourceInputSchema>;
export type EngineeringSourceRevisionInput = z.infer<typeof engineeringSourceRevisionInputSchema>;

export async function listEngineeringObjects(
  projectId: number,
  opts?: { objectType?: string; status?: string; limit?: number },
) {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  // Điều kiện lọc dựng ĐỘNG (không dùng "? IS NULL OR col = ?" với tham số đứng riêng) —
  // Postgres không suy được kiểu tham số khi vế trái của OR không so trực tiếp với cột,
  // lỗi thật "could not determine data type of parameter" (đúng lớp lỗi đã gặp ở M64 PR325,
  // xem PROGRESS.md). Pattern đúng: chỉ thêm điều kiện khi có giá trị lọc.
  const conds = ["project_id = ?", "status <> 'void'"];
  const args: unknown[] = [projectId];
  if (opts?.objectType) {
    conds.push("object_type = ?");
    args.push(opts.objectType);
  }
  if (opts?.status) {
    conds.push("status = ?");
    args.push(opts.status);
  }
  return withProjectScope(projectId, () =>
    query(
      `SELECT id, project_id AS "projectId", object_type AS "objectType", discipline,
              external_key AS "externalKey", name, status, properties, geometry_ref AS "geometryRef",
              source_revision_id AS "sourceRevisionId", created_by AS "createdBy", updated_by AS "updatedBy",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM engineering_objects
       WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ?`,
      ...args,
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

// 5 revision gần nhất của 1 object (ai đổi/khi nào/lý do) — dùng cho modal chi tiết
// trang /engineering (ENG-1 mục 9). JOIN engineering_objects chỉ để lọc đúng project_id
// (cách ly đa dự án) mà không cần cột project_id riêng trên bảng revision.
export async function listObjectRevisions(projectId: number, objectId: string, limit = 5) {
  return withProjectScope(projectId, () =>
    query(
      `SELECT r.id, r.object_id AS "objectId", r.revision_no AS "revisionNo",
              r.source_revision_id AS "sourceRevisionId", r.object_type AS "objectType",
              r.discipline, r.name, r.status, r.change_reason AS "changeReason",
              r.created_by AS "createdBy", r.created_at AS "createdAt"
       FROM engineering_object_revisions r
       JOIN engineering_objects o ON o.id = r.object_id
       WHERE o.project_id = ? AND r.object_id = ?
       ORDER BY r.revision_no DESC
       LIMIT ?`,
      projectId,
      objectId,
      limit,
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
    // project_id LẤY TỪ CHÍNH SOURCE CHA (s.project_id) chứ không nhận từ bên gọi — bất
    // biến "revision cùng dự án với source" (C3 §3) đúng ngay từ lúc ghi, không phụ thuộc
    // caller truyền đúng. FK composite ở 0089 là lưới an toàn thứ 2.
    `INSERT INTO engineering_source_revisions
       (source_id, project_id, revision_no, object_key, sha256, parser_name, parser_version, metadata, created_by)
     SELECT s.id, s.project_id, ?, ?, ?, ?, ?, ?::jsonb, ?
       FROM engineering_sources s WHERE s.id = ?
     RETURNING id, source_id AS "sourceId", revision_no AS "revisionNo", object_key AS "objectKey",
               sha256, parser_name AS "parserName", parser_version AS "parserVersion", metadata,
               created_by AS "createdBy", created_at AS "createdAt"`,
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

export async function createObjectRevision(
  input: z.infer<typeof engineeringObjectRevisionInputSchema>,
  userId: number,
) {
  return queryOne(
    // project_id lấy thẳng từ chính dòng object đang SELECT (`o.project_id`) — 0091 bắt buộc
    // cột này NOT NULL, và lấy từ cha thì bản ghi lịch sử không thể lệch dự án.
    `INSERT INTO engineering_object_revisions
       (object_id, project_id, revision_no, source_revision_id, object_type, discipline, name, status, properties, geometry_ref, change_reason, created_by)
     SELECT o.id, o.project_id,
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

// --- M65 PR1 — kho nhận từ MEP-Agents (docs/nang-cap/M65-tich-hop-mep-agents-engineering-core.md) ---

export const engineeringObjectExternalInputSchema = engineeringObjectInputSchema.extend({
  // Ingest từ hệ thống ngoài LUÔN phải có externalKey (khác input tạo tay trong XBoss, nơi
  // trường này optional) — đây là object_id bất biến bên MEP-Agents, dùng để idempotent.
  externalKey: z.string().trim().min(1).max(255),
});
export type EngineeringObjectExternalInput = z.infer<typeof engineeringObjectExternalInputSchema>;

// Upsert theo (project_id, external_key) — MEP-Agents gửi lại cùng object (object_id bất
// biến phía họ) không được tạo dòng mới. Có sẵn thì UPDATE properties/geometry_ref/name/
// discipline/object_type, GIỮ NGUYÊN status (object đã duyệt nhận bản cập nhật không tự
// mất trạng thái duyệt — "duyệt lại khi đổi" là quyết định để dành PR2). Chưa có thì INSERT
// như createEngineeringObject. Cả 2 nhánh đều ghi 1 dòng vào engineering_object_revisions
// để có lịch sử (change_reason cố định theo nhánh).
export async function upsertEngineeringObjectFromExternal(
  input: EngineeringObjectExternalInput,
  userId: number,
): Promise<{ id: string; created: boolean }> {
  return withTransaction(async () => {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM engineering_objects WHERE project_id = ? AND external_key = ?`,
      input.projectId,
      input.externalKey,
    );
    if (existing) {
      await run(
        `UPDATE engineering_objects
            SET object_type = ?, discipline = ?, name = ?, properties = ?::jsonb, geometry_ref = ?::jsonb,
                source_revision_id = ?, updated_by = ?, updated_at = NOW()
          WHERE id = ?`,
        input.objectType,
        input.discipline ?? null,
        input.name ?? null,
        JSON.stringify(input.properties),
        JSON.stringify(input.geometryRef),
        input.sourceRevisionId ?? null,
        userId,
        existing.id,
      );
      await createObjectRevision(
        {
          objectId: existing.id,
          sourceRevisionId: input.sourceRevisionId ?? null,
          changeReason: "Cập nhật từ MEP-Agents (ingest)",
        },
        userId,
      );
      return { id: existing.id, created: false };
    }
    const created = (await createEngineeringObject(input, userId)) as { id: string } | undefined;
    if (!created) throw new Error("Tạo đối tượng kỹ thuật thất bại");
    await createObjectRevision(
      {
        objectId: created.id,
        sourceRevisionId: input.sourceRevisionId ?? null,
        changeReason: "Tạo mới từ MEP-Agents (ingest)",
      },
      userId,
    );
    return { id: created.id, created: true };
  });
}

// ---------------------------------------------------------------------------------------
// ENG-5 (C1) — ingest theo EXTERNAL KEY, lũy đẳng khi agent retry.
// Đặc tả: docs/nang-cap/ENG-5-integration-contract-pilot.md §2.2/§3.3.
// Vì sao: agent ngoài KHÔNG biết UUID nội bộ của XBoss, nên mọi tham chiếu nó gửi sang phải
// là khoá bền vững của chính nó. Ràng buộc DB tương ứng ở migrations/0088.
// ---------------------------------------------------------------------------------------

export const engineeringSourceExternalInputSchema = engineeringSourceInputSchema.extend({
  externalKey: z.string().trim().min(1).max(255),
});
export type EngineeringSourceExternalInput = z.infer<typeof engineeringSourceExternalInputSchema>;

export const engineeringSourceRevisionExternalInputSchema = z.object({
  sourceId: z.string().uuid(),
  externalRevisionKey: z.string().trim().min(1).max(255),
  revisionNo: z.coerce.number().int().positive().nullable().optional(),
  objectKey: z.string().trim().max(2000).nullable().optional(),
  sha256: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i)
    .nullable()
    .optional(),
  parserName: z.string().trim().max(255).nullable().optional(),
  parserVersion: z.string().trim().max(255).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type EngineeringSourceRevisionExternalInput = z.infer<
  typeof engineeringSourceRevisionExternalInputSchema
>;

// Relation gửi từ agent: 2 đầu là external key, KHÔNG phải UUID (ENG-5 §2.2).
export const engineeringRelationExternalInputSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  fromExternalKey: z.string().trim().min(1).max(255),
  toExternalKey: z.string().trim().min(1).max(255),
  relationType: z.string().trim().min(1).max(100),
  properties: z.record(z.string(), z.unknown()).default({}),
  sourceRevisionId: z.string().uuid().nullable().optional(),
});
export type EngineeringRelationExternalInput = z.infer<
  typeof engineeringRelationExternalInputSchema
>;

// Upsert source theo (project_id, external_key). Retry cùng externalKey KHÔNG tạo source mới
// — cập nhật metadata mô tả rồi trả lại đúng id cũ.
export async function upsertEngineeringSourceFromExternal(
  input: EngineeringSourceExternalInput,
  userId: number,
): Promise<{ id: string; created: boolean }> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM engineering_sources WHERE project_id = ? AND external_key = ?`,
    input.projectId,
    input.externalKey,
  );
  if (existing) {
    await run(
      `UPDATE engineering_sources
          SET source_type = ?, title = ?, object_key = ?, mime_type = ?, sha256 = ?,
              metadata = ?::jsonb
        WHERE id = ?`,
      input.sourceType,
      input.title,
      input.objectKey ?? null,
      input.mimeType ?? null,
      input.sha256 ?? null,
      JSON.stringify(input.metadata),
      existing.id,
    );
    return { id: existing.id, created: false };
  }
  const created = await queryOne<{ id: string }>(
    `INSERT INTO engineering_sources
       (project_id, source_type, title, external_key, object_key, mime_type, sha256, metadata, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)
     RETURNING id`,
    input.projectId,
    input.sourceType,
    input.title,
    input.externalKey,
    input.objectKey ?? null,
    input.mimeType ?? null,
    input.sha256 ?? null,
    JSON.stringify(input.metadata),
    userId,
  );
  if (!created) throw new Error("Tạo nguồn kỹ thuật thất bại");
  return { id: created.id, created: true };
}

// Upsert revision theo (source_id, external_revision_key). `revisionNo` chỉ để HIỂN THỊ
// (ENG-5 §3.3) — agent không gửi thì tự cấp số tiếp theo. Khoá dòng source (FOR UPDATE)
// trước khi tính MAX(revision_no) để 2 request song song không cùng lấy một số (§4).
export async function upsertSourceRevisionFromExternal(
  input: EngineeringSourceRevisionExternalInput,
  userId: number,
): Promise<{ id: string; created: boolean; revisionNo: number }> {
  const existing = await queryOne<{ id: string; revisionNo: number }>(
    `SELECT id, revision_no AS "revisionNo" FROM engineering_source_revisions
      WHERE source_id = ? AND external_revision_key = ?`,
    input.sourceId,
    input.externalRevisionKey,
  );
  if (existing) return { id: existing.id, created: false, revisionNo: existing.revisionNo };

  // Khoá source để nối tiếp revision_no an toàn khi có request đồng thời.
  await queryOne(`SELECT id FROM engineering_sources WHERE id = ? FOR UPDATE`, input.sourceId);
  const next = await queryOne<{ n: number }>(
    `SELECT COALESCE(MAX(revision_no), 0) + 1 AS n FROM engineering_source_revisions WHERE source_id = ?`,
    input.sourceId,
  );
  const revisionNo = input.revisionNo ?? next?.n ?? 1;
  const created = await queryOne<{ id: string; revisionNo: number }>(
    // Như createSourceRevision: project_id suy từ source cha, không nhận từ bên gọi (C3 §3).
    `INSERT INTO engineering_source_revisions
       (source_id, project_id, revision_no, external_revision_key, object_key, sha256, parser_name,
        parser_version, metadata, created_by)
     SELECT s.id, s.project_id, ?, ?, ?, ?, ?, ?, ?::jsonb, ?
       FROM engineering_sources s WHERE s.id = ?
     RETURNING id, revision_no AS "revisionNo"`,
    revisionNo,
    input.externalRevisionKey,
    input.objectKey ?? null,
    input.sha256 ?? null,
    input.parserName ?? null,
    input.parserVersion ?? null,
    JSON.stringify(input.metadata),
    userId,
    input.sourceId,
  );
  if (!created) throw new Error("Tạo revision nguồn thất bại");
  return { id: created.id, created: true, revisionNo: created.revisionNo };
}

// Lỗi có vị trí lỗi theo JSON Pointer (ENG-5 §3.1: 422 trả lỗi theo JSON Pointer).
export class EngineeringContractError extends Error {
  constructor(
    message: string,
    readonly pointer: string,
  ) {
    super(message);
    this.name = "EngineeringContractError";
  }
}

// Resolve 2 external key → UUID rồi upsert relation. Lũy đẳng nhờ unique index logic
// uq_engineering_object_relations_logical (0088) — retry KHÔNG nhân bản relation.
// Cách ly dự án được DB bảo đảm bằng composite FK; ở đây chỉ resolve trong đúng project
// nên key của dự án khác coi như "không tồn tại" (không lộ sự tồn tại của dữ liệu dự án khác).
export async function upsertEngineeringRelationFromExternal(
  input: EngineeringRelationExternalInput,
  userId: number,
  pointerPrefix = "",
): Promise<{ id: string; created: boolean }> {
  const ends = await query<{ externalKey: string; id: string }>(
    `SELECT external_key AS "externalKey", id FROM engineering_objects
      WHERE project_id = ? AND external_key IN (?, ?)`,
    input.projectId,
    input.fromExternalKey,
    input.toExternalKey,
  );
  const byKey = new Map(ends.map((r) => [r.externalKey, r.id]));
  const fromId = byKey.get(input.fromExternalKey);
  const toId = byKey.get(input.toExternalKey);
  if (!fromId)
    throw new EngineeringContractError(
      `fromExternalKey "${input.fromExternalKey}" không tồn tại trong dự án này`,
      `${pointerPrefix}/fromExternalKey`,
    );
  if (!toId)
    throw new EngineeringContractError(
      `toExternalKey "${input.toExternalKey}" không tồn tại trong dự án này`,
      `${pointerPrefix}/toExternalKey`,
    );

  const created = await queryOne<{ id: string }>(
    `INSERT INTO engineering_object_relations
       (project_id, from_object_id, to_object_id, relation_type, properties, source_revision_id, created_by)
     VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    input.projectId,
    fromId,
    toId,
    input.relationType,
    JSON.stringify(input.properties),
    input.sourceRevisionId ?? null,
    userId,
  );
  if (created) return { id: created.id, created: true };

  // ON CONFLICT DO NOTHING → relation đã có sẵn (retry). Đọc lại id để trả về ổn định.
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM engineering_object_relations
      WHERE project_id = ? AND from_object_id = ? AND to_object_id = ? AND relation_type = ?
        AND COALESCE(source_revision_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(?::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
    input.projectId,
    fromId,
    toId,
    input.relationType,
    input.sourceRevisionId ?? null,
  );
  if (!existing) throw new Error("Không resolve được relation sau ON CONFLICT");
  return { id: existing.id, created: false };
}

// Chuyển status: chỉ pending_review/approved/rejected <-> nhau (KHÔNG đụng 'void' — soft-
// delete là thao tác riêng, ngoài phạm vi PR1). Ném lỗi nếu object không tồn tại/không
// thuộc projectId (cách ly đa dự án, pattern billBelongsToProject ở lib/finance.ts) — route
// gọi hàm này tự bắt lỗi để trả 404. Ghi lịch sử qua createObjectRevision thay vì thêm cột
// reviewed_by/reviewed_at riêng (tránh 2 nơi lưu cùng 1 sự thật — xem mục 4 đặc tả).
export async function reviewEngineeringObject(
  projectId: number,
  objectId: string,
  decision: "approved" | "rejected",
  reviewerId: number,
  note?: string,
): Promise<void> {
  return withTransaction(async () => {
    const current = await queryOne<{ status: string }>(
      `SELECT status FROM engineering_objects WHERE id = ? AND project_id = ?`,
      objectId,
      projectId,
    );
    if (!current)
      throw loiKhongTimThay("Đối tượng kỹ thuật không tồn tại hoặc không thuộc dự án đang chọn");
    // 409 chứ không 422: đầu vào hợp lệ, chỉ là bản ghi đang ở trạng thái không cho duyệt.
    if (current.status === "void")
      throw loiXungDot("Đối tượng đã bị xoá mềm, không thể duyệt/từ chối");
    await run(
      `UPDATE engineering_objects SET status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`,
      decision,
      reviewerId,
      objectId,
    );
    await createObjectRevision(
      {
        objectId,
        sourceRevisionId: null,
        changeReason: note?.trim() || (decision === "approved" ? "Duyệt" : "Từ chối"),
      },
      reviewerId,
    );
  });
}
