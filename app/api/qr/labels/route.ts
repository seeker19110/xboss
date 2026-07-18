import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  isQrKind,
  resolveManyForLabels,
  qrTargetPath,
  absoluteUrl,
  qrSvg,
  escapeHtml,
  type QrKind,
} from "@/lib/qr";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<QrKind, string> = {
  eq: "Thiết bị",
  mt: "Vật tư",
  wf: "Mặt bằng",
  tk: "Task",
};

// GET /api/qr/labels?kind=eq&ids=1,2,3 — trang in tem QR (Admin/PM, dùng chung quyền
// CAN.export — không có perm riêng cho tem QR trong map CAN, "export" là quyền xuất dữ
// liệu gần nghĩa nhất đã có). Trả HTML in-friendly (khổ A4, lưới tem) — KHÔNG phải trang
// React trong app bundle nên không theo theme zinc dark-first (giống /api/work-fronts/report
// xuất PDF màu cố định) — nội dung in trên giấy trắng.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.export(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền in tem QR (chỉ Admin/PM)" },
      { status: 403 },
    );

  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") ?? "";
  if (!isQrKind(kind))
    return NextResponse.json({ error: "Loại mã QR không hợp lệ" }, { status: 400 });

  const rawIds = (sp.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // wf dùng floor_label (chuỗi) làm khoá — không phải số nguyên như eq/mt/tk (xem lib/qr.ts).
  const ids = kind === "wf" ? rawIds : rawIds.filter((s) => /^\d+$/.test(s));
  if (ids.length === 0)
    return NextResponse.json({ error: "Thiếu danh sách id hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const items = await resolveManyForLabels(kind, ids, projectId);

  const labelsHtml = (
    await Promise.all(
      items.map(async (it) => {
        const url = absoluteUrl(qrTargetPath(kind, it.id), req);
        const svg = await qrSvg(url);
        return `<div class="label">
          <div class="qr">${svg}</div>
          <div class="meta">
            <div class="code">${escapeHtml(it.code)}</div>
            <div class="name">${escapeHtml(it.name)}</div>
          </div>
        </div>`;
      }),
    )
  ).join("\n");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Tem QR — ${escapeHtml(KIND_LABEL[kind])}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; margin: 0; padding: 16px; background: #f4f4f5; color: #18181b; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .toolbar button { background: #18181b; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-size: 14px; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #fff; }
  .label { border: 1px solid #d4d4d8; border-radius: 6px; padding: 8px; display: flex; align-items: center; gap: 8px; break-inside: avoid; }
  .qr svg { width: 64px; height: 64px; display: block; }
  .meta { min-width: 0; }
  .code { font-family: ui-monospace, monospace; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name { font-size: 11px; color: #52525b; overflow-wrap: break-word; }
  .empty { padding: 32px; text-align: center; color: #71717a; }
  @page { size: A4; margin: 10mm; }
  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .grid { gap: 4mm; }
    .label { border: 1px dashed #a1a1aa; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <strong>Tem QR — ${escapeHtml(KIND_LABEL[kind])} (${items.length} tem)</strong>
    <button onclick="window.print()">In</button>
  </div>
  ${items.length ? `<div class="grid">${labelsHtml}</div>` : `<p class="empty">Không có tem nào để in — kiểm tra lại danh sách đã chọn.</p>`}
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
