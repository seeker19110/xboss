// lib/qr.ts — M58 PR1: mã QR mở URL (quét bằng camera thường, không cần app) dán lên
// thiết bị/vật tư/mặt bằng/task. Nội dung QR = URL thật `https://<host>/r/<kind>/<id>`.
// KHÔNG phải QR TOTP (M56 PR1, khác use-case) — chỉ dùng chung thư viện render `qrcode`
// (chọn Ở PR NÀY để M56 tái dùng đúng): pure-JS, không phụ thuộc canvas native (renderer
// SVG không cần addon biên dịch), nhỏ, phổ biến, pin version cụ thể trong package.json.
import QRCode from "qrcode";
import { queryOne } from "@/lib/db";

export const QR_KINDS = ["eq", "mt", "wf", "tk"] as const;
export type QrKind = (typeof QR_KINDS)[number];

export function isQrKind(v: string): v is QrKind {
  return (QR_KINDS as readonly string[]).includes(v);
}

export type QrResolveResult =
  | { kind: "eq"; id: number; code: string; name: string }
  | { kind: "mt"; id: number; code: string; name: string }
  // wf: id = floor_label (chuỗi) — khoá thật đang dùng ở app/work-fronts/[floor]/page.tsx
  // (bản M46, trục tầng × công tác thi công), KHÔNG phải work_fronts.id (bảng M14 cũ,
  // vẫn còn nhưng không còn là nguồn UI /work-fronts đọc).
  | { kind: "wf"; id: string; code: string; name: string }
  | { kind: "tk"; id: number; sheetSlug: string; code: string; name: string };

/** Tra 1 tài nguyên theo (kind, rawId), SCOPED theo dự án đang chọn — tài nguyên thuộc
 *  dự án khác (hoặc projectId null = chưa có dự án nào) → null (route trả 404, không lộ
 *  tồn tại — đúng tiền lệ chống rò rỉ chéo dự án từ M22). */
export async function resolveQr(
  kind: QrKind,
  rawId: string,
  projectId: number | null,
): Promise<QrResolveResult | null> {
  if (projectId == null) return null;

  if (kind === "eq") {
    const id = Number(rawId);
    if (!Number.isInteger(id)) return null;
    const row = await queryOne<{ id: number; code: string; name: string }>(
      `SELECT id, code, name FROM equipment WHERE id = ? AND project_id = ?`,
      id,
      projectId,
    );
    return row ? { kind, id: row.id, code: row.code, name: row.name } : null;
  }

  if (kind === "mt") {
    const id = Number(rawId);
    if (!Number.isInteger(id)) return null;
    const row = await queryOne<{ id: number; boqCode: string | null; name: string }>(
      `SELECT id, boq_code AS "boqCode", name FROM materials WHERE id = ? AND project_id = ?`,
      id,
      projectId,
    );
    return row ? { kind, id: row.id, code: row.boqCode ?? String(row.id), name: row.name } : null;
  }

  if (kind === "wf") {
    const floorLabel = rawId.trim();
    if (!floorLabel) return null;
    const row = await queryOne<{ floorLabel: string }>(
      `SELECT DISTINCT wp.floor_label AS "floorLabel"
         FROM work_packages wp
         JOIN sheet_types st ON st.id = wp.sheet_type_id
         JOIN towers tw ON tw.id = st.tower_id
        WHERE wp.floor_label = ? AND tw.project_id = ? LIMIT 1`,
      floorLabel,
      projectId,
    );
    return row
      ? { kind, id: row.floorLabel, code: row.floorLabel, name: `Mặt bằng ${row.floorLabel}` }
      : null;
  }

  // kind === "tk"
  const id = Number(rawId);
  if (!Number.isInteger(id)) return null;
  const row = await queryOne<{ id: number; code: string; name: string; sheetSlug: string | null }>(
    `SELECT t.id, t.code, t.name, st.slug AS "sheetSlug"
       FROM tasks t
       JOIN work_packages wp ON wp.id = t.package_id
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
      WHERE t.id = ? AND tw.project_id = ?`,
    id,
    projectId,
  );
  if (!row || !row.sheetSlug) return null;
  return { kind, id: row.id, sheetSlug: row.sheetSlug, code: row.code, name: row.name };
}

/** URL đích /r/:kind/:id (dùng làm nội dung QR lẫn để dựng đường dẫn tuyệt đối cho tem in). */
export function qrTargetPath(kind: QrKind, id: number | string): string {
  return `/r/${kind}/${encodeURIComponent(String(id))}`;
}

/** Dựng host tuyệt đối cho URL QR — ưu tiên APP_URL (biến môi trường có sẵn, dùng chung
 *  với lib/oidc.ts redirectUri()), fallback header `host` của chính request (kèm suy giao
 *  thức qua x-forwarded-proto, phổ biến sau reverse proxy) khi APP_URL chưa cấu hình. */
export function absoluteUrl(path: string, req: { headers: Headers }): string {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return `${appUrl.replace(/\/+$/, "")}${path}`;
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}${path}`;
}

/** Sinh SVG QR (chuỗi markup, nhúng thẳng vào HTML tem in) — pure JS, không canvas. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, width: 160 });
}

/** Tra nhiều tài nguyên cho tem in (`/api/qr/labels`) — tái dùng resolveQr cho từng id
 *  (danh sách chọn để in tem luôn nhỏ, không cần câu SQL IN() riêng); id không tồn tại/
 *  thuộc dự án khác bị BỎ QUA (không throw) — đúng yêu cầu "id không tồn tại thì bỏ qua". */
export async function resolveManyForLabels(
  kind: QrKind,
  ids: string[],
  projectId: number | null,
): Promise<{ id: number | string; code: string; name: string }[]> {
  const out: { id: number | string; code: string; name: string }[] = [];
  for (const raw of ids) {
    const r = await resolveQr(kind, raw, projectId);
    if (r) out.push({ id: r.id, code: r.code, name: r.name });
  }
  return out;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
