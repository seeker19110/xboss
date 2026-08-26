import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  docBangDot,
  luuKetQuaChiaDot,
  type JointRunInput,
  type JointSegmentInput,
} from "@/lib/ky-thuat/joint-segmentation-store";
import {
  explodeJointHardware,
  docJointRulesTuRulePack,
  SAI_SO_TONG_CHIEU_DAI_MM,
  type JointHardwareLine,
} from "@/lib/ky-thuat/engineering-joint-segmentation";
import { RULE_PACK_HIEN_HANH } from "@/lib/ky-thuat/cad/rule-pack-hien-hanh";

export const dynamic = "force-dynamic";

// M105 §10 — bảng đốt MEPF (kết quả chia đốt theo kiểu kết nối).
//   POST: XBOSS_VE_CHIADOT/XBOSS_BOCKL đẩy lên (token thiết bị CAD) hoặc phiên web.
//   GET : mọi vai trò đã đăng nhập xem bảng đốt của một bản vẽ.
// Bản vẽ là nguồn sự thật của dự án — không tin projectId phía client gửi.

const DIVIDE_MODES = ["deu", "cay_nguyen"] as const;

/** Lỗi kiểm đầu vào: trả kèm chỗ sai để plugin/kỹ sư biết tuyến nào hỏng. */
type LoiKiem = { thongDiep: string };

function kiemSegment(seg: unknown, viTri: string): LoiKiem | JointSegmentInput {
  if (!seg || typeof seg !== "object") return { thongDiep: `${viTri}: đoạn không hợp lệ` };
  const s = seg as Record<string, unknown>;
  const lengthMm = Number(s.lengthMm);
  const gapMm = Number(s.gapMm ?? 0);
  const pieces = Array.isArray(s.pieces) ? s.pieces.map(Number) : null;
  if (!Number.isFinite(lengthMm) || lengthMm <= 0)
    return { thongDiep: `${viTri}: lengthMm phải là số dương` };
  if (!Number.isFinite(gapMm) || gapMm < 0)
    return { thongDiep: `${viTri}: gapMm phải là số không âm` };
  if (!pieces || pieces.length === 0 || pieces.some((p) => !Number.isFinite(p) || p <= 0))
    return { thongDiep: `${viTri}: pieces phải là danh sách số dương` };

  // Bất biến FR2 — kiểm LẠI ở server, không tin client đã chia đúng.
  const tong = pieces.reduce((a, b) => a + b, 0) + (pieces.length - 1) * gapMm;
  if (Math.abs(tong - lengthMm) > SAI_SO_TONG_CHIEU_DAI_MM)
    return {
      thongDiep: `${viTri}: tổng đốt + khe (${tong.toFixed(1)}mm) lệch chiều dài đoạn (${lengthMm.toFixed(1)}mm)`,
    };
  return { lengthMm, gapMm, pieces };
}

