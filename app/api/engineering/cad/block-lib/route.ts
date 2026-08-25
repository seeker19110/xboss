import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { matchesEtag } from "@/lib/ky-thuat/cad/rule-pack";
import { GIOI_HAN_TEP_CAD } from "@/lib/ky-thuat/cad/gioi-han";
import { isContentTooLarge } from "@/lib/nen/photos";
import {
  layBlockLibHienHanh,
  docTepBlockLib,
  etagBlockLib,
  phatHanhBlockLib,
} from "@/lib/ky-thuat/cad/block-lib";

export const dynamic = "force-dynamic";

// /api/engineering/cad/block-lib — Thư viện block chuẩn của bộ lệnh vẽ XBOSS_VE_* (M100 PR2, §10).
//
// GET  tải thư viện đang phát hành: mặc định trả tệp `.dwg`, `?manifest=1` trả JSON manifest.
//      Auth như GET /api/engineering/cad/rule-pack — Bearer token scope 'cad' của plugin
//      (XBOSS_LOGIN) hoặc phiên web, quyền qua CAN.viewEngineeringGraph. ETag theo version + hash
//      tệp để plugin cache cục bộ (M100 AC8).
// POST phát hành version mới — phiên web Admin/PM (KHÔNG nhận token thiết bị: phát hành là thao
//      tác chuỗi cung ứng nội bộ, không được làm từ máy trạm bằng token cad). Same-origin/CSRF đã
//      phủ tập trung ở proxy.ts cho mọi request mutating tới /api/*.

export async function GET(req: NextRequest) {
  // Bearer kiểm TRƯỚC: request của plugin không đụng cookies() (cùng lý do route rule-pack).
  const user =
    (await getCadTokenUser(req.headers.get("authorization"))) ?? (await getCurrentUser());
  if (!user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập hoặc token thiết bị không hợp lệ — chạy XBOSS_LOGIN" },
      { status: 401 },
    );
  }
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền tải thư viện block CAD" }, { status: 403 });
  }

  const row = await layBlockLibHienHanh();
  if (!row) {
    return NextResponse.json(
      {
        error:
          "Chưa phát hành thư viện block nào — vào /engineering/chuan-hoa-ban-ve, mục Thư Viện Block để phát hành.",
      },
      { status: 404 },
    );
  }

  // `?v=<version>` là tham số cache-busting của UI, KHÔNG phải chọn bản để tải — thư viện chỉ giữ
  // bản đang phát hành (không lưu lịch sử tải lại). Gửi `v` khác bản hiện hành → báo rõ thay vì
  // âm thầm trả bản khác với thứ client tưởng đang xin.
  const vThamSo = req.nextUrl.searchParams.get("v");
  if (vThamSo && vThamSo !== row.version) {
    return NextResponse.json(
      {
        error: `Phiên bản thư viện không còn là bản hiện hành (đang yêu cầu ${vThamSo}, bản hiện hành là ${row.version}) — tải lại trang để lấy bản mới nhất.`,
      },
      { status: 404 },
    );
  }

  const etag = etagBlockLib(row);
  if (matchesEtag(req.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  // Header đi kèm tệp nhị phân chỉ mang version + hash (đủ để plugin biết cần tải lại manifest hay
  // chưa và kiểm toàn vẹn); manifest đầy đủ đi đường `?manifest=1` — nhét cả JSON vào header sẽ
  // vượt trần header của reverse proxy khi thư viện có vài trăm block.
  const headerChung = {
    ETag: etag,
    "X-Block-Lib-Version": row.version,
    "X-Block-Lib-Sha256": row.dwgSha256,
  };

  if (req.nextUrl.searchParams.get("manifest") === "1") {
    return NextResponse.json(
      { version: row.version, dwgSha256: row.dwgSha256, manifest: row.manifest },
      { headers: headerChung },
    );
  }

  const tep = await docTepBlockLib(row);
  if (!tep) {
    return NextResponse.json(
      { error: `Tệp thư viện block version ${row.version} không còn trên kho lưu trữ` },
      { status: 404 },
    );
  }
  return new NextResponse(new Uint8Array(tep), {
    headers: {
      ...headerChung,
      "Content-Type": "application/acad",
      "Content-Length": String(tep.length),
      "Content-Disposition": `attachment; filename="xboss-block-lib-${row.version}.dwg"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role)) {
    return NextResponse.json(
      { error: "Chỉ Admin/PM được phát hành thư viện block" },
      { status: 403 },
    );
  }
  if (await hitRateLimit(`cad-block-lib:${user.id}`, 10, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn phát hành (10 lượt/15 phút)" },
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

  const dwg = form.get("dwg");
  const dxf = form.get("dxf");
  const manifestTho = form.get("manifest");
  if (!(dwg instanceof File) || !(dxf instanceof File) || !manifestTho) {
    return NextResponse.json(
      {
        error:
          "Thiếu trường bắt buộc: dwg (tệp thư viện), dxf (bản DXF sidecar để máy chủ kiểm), manifest (JSON)",
      },
      { status: 400 },
    );
  }
  // Header content-length (check ở trên) có thể vắng mặt khi body gửi chunked — kiểm lại kích
  // thước THẬT ngay khi đã biết đây là File, TRƯỚC khi buffer nội dung vào RAM (arrayBuffer/text),
  // để không nạp không giới hạn khi client né được header.
  const manifestSize = manifestTho instanceof File ? manifestTho.size : manifestTho.length;
  if (
    dwg.size > GIOI_HAN_TEP_CAD ||
    dxf.size > GIOI_HAN_TEP_CAD ||
    manifestSize > GIOI_HAN_TEP_CAD
  ) {
    return NextResponse.json(
      { error: `Tệp vượt trần ${Math.floor(GIOI_HAN_TEP_CAD / (1024 * 1024))}MB` },
      { status: 413 },
    );
  }

  // Manifest nhận cả dạng tệp .json lẫn ô văn bản — trình duyệt gửi tệp, script/plugin gửi chuỗi.
  const manifestText = manifestTho instanceof File ? await manifestTho.text() : String(manifestTho);
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestText);
  } catch {
    return NextResponse.json({ error: "manifest không phải JSON hợp lệ" }, { status: 400 });
  }

  const kq = await phatHanhBlockLib({
    userId: user.id,
    manifestTho: manifestJson,
    dwg: Buffer.from(await dwg.arrayBuffer()),
    dxfText: await dxf.text(),
  });

  if (kq.status === "invalid") {
    return NextResponse.json({ kiemDinh: kq.kiemDinh }, { status: 422 });
  }
  if (kq.status === "version-conflict") {
    return NextResponse.json({ error: kq.message }, { status: 409 });
  }
  return NextResponse.json(
    {
      id: kq.id,
      version: kq.version,
      idempotent: kq.status === "idempotent",
      kiemDinh: kq.kiemDinh,
    },
    { status: kq.status === "created" ? 201 : 200 },
  );
}
