import { query, queryOne, withProjectScope, withTransaction } from "@/lib/db";
import { todayISO } from "@/lib/nen/date";
import crypto from "crypto";

export type EsignDocumentType =
  "BBNT" | "RFA" | "MATERIAL_APPROVAL" | "METHOD_STATEMENT" | "SAFETY_PERMIT";
export type EsignStatus = "draft" | "pending" | "signed" | "rejected" | "cancelled";
export type SignerRole =
  "CONTRACTOR_ENGINEER" | "SUPERVISION_CONSULTANT" | "PROJECT_MANAGER" | "CLIENT_REP";

export interface EsignSignatoryInput {
  userId?: number | null;
  signerName: string;
  signerRole: SignerRole;
  signingOrder?: number;
}

export interface EsignSignatoryRow {
  id: string;
  envelopeId: string;
  projectId: number;
  userId: number | null;
  signerName: string;
  signerRole: SignerRole;
  signingOrder: number;
  status: "waiting" | "ready" | "signed" | "rejected";
  signatureData?: string | null;
  signedAt?: string | null;
  ipAddress?: string | null;
  geoLocation?: { lat: number; lng: number; accuracy?: number } | null;
}

export interface EsignEnvelopeRow {
  id: string;
  projectId: number;
  title: string;
  documentType: EsignDocumentType;
  referenceId: number | null;
  referenceCode: string | null;
  status: EsignStatus;
  documentHash: string;
  documentPayload: Record<string, unknown>;
  createdBy: number | null;
  createdAt: string;
  completedAt?: string | null;
  signatories?: EsignSignatoryRow[];
}

export function createDocumentEnvelopeHash(payload: Record<string, unknown>): string {
  const canonicalJson = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex");
}

