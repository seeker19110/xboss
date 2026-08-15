import { createHash } from "node:crypto";
import { queryOne, run } from "@/lib/db";

// Sổ lũy đẳng cho POST /api/v1/engineering/ingest (ENG-5 §3.1/§3.3).
// Quy tắc hợp đồng:
//   - cùng Idempotency-Key + cùng body hash  → trả LẠI NGUYÊN response cũ, HTTP 200 (replay)
//   - cùng Idempotency-Key + body KHÁC       → HTTP 409 (client dùng lại key cho payload khác)
//   - key mới                                 → xử lý thật, ghi sổ, HTTP 201
// Bảng: engineering_ingest_requests (migrations/0088), unique (project_id, idempotency_key).

export function hashRequestBody(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export type StoredIngestRequest = {
  requestSha256: string;
  responseStatus: number;
  responseBody: unknown;
  correlationId: string | null;
};

export async function findIngestRequest(
  projectId: number,
  idempotencyKey: string,
): Promise<StoredIngestRequest | undefined> {
  return queryOne<StoredIngestRequest>(
    `SELECT request_sha256 AS "requestSha256", response_status AS "responseStatus",
            response_body AS "responseBody", correlation_id AS "correlationId"
       FROM engineering_ingest_requests
      WHERE project_id = ? AND idempotency_key = ?`,
    projectId,
    idempotencyKey,
  );
}

// Ghi sổ sau khi xử lý xong. ON CONFLICT DO NOTHING: nếu 2 request song song cùng key cùng
// lọt tới đây thì bản ghi đầu thắng — bản sau không ghi đè response đã trả cho client trước.
export async function saveIngestRequest(args: {
  projectId: number;
  idempotencyKey: string;
  requestSha256: string;
  responseStatus: number;
  responseBody: unknown;
  correlationId: string | null;
  apiKeyId: number | null;
  contractVersion: string | null;
}): Promise<void> {
  await run(
    `INSERT INTO engineering_ingest_requests
       (project_id, idempotency_key, request_sha256, status, response_status, response_body,
        correlation_id, api_key_id, contract_version)
     VALUES (?, ?, ?, 'completed', ?, ?::jsonb, ?, ?, ?)
     ON CONFLICT (project_id, idempotency_key) DO NOTHING`,
    args.projectId,
    args.idempotencyKey,
    args.requestSha256,
    args.responseStatus,
    JSON.stringify(args.responseBody),
    args.correlationId,
    args.apiKeyId,
    args.contractVersion,
  );
}
