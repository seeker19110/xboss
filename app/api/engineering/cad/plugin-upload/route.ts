import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { GIOI_HAN_TEP_CAD } from "@/lib/ky-thuat/cad/gioi-han";
import { GIOI_HAN_DWG_PLUGIN, nhanPluginUpload } from "@/lib/ky-thuat/cad/plugin-upload";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/plugin-upload — XBOSS_UPLOAD gửi DWG + DXF sidecar + báo cáo
// (M99 PR5, §10). Bearer token scope 'cad' (kiểm trước — plugin không có cookies) hoặc phiên
// web; quyền CAN.manageDrawings; rate limit theo user. Route chỉ là ranh giới HTTP (ADR-0008)
// — toàn bộ nghiệp vụ nằm ở lib/ky-thuat/cad/plugin-upload.ts.
export async function POST(req: NextRequest) {
  const user =
    (await getCadTokenUser(req.headers.get("authorization"))) ?? (await getCurrentUser());
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền nộp bản vẽ" }, { status: 403 });
  }
  if (await hitRateLimit(`cad-upload:${user.id}`, 30, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn nộp bản vẽ (30 lượt/15 phút) — thử lại sau" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form)
    return NextResponse.json({ error: "Body phải là multipart/form-data" }, { status: 400 });

  const dwgFile = form.get("dwg");
  const dxfFile = form.get("dxf");
  if (!(dwgFile instanceof File) || !(dxfFile instanceof File)) {
    return NextResponse.json({ error: "Thiếu tệp dwg hoặc dxf sidecar" }, { status: 400 });
  }
  if (dwgFile.size > GIOI_HAN_DWG_PLUGIN) {
    return NextResponse.json(
      { error: `DWG vượt trần ${Math.round(GIOI_HAN_DWG_PLUGIN / 1024 / 1024)}MB` },
      { status: 413 },
    );
  }
  if (dxfFile.size > GIOI_HAN_TEP_CAD) {
    return NextResponse.json(
      { error: `DXF sidecar vượt trần ${Math.round(GIOI_HAN_TEP_CAD / 1024 / 1024)}MB` },
      { status: 413 },
    );
  }

  const rulePackVersion = String(form.get("rulePackVersion") ?? "").trim();
  if (!rulePackVersion) {
    return NextResponse.json({ error: "Thiếu rulePackVersion" }, { status: 400 });
  }
  let report: unknown = null;
  const reportRaw = form.get("report");
  if (typeof reportRaw === "string" && reportRaw.length > 0) {
    try {
      report = JSON.parse(reportRaw);
    } catch {
      return NextResponse.json({ error: "report không phải JSON hợp lệ" }, { status: 400 });
    }
  }

  // Không tin project client gửi — đối chiếu danh sách dự án user thấy (như save-drawing).
  const chotDuAn = await chotProjectIdChoGhi(
    user,
    form.get("projectId") ?? undefined,
    (await getCurrentProjectId(user)) || 1,
  );
  if (!chotDuAn.ok) {
    return NextResponse.json({ error: "Không có quyền nộp bản vẽ vào dự án này" }, { status: 403 });
  }

  const kq = await nhanPluginUpload({
    user,
    projectId: chotDuAn.projectId,
    dwg: Buffer.from(await dwgFile.arrayBuffer()),
    dwgOriginalName: dwgFile.name,
    dxfContent: await dxfFile.text(),
    report,
    rulePackVersion,
    drawingCode: String(form.get("drawingCode") ?? ""),
    drawingName: String(form.get("drawingName") ?? ""),
    systems: String(form.get("systems") ?? ""),
    rev: String(form.get("rev") ?? ""),
  });

  switch (kq.kind) {
    case "invalid-dxf":
      // AC5: tệp không đạt chuẩn → 422, KHÔNG tạo drawing_revision.
      return NextResponse.json(
        { error: "DXF sidecar không hợp lệ — không nhận bản vẽ", errors: kq.errors.slice(0, 10) },
        { status: 422 },
      );
    case "rule-pack-cu":
      // AC8: rule pack lỗi thời/cache → chặn tải lên.
      return NextResponse.json(
        {
          error: `Rule pack ${rulePackVersion} đã lỗi thời (hiện hành: ${kq.hienHanh}) — chạy XBOSS_LOGIN để cập nhật rồi chuẩn hóa lại`,
        },
        { status: 409 },
      );
    case "trung-lap":
      // Idempotent theo nội dung DWG: cùng tệp → trả revision đã có, không tạo trùng.
      return NextResponse.json({ status: "duplicated", revisionId: kq.revisionId });
    case "rev-ton-tai":
      return NextResponse.json(
        { error: "Revision này đã tồn tại cho bản vẽ — tăng rev (A → B…) rồi nộp lại" },
        { status: 409 },
      );
    default:
      return NextResponse.json(
        { status: "accepted", jobId: kq.jobId, drawingId: kq.drawingId, revisionId: kq.revisionId },
        { status: 202 },
      );
  }
}
