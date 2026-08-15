import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { requireApiKey } from "@/lib/api-keys";
import {
  engineeringSourceExternalInputSchema,
  engineeringSourceRevisionExternalInputSchema,
  engineeringObjectExternalInputSchema,
  engineeringRelationInputSchema,
  engineeringRelationExternalInputSchema,
  upsertEngineeringSourceFromExternal,
  upsertSourceRevisionFromExternal,
  upsertEngineeringObjectFromExternal,
  upsertEngineeringRelationFromExternal,
  createEngineeringRelation,
  EngineeringContractError,
} from "@/lib/engineering-kernel";
import { hashRequestBody, findIngestRequest, saveIngestRequest } from "@/lib/engineering-ingest";

export const dynamic = "force-dynamic";

// Giới hạn cứng theo ENG-5 §3.1 — chặn payload khổng lồ làm nghẽn transaction/bộ nhớ.
const MAX_OBJECTS = 500;
const MAX_RELATIONS = 2000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MiB

// Lỗi hợp đồng kèm vị trí theo JSON Pointer (§3.1: 422 trả lỗi theo JSON Pointer).
class ValidationError extends Error {
  constructor(
    message: string,
    readonly pointer: string,
  ) {
    super(message);
  }
}

// zod trả path kiểu PropertyKey[] (có thể lẫn symbol) — lọc bỏ symbol trước khi ghép thành
// JSON Pointer, tránh "Symbol()" lọt vào thông báo lỗi trả cho client.
function firstIssue(err: { issues: readonly { message?: string; path?: PropertyKey[] }[] }) {
  const i = err.issues[0];
  const segs = (i?.path ?? []).filter((p): p is string | number => typeof p !== "symbol");
  return {
    message: i?.message ?? "không hợp lệ",
    suffix: segs.length ? `/${segs.join("/")}` : "",
  };
}

