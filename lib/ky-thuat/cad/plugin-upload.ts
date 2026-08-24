// M99 PR5 — nhận DWG + DXF sidecar từ plugin AutoCAD (XBOSS_UPLOAD) vào sổ bản vẽ.
//
// Kiểm định 2 cổng (điểm lệch FR10 có chủ đích, ghi ở M99 §10):
//   Cổng 1 (đồng bộ): validateDxf (TS) trên DXF sidecar — sai cấu trúc → từ chối ngay,
//     KHÔNG tạo bản ghi nào (AC5).
//   Cổng 2 (bất đồng bộ): task `mepf.cad.plugin_validate` cho worker ezdxf (mepf-worker) —
//     revision tạo `submitted` ngay sau cổng 1 để kỹ sư không bị chặn khi worker vắng mặt;
//     worker báo fail → revision tự chuyển `rejected` kèm lý do lúc đọc kết quả job.
//
// Idempotent theo sha256 nội dung DWG (M99 §10): tải lại cùng tệp trong cùng dự án trả về
// revision đã có, không tạo trùng. Server không tin client (ADR-0006 nguyên tắc 2): tên tệp
// do server sinh, mọi chuỗi client gửi chỉ dùng sau khi làm sạch/giới hạn độ dài.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { queryOne, insertId, run } from "@/lib/db";
import type { User } from "@/lib/bao-mat/auth";
import { validateDxf } from "@/lib/ky-thuat/cad/dxf-parser";
import { CURRENT_RULE_PACK_VERSION } from "@/lib/ky-thuat/cad/rule-pack";
import { enqueueAsyncTask } from "@/lib/ky-thuat/engineering-task-queue";
import { storagePut } from "@/lib/nen/storage";
import { newStandardizedDrawingFileName } from "@/lib/nen/photos";

export const PLUGIN_VALIDATE_TASK_TYPE = "mepf.cad.plugin_validate";

/** Trần DWG plugin tải lên — DWG nén hơn DXF nhiều, 80MB là rộng cho mặt bằng MEPF thật. */
export const GIOI_HAN_DWG_PLUGIN = 80 * 1024 * 1024;

export type PluginUploadInput = {
  user: User;
  projectId: number;
  dwg: Buffer;
  dwgOriginalName: string;
  dxfContent: string;
  /** report.json từ XBOSS_CHUANHOA (đã parse) — null khi plugin không gửi. */
  report: unknown | null;
  rulePackVersion: string;
  drawingCode: string;
  drawingName: string;
  systems: string;
  rev: string;
};

export type PluginUploadKetQua =
  | { kind: "invalid-dxf"; errors: string[] }
  | { kind: "rule-pack-cu"; hienHanh: string }
  | { kind: "trung-lap"; revisionId: number }
  | { kind: "rev-ton-tai" }
  | { kind: "ok"; drawingId: number; revisionId: number; jobId: string };

const lamSach = (s: string, toiDa: number) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, toiDa);

export async function nhanPluginUpload(input: PluginUploadInput): Promise<PluginUploadKetQua> {
  // Cổng 1 — cấu trúc DXF sidecar (server kiểm mà không cần đọc DWG, ADR-0006 nguyên tắc 2).
  const validation = validateDxf(input.dxfContent);
  if (!validation.valid) return { kind: "invalid-dxf", errors: validation.errors };

  // AC8: rule pack lỗi thời → chặn tải lên, hướng dẫn cập nhật.
  if (input.rulePackVersion !== CURRENT_RULE_PACK_VERSION) {
    return { kind: "rule-pack-cu", hienHanh: CURRENT_RULE_PACK_VERSION };
  }

  // Idempotency theo nội dung DWG trong cùng dự án.
  const sha256 = createHash("sha256").update(input.dwg).digest("hex");
  const daCo = await queryOne<{ id: number }>(
    `SELECT r.id
       FROM drawing_revisions r
       JOIN drawings d ON d.id = r.drawing_id
      WHERE r.content_sha256 = ? AND d.project_id = ?`,
    sha256,
    input.projectId,
  );
  if (daCo) return { kind: "trung-lap", revisionId: daCo.id };

  const code = lamSach(input.drawingCode, 60) || `PLUGIN-${sha256.slice(0, 8).toUpperCase()}`;
  const rev = lamSach(input.rev, 10) || "A";
  const systems = lamSach(input.systems, 20) || "MEPF";
  const ten = input.drawingName.trim().slice(0, 200) || code;

  // Bản vẽ theo code trong dự án; rev trùng → báo để kỹ sư tăng rev (UNIQUE drawing_id+rev).
  let drawingId = (
    await queryOne<{ id: number }>(
      `SELECT id FROM drawings WHERE code = ? AND project_id = ?`,
      code,
      input.projectId,
    )
  )?.id;
  if (drawingId) {
    const revTrung = await queryOne(
      `SELECT 1 FROM drawing_revisions WHERE drawing_id = ? AND rev = ?`,
      drawingId,
      rev,
    );
    if (revTrung) return { kind: "rev-ton-tai" };
  } else {
    drawingId = await insertId(
      `INSERT INTO drawings (code, name, kind, system_group, project_id, created_by)
       VALUES (?, ?, 'shop', ?, ?, ?)`,
      code,
      ten,
      systems,
      input.projectId,
      input.user.id,
    );
  }

  // Lưu tệp: DWG + DXF vào lớp storage (đọc lại được mọi triển khai); DXF thêm một bản trên
  // đĩa data/uploads/mepf để worker ezdxf đọc (cùng quy ước app/api/engineering/queue/upload).
  const dwgStorageName = newStandardizedDrawingFileName("dwg");
  const dxfStorageName = newStandardizedDrawingFileName("dxf");
  await storagePut(input.user.orgId, dwgStorageName, input.dwg);
  const dxfBuffer = Buffer.from(input.dxfContent, "utf8");
  await storagePut(input.user.orgId, dxfStorageName, dxfBuffer);

  const workerDir = path.join(process.cwd(), "data", "uploads", "mepf");
  await fs.mkdir(workerDir, { recursive: true });
  const workerFile = `${sha256.slice(0, 16)}_${dxfStorageName}`;
  await fs.writeFile(path.join(workerDir, workerFile), dxfBuffer);

  const baoCao = {
    pluginReport: input.report ?? null,
    serverValidation: { status: "processing" },
  };
  const revisionId = await insertId(
    `INSERT INTO drawing_revisions (
       drawing_id, rev, file_name, original_name, mime_type, size_bytes,
       status, submitted_at, decision_note, uploaded_by,
       rule_pack_version, standardize_report, source_tool, content_sha256, dxf_file_name
     ) VALUES (?, ?, ?, ?, 'application/acad', ?, 'submitted', CURRENT_DATE, ?, ?, ?, ?::jsonb, 'plugin', ?, ?)`,
    drawingId,
    rev,
    dwgStorageName,
    lamSach(input.dwgOriginalName, 120) || `${code}.dwg`,
    input.dwg.length,
    `[XBOSS_UPLOAD] Chờ kiểm định ezdxf phía server (rule pack ${input.rulePackVersion})`,
    input.user.id,
    input.rulePackVersion,
    JSON.stringify(baoCao),
    sha256,
    dxfStorageName,
  );

  const task = await enqueueAsyncTask({
    projectId: input.projectId,
    taskType: PLUGIN_VALIDATE_TASK_TYPE,
    payload: {
      filePath: `data/uploads/mepf/${workerFile}`,
      revisionId,
      rulePackVersion: input.rulePackVersion,
      contentSha256: sha256,
      uploadedBy: input.user.id,
    },
    priority: 10,
    createdBy: input.user.id,
  });

  return { kind: "ok", drawingId, revisionId, jobId: task.id };
}

