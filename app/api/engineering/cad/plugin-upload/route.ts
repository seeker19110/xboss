import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  enqueueAsyncTask,
  completeAsyncTask,
  failAsyncTask,
} from "@/lib/ky-thuat/engineering-task-queue";
import { xuLyPluginUpload } from "@/lib/ky-thuat/cad/plugin-upload";
import { GIOI_HAN_TEP_CAD } from "@/lib/ky-thuat/cad/gioi-han";
import { isContentTooLarge } from "@/lib/nen/photos";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/plugin-upload — XBOSS_UPLOAD gửi DWG + DXF sidecar + báo cáo
// chuẩn hóa + rulePackVersion (M99 PR5, FR9/FR10). Auth: Bearer token cad của plugin
// (đường chính) hoặc phiên web; quyền CAN.manageDrawings; scope theo dự án của bản vẽ.
// Kiểm định chạy NGAY trong request (parser TS, vài giây với sidecar ≤150MB) nhưng kết quả
// vẫn ghi vào hàng đợi engineering_async_tasks để giữ đúng hợp đồng §10:
//   đạt  → 202 { jobId }  (GET /:jobId trả { status, validation, revisionId })
//   fail → 422 { jobId, validation } và KHÔNG tạo revision (AC5)
export async function POST(req: NextRequest) {
  const user =
    (await getCadTokenUser(req.headers.get("authorization"))) ?? (await getCurrentUser());
  if (!user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập hoặc token thiết bị không hợp lệ — chạy XBOSS_LOGIN" },
      { status: 401 },
    );
  }
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền tải bản vẽ lên" }, { status: 403 });
  }
  if (await hitRateLimit(`cad-upload:${user.id}`, 30, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn tải lên (30 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  if (isContentTooLarge(req.headers.get("content-length"), GIOI_HAN_TEP_CAD)) {
    return NextResponse.json(
      { error: `Tệp vượt trần ${Math.floor(GIOI_HAN_TEP_CAD / (1024 * 1024))}MB` },
      { status: 413 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Body multipart không hợp lệ" }, { status: 400 });

  const dwg = form.get("dwg");
  const dxf = form.get("dxf");
  const rulePackVersion = String(form.get("rulePackVersion") ?? "").trim();
  const rev = String(form.get("rev") ?? "").trim();
  const drawingCode = String(form.get("drawingCode") ?? "").trim();
  const drawingIdTho = String(form.get("drawingId") ?? "").trim();
  if (!(dwg instanceof File) || !(dxf instanceof File) || !rulePackVersion || !rev) {
    return NextResponse.json(
      { error: "Thiếu trường bắt buộc: dwg, dxf, rulePackVersion, rev" },
      { status: 400 },
    );
  }
  if (!drawingCode && !drawingIdTho) {
    return NextResponse.json(
      { error: "Thiếu drawingCode (số bản vẽ) hoặc drawingId" },
      { status: 400 },
    );
  }

  // Bản vẽ đích + scope dự án: bản vẽ phải thuộc dự án người dùng được phép thao tác.
  const drawing = drawingIdTho
    ? await queryOne<{ id: number; project_id: number | null }>(
        `SELECT id, project_id FROM drawings WHERE id = ?`,
        Number(drawingIdTho),
      )
    : await queryOne<{ id: number; project_id: number | null }>(
        `SELECT id, project_id FROM drawings WHERE code = ?`,
        drawingCode,
      );
  if (!drawing) {
    return NextResponse.json(
      {
        error: `Không tìm thấy bản vẽ ${drawingCode || `#${drawingIdTho}`} — tạo bản vẽ trong sổ trước`,
      },
      { status: 404 },
    );
  }
  const chot = await chotProjectIdChoGhi(
    user,
    drawing.project_id,
    (await getCurrentProjectId(user)) || 1,
  );
  if (!chot.ok) {
    return NextResponse.json(
      { error: "Bản vẽ không thuộc dự án bạn được thao tác" },
      { status: 403 },
    );
  }
  const projectId = drawing.project_id ?? chot.projectId;

  const reportRaw = form.get("report");
  let report: Record<string, unknown> | null = null;
  if (reportRaw instanceof File) {
    try {
      report = JSON.parse(await reportRaw.text());
    } catch {
      return NextResponse.json({ error: "report.json không phải JSON hợp lệ" }, { status: 400 });
    }
  }

  const job = await enqueueAsyncTask({
    projectId,
    taskType: "cad.plugin-upload",
    payload: {
      drawingId: drawing.id,
      rev,
      rulePackVersion,
      dwgName: dwg.name,
      sizeBytes: dwg.size,
    },
    createdBy: user.id,
  });

  try {
    const kq = await xuLyPluginUpload({
      drawingId: drawing.id,
      orgId: user.orgId,
      userId: user.id,
      rev,
      rulePackVersion,
      dwg: Buffer.from(await dwg.arrayBuffer()),
      dwgName: dwg.name,
      dxfText: await dxf.text(),
      report,
    });

    if (kq.status === "invalid") {
      await failAsyncTask(job.id, `Kiểm định thất bại: ${kq.validation.errors.join(" · ")}`);
      return NextResponse.json({ jobId: job.id, validation: kq.validation }, { status: 422 });
    }
    if (kq.status === "rev-conflict") {
      await failAsyncTask(job.id, kq.message);
      return NextResponse.json({ jobId: job.id, error: kq.message }, { status: 409 });
    }
    await completeAsyncTask(job.id, {
      revisionId: kq.revisionId,
      idempotent: kq.status === "idempotent",
      validation: kq.validation as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (e) {
    await failAsyncTask(job.id, e instanceof Error ? e.message : String(e));
    throw e;
  }
}
