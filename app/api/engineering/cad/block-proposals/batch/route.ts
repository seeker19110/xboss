import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { GIOI_HAN_TEP_CAD } from "@/lib/ky-thuat/cad/dashboard";
import { isContentTooLarge } from "@/lib/nen/photos";
import { docUngVienTuDxf } from "@/lib/ky-thuat/cad/block";
import { napLoBlock } from "@/lib/dich-vu/cad";

export const dynamic = "force-dynamic";

// /api/engineering/cad/block-proposals/batch — nạp MỘT LÔ block từ tệp tổng hợp (M108 §10).
//
// Khác đường M104 (`/block-lib/blocks`, thêm 1 block phát hành thẳng): lô LUÔN qua hàng chờ duyệt,
// không bao giờ đổi thư viện ngay — không block nào vào thư viện mà không qua mắt người (§2 O3).
//
// Multipart: `dxf` (bắt buộc — thứ duy nhất máy chủ đọc được vì không chạy AutoCAD),
//            `dwg` (tuỳ chọn — gói gộp của đường plugin).

export async function POST(req: NextRequest) {
  // Bearer kiểm TRƯỚC: request của plugin không có cookie, và `getCurrentUser()` đụng `cookies()`
  // (cùng lý do đã ghi ở route block-proposals của M103). Nhận cả hai đường vì lô đến từ **cả
  // AutoCAD lẫn web** (M108 §4).
  const nguoiTuToken = await getCadTokenUser(req.headers.get("authorization"));
  const laPlugin = nguoiTuToken !== null;
  const user = nguoiTuToken ?? (await getCurrentUser());
  if (!user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập hoặc token thiết bị không hợp lệ — chạy XBOSS_LOGIN" },
      { status: 401 },
    );
  }
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json(
      { error: "Chỉ Admin/PM/Kỹ sư được nạp block vào thư viện" },
      { status: 403 },
    );
  }
  // Nạp lô nặng hơn thêm lẻ nhiều (đọc cả tệp + có thể gọi mô hình) nên siết chặt hơn.
  if (await hitRateLimit(`cad-block-lo:${user.id}`, 5, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn nạp lô (5 lượt/15 phút)" },
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

  const dxf = form.get("dxf");
  const dwg = form.get("dwg");
  if (!(dxf instanceof File)) {
    return NextResponse.json(
      { error: "Thiếu trường bắt buộc: dxf (xuất DXF từ chính tệp tổng hợp chứa các block)" },
      { status: 400 },
    );
  }
  // content-length có thể vắng khi gửi chunked — kiểm kích thước THẬT trước khi buffer vào RAM.
  if (dxf.size > GIOI_HAN_TEP_CAD || (dwg instanceof File && dwg.size > GIOI_HAN_TEP_CAD)) {
    return NextResponse.json(
      { error: `Tệp vượt trần ${Math.floor(GIOI_HAN_TEP_CAD / (1024 * 1024))}MB` },
      { status: 413 },
    );
  }

  let ungViens;
  try {
    ungViens = docUngVienTuDxf(await dxf.text());
  } catch (e) {
    return NextResponse.json(
      { errors: [`Không parse được tệp .dxf: ${e instanceof Error ? e.message : String(e)}`] },
      { status: 422 },
    );
  }

  const kq = await napLoBlock({
    userId: user.id,
    // Nguồn xác định theo CÁCH XÁC THỰC, không theo việc có gửi kèm .dwg hay không: chỉ plugin
    // mới có token thiết bị, và đó mới là thứ phân biệt thật giữa hai đường.
    nguon: laPlugin ? "plugin" : "web",
    ungViens,
  });

  if (kq.status === "invalid") return NextResponse.json({ errors: kq.errors }, { status: 422 });
  if (kq.status === "conflict") {
    return NextResponse.json(
      { error: kq.message, versionHienHanh: kq.versionHienHanh },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { loId: kq.loId, tong: kq.tong, boQua: kq.boQua, lyDoAiKhongChay: kq.lyDoAiKhongChay ?? null },
    { status: 201 },
  );
}
