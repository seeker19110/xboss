// M104 — thêm block vào thư viện THẲNG từ web (không qua hàng chờ duyệt của M103).
/**
 * Vì sao đường này tồn tại song song với M103: đề xuất từ AutoCAD (M103) dựng sẵn cả "thư viện
 * ứng viên" (blocks.dwg gộp) nên phải qua bước duyệt; còn từ web, người dùng chỉ có **một block
 * lẻ** (.dwg + .dxf cùng nội dung). Máy chủ không chạy AutoCAD → không gộp được vào tệp nền, nên
 * mô hình thư viện chuyển sang **đa tệp** (M104 §1): entry manifest mang `fileKey` trỏ tới tệp
 * `.dwg` riêng của chính block đó, tệp nền `blocks.dwg` giữ nguyên (cả `storage_key` lẫn
 * `dwg_sha256` của version mới đều chép từ version hiện hành).
 *
 * Kiểm định tái dùng nguyên vẹn M103/M100 — `docMetaBlockCoBan` (luật metadata theo kind),
 * `kiemThuocTinhTheoLoai` (thuộc tính bắt buộc theo loại), `parseDxf`, `dungPreviewSvg` — và ghi
 * sổ qua đúng `ghiSoBlockLib` như hai đường phát hành kia: một chỗ sửa, ba đường cùng đúng.
 *
 * Nguyên tử: toàn bộ bước phát hành nằm trong 1 transaction có `pg_advisory_xact_lock` trên
 * `cad_block_libs` (cùng khoá với đường duyệt M103) — hai lượt thêm song song xếp hàng, lượt sau
 * đọc được manifest vừa phát hành nên nối tiếp version thay vì đè mất block của lượt trước. Mọi
 * lỗi sau khi đã ghi tệp đều dọn tệp lại, không để tệp mồ côi trong kho lưu trữ.
 */
import { createHash } from "node:crypto";
import { queryOne, run, withProjectScope, withTransaction } from "@/lib/db";
import { storagePut, storageGet, storageDelete } from "@/lib/nen/storage";
import { newBlockLibFileName } from "@/lib/nen/photos";
import { parseDxf, type DxfEntityRaw } from "@/lib/ky-thuat/cad/dxf-parser";
import {
  ORG_THU_VIEN_BLOCK,
  docManifest,
  ghiSoBlockLib,
  kiemThuocTinhTheoLoai,
  laKhoaTepBlockHopLe,
  kiemXungDotBlockName,
  layBlockLibHienHanh,
  versionPhatHanhKeTiep,
  type BlockLibManifest,
  type BlockManifestEntry,
} from "@/lib/ky-thuat/cad/block-lib";
import { docMetaBlockCoBan } from "@/lib/ky-thuat/cad/block-proposals";
import { dungPreviewSvg } from "@/lib/ky-thuat/cad/block-preview-svg";

export type ThemBlockKetQua =
  | { status: "invalid"; errors: string[] }
  | {
      status: "conflict";
      loai: "trung-ten" | "chua-co-thu-vien";
      message: string;
      versionHienHanh?: string;
    }
  | { status: "created"; version: string; libId: number; coPreview: boolean };

/** Id entry manifest sinh từ tên block, bảo đảm không đụng id nào đã có trong thư viện. */
function idTuTenBlock(blockName: string, daCo: ReadonlySet<string>): string {
  const goc =
    blockName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "block";
  let id = goc;
  for (let i = 2; daCo.has(id); i++) id = `${goc}-${i}`;
  return id;
}

/**
 * Khoá advisory theo TẦNG thư viện (M113 §6): tầng toàn cục giữ nguyên chuỗi khoá cũ để vẫn xếp
 * hàng cùng đường duyệt đề xuất M103; mỗi dự án một khoá riêng nên hai dự án không chặn nhau.
 */
function khoaTang(projectId?: number): string {
  return projectId === undefined ? "cad_block_libs" : `cad_block_libs:${projectId}`;
}