export type PluginJobKetQua =
  | { kind: "khong-tim-thay" }
  | { kind: "khong-co-quyen" }
  | {
      kind: "ok";
      status: "processing" | "ok" | "rejected" | "error";
      revisionId: number | null;
      validation: unknown;
    };

/** Trạng thái job kiểm định (GET :jobId). Worker báo fail → revision `submitted` tự chuyển
 * `rejected` kèm lý do ngay tại đây (đường đọc duy nhất của plugin — không cần cron riêng). */
export async function layPluginUploadJob(jobId: string, user: User): Promise<PluginJobKetQua> {
  const task = await queryOne<{
    id: string;
    status: string;
    payload: { revisionId?: number };
    result: { valid?: boolean; errors?: string[] } | null;
    createdBy: number | null;
    errorMessage: string | null;
  }>(
    `SELECT id, status, payload, result, created_by AS "createdBy",
            error_message AS "errorMessage"
       FROM engineering_async_tasks
      WHERE id = ?::uuid AND task_type = ?`,
    jobId,
    PLUGIN_VALIDATE_TASK_TYPE,
  );
  if (!task) return { kind: "khong-tim-thay" };
  // Chủ upload hoặc Admin/PM (xử lý hộ) — engineer khác không xem job của người khác.
  if (task.createdBy !== user.id && user.role !== "admin" && user.role !== "pm") {
    return { kind: "khong-co-quyen" };
  }
  const revisionId = task.payload?.revisionId ?? null;

  if (task.status === "failed" || task.status === "cancelled") {
    return {
      kind: "ok",
      status: "error",
      revisionId,
      validation: { error: task.errorMessage ?? "Worker kiểm định gặp lỗi" },
    };
  }
  if (task.status !== "completed") {
    return { kind: "ok", status: "processing", revisionId, validation: null };
  }

  const valid = task.result?.valid === true;
  if (revisionId) {
    if (!valid) {
      // Kiểm định sâu fail → revision không được đi tiếp vòng duyệt (giữ sổ sạch — FR10).
      await run(
        `UPDATE drawing_revisions
            SET status = 'rejected', decided_at = CURRENT_DATE,
                decision_note = ?,
                standardize_report = jsonb_set(
                  COALESCE(standardize_report, '{}'::jsonb), '{serverValidation}', ?::jsonb)
          WHERE id = ? AND status = 'submitted'`,
        `[ezdxf] Kiểm định server KHÔNG đạt: ${(task.result?.errors ?? []).slice(0, 5).join("; ") || "xem standardize_report"}`,
        JSON.stringify(task.result ?? {}),
        revisionId,
      );
    } else {
      await run(
        `UPDATE drawing_revisions
            SET standardize_report = jsonb_set(
                  COALESCE(standardize_report, '{}'::jsonb), '{serverValidation}', ?::jsonb)
          WHERE id = ? AND standardize_report -> 'serverValidation' ->> 'status' = 'processing'`,
        JSON.stringify(task.result ?? {}),
        revisionId,
      );
    }
  }
  return { kind: "ok", status: valid ? "ok" : "rejected", revisionId, validation: task.result };
}
