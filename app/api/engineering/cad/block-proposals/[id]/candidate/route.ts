import { NextRequest, NextResponse } from "next/server";
import { CAN, getCurrentUser } from "@/lib/bao-mat/auth";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { layTepUngVien } from "@/lib/ky-thuat/cad/block-proposals";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/block-proposals/:id/candidate — tải tệp .dwg ứng viên của một đề xuất
// (bổ sung M103): người duyệt trước đây chỉ có ảnh xem trước SVG best-effort dựng từ sidecar DXF
// (có thể null) — route này cho tải TỆP THẬT về đối chiếu trước khi Duyệt & Phát Hành.
//
// CHỈ phiên web (KHÔNG nhận token thiết bị — đây là đường xem trong trình duyệt của con người,
// khác với đường plugin nộp/tải thư viện qua Bearer). Chỉ ĐỌC, không ghi.
//
// Quyền: người duyệt (`CAN.approve` — cùng quyền duyệt/từ chối đề xuất) hoặc chính người gửi đề
// xuất (`proposed_by`). `candidate_storage_key` đọc THẲNG từ dòng DB theo `id` — không nhận/ghép
// đường dẫn nào từ input client nên không có đường path traversal.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id đề xuất không hợp lệ" }, { status: 400 });
  }

  if (await hitRateLimit(`cad-block-proposal-candidate:${user.id}`, 30, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn tải tệp ứng viên (30 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const kq = await layTepUngVien({ id, userId: user.id, coQuyenDuyet: CAN.approve(user.role) });
  if (kq.status === "not-found") {
    return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  }
  if (kq.status === "forbidden") {
    return NextResponse.json(
      { error: "Chỉ người duyệt hoặc chính người đề xuất được tải tệp ứng viên" },
      { status: 403 },
    );
  }
  if (kq.status === "missing-file") {
    return NextResponse.json(
      { error: "Tệp .dwg ứng viên không còn trên kho lưu trữ" },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(kq.buf), {
    headers: {
      "Content-Type": "application/acad",
      "X-Content-Type-Options": "nosniff", // chặn browser sniff nội dung khác mime
      "X-Candidate-Sha256": kq.sha256,
      "Content-Length": String(kq.buf.length),
      "Content-Disposition": `attachment; filename="${kq.blockName.replace(/[^A-Za-z0-9._-]/g, "-")}-ung-vien.dwg"`,
    },
  });
}
