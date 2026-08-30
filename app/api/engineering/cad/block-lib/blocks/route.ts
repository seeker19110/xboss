import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { GIOI_HAN_TEP_CAD } from "@/lib/ky-thuat/cad/dashboard";
import { isContentTooLarge } from "@/lib/nen/photos";
import { themBlockTuWeb } from "@/lib/ky-thuat/cad/block";

export const dynamic = "force-dynamic";

// /api/engineering/cad/block-lib/blocks — thêm MỘT block vào thư viện thẳng từ web (M104 §2).
//
// POST chỉ nhận **phiên web** (KHÔNG token thiết bị `cad`): đường từ AutoCAD đã có hàng chờ +
//      duyệt của M103, đường này bỏ qua duyệt nên phải là người đang đăng nhập trên trình duyệt.
//      Vai trò admin/pm/engineer (CAN.manageDrawings) — subcon/viewer/bch 403. Multipart: `dwg`
//      (tệp block), `dxf` (cùng nội dung, để máy chủ kiểm định + dựng ảnh xem trước), `meta` JSON.
//      M113 §6: `project` (query hoặc trường form) TUỲ CHỌN — có thì thêm vào bộ CỦA DỰ ÁN đó
//      (quyền `CAN.manageDrawings` trong phạm vi dự án, id đối chiếu qua `chotProjectIdChoGhi`;
//      tên block còn phải không đụng bộ toàn cục — §4); không có thì y hệt hôm nay (bộ toàn cục).
//      Same-origin/CSRF đã phủ tập trung ở proxy.ts cho mọi request mutating tới /api/*.

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json(
      { error: "Chỉ Admin/PM/Kỹ sư được thêm block vào thư viện" },
      { status: 403 },
    );
  }
  if (await hitRateLimit(`cad-block-lib:${user.id}`, 10, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn thêm block (10 lượt/15 phút)" },
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

  const thamSoDuAn = req.nextUrl.searchParams.get("project") ?? form.get("project");
  let projectId: number | undefined;
  if (typeof thamSoDuAn === "string" && thamSoDuAn !== "") {
    const hienTai = (await getCurrentProjectId(user)) ?? 0;
    const chot = await chotProjectIdChoGhi(user, thamSoDuAn, hienTai);
    // Ngoài phạm vi ⇒ 404, không tiết lộ sự tồn tại của dự án khác (M113 §6).
    if (!chot.ok) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
    projectId = chot.projectId;
  }

  const dwg = form.get("dwg");
  const dxf = form.get("dxf");
  const metaTho = form.get("meta");
  if (!(dwg instanceof File) || !(dxf instanceof File) || !metaTho) {
    return NextResponse.json(
      {
        error:
          "Thiếu trường bắt buộc: dwg (tệp block), dxf (cùng nội dung để máy chủ kiểm), meta (JSON)",
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

  // meta nhận cả dạng tệp .json lẫn ô văn bản — trình duyệt gửi chuỗi, script gửi tệp.
  const metaText = metaTho instanceof File ? await metaTho.text() : String(metaTho);
  let metaJson: unknown;
  try {
    metaJson = JSON.parse(metaText);
  } catch {
    return NextResponse.json({ error: "meta không phải JSON hợp lệ" }, { status: 400 });
  }

  const kq = await themBlockTuWeb({
    userId: user.id,
    metaTho: metaJson,
    dwg: Buffer.from(await dwg.arrayBuffer()),
    dxfText: await dxf.text(),
    projectId,
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
    {
      version: kq.version,
      libId: kq.libId,
      coPreview: kq.coPreview,
      ...(projectId === undefined ? {} : { projectId }),
    },
    { status: 201 },
  );
}
