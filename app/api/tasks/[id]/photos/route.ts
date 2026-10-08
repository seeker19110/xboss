import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, withTransaction } from "@/lib/db";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { newPhotoFileName, MAX_PHOTO_BYTES, sha256Hex, parseUploadedFile } from "@/lib/nen/photos";
import { taskProjectId } from "@/lib/tien-do/workpackages";
import {
  chotStaging,
  datFileStaging,
  doiSoatAnhMoCoi,
  donFileStaging,
} from "@/lib/tien-do/anh-staging";
import {
  bamYeuCau,
  docThaoTacHangDoi,
  ghiBienNhan,
  khoaVaTraBienNhan,
  type PhamViBienNhan,
} from "@/lib/bao-mat/offline-receipt";
import { chotNguCanhHangDoi, traLoiOfflineHoacNem } from "@/lib/bao-mat/offline-http";
import { log } from "@/lib/nen/log";

export const dynamic = "force-dynamic";

// GET /api/tasks/:id/photos → danh sách ảnh hiện trường của task (subcon chỉ
// xem được task được giao cho mình — cùng quy tắc với POST/comments).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  // Cách ly dự án (vá W6, Đợt 5) — canTouchTask không so dự án, xem ghi chú ở
  // app/api/dimensions/[id]/route.ts.
  if (projectId == null || (await taskProjectId(taskId)) !== projectId)
    return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  if (!(await canTouchTask(user, taskId)))
    return NextResponse.json(
      { error: "Bạn chỉ được xem ảnh của task được giao cho mình" },
      { status: 403 },
    );

  const photos = await query(
    `SELECT p.id, p.original_name AS "originalName", p.mime_type AS "mimeType",
            p.size_bytes AS "sizeBytes", p.caption, p.created_at AS "createdAt",
            p.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
       FROM task_photos p
       LEFT JOIN users u ON p.uploaded_by = u.id
      WHERE p.task_id = ? ORDER BY p.id DESC`,
    taskId,
  );
  return NextResponse.json({ photos });
}