export function generateCertificateCode(documentType: string): string {
  const dateStr = todayISO().replace(/-/g, "");
  const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CERT-${documentType}-${dateStr}-${randomSuffix}`;
}

export async function createEsignEnvelope(params: {
  projectId: number;
  title: string;
  documentType: EsignDocumentType;
  referenceId?: number | null;
  referenceCode?: string | null;
  documentPayload: Record<string, unknown>;
  signatories: EsignSignatoryInput[];
  createdBy?: number | null;
}): Promise<EsignEnvelopeRow> {
  const {
    projectId,
    title,
    documentType,
    referenceId = null,
    referenceCode = null,
    documentPayload,
    signatories,
    createdBy = null,
  } = params;

  const docHash = createDocumentEnvelopeHash(documentPayload);

  return withProjectScope(
    projectId,
    async () => {
      return withTransaction(async () => {
        const rows = await query<any>(
          `INSERT INTO engineering_esign_envelopes
           (project_id, title, document_type, reference_id, reference_code, status, document_hash, document_payload, created_by)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
         RETURNING id, project_id AS "projectId", title, document_type AS "documentType",
                   reference_id AS "referenceId", reference_code AS "referenceCode",
                   status, document_hash AS "documentHash", document_payload AS "documentPayload",
                   created_by AS "createdBy", created_at AS "createdAt"`,
          projectId,
          title,
          documentType,
          referenceId,
          referenceCode,
          docHash,
          JSON.stringify(documentPayload),
          createdBy,
        );

        const envelope = rows[0];

        const insertedSignatories: EsignSignatoryRow[] = [];
        for (let i = 0; i < signatories.length; i++) {
          const s = signatories[i];
          const initialStatus = (s.signingOrder || i + 1) === 1 ? "ready" : "waiting";
          const sRows = await query<any>(
            `INSERT INTO engineering_esign_signatories
             (envelope_id, project_id, user_id, signer_name, signer_role, signing_order, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           RETURNING id, envelope_id AS "envelopeId", project_id AS "projectId",
                     user_id AS "userId", signer_name AS "signerName", signer_role AS "signerRole",
                     signing_order AS "signingOrder", status, created_at AS "createdAt"`,
            envelope.id,
            projectId,
            s.userId || null,
            s.signerName,
            s.signerRole,
            s.signingOrder || i + 1,
            initialStatus,
          );
          insertedSignatories.push(sRows[0]);
        }

        envelope.signatories = insertedSignatories;
        return envelope;
      });
    },
    { readOnly: false },
  );
}

export async function generateSignerOtp(
  projectId: number,
  envelopeId: string,
  signatoryId: string,
): Promise<string> {
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await withProjectScope(
    projectId,
    async () => {
      await query(
        `UPDATE engineering_esign_signatories
       SET otp_code = ?, otp_expires_at = ?
       WHERE id = ? AND envelope_id = ? AND project_id = ?`,
        otpCode,
        expiresAt,
        signatoryId,
        envelopeId,
        projectId,
      );
    },
    { readOnly: false },
  );

  return otpCode;
}

// Lỗi ký có mã HTTP kèm theo để route trả đúng 403/409/422 thay vì gộp hết về 500.
export class EsignSignError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EsignSignError";
  }
}

// So mã OTP theo thời gian hằng số.
// TODO: gộp về `lib/bao-mat/otp.ts` (module dùng chung do việc V1 tạo) khi V1 đã tích hợp.
function soKhopOtp(nhap: string, luu: string): boolean {
  const a = Buffer.from(nhap, "utf8");
  const b = Buffer.from(luu, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface EsignSignatoryGuardRow {
  userId: number | null;
  status: string;
  otpCode?: string | null;
  otpExpiresAt?: string | null;
}

/**
 * Điều kiện được phép ký một signatory — hàm THUẦN để test được không cần Postgres.
 *
 * Vá 3 lỗ hổng (audit 2026-08-24): (1) `signatoryId` do client chọn nên một user ký được cả 3
 * bên; (2) OTP chỉ kiểm khi client tự nguyện gửi `otpCode` — bỏ trường đi là qua mặt; (3) chỉ
 * chặn `status='signed'` nên ký sai thứ tự được.
 */
export function kiemDieuKienKy(
  signatory: EsignSignatoryGuardRow,
  userId: number,
  otpCode?: string,
  bayGio: number = Date.now(),
): { ok: true } | { ok: false; status: number; message: string } {
  if (signatory.userId == null) {
    return { ok: false, status: 422, message: "Người ký chưa được gắn tài khoản hệ thống" };
  }
  if (Number(signatory.userId) !== userId) {
    return { ok: false, status: 403, message: "Bạn không phải người ký của mục này" };
  }
  if (signatory.status === "signed") {
    return { ok: false, status: 409, message: "Người này đã hoàn tất ký trước đó" };
  }
  if (signatory.status !== "ready") {
    return {
      ok: false,
      status: 409,
      message: `Chưa tới lượt ký của mục này (trạng thái hiện tại: ${signatory.status})`,
    };
  }
  // OTP đã phát thì BẮT BUỘC, không phụ thuộc việc client có gửi hay không.
  if (signatory.otpCode) {
    if (!otpCode) {
      return { ok: false, status: 422, message: "Thiếu mã OTP xác thực người ký" };
    }
    if (!soKhopOtp(otpCode, signatory.otpCode)) {
      return { ok: false, status: 422, message: "Mã OTP xác thực không chính xác" };
    }
    if (!signatory.otpExpiresAt || new Date(signatory.otpExpiresAt).getTime() < bayGio) {
      return { ok: false, status: 422, message: "Mã OTP xác thực đã hết hạn" };
    }
  }
  return { ok: true };
}

export async function executeSignEnvelope(params: {
  projectId: number;
  userId: number;
  envelopeId: string;
  signatoryId: string;
  signatureData: string;
  otpCode?: string;
  ipAddress?: string;
  geoLocation?: { lat: number; lng: number; accuracy?: number };
}): Promise<{ success: boolean; isEnvelopeComplete: boolean; certificateCode?: string }> {
  const {
    projectId,
    userId,
    envelopeId,
    signatoryId,
    signatureData,
    otpCode,
    ipAddress = "127.0.0.1",
    geoLocation,
  } = params;

  return withProjectScope(
    projectId,
    async () => {
      return withTransaction(async () => {
        const signatory = await queryOne<any>(
          `SELECT id, user_id AS "userId", signing_order AS "signingOrder", status, otp_code AS "otpCode", otp_expires_at AS "otpExpiresAt", signer_name AS "signerName", signer_role AS "signerRole"
         FROM engineering_esign_signatories
         WHERE id = ? AND envelope_id = ? AND project_id = ?`,
          signatoryId,
          envelopeId,
          projectId,
        );

        if (!signatory) {
          throw new EsignSignError("Không tìm thấy người ký trong hồ sơ", 404);
        }

        const kiem = kiemDieuKienKy(signatory, userId, otpCode);
        if (!kiem.ok) {
          throw new EsignSignError(kiem.message, kiem.status);
        }

        const signedAt = new Date().toISOString();

        await query(
          `UPDATE engineering_esign_signatories
         SET status = 'signed', signature_data = ?, signed_at = ?, ip_address = ?, geo_location = ?
         WHERE id = ?`,
          signatureData,
          signedAt,
          ipAddress,
          geoLocation ? JSON.stringify(geoLocation) : null,
          signatoryId,
        );

        await query(
          `UPDATE engineering_esign_signatories
         SET status = 'ready'
         WHERE envelope_id = ? AND project_id = ? AND signing_order = ? AND status = 'waiting'`,
          envelopeId,
          projectId,
          signatory.signingOrder + 1,
        );

        const pendingSigners = await query<any>(
          `SELECT id FROM engineering_esign_signatories
         WHERE envelope_id = ? AND project_id = ? AND status != 'signed'`,
          envelopeId,
          projectId,
        );

        const isEnvelopeComplete = pendingSigners.length === 0;
        let certificateCode: string | undefined;

        if (isEnvelopeComplete) {
          const envelope = await queryOne<any>(
            `SELECT id, document_type AS "documentType", document_hash AS "documentHash"
           FROM engineering_esign_envelopes
           WHERE id = ?`,
            envelopeId,
          );

          const allSigners = await query<any>(
            `SELECT signer_name AS "signerName", signer_role AS "signerRole", signed_at AS "signedAt", ip_address AS "ipAddress"
           FROM engineering_esign_signatories
           WHERE envelope_id = ?
           ORDER BY signing_order ASC`,
            envelopeId,
          );

          certificateCode = generateCertificateCode(envelope?.documentType || "DOC");
          const leafHash = crypto
            .createHash("sha256")
            .update((envelope?.documentHash || "") + ":" + certificateCode + ":" + signedAt)
            .digest("hex");
          const tamperProofToken = "SIG-TOKEN-" + leafHash.slice(0, 16).toUpperCase();

          await query(
            `INSERT INTO engineering_esign_audit_certificates
             (envelope_id, project_id, certificate_code, merkle_leaf_hash, tamper_proof_token, signatory_summary)
           VALUES (?, ?, ?, ?, ?, ?)`,
            envelopeId,
            projectId,
            certificateCode,
            leafHash,
            tamperProofToken,
            JSON.stringify(allSigners),
          );

          await query(
            `UPDATE engineering_esign_envelopes
           SET status = 'signed', completed_at = ?
           WHERE id = ?`,
            signedAt,
            envelopeId,
          );
        }

        return {
          success: true,
          isEnvelopeComplete,
          certificateCode,
        };
      });
    },
    { readOnly: false },
  );
}

export async function listEsignEnvelopes(projectId: number): Promise<EsignEnvelopeRow[]> {
  return withProjectScope(projectId, async () => {
    const envelopes = await query<any>(
      `SELECT id, project_id AS "projectId", title, document_type AS "documentType",
              reference_id AS "referenceId", reference_code AS "referenceCode",
              status, document_hash AS "documentHash", document_payload AS "documentPayload",
              created_by AS "createdBy", created_at AS "createdAt", completed_at AS "completedAt"
       FROM engineering_esign_envelopes
       WHERE project_id = ?
       ORDER BY created_at DESC`,
      projectId,
    );

    for (const env of envelopes) {
      env.signatories = await query<any>(
        `SELECT id, envelope_id AS "envelopeId", project_id AS "projectId",
                user_id AS "userId", signer_name AS "signerName", signer_role AS "signerRole",
                signing_order AS "signingOrder", status, signature_data AS "signatureData",
                signed_at AS "signedAt", ip_address AS "ipAddress", geo_location AS "geoLocation"
         FROM engineering_esign_signatories
         WHERE envelope_id = ?
         ORDER BY signing_order ASC`,
        env.id,
      );
    }

    return envelopes;
  });
}
