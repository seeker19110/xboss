import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { thuHoiDeXuat } from "@/lib/ky-thuat/cad/block-proposals";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/block-proposals/:id/withdraw — người gửi đề xuất tự rút lại đề xuất
// SAI của chính mình khi còn "pending" (chưa Admin/PM duyệt/từ chối). Admin/PM vẫn dùng route
// reject sẵn có để từ chối đề xuất của người khác kèm lý do — route này CHỈ cho chính chủ.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  if (await hitRateLimit(`cad-block-proposal-withdraw:${user.id}`, 20, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn thu hồi đề xuất (20 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id đề xuất không hợp lệ" }, { status: 400 });
  }

  const kq = await thuHoiDeXuat({ id, userId: user.id });
  if (kq.status === "not-found") {
    return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 });
  }
  if (kq.status === "forbidden") {
    return NextResponse.json(
      { error: "Chỉ người gửi đề xuất mới được thu hồi" },
      { status: 403 },
    );
  }
  if (kq.status === "conflict") {
    return NextResponse.json({ error: kq.message }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