function kiemRun(run: unknown, viTri: string): LoiKiem | JointRunInput {
  if (!run || typeof run !== "object") return { thongDiep: `${viTri}: tuyến không hợp lệ` };
  const r = run as Record<string, unknown>;
  const systemId = String(r.systemId ?? "").trim();
  const itemId = String(r.itemId ?? "").trim();
  const size = String(r.size ?? "").trim();
  const jointType = String(r.jointType ?? "").trim();
  const divideMode = String(r.divideMode ?? "").trim();
  if (!systemId || !itemId || !size || !jointType)
    return { thongDiep: `${viTri}: thiếu systemId/itemId/size/jointType` };
  if (!(DIVIDE_MODES as readonly string[]).includes(divideMode))
    return { thongDiep: `${viTri}: divideMode phải là "deu" hoặc "cay_nguyen"` };
  if (!Array.isArray(r.segments) || r.segments.length === 0)
    return { thongDiep: `${viTri}: thiếu segments` };

  const segments: JointSegmentInput[] = [];
  for (let i = 0; i < r.segments.length; i++) {
    const kq = kiemSegment(r.segments[i], `${viTri} · đoạn ${i + 1}`);
    if ("thongDiep" in kq) return kq;
    segments.push(kq);
  }
  return {
    runKey: r.runKey ? String(r.runKey).trim() : undefined,
    systemId,
    itemId,
    size,
    jointType,
    overridden: r.overridden === true,
    divideMode: divideMode as JointRunInput["divideMode"],
    segments,
  };
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
    return NextResponse.json({ error: "Không có quyền ghi bảng đốt" }, { status: 403 });
  }
  if (await hitRateLimit(`chia-dot:${user.id}`, 60, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn ghi bảng đốt (60 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Body JSON không hợp lệ" }, { status: 400 });

  const drawingId = Number(body.drawingId);
  const rulePackVersion = String(body.rulePackVersion ?? "").trim();
  if (!Number.isInteger(drawingId) || drawingId <= 0 || !rulePackVersion)
    return NextResponse.json(
      { error: "Thiếu trường bắt buộc: drawingId, rulePackVersion" },
      { status: 400 },
    );
  if (!Array.isArray(body.runs) || body.runs.length === 0)
    return NextResponse.json({ error: "Thiếu danh sách tuyến (runs)" }, { status: 400 });

  const runs: JointRunInput[] = [];
  for (let i = 0; i < body.runs.length; i++) {
    const kq = kiemRun(body.runs[i], `Tuyến ${i + 1}`);
    if ("thongDiep" in kq) return NextResponse.json({ error: kq.thongDiep }, { status: 422 });
    runs.push(kq);
  }

  const drawing = await queryOne<{ id: number; project_id: number | null }>(
    `SELECT id, project_id FROM drawings WHERE id = ?`,
    drawingId,
  );
  if (!drawing)
    return NextResponse.json({ error: `Không tìm thấy bản vẽ #${drawingId}` }, { status: 404 });

  const chot = await chotProjectIdChoGhi(
    user,
    drawing.project_id,
    (await getCurrentProjectId(user)) || 1,
  );
  if (!chot.ok)
    return NextResponse.json(
      { error: "Bản vẽ không thuộc dự án bạn được thao tác" },
      { status: 403 },
    );
  const projectId = drawing.project_id ?? chot.projectId;

  const kq = await luuKetQuaChiaDot(projectId, drawingId, rulePackVersion, runs, user.id);
  return NextResponse.json(kq);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const drawingId = Number(req.nextUrl.searchParams.get("drawingId"));
  if (!Number.isInteger(drawingId) || drawingId <= 0)
    return NextResponse.json({ error: "Thiếu drawingId" }, { status: 400 });

  const drawing = await queryOne<{ id: number; project_id: number | null }>(
    `SELECT id, project_id FROM drawings WHERE id = ?`,
    drawingId,
  );
  if (!drawing)
    return NextResponse.json({ error: `Không tìm thấy bản vẽ #${drawingId}` }, { status: 404 });

  const projectId = drawing.project_id ?? (await getCurrentProjectId(user)) ?? 0;
  if (!projectId) return NextResponse.json({ runs: [], hardware: [] });

  const runs = await docBangDot(projectId, drawingId);

  // Phụ kiện mối nối suy từ runs × định mức rule pack HIỆN HÀNH lúc đọc (không lưu bảng
  // riêng — đổi định mức không phải backfill, M105 §11).
  const gop = new Map<string, JointHardwareLine>();
  for (const run of runs) {
    const rule = docJointRulesTuRulePack(RULE_PACK_HIEN_HANH, run.systemId, run.itemId);
    if (!rule) continue;
    const dong = explodeJointHardware(
      { size: run.size, jointType: run.jointType, jointCount: run.jointCount },
      rule.hardware,
    );
    for (const d of dong) {
      const khoa = `${d.item}|${d.unit}`;
      const cu = gop.get(khoa);
      gop.set(khoa, cu ? { ...cu, quantity: cu.quantity + d.quantity } : { ...d });
    }
  }

  return NextResponse.json({
    runs,
    hardware: [...gop.values()].sort((a, b) => a.item.localeCompare(b.item, "vi")),
  });
}