/** Thẻ thuộc tính (ATTDEF) có thật trong định nghĩa block — nguồn duy nhất cho `attributes`. */
function thuocTinhTuDxf(hinhHoc: readonly DxfEntityRaw[] | undefined): string[] {
  const the = new Set<string>();
  for (const e of hinhHoc ?? []) {
    if (e.type !== "ATTDEF" || !e.attributeTag) continue;
    const t = String(e.attributeTag).trim().toUpperCase();
    if (t) the.add(t);
  }
  return [...the];
}

/**
 * Thêm một block vào thư viện hiện hành và phát hành ngay version mới (M104 §2).
 *
 * Thứ tự kiểm bám đặc tả: metadata đủ theo kind → tệp .dwg đúng định dạng → DXF parse được và có
 * định nghĩa block đúng tên → thuộc tính bắt buộc theo loại → (trong khoá) chưa có thư viện nền /
 * trùng tên → lưu tệp + phát hành. Các bước thuần đứng trước để giữ khoá ngắn nhất có thể.
 */
export async function themBlockTuWeb(input: {
  userId: number;
  metaTho: unknown;
  dwg: Buffer;
  dxfText: string;
  /** M113 §6 — thêm vào bộ **của dự án này**; vắng = bộ toàn cục, y hệt hôm nay (guardrail 1). */
  projectId?: number;
}): Promise<ThemBlockKetQua> {
  const { meta, errors: loiMeta } = docMetaBlockCoBan(input.metaTho);
  if (!meta) return { status: "invalid", errors: loiMeta };

  // Chỉ soi 4 byte chữ ký ("AC10.." — mọi đời DWG từ R14 tới 2026), KHÔNG đọc nội dung (M100 §12).
  // Bắt đúng lỗi thật hay gặp: kéo nhầm bản .dxf vào ô .dwg.
  if (input.dwg.subarray(0, 4).toString("ascii") !== "AC10") {
    return {
      status: "invalid",
      errors: [
        "Tệp nộp ở ô .dwg không mang chữ ký DWG — lưu block sang định dạng DWG rồi nộp lại (bản DXF nộp ở ô còn lại).",
      ],
    };
  }

  // Định nghĩa block phải có thật trong bản DXF kèm theo — đây là thứ duy nhất máy chủ đọc được.
  let hinhHoc: DxfEntityRaw[] | undefined;
  let coDinhNghia = false;
  try {
    const dxf = parseDxf(input.dxfText);
    const dinhNghia = dxf.blocks.find((b) => b.name.toUpperCase() === meta.blockName.toUpperCase());
    if (dinhNghia) {
      coDinhNghia = true;
      hinhHoc = dinhNghia.entities;
    }
  } catch (e) {
    return {
      status: "invalid",
      errors: [`Không parse được tệp .dxf: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
  if (!coDinhNghia) {
    return {
      status: "invalid",
      errors: [
        `Tệp .dxf không có định nghĩa block "${meta.blockName}" — kiểm lại tên block, hoặc xuất DXF từ chính bản vẽ chứa block đó.`,
      ],
    };
  }

  const hash = createHash("sha256").update(input.dwg).digest("hex");
  // Ảnh xem trước là best-effort (M103 §3): hỏng thì entry không có `previewSvg`, KHÔNG chặn thêm.
  let previewSvg: string | null = null;
  try {
    previewSvg = dungPreviewSvg(hinhHoc, meta.blockName);
  } catch {
    previewSvg = null;
  }

  const fileKey = newBlockLibFileName(`blk${meta.blockName}`);
  let daLuuTep = false;

  // Bộ toàn cục hiện hành: đọc TRƯỚC transaction để kiểm xung đột tên block khi thêm vào bộ dự án
  // (M113 §4) — bộ toàn cục không đổi trong lúc thêm block cho một dự án.
  const toanCucRow = input.projectId === undefined ? null : await layBlockLibHienHanh();

  const than = async (): Promise<ThemBlockKetQua> => {
    // Cùng khoá với đường duyệt đề xuất (M103) — hai đường phát hành không bao giờ chạy chồng.
    // M113: khoá tách theo TẦNG, bộ toàn cục và bộ của dự án A không chặn nhau (chuỗi khoá của
    // tầng toàn cục giữ nguyên để vẫn xếp hàng với đường duyệt M103).
    await run(`SELECT pg_advisory_xact_lock(hashtext(?))`, khoaTang(input.projectId));

    const hienHanhRow = await layBlockLibHienHanh(input.projectId);
    if (!hienHanhRow) {
      return {
        status: "conflict",
        loai: "chua-co-thu-vien",
        message:
          input.projectId === undefined
            ? "Chưa phát hành thư viện block nền nào — Admin/PM phát hành bản nền trước, rồi mới thêm block từ web."
            : "Dự án này chưa phát hành bộ block riêng nào — phát hành bộ nền của dự án trước, rồi mới thêm block lẻ.",
      };
    }
    const { manifest: hienHanh, errors: loiHienHanh } = docManifest(hienHanhRow.manifest);
    if (!hienHanh) {
      return {
        status: "invalid",
        errors: [
          `Manifest của thư viện hiện hành (${hienHanhRow.version}) không đọc được: ${loiHienHanh.join(" · ")}`,
        ],
      };
    }

    // Trùng tên với thư viện hiện hành hoặc một đề xuất M103 đang chờ duyệt → bắt đổi tên.
    // Tên block trong AutoCAD KHÔNG phân biệt hoa thường.
    if (hienHanh.blocks.some((b) => b.blockName.toUpperCase() === meta.blockName.toUpperCase())) {
      return {
        status: "conflict",
        loai: "trung-ten",
        message: `Thư viện ${hienHanhRow.version} đã có block tên "${meta.blockName}" — đặt tên khác rồi thêm lại.`,
        versionHienHanh: hienHanhRow.version,
      };
    }
    // M113 §4/FR3 — block thêm vào bộ dự án không được trùng TÊN với block của bộ toàn cục
    // (id sinh mới nên chắc chắn khác id ⇒ hai định nghĩa cùng tên trong một bản vẽ).
    const xungDotToanCuc = kiemXungDotBlockName(
      [{ id: "", blockName: meta.blockName, kind: meta.kind }],
      toanCucRow,
    );
    if (xungDotToanCuc.length > 0) {
      return {
        status: "conflict",
        loai: "trung-ten",
        message: `Bộ toàn cục ${toanCucRow?.version} đã có block tên "${meta.blockName}" — đặt tên khác rồi thêm lại.`,
        versionHienHanh: hienHanhRow.version,
      };
    }
    const trungCho = await queryOne<{ id: number }>(
      `SELECT id FROM cad_block_proposals WHERE upper(block_name) = upper(?) AND status = 'pending'`,
      meta.blockName,
    );
    if (trungCho) {
      return {
        status: "conflict",
        loai: "trung-ten",
        message: `Đã có đề xuất #${trungCho.id} đang chờ duyệt cho block tên "${meta.blockName}" — đặt tên khác rồi thêm lại.`,
        versionHienHanh: hienHanhRow.version,
      };
    }

    // `attributes` lấy từ chính ATTDEF trong DXF (không có ô nhập nào cho người dùng gõ tay) —
    // nhờ vậy thẻ khai trong manifest luôn khớp thẻ có thật trong block.
    const thuocTinh = thuocTinhTuDxf(hinhHoc);
    const entry: BlockManifestEntry = {
      id: idTuTenBlock(meta.blockName, new Set(hienHanh.blocks.map((b) => b.id))),
      blockName: meta.blockName,
      kind: meta.kind,
      system: meta.systemId ?? undefined,
      attributes: thuocTinh.length > 0 ? thuocTinh : undefined,
      takeoffItemId: meta.takeoffItemId ?? undefined,
      paper: meta.paperSize ?? undefined,
      fileKey,
      fileSha256: hash,
      previewSvg: previewSvg ?? undefined,
    };
    const loiThuocTinh: string[] = [];
    kiemThuocTinhTheoLoai(entry, loiThuocTinh);
    if (loiThuocTinh.length > 0) return { status: "invalid", errors: loiThuocTinh };

    // Tệp lẻ + bản DXF kèm (đặt cạnh nhau cùng quy ước tên như hai đường phát hành kia, để
    // kiểm định lại được về sau mà không cần AutoCAD).
    await storagePut(ORG_THU_VIEN_BLOCK, fileKey, input.dwg);
    daLuuTep = true;
    await storagePut(
      ORG_THU_VIEN_BLOCK,
      `${fileKey}.sidecar.dxf`,
      Buffer.from(input.dxfText, "utf8"),
    );

    const versionMoi = await versionPhatHanhKeTiep(hienHanhRow.version, input.projectId);
    // Tệp nền KHÔNG đổi: `storage_key`/`dwg_sha256` (và `manifest.dwgSha256`) chép nguyên của
    // version hiện hành — plugin đang cache tệp nền theo hash sẽ không phải tải lại.
    const manifestMoi: BlockLibManifest = {
      ...hienHanh,
      version: versionMoi,
      dwgSha256: hienHanhRow.dwgSha256,
      blocks: [...hienHanh.blocks, entry],
    };
    const libId = await ghiSoBlockLib({
      version: versionMoi,
      manifest: manifestMoi,
      storageKey: hienHanhRow.storageKey,
      dwgSha256: hienHanhRow.dwgSha256,
      userId: input.userId,
      projectId: input.projectId,
    });
    return { status: "created", version: versionMoi, libId, coPreview: previewSvg !== null };
  };

  try {
    return input.projectId === undefined
      ? await withTransaction<ThemBlockKetQua>(than)
      : await withProjectScope<ThemBlockKetQua>(input.projectId, than, { readOnly: false });
  } catch (e) {
    // Transaction đã rollback → dòng thư viện không tồn tại; dọn nốt tệp vừa ghi để không mồ côi.
    if (daLuuTep) {
      await storageDelete(ORG_THU_VIEN_BLOCK, fileKey).catch(() => {});
      await storageDelete(ORG_THU_VIEN_BLOCK, `${fileKey}.sidecar.dxf`).catch(() => {});
    }
    throw e;
  }
}

