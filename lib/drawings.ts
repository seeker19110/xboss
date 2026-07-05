// M8 — Drawing register (bản vẽ shop/asbuilt/BIM + biện pháp thi công): validate thuần
// (unit test được) + query danh sách/chi tiết + logic supersede revision khi duyệt.
// Xem docs/nang-cap/M08-ban-ve.md.
import { query, queryOne, run, withTransaction } from "@/lib/db";

export const DRAWING_KINDS = ["shop", "asbuilt", "bim", "method"] as const;
export type DrawingKind = (typeof DRAWING_KINDS)[number];
export const DRAWING_KIND_LABEL: Record<DrawingKind, string> = {
  shop: "Shop drawing",
  asbuilt: "As-built",
  bim: "BIM",
  method: "Biện pháp thi công",
};

export const REVISION_STATUSES = [
  "submitted",
  "commented",
  "approved",
  "approved_with_comments",
  "rejected",
  "superseded",
] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];
export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  submitted: "Đã trình",
  commented: "Có ý kiến",
  approved: "Đã duyệt",
  approved_with_comments: "Duyệt kèm ý kiến",
  rejected: "Từ chối",
  superseded: "Đã thay thế",
};

// Trạng thái coi là "đang hiệu lực" — rev mới đạt 1 trong 2 trạng thái này sẽ tự
// thay thế (superseded) rev cũ cũng đang ở 1 trong 2 trạng thái này của cùng drawing.
const CURRENT_STATUSES: RevisionStatus[] = ["approved", "approved_with_comments"];

export type DrawingInput = {
  code: string;
  name: string;
  kind: DrawingKind;
  systemGroup: string | null;
  floorLabel: string | null;
  workPackageId: number | null;
};

// Validate thuần — trả thông điệp lỗi tiếng Việt hoặc null khi hợp lệ.
export function validateDrawingInput(input: DrawingInput): string | null {
  if (!input.code.trim()) return "Thiếu số bản vẽ";
  if (!input.name.trim()) return "Thiếu tên bản vẽ";
  if (!DRAWING_KINDS.includes(input.kind)) return "Loại bản vẽ không hợp lệ";
  return null;
}

export function parseDrawingBody(body: Record<string, unknown>): DrawingInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    code: str(body.code),
    name: str(body.name),
    kind: (str(body.kind) || "shop") as DrawingKind,
    systemGroup: strOrNull(body.systemGroup),
    floorLabel: strOrNull(body.floorLabel),
    workPackageId: body.workPackageId != null ? Number(body.workPackageId) : null,
  };
}

// Kiểm FK work_package tồn tại — trả thông điệp lỗi hoặc null.
export async function checkDrawingRefs(input: DrawingInput): Promise<string | null> {
  if (input.workPackageId != null) {
    if (
      !Number.isInteger(input.workPackageId) ||
      !(await queryOne(`SELECT id FROM work_packages WHERE id = ?`, input.workPackageId))
    )
      return "Nhóm công việc không tồn tại";
  }
  return null;
}

export type DrawingRow = {
  id: number;
  code: string;
  name: string;
  kind: DrawingKind;
  systemGroup: string | null;
  floorLabel: string | null;
  workPackageId: number | null;
  workPackageCode: string | null;
  workPackageName: string | null;
  workPackageRequiresMethodStatement: boolean | null;
  createdAt: string;
  latestRevisionId: number | null;
  latestRev: string | null;
  latestStatus: RevisionStatus | null;
  latestSubmittedAt: string | null;
  latestDecidedAt: string | null;
  approvedRevisionId: number | null;
  approvedRev: string | null;
  approvedDecidedAt: string | null;
};

export type DrawingFilters = {
  kind?: DrawingKind;
  floorLabel?: string;
  systemGroup?: string;
  status?: RevisionStatus;
};

