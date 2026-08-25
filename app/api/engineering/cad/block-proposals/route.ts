import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { GIOI_HAN_TEP_CAD } from "@/lib/ky-thuat/cad/gioi-han";
import { isContentTooLarge } from "@/lib/nen/photos";
import { layDanhSachDeXuat, nhanDeXuat } from "@/lib/ky-thuat/cad/block-proposals";

export const dynamic = "force-dynamic";

// /api/engineering/cad/block-proposals — hàng chờ đề xuất block vào thư viện (M103 §3).
//
// POST plugin gửi gói ứng viên (XBOSS_VE_DEXUAT): token thiết bị scope 'cad' hoặc phiên web,
//      quyền CAN.manageDrawings (admin/pm/engineer — subcon/viewer bị 403 theo AC6).
// GET  danh sách đề xuất: phiên web hoặc token 'cad'; engineer chỉ thấy đề xuất của mình,
//      Admin/PM thấy tất cả.
//
// Same-origin/CSRF đã phủ tập trung ở proxy.ts cho mọi request mutating tới /api/*.

export async function GET(req: NextRequest) {
  // Bearer kiểm TRƯỚC: request của plugin không đụng cookies() (cùng lý do route block-lib).
  const user =
    (await getCadTokenUser(req.headers.get("authorization"))) ?? (await getCurrentUser());
  if (!user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập hoặc token thiết bị không hợp lệ — chạy XBOSS_LOGIN" },
      { status: 401 },
    );
  }
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem đề xuất block" }, { status: 403 });
  }

  const deXuat = await layDanhSachDeXuat({
    status: req.nextUrl.searchParams.get("status") ?? undefined,
    // Engineer chỉ thấy đề xuất của chính mình; Admin/PM thấy toàn bộ hàng chờ.
    chiNguoiDeXuat: isAdminOrPm(user.role) ? undefined : user.id,
  });
  return NextResponse.json({ deXuat, laNguoiDuyet: isAdminOrPm(user.role) });
}

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
    return NextResponse.json(
      { error: "Chỉ Admin/PM/Kỹ sư được đề xuất block vào thư viện" },
      { status: 403 },
    );
  }
  if (await hitRateLimit(`cad-block-proposal:${user.id}`, 10, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn gửi đề xuất (10 lượt/15 phút)" },
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

  const dwg = form.get("candidateDwg");
  const dxf = form.get("sidecarDxf");
  const metaTho = form.get("meta");
  if (!(dwg instanceof File) || !(dxf instanceof File) || !metaTho) {
    return NextResponse.json(
      {
        error:
          "Thiếu trường bắt buộc: candidateDwg (thư viện ứng viên), sidecarDxf (bản DXF để máy chủ kiểm), meta (JSON)",
      },
      { status: 400 },
    );
  }
  // Header content-length có thể vắng khi body gửi chunked — kiểm lại kích thước THẬT ngay khi đã
  // biết đây là File, TRƯỚC khi buffer nội dung vào RAM (arrayBuffer/text).
  const metaSize =
    metaTho instanceof File ? metaTho.size : Buffer.byteLength(String(metaTho), "utf8");
  if (dwg.size > GIOI_HAN_TEP_CAD || dxf.size > GIOI_HAN_TEP_CAD || metaSize > GIOI_HAN_TEP_CAD) {
    return NextResponse.json(
      { error: `Tệp vượt trần ${Math.floor(GIOI_HAN_TEP_CAD / (1024 * 1024))}MB` },
      { status: 413 },
    );
  }

  // meta nhận cả dạng tệp .json lẫn ô văn bản — trình duyệt gửi tệp, plugin gửi chuỗi.
  const metaText = metaTho instanceof File ? await metaTho.text() : String(metaTho);
  let metaJson: unknown;
  try {
    metaJson = JSON.parse(metaText);
  } catch {
    return NextResponse.json({ error: "meta không phải JSON hợp lệ" }, { status: 400 });
  }

  const kq = await nhanDeXuat({
    userId: user.id,
    metaTho: metaJson,
    dwg: Buffer.from(await dwg.arrayBuffer()),
    dxfText: await dxf.text(),
  });

  if (kq.status === "invalid") {
    return NextResponse.json({ errors: kq.errors }, { status: 422 });
  }
  if (kq.status === "conflict") {
    return NextResponse.json(
      { error: kq.message, loai: kq.loai, versionHienHanh: kq.versionHienHanh },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { id: kq.id, idempotent: kq.status === "idempotent", coPreview: kq.coPreview },
    { status: kq.status === "created" ? 201 : 200 },
  );
}
