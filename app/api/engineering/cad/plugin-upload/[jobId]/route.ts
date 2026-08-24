import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { layPluginUploadJob } from "@/lib/ky-thuat/cad/plugin-upload";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/plugin-upload/:jobId — plugin poll trạng thái kiểm định ezdxf
// (M99 PR5, §10): { status: processing|ok|rejected|error, validation, revisionId }.
// Worker báo fail → revision tự chuyển 'rejected' trong lib (đường đọc duy nhất của plugin).
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user =
    (await getCadTokenUser(req.headers.get("authorization"))) ?? (await getCurrentUser());
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem job nộp bản vẽ" }, { status: 403 });
  }

  const jobId = (await params).jobId;
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return NextResponse.json({ error: "jobId không hợp lệ" }, { status: 400 });
  }

  const kq = await layPluginUploadJob(jobId, user);
  if (kq.kind === "khong-tim-thay") {
    return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });
  }
  if (kq.kind === "khong-co-quyen") {
    return NextResponse.json({ error: "Job thuộc người dùng khác" }, { status: 403 });
  }
  return NextResponse.json({
    status: kq.status,
    revisionId: kq.revisionId,
    validation: kq.validation,
  });
}
