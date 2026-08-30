import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { isContentTooLarge } from "@/lib/nen/photos";
import { newStandardizedDrawingFileName } from "@/lib/nen/photos";
import { storagePut } from "@/lib/nen/storage";
import { heSchematicHopLe, taoGraphSchematic } from "@/lib/dich-vu/cad";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/schematic — M117 PR2 (§7 FR1/FR5): nạp một tệp DXF SƠ ĐỒ NGUYÊN LÝ
// của dự án, dựng đồ thị kết nối (tầng 1 luật + tầng 2 AI nếu bật) rồi lưu ở trạng thái `nhap`.
//
// Quyền Admin/PM/kỹ sư của dự án (`CAN.manageDrawings`), id dự án đối chiếu lại qua
// `chotProjectIdChoGhi` (không tin client). Tắt AI vẫn nạp được, chỉ nhiều phần `chua_quyet` hơn.

/** Trần tệp schematic (M117 §7 FR1) — hẹp hơn trần chung của bản vẽ CAD vì đây là sơ đồ, không phải mặt bằng. */
const TRAN_TEP_SCHEMATIC = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền nạp sơ đồ nguyên lý" }, { status: 403 });
  }
  // Nạp schematic là thao tác nặng (parse tệp + gọi mô hình) — chặn vòng lặp nạp.
  if (await hitRateLimit(`cad-schematic:${user.id}`, 10, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn nạp sơ đồ nguyên lý (10 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  if (isContentTooLarge(req.headers.get("content-length"), TRAN_TEP_SCHEMATIC)) {
    return NextResponse.json({ error: "Tệp vượt trần 50MB" }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Body multipart không hợp lệ" }, { status: 400 });

  const tep = form.get("dxf");
  if (!(tep instanceof File)) {
    return NextResponse.json({ error: "Thiếu trường dxf (tệp sơ đồ nguyên lý)" }, { status: 400 });
  }
  // Header content-length có thể vắng khi body gửi chunked — kiểm kích thước THẬT trước khi nạp
  // nội dung vào RAM.
  if (tep.size > TRAN_TEP_SCHEMATIC) {
    return NextResponse.json({ error: "Tệp vượt trần 50MB" }, { status: 413 });
  }
  if (!tep.name.toLowerCase().endsWith(".dxf")) {
    return NextResponse.json(
      { error: "Chỉ nhận tệp .dxf — xuất DXF từ AutoCAD rồi nạp lại" },
      { status: 400 },
    );
  }

  const he = form.get("system");
  if (!heSchematicHopLe(he)) {
    const hopLe = getCurrentRulePack()
      .drawTools.systems.map((s) => s.id)
      .join(", ");
    return NextResponse.json(
      { error: `Hệ không hợp lệ — chọn một trong: ${hopLe}` },
      { status: 400 },
    );
  }

  const chot = await chotProjectIdChoGhi(
    user,
    form.get("project"),
    (await getCurrentProjectId(user)) ?? 0,
  );
  // Ngoài phạm vi ⇒ 404, không tiết lộ sự tồn tại của dự án khác.
  if (!chot.ok) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });

  const noiDung = Buffer.from(await tep.arrayBuffer());
  const fileName = newStandardizedDrawingFileName("dxf");
  await storagePut(user.orgId, fileName, noiDung);

  const kq = await taoGraphSchematic({
    projectId: chot.projectId,
    userId: user.id,
    systemId: he,
    filePath: fileName,
    dxf: noiDung,
  });

  return NextResponse.json(
    {
      id: kq.id,
      projectId: chot.projectId,
      systemId: he,
      trangThai: "nhap",
      graph: kq.graph,
      aiDaChay: kq.aiDaChay,
      lyDoAiKhongChay: kq.lyDoAiKhongChay,
    },
    { status: 201 },
  );
}
