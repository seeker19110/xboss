import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import {
  chotProjectIdChoDoc,
  chotProjectIdChoGhi,
  getCurrentProjectId,
} from "@/lib/ha-tang/projects";
import { docSuaGraph, layGraphSchematic, suaGraphSchematic } from "@/lib/dich-vu/cad";

export const dynamic = "force-dynamic";

// GET/PATCH /api/engineering/cad/schematic/:id — M117 PR2 (§7 FR4/FR5).
//
// GET   trả graph đầy đủ + metadata cho màn duyệt (PR3).
// PATCH sửa nút/cạnh và/hoặc CHỐT graph (`trang_thai='da_duyet'`, ghi `duyet_boi`/`duyet_luc`).
//       Audit đi qua trigger `audit_row_change` gắn ở migration 0147 (cơ chế audit hiện hành).
//
// Cả hai: quyền Admin/PM/kỹ sư của dự án; id dự án client gửi KHÔNG được tin (chốt lại qua
// `chotProjectId*`), đọc/ghi bọc `withProjectScope` trong tầng dịch vụ (RLS 0146).

function docId(tho: string): number | null {
  const id = Number(tho);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem sơ đồ nguyên lý" }, { status: 403 });
  }
  const id = docId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "Id không hợp lệ" }, { status: 400 });

  const chot = await chotProjectIdChoDoc(user, req.nextUrl.searchParams.get("project"));
  if (!chot.ok) {
    return chot.lyDo === "phai-chon"
      ? NextResponse.json(
          { error: "Bạn thuộc nhiều dự án — chỉ định ?project=<id>", duAn: chot.duAn },
          { status: 409 },
        )
      : NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
  }

  const ban = await layGraphSchematic(chot.projectId, id);
  if (!ban) return NextResponse.json({ error: "Không tìm thấy sơ đồ nguyên lý" }, { status: 404 });
  return NextResponse.json(ban);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền sửa sơ đồ nguyên lý" }, { status: 403 });
  }
  const id = docId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "Id không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (body === null || typeof body !== "object") {
    return NextResponse.json({ error: "Body JSON không hợp lệ" }, { status: 400 });
  }
  const b = body as { sua?: unknown; duyet?: unknown; project?: unknown };
  if (b.duyet !== undefined && typeof b.duyet !== "boolean") {
    return NextResponse.json({ error: "Trường duyet phải là true/false" }, { status: 400 });
  }
  const doc = docSuaGraph(b.sua);
  if ("loi" in doc) return NextResponse.json({ error: doc.loi }, { status: 400 });
  const duyet = b.duyet === true;
  if (!duyet && doc.sua.nodes.length === 0 && doc.sua.edges.length === 0) {
    return NextResponse.json({ error: "Không có gì để sửa và cũng không duyệt" }, { status: 400 });
  }

  const chot = await chotProjectIdChoGhi(user, b.project, (await getCurrentProjectId(user)) ?? 0);
  if (!chot.ok) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });

  const kq = await suaGraphSchematic({
    projectId: chot.projectId,
    id,
    userId: user.id,
    sua: doc.sua,
    duyet,
  });
  if (kq.status === "not-found") {
    return NextResponse.json({ error: "Không tìm thấy sơ đồ nguyên lý" }, { status: 404 });
  }
  if (kq.status === "da-duyet") {
    return NextResponse.json(
      { error: "Graph đã chốt — không sửa/duyệt lại được (plugin đang dùng bản này)" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ...kq.ban, soPhanTuDoi: kq.soPhanTuDoi });
}
