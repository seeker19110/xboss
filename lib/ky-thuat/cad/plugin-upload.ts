// M99 PR5 — nhận bản vẽ từ plugin AutoCAD (XBOSS_UPLOAD): DWG + DXF sidecar + báo cáo
// chuẩn hóa + version rule pack. Server KHÔNG tin client (FR10): kiểm định lại DXF sidecar
// bằng chính parser tầng 3 (lib/ky-thuat/cad/dxf-parser — đã tôi luyện qua 6 vòng đối chiếu
// AutoCAD thật, xem PROGRESS.md) + đối chiếu version rule pack đang phát hành; sai → trả
// danh sách lỗi, KHÔNG tạo revision (AC5). Điểm lệch spec có chủ đích: spec FR10 nhắc
// "ezdxf" (worker Python) — dùng parser TS sẵn có thay vì thêm cả một stack Python chỉ để
// kiểm cấu trúc DXF; cùng tinh thần "server kiểm định lại, không đọc DWG".
//
// Idempotent theo hash nội dung DWG (M99 §12): cùng drawing + cùng sha256 → trả revision
// đã có, không tạo đôi; cùng rev nhưng nội dung khác → báo xung đột cho kỹ sư tự tăng rev.
import { createHash } from "node:crypto";
import { queryOne, insertId } from "@/lib/db";
import { storagePut } from "@/lib/nen/storage";
import { newDrawingRevisionFileName } from "@/lib/nen/photos";
import { validateDxf, parseDxf } from "@/lib/ky-thuat/cad/dxf-parser";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";

export type PluginUploadValidation = {
  ok: boolean;
  /** Lỗi chặn (422 — không tạo revision). */
  errors: string[];
  /** Cảnh báo không chặn — ghi vào standardize_report để người duyệt thấy. */
  warnings: string[];
  /** Số liệu DXF đo được phía server (đối chứng với báo cáo client gửi). */
  stats?: { layers: number; entities: number };
};

export type PluginUploadKetQua =
  | { status: "invalid"; validation: PluginUploadValidation }
  | { status: "rev-conflict"; message: string }
  | { status: "created" | "idempotent"; validation: PluginUploadValidation; revisionId: number };

/** Kiểm định DXF sidecar + rule pack version — thuần, không chạm DB (test đơn vị được). */
export function kiemDinhPluginUpload(
  dxfText: string,
  rulePackVersion: string,
): PluginUploadValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const packHienHanh = getCurrentRulePack();
  if (rulePackVersion !== packHienHanh.version) {
    // AC8: rule pack cache cũ bị CHẶN tải lên — kỹ sư chạy XBOSS_LOGIN cập nhật rồi chuẩn hóa lại.
    errors.push(
      `Rule pack ${rulePackVersion} không phải bản đang phát hành (${packHienHanh.version}) — ` +
        `chạy XBOSS_LOGIN cập nhật rule pack rồi chuẩn hóa lại trước khi tải lên.`,
    );
  }

  const cauTruc = validateDxf(dxfText);
  if (!cauTruc.valid) {
    errors.push(...cauTruc.errors.map((e) => `DXF sidecar lỗi cấu trúc: ${e}`));
  }

  let stats: PluginUploadValidation["stats"];
  if (cauTruc.valid) {
    try {
      const dxf = parseDxf(dxfText);
      stats = { layers: dxf.layers.length, entities: dxf.entities.length };
      if (dxf.entities.length === 0) {
        errors.push("DXF sidecar không có thực thể nào — sai tệp hoặc xuất hỏng.");
      }
    } catch (e) {
      errors.push(`Không parse được DXF sidecar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, stats };
}

/**
 * Xử lý trọn một lượt tải lên từ plugin. Drawing đã được route xác minh thuộc dự án
 * người dùng (ranh giới HTTP lo scope — ADR-0008); hàm này lo kiểm định + ghi sổ.
 */
export async function xuLyPluginUpload(input: {
  drawingId: number;
  orgId: number;
  userId: number;
  rev: string;
  rulePackVersion: string;
  dwg: Buffer;
  dwgName: string;
  dxfText: string;
  report: Record<string, unknown> | null;
  /** M101 §6.4 (PR5): sidecar JSON kết quả bóc khối lượng (TakeoffJsonReport), TÙY CHỌN — lưu
   * nguyên vào standardize_report khối "takeoff". KHÔNG BAO GIỜ ghi vào bảng BOQ (đường ghi sổ
   * duy nhất giữ nguyên); upload không kèm khối này vẫn chạy y hệt trước PR5. */
  takeoff?: Record<string, unknown> | null;
}): Promise<PluginUploadKetQua> {
  const validation = kiemDinhPluginUpload(input.dxfText, input.rulePackVersion);
  if (!validation.ok) return { status: "invalid", validation };

  const hash = createHash("sha256").update(input.dwg).digest("hex");

  // Idempotency: đúng tệp này đã có revision → trả lại, không ghi gì thêm.
  const daCo = await queryOne<{ id: number }>(
    `SELECT id FROM drawing_revisions WHERE drawing_id = ? AND content_sha256 = ?`,
    input.drawingId,
    hash,
  );
  if (daCo) return { status: "idempotent", validation, revisionId: daCo.id };

  // Cùng rev nhưng nội dung khác — không lặng lẽ đè (UNIQUE drawing_id+rev sẽ nổ):
  const trungRev = await queryOne<{ id: number }>(
    `SELECT id FROM drawing_revisions WHERE drawing_id = ? AND rev = ?`,
    input.drawingId,
    input.rev,
  );
  if (trungRev) {
    return {
      status: "rev-conflict",
      message: `Rev "${input.rev}" đã tồn tại với nội dung khác — tăng rev (VD ${input.rev} → kế tiếp) rồi tải lại.`,
    };
  }

  const fileName = newDrawingRevisionFileName(input.drawingId, input.rev, "application/acad");
  await storagePut(input.orgId, fileName, input.dwg);
  // DXF sidecar + báo cáo đặt cạnh DWG cùng quy ước tên — server/QS đọc lại được không cần AutoCAD.
  await storagePut(input.orgId, `${fileName}.sidecar.dxf`, Buffer.from(input.dxfText, "utf8"));

  const revisionId = await insertId(
    `INSERT INTO drawing_revisions
       (drawing_id, rev, file_name, original_name, mime_type, size_bytes, status, submitted_at,
        uploaded_by, source_tool, rule_pack_version, standardize_report, content_sha256)
     VALUES (?, ?, ?, ?, 'application/acad', ?, 'submitted', CURRENT_DATE, ?, 'plugin', ?, ?::jsonb, ?)`,
    input.drawingId,
    input.rev,
    fileName,
    input.dwgName,
    input.dwg.length,
    input.userId,
    input.rulePackVersion,
    JSON.stringify({
      ...(input.report ?? {}),
      ...(input.takeoff ? { takeoff: input.takeoff } : {}),
      serverValidation: validation,
    }),
    hash,
  );
  return { status: "created", validation, revisionId };
}
