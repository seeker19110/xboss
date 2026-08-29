import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { matchesEtag } from "@/lib/ky-thuat/cad/rule-pack";
import { GIOI_HAN_TEP_CAD } from "@/lib/ky-thuat/cad/gioi-han";
import { isContentTooLarge } from "@/lib/nen/photos";
import {
  chotProjectIdChoDoc,
  chotProjectIdChoGhi,
  getCurrentProjectId,
} from "@/lib/ha-tang/projects";
import { withProjectScope } from "@/lib/db";
import {
  layBlockLibHienHanh,
  docTepBlockLib,
  etagBlockLib,
  etagBlockLibTron,
  phatHanhBlockLib,
  tronThuVienBlock,
} from "@/lib/ky-thuat/cad/block-lib";
import { timBlockLeTheoKhoa, docTepBlockLe } from "@/lib/ky-thuat/cad/block-them-web";

export const dynamic = "force-dynamic";

// /api/engineering/cad/block-lib — Thư viện block chuẩn của bộ lệnh vẽ XBOSS_VE_* (M100 PR2, §10).
//
// GET  tải thư viện đang phát hành: mặc định trả tệp `.dwg`, `?manifest=1` trả JSON manifest,
//      `?file=<fileKey>` trả tệp `.dwg` lẻ của block thêm từ web (thư viện đa tệp — M104 §1/§2).
//      Auth như GET /api/engineering/cad/rule-pack — Bearer token scope 'cad' của plugin
//      (XBOSS_LOGIN) hoặc phiên web, quyền qua CAN.viewEngineeringGraph. ETag theo version + hash
//      tệp để plugin cache cục bộ (M100 AC8).
//      M113 §6: `?project=<id>` TUỲ CHỌN — không có thì hành vi y hệt hôm nay (chỉ bộ toàn cục,
//      guardrail 1); có thì `?manifest=1` trả manifest ĐÃ TRỘN hai tầng (mỗi entry mang
//      `nguon`/`libVersion`, ETag băm cặp id hai bộ), còn tệp nhị phân trả đúng tệp `.dwg` của bộ
//      DỰ ÁN (hash kiểm theo TỪNG bộ — bộ toàn cục tải bằng đường không kèm `?project=`).
// POST phát hành version mới — phiên web Admin/PM (KHÔNG nhận token thiết bị: phát hành là thao
//      tác chuỗi cung ứng nội bộ, không được làm từ máy trạm bằng token cad). Same-origin/CSRF đã
//      phủ tập trung ở proxy.ts cho mọi request mutating tới /api/*.
//      M113 §6 + §13 (chốt 2026-08-29): `project` (query hoặc trường form) TUỲ CHỌN — có thì phát
//      hành bộ CỦA DỰ ÁN đó, quyền `CAN.manageDrawings` TRONG PHẠM VI dự án (PM dự án làm được),
//      id đối chiếu qua `chotProjectIdChoGhi`; không có thì y hệt hôm nay (bộ toàn cục, Admin/PM).

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

  // Id dự án client gửi KHÔNG được tin: `chotProjectIdChoDoc` đối chiếu lại với danh sách dự án
  // user thực sự thấy + cùng org. Ngoài phạm vi ⇒ 404 (M113 §6: không tiết lộ sự tồn tại của dự
  // án khác).
  const thamSoDuAn = req.nextUrl.searchParams.get("project");
  let projectId: number | undefined;
  if (thamSoDuAn) {
    const chot = await chotProjectIdChoDoc(user, thamSoDuAn);
    if (!chot.ok) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
    projectId = chot.projectId;
  }

  // M104 §2 — `?file=<fileKey>`: tải tệp .dwg LẺ của một block thêm từ web (thư viện đa tệp).
  // Chỉ phục vụ khoá có mặt trong manifest của một version (lib tự kiểm), nên không đọc được tệp
  // tuỳ ý trong kho lưu trữ.
  const fileKey = req.nextUrl.searchParams.get("file");
  if (fileKey) {
    // M113 §6 — `libVersion` (tuỳ chọn) chỉ đúng BỘ chứa block; thiếu thì tìm trong bộ của tầng
    // đang hỏi (không có `?project=` ⇒ bộ toàn cục, đúng như hôm nay).
    const libVersion = req.nextUrl.searchParams.get("libVersion") ?? undefined;
    const timLe = () => timBlockLeTheoKhoa(fileKey, { projectId, libVersion });
    const le = projectId === undefined ? await timLe() : await withProjectScope(projectId, timLe);
    if (!le) {
      return NextResponse.json(
        { error: "Không có tệp block nào mang khoá này trong thư viện" },
        { status: 404 },
      );
    }
    const etagLe = `"${le.entry.fileSha256?.slice(0, 32) ?? le.version}"`;
    if (matchesEtag(req.headers.get("if-none-match"), etagLe)) {
      return new NextResponse(null, { status: 304, headers: { ETag: etagLe } });
    }
    const tepLe = await docTepBlockLe(fileKey);
    if (!tepLe) {
      return NextResponse.json(
        { error: `Tệp block "${le.entry.blockName}" không còn trên kho lưu trữ` },
        { status: 404 },
      );
    }
    return new NextResponse(new Uint8Array(tepLe), {
      headers: {
        ETag: etagLe,
        "X-Block-Lib-Version": le.version,
        "X-Block-File-Sha256": le.entry.fileSha256 ?? "",
        "Content-Type": "application/acad",
        "Content-Length": String(tepLe.length),
        // Tên tệp gợi ý lấy từ id manifest — lọc về [A-Za-z0-9._-] để không chèn được ký tự lạ
        // vào header (id là dữ liệu người phát hành đặt).
        "Content-Disposition": `attachment; filename="${le.entry.id.replace(/[^A-Za-z0-9._-]/g, "-")}.dwg"`,
      },
    });
  }

  if (projectId !== undefined) return await traHaiTang(req, projectId);

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

