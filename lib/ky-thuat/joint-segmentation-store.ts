// lib/ky-thuat/joint-segmentation-store.ts — M105 §10/§11: lớp truy cập DB cho bảng đốt MEPF
// (`engineering_joint_runs` / `engineering_joint_pieces`, migration 0143).
//
// Chỉ chạm miền kỹ thuật (bản vẽ + kết quả chia đốt) nên đặt ở `lib/ky-thuat/` theo ADR-0007,
// không đẩy lên `lib/dich-vu/` (nơi dành cho logic phối hợp từ 2 miền trở lên).
import { query, queryOne, withProjectScope, withTransaction } from "@/lib/db";

/** Một đoạn thẳng của tuyến đã chia: tổng dài, khe mối nối và chiều dài từng đốt (mm). */
export interface JointSegmentInput {
  lengthMm: number;
  gapMm: number;
  pieces: number[];
}

/** Một tuyến (run) đã chia đốt do plugin/engine gửi lên. */
export interface JointRunInput {
  /** Khóa idempotency (handle tim + itemId). Thiếu → suy ra từ systemId|itemId|size. */
  runKey?: string;
  systemId: string;
  itemId: string;
  size: string;
  jointType: string;
  overridden: boolean;
  divideMode: "deu" | "cay_nguyen";
  segments: JointSegmentInput[];
}

export interface JointPieceRow {
  pieceIndex: number;
  lengthMm: number;
  tag: string;
}

export interface JointRunRow {
  id: string;
  runKey: string;
  systemId: string;
  itemId: string;
  size: string;
  jointType: string;
  divideMode: string;
  overridden: boolean;
  rulePackVersion: string;
  totalLengthMm: number;
  pieceCount: number;
  jointCount: number;
  createdAt: string;
  pieces: JointPieceRow[];
}

/** Khóa idempotency của một tuyến khi plugin không gửi kèm `runKey`. */
export function runKeyCuaTuyen(run: JointRunInput): string {
  return (run.runKey ?? `${run.systemId}|${run.itemId}|${run.size}`).trim();
}

/** Nhãn đốt theo FR5: `D-<itemId>-<sốTuyến>-<sốĐốt>`. */
function nhanDot(itemId: string, thuTuTuyen: number, thuTuDot: number): string {
  return `D-${itemId}-${String(thuTuTuyen).padStart(3, "0")}-${String(thuTuDot).padStart(2, "0")}`;
}

/** Dự án của bản vẽ (nguồn sự thật để đối chiếu, không tin projectId client gửi). */
export async function docDuAnCuaBanVe(drawingId: number): Promise<number | null> {
  const row = await queryOne<{ projectId: number | null }>(
    `SELECT project_id AS "projectId" FROM drawings WHERE id = ?`,
    drawingId,
  );
  return row ? row.projectId : null;
}

/**
 * Lưu kết quả chia đốt — IDEMPOTENT theo `(drawing_id, run_key)`: mỗi tuyến upsert bản ghi
 * run, xóa toàn bộ đốt cũ của run rồi chèn lại. Tất cả trong MỘT transaction.
 */
export async function luuKetQuaChiaDot(
  projectId: number,
  drawingId: number,
  rulePackVersion: string,
  runs: JointRunInput[],
  userId: number,
): Promise<{ runsSaved: number; piecesSaved: number }> {
  return withProjectScope(
    projectId,
    () =>
      withTransaction(async () => {
        let piecesSaved = 0;
        for (let i = 0; i < runs.length; i++) {
          const run = runs[i];
          const runKey = runKeyCuaTuyen(run);
          const pieces = run.segments.flatMap((s) => s.pieces);
          const totalLengthMm = run.segments.reduce((s, seg) => s + seg.lengthMm, 0);
          const jointCount = run.segments.reduce(
            (s, seg) => s + Math.max(0, seg.pieces.length - 1),
            0,
          );

          const saved = await queryOne<{ id: string }>(
            `INSERT INTO engineering_joint_runs
               (project_id, drawing_id, run_key, system_id, item_id, size, joint_type,
                divide_mode, overridden, rule_pack_version, total_length_mm, piece_count,
                joint_count, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (drawing_id, run_key) DO UPDATE SET
               system_id = EXCLUDED.system_id,
               item_id = EXCLUDED.item_id,
               size = EXCLUDED.size,
               joint_type = EXCLUDED.joint_type,
               divide_mode = EXCLUDED.divide_mode,
               overridden = EXCLUDED.overridden,
               rule_pack_version = EXCLUDED.rule_pack_version,
               total_length_mm = EXCLUDED.total_length_mm,
               piece_count = EXCLUDED.piece_count,
               joint_count = EXCLUDED.joint_count,
               created_by = EXCLUDED.created_by
             RETURNING id`,
            projectId,
            drawingId,
            runKey,
            run.systemId,
            run.itemId,
            run.size,
            run.jointType,
            run.divideMode,
            run.overridden,
            rulePackVersion,
            totalLengthMm,
            pieces.length,
            jointCount,
            userId,
          );
          if (!saved) throw new Error(`Không lưu được tuyến ${runKey}`);

          await query(`DELETE FROM engineering_joint_pieces WHERE run_id = ?`, saved.id);
          for (let j = 0; j < pieces.length; j++) {
            await query(
              `INSERT INTO engineering_joint_pieces
                 (project_id, run_id, piece_index, length_mm, tag)
               VALUES (?, ?, ?, ?, ?)`,
              projectId,
              saved.id,
              j + 1,
              pieces[j],
              nhanDot(run.itemId, i + 1, j + 1),
            );
            piecesSaved++;
          }
        }
        return { runsSaved: runs.length, piecesSaved };
      }),
    { readOnly: false },
  );
}

/** Bảng đốt của một bản vẽ: runs kèm pieces, sắp theo hệ → tuyến → thứ tự đốt. */
export async function docBangDot(projectId: number, drawingId: number): Promise<JointRunRow[]> {
  return withProjectScope(projectId, async () => {
    const runs = await query<Omit<JointRunRow, "pieces">>(
      `SELECT id, run_key AS "runKey", system_id AS "systemId", item_id AS "itemId", size,
              joint_type AS "jointType", divide_mode AS "divideMode", overridden,
              rule_pack_version AS "rulePackVersion", total_length_mm AS "totalLengthMm",
              piece_count AS "pieceCount", joint_count AS "jointCount", created_at AS "createdAt"
         FROM engineering_joint_runs
        WHERE drawing_id = ? AND project_id = ?
        ORDER BY system_id, item_id, run_key`,
      drawingId,
      projectId,
    );
    if (runs.length === 0) return [];

    const pieces = await query<JointPieceRow & { runId: string }>(
      `SELECT p.run_id AS "runId", p.piece_index AS "pieceIndex", p.length_mm AS "lengthMm", p.tag
         FROM engineering_joint_pieces p
         JOIN engineering_joint_runs r ON r.id = p.run_id
        WHERE r.drawing_id = ? AND r.project_id = ?
        ORDER BY r.system_id, r.item_id, r.run_key, p.piece_index`,
      drawingId,
      projectId,
    );
    const theoRun = new Map<string, JointPieceRow[]>();
    for (const p of pieces) {
      const ds = theoRun.get(p.runId) ?? [];
      ds.push({ pieceIndex: p.pieceIndex, lengthMm: p.lengthMm, tag: p.tag });
      theoRun.set(p.runId, ds);
    }
    return runs.map((r) => ({ ...r, pieces: theoRun.get(r.id) ?? [] }));
  });
}