export type BlockLeTrongThuVien = { version: string; entry: BlockManifestEntry };

/**
 * Tra một tệp block lẻ theo `fileKey` (M104 §2 — `GET /api/engineering/cad/block-lib?file=`).
 *
 * Chỉ trả về khi khoá **có mặt trong manifest của một version** — đó là hàng rào chặn việc đọc
 * tệp tuỳ ý trong kho lưu trữ; khuôn tên cũng được kiểm trước để không truy vấn khoá rác.
 */
export async function timBlockLeTheoKhoa(
  fileKey: string,
  opts?: { projectId?: number; libVersion?: string },
): Promise<BlockLeTrongThuVien | null> {
  if (!fileKey || !laKhoaTepBlockHopLe(fileKey)) return null;
  // M113 §6 — tìm trong ĐÚNG tầng: không có dự án ⇒ bộ toàn cục (tương thích ngược, plugin bản cũ);
  // có dự án ⇒ chỉ các bộ của dự án đó. `libVersion` (tuỳ chọn) khoá thêm về đúng bộ chứa block.
  const row = await queryOne<{ version: string; manifest: BlockLibManifest }>(
    `SELECT version, manifest FROM cad_block_libs
      WHERE manifest -> 'blocks' @> ?::jsonb
        AND project_id IS NOT DISTINCT FROM ?
        AND (?::text IS NULL OR version = ?::text)
      ORDER BY id DESC LIMIT 1`,
    JSON.stringify([{ fileKey }]),
    opts?.projectId ?? null,
    opts?.libVersion ?? null,
    opts?.libVersion ?? null,
  );
  if (!row) return null;
  const entry = (row.manifest?.blocks ?? []).find((b) => b.fileKey === fileKey);
  return entry ? { version: row.version, entry } : null;
}

/** Nội dung tệp `.dwg` lẻ — `null` khi tệp đã mất trên kho lưu trữ. */
export async function docTepBlockLe(fileKey: string): Promise<Buffer | null> {
  return storageGet(ORG_THU_VIEN_BLOCK, fileKey);
}
