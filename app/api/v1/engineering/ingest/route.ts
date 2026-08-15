import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { requireApiKey } from "@/lib/api-keys";
import {
  engineeringSourceInputSchema,
  engineeringSourceRevisionInputSchema,
  engineeringObjectExternalInputSchema,
  engineeringRelationInputSchema,
  createEngineeringSource,
  createSourceRevision,
  upsertEngineeringObjectFromExternal,
  createEngineeringRelation,
} from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

const MAX_OBJECTS = 500;

class ValidationError extends Error {}

// POST /api/v1/engineering/ingest — kho nhận Engineering Object từ hệ thống ngoài (ENG-1,
// docs/nang-cap/ENG-1-mep-agent-integration.md). Auth qua API key scope "engineering", 1
// dự án/key (boundary track ENG-*, xem docs/nang-cap/ENG-0-roadmap-tich-hop-engineering-os.md
// mục 4). Object mới LUÔN `pending_review` — không có đường nào trong route này tự chuyển
// sang `approved`, không ảnh hưởng boq_items/cost cho tới khi Admin/PM duyệt qua
// POST /api/engineering/objects/:id/review.
export async function POST(req: NextRequest) {
  const ctx = await requireApiKey(req, "engineering");
  if (ctx instanceof Response) return ctx;
  const { auth, projectId } = ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body JSON không hợp lệ" }, { status: 422 });

  const rawObjects = Array.isArray(body.objects) ? (body.objects as unknown[]) : [];
  if (rawObjects.length === 0)
    return NextResponse.json({ error: "objects rỗng — cần ít nhất 1 object" }, { status: 422 });
  if (rawObjects.length > MAX_OBJECTS)
    return NextResponse.json(
      { error: `objects vượt giới hạn ${MAX_OBJECTS} phần tử/request` },
      { status: 422 },
    );

  try {
    const result = await withTransaction(async () => {
      let sourceRevisionId: string | null = null;

      const rawSource = body.source;
      if (rawSource && typeof rawSource === "object") {
        const s = rawSource as Record<string, unknown>;
        const sourceParsed = engineeringSourceInputSchema.safeParse({ ...s, projectId });
        if (!sourceParsed.success)
          throw new ValidationError(
            `source: ${sourceParsed.error.issues[0]?.message ?? "không hợp lệ"}`,
          );
        const source = (await createEngineeringSource(sourceParsed.data, auth.createdBy)) as
          { id: string } | undefined;
        if (!source) throw new ValidationError("Tạo source thất bại");

        const revisionNo = Number(s.revisionNo);
        const revisionParsed = engineeringSourceRevisionInputSchema.safeParse({
          sourceId: source.id,
          revisionNo: Number.isFinite(revisionNo) && revisionNo > 0 ? revisionNo : 1,
          objectKey: s.objectKey ?? null,
          sha256: s.sha256 ?? null,
          parserName: s.parserName ?? null,
          parserVersion: s.parserVersion ?? null,
          metadata: s.metadata ?? {},
        });
        if (!revisionParsed.success)
          throw new ValidationError(
            `source.revision: ${revisionParsed.error.issues[0]?.message ?? "không hợp lệ"}`,
          );
        const revision = (await createSourceRevision(revisionParsed.data, auth.createdBy)) as
          { id: string } | undefined;
        if (!revision) throw new ValidationError("Tạo source revision thất bại");
        sourceRevisionId = revision.id;
      }

      const objectsResult: { externalKey: string; id: string; created: boolean }[] = [];
      for (let i = 0; i < rawObjects.length; i++) {
        const o = rawObjects[i] as Record<string, unknown>;
        const parsed = engineeringObjectExternalInputSchema.safeParse({
          ...o,
          projectId,
          sourceRevisionId: o.sourceRevisionId ?? sourceRevisionId,
        });
        if (!parsed.success)
          throw new ValidationError(
            `objects[${i}]: ${parsed.error.issues[0]?.message ?? "không hợp lệ"}`,
          );
        const r = await upsertEngineeringObjectFromExternal(parsed.data, auth.createdBy);
        objectsResult.push({ externalKey: parsed.data.externalKey, id: r.id, created: r.created });
      }

      const rawRelations = Array.isArray(body.relations) ? (body.relations as unknown[]) : [];
      for (let i = 0; i < rawRelations.length; i++) {
        const rel = rawRelations[i] as Record<string, unknown>;
        const parsed = engineeringRelationInputSchema.safeParse({
          ...rel,
          projectId,
          sourceRevisionId: rel.sourceRevisionId ?? sourceRevisionId,
        });
        if (!parsed.success)
          throw new ValidationError(
            `relations[${i}]: ${parsed.error.issues[0]?.message ?? "không hợp lệ"}`,
          );
        await createEngineeringRelation(parsed.data, auth.createdBy);
      }

      return { sourceRevisionId, objects: objectsResult };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError)
      return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