// Danh sách drawing kèm rev mới nhất (mọi trạng thái) + rev đã duyệt mới nhất
// (approved|approved_with_comments) — 2 nguồn UI cần: badge trạng thái hiện hành
// và nút "Xem bản mới nhất đã duyệt".
export async function listDrawings(filters: DrawingFilters = {}): Promise<DrawingRow[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters.kind) {
    conds.push("d.kind = ?");
    params.push(filters.kind);
  }
  if (filters.floorLabel) {
    conds.push("d.floor_label = ?");
    params.push(filters.floorLabel);
  }
  if (filters.systemGroup) {
    conds.push("d.system_group = ?");
    params.push(filters.systemGroup);
  }
  if (filters.status) {
    conds.push("lr.status = ?");
    params.push(filters.status);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  return query<DrawingRow>(
    `SELECT d.id, d.code, d.name, d.kind, d.system_group AS "systemGroup",
            d.floor_label AS "floorLabel", d.work_package_id AS "workPackageId",
            wp.code AS "workPackageCode", wp.name AS "workPackageName",
            wp.requires_method_statement AS "workPackageRequiresMethodStatement",
            d.created_at AS "createdAt",
            lr.id AS "latestRevisionId", lr.rev AS "latestRev", lr.status AS "latestStatus",
            lr.submitted_at AS "latestSubmittedAt", lr.decided_at AS "latestDecidedAt",
            ar.id AS "approvedRevisionId", ar.rev AS "approvedRev",
            ar.decided_at AS "approvedDecidedAt"
       FROM drawings d
       LEFT JOIN work_packages wp ON wp.id = d.work_package_id
       LEFT JOIN LATERAL (
         SELECT * FROM drawing_revisions r WHERE r.drawing_id = d.id ORDER BY r.id DESC LIMIT 1
       ) lr ON TRUE
       LEFT JOIN LATERAL (
         SELECT * FROM drawing_revisions r
          WHERE r.drawing_id = d.id AND r.status IN ('approved','approved_with_comments')
          ORDER BY r.id DESC LIMIT 1
       ) ar ON TRUE
       ${where}
      ORDER BY d.code`,
    ...params,
  );
}

export type DrawingRevisionRow = {
  id: number;
  rev: string;
  fileName: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number | null;
  status: RevisionStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: string;
};

export async function listRevisions(drawingId: number): Promise<DrawingRevisionRow[]> {
  return query<DrawingRevisionRow>(
    `SELECT r.id, r.rev, r.file_name AS "fileName", r.original_name AS "originalName",
            r.mime_type AS "mimeType", r.size_bytes AS "sizeBytes", r.status,
            r.submitted_at AS "submittedAt", r.decided_at AS "decidedAt",
            r.decision_note AS "decisionNote", r.uploaded_by AS "uploadedBy",
            u.name AS "uploaderName", r.created_at AS "createdAt"
       FROM drawing_revisions r LEFT JOIN users u ON u.id = r.uploaded_by
      WHERE r.drawing_id = ?
      ORDER BY r.id DESC`,
    drawingId,
  );
}

// Đổi trạng thái 1 rev (Admin/PM). Khi status mới thuộc CURRENT_STATUSES: mọi rev
// khác của cùng drawing đang ở CURRENT_STATUSES tự chuyển 'superseded' trong cùng
// transaction (chỉ 1 rev "đang hiệu lực" mỗi drawing tại 1 thời điểm).
export async function setRevisionStatus(
  revisionId: number,
  status: RevisionStatus,
  decisionNote: string | null,
): Promise<{ error: string } | { drawingId: number }> {
  return withTransaction(async () => {
    const rev = await queryOne<{ drawingId: number }>(
      `SELECT drawing_id AS "drawingId" FROM drawing_revisions WHERE id = ? FOR UPDATE`,
      revisionId,
    );
    if (!rev) return { error: "Không tìm thấy revision" };

    if (CURRENT_STATUSES.includes(status)) {
      await run(
        `UPDATE drawing_revisions SET status = 'superseded'
          WHERE drawing_id = ? AND id <> ? AND status IN ('approved','approved_with_comments')`,
        rev.drawingId,
        revisionId,
      );
    }

    await run(
      `UPDATE drawing_revisions SET status = ?, decision_note = ?, decided_at = CURRENT_DATE
        WHERE id = ?`,
      status,
      decisionNote,
      revisionId,
    );

    return { drawingId: rev.drawingId };
  });
}