// POST /api/tasks/:id/photos → upload ảnh (multipart: file, caption?).
// Mọi vai trò được cập nhật tiến độ đều được upload; subcon chỉ cho task được giao.
// Hàng đợi offline (S06, kind `photo`): Idempotency-Key + X-XBoss-Context → receipt; cùng key một
// dòng task_photos, replay trả `{ receipt }`. File đi qua staging (lib/tien-do/anh-staging.ts): ghi
// metadata lỗi/huỷ thì file được dọn, không để file mồ côi.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền upload ảnh" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  const taskId = parseInt(params.id);
  if (isNaN(taskId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // Context kiểm TRƯỚC phạm vi tài nguyên (xem app/api/dimensions/[id]/route.ts).
  let op: ReturnType<typeof docThaoTacHangDoi>;
  try {
    op = docThaoTacHangDoi(req.headers);
    if (op) await chotNguCanhHangDoi(op.context, user, projectId);
  } catch (e) {
    return traLoiOfflineHoacNem(e);
  }

  const task = await queryOne<{ id: number }>(`SELECT id FROM tasks WHERE id = ?`, taskId);
  if (!task) return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });

  // Cách ly dự án (vá W6, Đợt 5) — canTouchTask không so dự án.
  if (projectId == null || (await taskProjectId(taskId)) !== projectId)
    return NextResponse.json({ error: "Không tìm thấy task" }, { status: 404 });
  if (!(await canTouchTask(user, taskId)))
    return NextResponse.json(
      { error: "Bạn chỉ được upload ảnh cho task được giao cho mình" },
      { status: 403 },
    );

  const up = await parseUploadedFile(req, { accept: "image", maxBytes: MAX_PHOTO_BYTES });
  if (!up.ok) return NextResponse.json({ error: up.error }, { status: up.status });
  const { form, file, buf: fileBuf } = up;

  const hash = sha256Hex(fileBuf);
  const caption = String(form.get("caption") ?? "").trim() || null;
  const originalName = file.name || null;

  // Receipt (S06): digest BYTE ảnh + metadata sẽ ghi (không dính boundary multipart).
  const bn: PhamViBienNhan | null = op
    ? {
        user,
        projectId,
        operationId: op.operationId,
        kind: "photo",
        hash: bamYeuCau({
          kind: "photo",
          orgId: user.orgId,
          projectId,
          userId: user.id,
          target: { taskId },
          payload: { sha256: hash, size: file.size, mime: file.type, caption, originalName },
          baseVersion: null,
        }),
      }
    : null;

  // Đối soát file mồ côi cũ của chính người này (best-effort, không chặn upload).
  await doiSoatAnhMoCoi(user).catch((e) =>
    log.warn("Đối soát ảnh mồ côi lỗi", { loi: e instanceof Error ? e.message : String(e) }),
  );

  // Bước 1 — trước khi ghi file: replay theo receipt, hoặc chống trùng nội dung cũ (offlineQueue v1
  // gửi lại cùng ảnh: cùng task + cùng hash trong 24h → trả ảnh đã có, không ghi file/dòng mới).
  let truoc;
  try {
    truoc = await withTransaction(async () => {
      if (bn) {
        const replay = await khoaVaTraBienNhan(bn);
        if (replay) return { replay } as const;
      }
      const existing = await queryOne<{ id: number; caption: string | null; sizeBytes: number }>(
        `SELECT id, caption, size_bytes AS "sizeBytes"
           FROM task_photos
          WHERE task_id = ? AND sha256 = ? AND created_at > now() - interval '24 hours'
          ORDER BY id DESC LIMIT 1`,
        taskId,
        hash,
      );
      if (!existing) return null;
      const receipt = bn
        ? await ghiBienNhan(bn, {
            resourceType: "task_photo",
            resourceId: String(existing.id),
            version: null,
          })
        : undefined;
      return { existing, receipt } as const;
    });
  } catch (e) {
    return traLoiOfflineHoacNem(e);
  }
  if (truoc && "replay" in truoc) return NextResponse.json({ receipt: truoc.replay });
  if (truoc)
    return NextResponse.json(
      {
        id: truoc.existing.id,
        taskId,
        caption: truoc.existing.caption,
        sizeBytes: truoc.existing.sizeBytes,
        deduped: true,
        ...(truoc.receipt ? { receipt: truoc.receipt } : {}),
      },
      { status: 200 },
    );

  // Bước 2 — metadata staging (đã COMMIT) rồi mới đặt file.
  const fileName = newPhotoFileName(taskId, file.type);
  await datFileStaging(user, taskId, fileName, fileBuf);

  // Bước 3 — metadata + receipt + chốt staging cùng MỘT transaction. Tra receipt lại dưới khoá:
  // request đồng thời cùng key đã thắng ở đây thì file vừa đặt là thừa → dọn.
  let kq;
  try {
    kq = await withTransaction(async () => {
      if (bn) {
        const replay = await khoaVaTraBienNhan(bn);
        if (replay) return { replay } as const;
      }
      const id = await insertId(
        `INSERT INTO task_photos (task_id, file_name, original_name, mime_type, size_bytes, caption, uploaded_by, sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        taskId,
        fileName,
        originalName,
        file.type,
        file.size,
        caption,
        user.id,
        hash,
      );
      const receipt = bn
        ? await ghiBienNhan(bn, {
            resourceType: "task_photo",
            resourceId: String(id),
            version: null,
          })
        : undefined;
      await chotStaging(fileName);
      return { id, receipt } as const;
    });
  } catch (e) {
    await donFileStaging(user, fileName);
    return traLoiOfflineHoacNem(e);
  }
  if ("replay" in kq) {
    await donFileStaging(user, fileName);
    return NextResponse.json({ receipt: kq.replay });
  }

  return NextResponse.json(
    {
      id: kq.id,
      taskId,
      caption,
      sizeBytes: file.size,
      ...(kq.receipt ? { receipt: kq.receipt } : {}),
    },
    { status: 201 },
  );
}
