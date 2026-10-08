import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import { capNguCanh } from "@/lib/bao-mat/offline-context";
import {
  jsonOffline,
  loiOffline,
  moDauOffline,
  phanHoiLoiOffline,
  thietBiCuaToi,
} from "@/lib/bao-mat/offline-http";

export const dynamic = "force-dynamic";

// POST /api/offline/context  body: { expectedProjectId?: number }
// Cấp context offline (DATA-CONTRACTS §3): phiên + proof thiết bị (chưa thu hồi) + dự án đang chọn
// qua resolver A1 (KHÔNG fallback khi cookie dự án sai) + quyền hiện hành. Tab gửi
// expectedProjectId khác dự án hiện hành (tab khác vừa đổi dự án) → 409 context_changed, không
// lặng lẽ cấp context cho dự án mới.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return loiOffline(401, "unauthenticated", "Chưa đăng nhập");
  const md = await moDauOffline(req, user, {
    kiemOrigin: true,
    canVault: true,
    gioiHan: { ten: "context", max: 120 },
  });
  if (!md.ok) return md.res;
  try {
    const projectId = await getCurrentProjectIdStrict(user);
    if (projectId == null)
      return loiOffline(404, "project_unavailable", "Không có dự án hợp lệ đang được chọn");
    const body = (await req.json().catch(() => null)) as { expectedProjectId?: unknown } | null;
    const ky = body?.expectedProjectId;
    if (ky !== undefined && ky !== null && ky !== projectId)
      return loiOffline(409, "context_changed", "Dự án đang chọn đã thay đổi — tải lại trang");
    const thietBi = await thietBiCuaToi(user, md.proofHash);
    return jsonOffline({ context: await capNguCanh(user, thietBi, projectId) });
  } catch (e) {
    return phanHoiLoiOffline(e);
  }
}