// POST /api/v1/engineering/ingest — kho nhận Engineering Object từ hệ thống ngoài
// (ENG-1 + hợp đồng ENG-5, xem docs/nang-cap/ENG-5-integration-contract-pilot.md).
// Auth qua API key scope "engineering", 1 dự án/key (boundary track ENG-*, xem ENG-0 mục 4).
// Object mới LUÔN `pending_review` — không có đường nào trong route này tự chuyển sang
// `approved`, không ảnh hưởng boq_items/cost cho tới khi Admin/PM duyệt qua
// POST /api/engineering/objects/:id/review.
export async function POST(req: NextRequest) {
  const ctx = await requireApiKey(req, "engineering");
  if (ctx instanceof Response) return ctx;
  const { auth, projectId } = ctx;

  const correlationId = req.headers.get("x-correlation-id")?.trim() || randomUUID();
  const headers = { "X-Correlation-Id": correlationId };

  // Idempotency-Key bắt buộc (§3.1) — không có thì agent không thể retry an toàn.
  const idempotencyKey = req.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey)
    return NextResponse.json(
      { error: "Thiếu header Idempotency-Key (bắt buộc)", pointer: "/headers/Idempotency-Key" },
      { status: 422, headers },
    );

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES)
    return NextResponse.json(
      { error: `Body vượt giới hạn ${MAX_BODY_BYTES} byte`, pointer: "" },
      { status: 413, headers },
    );

  const requestSha256 = hashRequestBody(raw);

  // Replay: cùng key + cùng body → trả lại NGUYÊN response cũ (200). Body khác → 409.
  const prior = await findIngestRequest(projectId, idempotencyKey);
  if (prior) {
    if (prior.requestSha256 !== requestSha256)
      return NextResponse.json(
        {
          error: "Idempotency-Key đã dùng cho payload khác",
          pointer: "/headers/Idempotency-Key",
        },
        { status: 409, headers },
      );
    return NextResponse.json(prior.responseBody, { status: 200, headers });
  }

  const body = (() => {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json(
      { error: "Body JSON không hợp lệ", pointer: "" },
      { status: 422, headers },
    );

  const contractVersion = typeof body.contractVersion === "string" ? body.contractVersion : null;

  const rawObjects = Array.isArray(body.objects) ? (body.objects as unknown[]) : [];
  if (rawObjects.length === 0)
    return NextResponse.json(
      { error: "objects rỗng — cần ít nhất 1 object", pointer: "/objects" },
      { status: 422, headers },
    );
  if (rawObjects.length > MAX_OBJECTS)
    return NextResponse.json(
      { error: `objects vượt giới hạn ${MAX_OBJECTS} phần tử/request`, pointer: "/objects" },
      { status: 422, headers },
    );

  const rawRelations = Array.isArray(body.relations) ? (body.relations as unknown[]) : [];
  if (rawRelations.length > MAX_RELATIONS)
    return NextResponse.json(
      { error: `relations vượt giới hạn ${MAX_RELATIONS} phần tử/request`, pointer: "/relations" },
      { status: 422, headers },
    );

  try {
    const result = await withTransaction(async () => {
      let sourceRevisionId: string | null = null;

      const rawSource = body.source;
      if (rawSource && typeof rawSource === "object" && !Array.isArray(rawSource)) {
        const s = rawSource as Record<string, unknown>;
        const sourceParsed = engineeringSourceExternalInputSchema.safeParse({ ...s, projectId });
        if (!sourceParsed.success) {
          const { message, suffix } = firstIssue(sourceParsed.error);
          throw new ValidationError(`source: ${message}`, `/source${suffix}`);
        }
        const source = await upsertEngineeringSourceFromExternal(sourceParsed.data, auth.createdBy);

        // revision nằm lồng trong source theo payload chuẩn §3.2; vẫn chấp nhận dạng phẳng
        // (trường đặt thẳng trên source) để không phá caller cũ.
        const rawRev =
          s.revision && typeof s.revision === "object" && !Array.isArray(s.revision)
            ? (s.revision as Record<string, unknown>)
            : s;
        const revisionParsed = engineeringSourceRevisionExternalInputSchema.safeParse({
          sourceId: source.id,
          externalRevisionKey: rawRev.externalRevisionKey,
          revisionNo: rawRev.revisionNo ?? null,
          objectKey: rawRev.objectKey ?? null,
          sha256: rawRev.sha256 ?? null,
          parserName: rawRev.parserName ?? null,
          parserVersion: rawRev.parserVersion ?? null,
          metadata: rawRev.metadata ?? {},
        });
        if (!revisionParsed.success) {
          const { message, suffix } = firstIssue(revisionParsed.error);
          throw new ValidationError(
            `source.revision: ${message}`,
            `/source/revision${suffix.replace(/^\/(sourceId)$/, "")}`,
          );
        }
        const revision = await upsertSourceRevisionFromExternal(
          revisionParsed.data,
          auth.createdBy,
        );
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
        if (!parsed.success) {
          const { message, suffix } = firstIssue(parsed.error);
          throw new ValidationError(`objects[${i}]: ${message}`, `/objects/${i}${suffix}`);
        }
        const r = await upsertEngineeringObjectFromExternal(parsed.data, auth.createdBy);
        objectsResult.push({ externalKey: parsed.data.externalKey, id: r.id, created: r.created });
      }

      const relationsResult: { id: string; created: boolean }[] = [];
      for (let i = 0; i < rawRelations.length; i++) {
        const rel = rawRelations[i] as Record<string, unknown>;
        const pointer = `/relations/${i}`;

        // Đường chuẩn ENG-5: 2 đầu là external key. Giữ nhánh UUID cũ để tương thích ngược
        // (§5.5 — v1 chỉ được thay đổi theo kiểu additive).
        if (rel.fromExternalKey !== undefined || rel.toExternalKey !== undefined) {
          const parsed = engineeringRelationExternalInputSchema.safeParse({
            ...rel,
            projectId,
            sourceRevisionId: rel.sourceRevisionId ?? sourceRevisionId,
          });
          if (!parsed.success) {
            const { message, suffix } = firstIssue(parsed.error);
            throw new ValidationError(`relations[${i}]: ${message}`, `${pointer}${suffix}`);
          }
          const r = await upsertEngineeringRelationFromExternal(
            parsed.data,
            auth.createdBy,
            pointer,
          );
          relationsResult.push(r);
          continue;
        }

        const parsed = engineeringRelationInputSchema.safeParse({
          ...rel,
          projectId,
          sourceRevisionId: rel.sourceRevisionId ?? sourceRevisionId,
        });
        if (!parsed.success) {
          const { message, suffix } = firstIssue(parsed.error);
          throw new ValidationError(`relations[${i}]: ${message}`, `${pointer}${suffix}`);
        }
        const created = (await createEngineeringRelation(parsed.data, auth.createdBy)) as
          { id: string } | undefined;
        relationsResult.push({ id: created?.id ?? "", created: true });
      }

      return {
        contractVersion,
        correlationId,
        sourceRevisionId,
        objects: objectsResult,
        relations: relationsResult,
      };
    });

    // Ghi sổ lũy đẳng SAU khi transaction nghiệp vụ commit — nếu bước này hỏng thì lần retry
    // sau xử lý lại từ đầu, vẫn an toàn vì mọi upsert bên trong đều lũy đẳng theo external key.
    await saveIngestRequest({
      projectId,
      idempotencyKey,
      requestSha256,
      responseStatus: 201,
      responseBody: result,
      correlationId,
      apiKeyId: auth.keyId,
      contractVersion,
    });

    return NextResponse.json(result, { status: 201, headers });
  } catch (err) {
    if (err instanceof ValidationError)
      return NextResponse.json(
        { error: err.message, pointer: err.pointer },
        { status: 422, headers },
      );
    if (err instanceof EngineeringContractError)
      return NextResponse.json(
        { error: err.message, pointer: err.pointer },
        { status: 422, headers },
      );
    throw err;
  }
}