/**
 * Nhánh `?project=` (M113 §4): trộn bộ toàn cục với bộ của dự án rồi trả manifest đã trộn.
 * Tách hẳn khỏi nhánh cũ để đường không kèm `?project=` giữ nguyên từng byte (guardrail 1).
 */
async function traHaiTang(req: NextRequest, projectId: number): Promise<NextResponse> {
  const toanCuc = await layBlockLibHienHanh();
  const cuaDuAn = await withProjectScope(projectId, () => layBlockLibHienHanh(projectId));
  if (!toanCuc && !cuaDuAn) {
    return NextResponse.json(
      {
        error:
          "Chưa phát hành thư viện block nào — vào /engineering/chuan-hoa-ban-ve, mục Thư Viện Block để phát hành.",
      },
      { status: 404 },
    );
  }

  if (req.nextUrl.searchParams.get("manifest") === "1") {
    // ETag = băm cặp (id bộ toàn cục, id bộ dự án) — đổi một trong hai thì client tải lại (§4.6).
    const etag = etagBlockLibTron(toanCuc, cuaDuAn);
    if (matchesEtag(req.headers.get("if-none-match"), etag)) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }
    return NextResponse.json(
      {
        projectId,
        // Trường cấp cao vẫn nói về bộ NỀN toàn cục (thứ plugin cache theo hash) — hợp đồng M100
        // §11 không đổi; bộ của dự án đi kèm riêng ở `boDuAn` (FR6: bảng điều khiển hiện cả hai).
        version: toanCuc?.version ?? null,
        dwgSha256: toanCuc?.dwgSha256 ?? null,
        boDuAn: cuaDuAn ? { version: cuaDuAn.version, dwgSha256: cuaDuAn.dwgSha256 } : null,
        manifest: {
          version: cuaDuAn?.version ?? toanCuc?.version ?? "",
          dwgSha256: toanCuc?.dwgSha256 ?? cuaDuAn?.dwgSha256 ?? "",
          blocks: tronThuVienBlock(toanCuc, cuaDuAn),
        },
      },
      {
        headers: {
          ETag: etag,
          "X-Block-Lib-Version": toanCuc?.version ?? "",
          "X-Block-Lib-Du-An-Version": cuaDuAn?.version ?? "",
        },
      },
    );
  }

  // Tệp nhị phân: mỗi bộ một tệp, hash kiểm theo TỪNG bộ (§4.5) — `?project=` trả tệp của bộ dự án.
  if (!cuaDuAn) {
    return NextResponse.json(
      {
        error:
          "Dự án này chưa phát hành bộ block riêng — tải bộ toàn cục bằng đường không kèm ?project=.",
      },
      { status: 404 },
    );
  }
  const etagLe = etagBlockLib(cuaDuAn);
  if (matchesEtag(req.headers.get("if-none-match"), etagLe)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etagLe } });
  }
  const tep = await docTepBlockLib(cuaDuAn);
  if (!tep) {
    return NextResponse.json(
      { error: `Tệp thư viện block version ${cuaDuAn.version} không còn trên kho lưu trữ` },
      { status: 404 },
    );
  }
  return new NextResponse(new Uint8Array(tep), {
    headers: {
      ETag: etagLe,
      "X-Block-Lib-Version": cuaDuAn.version,
      "X-Block-Lib-Sha256": cuaDuAn.dwgSha256,
      "Content-Type": "application/acad",
      "Content-Length": String(tep.length),
      "Content-Disposition": `attachment; filename="xboss-block-lib-${cuaDuAn.version}.dwg"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  // Cổng quyền RỘNG NHẤT trong hai đường (bộ dự án = manageDrawings ⊃ Admin/PM); đường toàn cục
  // vẫn bị siết lại về Admin/PM ngay sau khi biết request có kèm `project` hay không.
  if (!CAN.manageDrawings(user.role)) {
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

  // `project` nhận từ query (đường script/plugin) hoặc trường form (đường trình duyệt).
  const thamSoDuAn = req.nextUrl.searchParams.get("project") ?? form.get("project");
  const coDuAn = typeof thamSoDuAn === "string" && thamSoDuAn !== "";
  let projectId: number | undefined;
  if (coDuAn) {
    const hienTai = (await getCurrentProjectId(user)) ?? 0;
    const chot = await chotProjectIdChoGhi(user, thamSoDuAn, hienTai);
    // Ngoài phạm vi ⇒ 404, không tiết lộ sự tồn tại của dự án khác (M113 §6).
    if (!chot.ok) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
    projectId = chot.projectId;
  } else if (!isAdminOrPm(user.role)) {
    // Bộ TOÀN CỤC vẫn chỉ Admin/PM — kỹ sư chỉ phát hành được bộ của dự án mình.
    return NextResponse.json(
      { error: "Chỉ Admin/PM được phát hành thư viện block" },
      { status: 403 },
    );
  }

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
    projectId,
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
      ...(projectId === undefined ? {} : { projectId }),
      idempotent: kq.status === "idempotent",
      kiemDinh: kq.kiemDinh,
    },
    { status: kq.status === "created" ? 201 : 200 },
  );
}
