// M100 PR2 — Thư viện block chuẩn có version cho bộ lệnh vẽ XBOSS_VE_* (M100 §6.10/§7 FR2/§10).
/**
 * Cùng nguyên tắc với rule pack (ADR-0006 nguyên tắc 1): thư viện block là **dữ liệu phát hành**,
 * không phải mã nguồn — thêm/sửa block = phát hành version mới, plugin tự tải về, không build lại.
 *
 * Server **không đọc DWG** (M100 §12, kế thừa M99/ADR-0006): tệp `.dwg` chỉ được lưu nguyên vẹn +
 * băm sha256. Việc "manifest khai block nào thì block đó phải có thật" được kiểm qua **bản DXF
 * sidecar** người phát hành nộp kèm, bằng đúng parser tầng 3 đã dùng cho `plugin-upload.ts`.
 *
 * Kiểm định chia hai mức, đúng M100 §10:
 *   - `errors`   → chặn phát hành (422), không ghi dòng nào;
 *   - `warnings` → cho phát hành nhưng hiện cho người phát hành thấy (rủi ro "trôi tên" giữa
 *     manifest ↔ `takeoff.blockNameMatchAny` là rủi ro số 1 của M100 §18, nhưng chặn cứng sẽ khoá
 *     việc phát hành block chưa có item takeoff — item đó thuộc rule pack, phát hành đường khác).
 */
import { createHash } from "node:crypto";
import { query, queryOne, insertId, withProjectScope } from "@/lib/db";
import { storagePut, storageGet } from "@/lib/nen/storage";
import { newBlockLibFileName } from "@/lib/nen/photos";
import { validateDxf, parseDxf, hasAnyToken } from "@/lib/ky-thuat/cad/dxf-parser";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";

/**
 * Thư viện block là tài nguyên **toàn cục** (M100 §18 đã chốt) nên không gắn org nào; khoá lưu trữ
 * vẫn cần một org để dựng prefix khi backend là S3 (`lib/nen/storage.ts`) → dùng cố định org gốc
 * cho cả ghi lẫn đọc, nếu không máy đọc thuộc org khác sẽ trỏ sai key. Đổi sang thư viện theo
 * dự án/tổ chức (M100 §20) thì thêm cột org_id và bỏ hằng số này.
 */
export const ORG_THU_VIEN_BLOCK = 1;

/**
 * Loại block trong thư viện (M100 §11 + §6.7–6.9 bổ sung `support`/`sleeve`; M110 §5 bổ sung
 * `annotation`).
 *
 * `annotation` = ký hiệu CHÚ THÍCH thuần (tam giác số revision của `XBOSS_VE_REV`…): không thuộc
 * hệ nào, **không bao giờ đi vào khối lượng** — nó cố ý vắng mặt trong `KIND_DEM_KHOI_LUONG`
 * (`lib/ky-thuat/cad/block-proposals.ts`) và trong `doiChieuTakeoff` phía dưới (chỉ soi
 * `equipment`), đúng guardrail 1 của M110: khoanh revision không được đổi con số `XBOSS_BOCKL`.
 */
export const LOAI_BLOCK = [
  "fitting",
  "equipment",
  "titleblock",
  "support",
  "sleeve",
  "annotation",
] as const;
export type LoaiBlock = (typeof LOAI_BLOCK)[number];

export type BlockManifestEntry = {
  /** Id dùng trong rule pack `drawTools.systems[].fittings/equipment` và `sheetSetup.titleblockId`. */
  id: string;
  /** Tên block THẬT trong tệp `.dwg` — nguồn khớp duy nhất với `takeoff.blockNameMatchAny`. */
  blockName: string;
  kind: LoaiBlock;
  /** Hệ sở hữu block (khớp `layerMap.groups[].id`); khung tên không thuộc hệ nào. */
  system?: string;
  scaleBySize?: boolean;
  rotateToPath?: boolean;
  /** Thẻ thuộc tính bắt buộc khi chèn (TAG/MODEL/SIZE, khung tên: DU_AN/TI_LE/…). */
  attributes?: string[];
  /** Item takeoff mà block này được đếm vào (`measure: count`). */
  takeoffItemId?: string;
  /** Khổ giấy của khung tên (chỉ `kind: titleblock`). */
  paper?: string;
  /**
   * M104 §1 — khoá tệp `.dwg` RIÊNG của block trong kho lưu trữ (block thêm thẳng từ web:
   * máy chủ không chạy AutoCAD nên không gộp được vào `blocks.dwg` nền). Vắng trường này =
   * block nằm trong `blocks.dwg` như cũ (mọi manifest đã phát hành trước M104 không đổi).
   * Plugin tải tệp lẻ qua `GET /api/engineering/cad/block-lib?file=<fileKey>`.
   */
  fileKey?: string;
  /** Hash sha256 của tệp lẻ ở `fileKey` — plugin kiểm y như kiểm tệp nền. Đi cặp với `fileKey`. */
  fileSha256?: string;
  /** Ảnh xem trước (SVG thuần, dựng từ DXF lúc thêm) để web hiển thị — không ảnh hưởng plugin. */
  previewSvg?: string;
};

export type BlockLibManifest = {
  version: string;
  dwgSha256: string;
  blocks: BlockManifestEntry[];
};

export type KiemDinhBlockLib = {
  ok: boolean;
  /** Lỗi chặn — không phát hành. */
  errors: string[];
  /** Cảnh báo không chặn — lưu kèm để người phát hành thấy. */
  warnings: string[];
  /** Số liệu đo được từ DXF sidecar (đối chứng với manifest). */
  stats?: { blocksTrongDxf: number; blocksKhaiManifest: number };
};

export type PhatHanhKetQua =
  | { status: "invalid"; kiemDinh: KiemDinhBlockLib }
  | { status: "version-conflict"; message: string }
  | { status: "created" | "idempotent"; kiemDinh: KiemDinhBlockLib; id: number; version: string };

export type BlockLibRow = {
  id: number;
  version: string;
  manifest: BlockLibManifest;
  storageKey: string;
  dwgSha256: string;
  nguoiPhatHanh: string | null;
  createdAt: string | null;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Dạng hợp lệ của `fileKey` (M104 §1) — đúng khuôn tên do `newBlockLibFileName` sinh
 * (`blocklib-<nhãn>-<ts>-<hex>.dwg`). Ràng khuôn chặt vì `GET ?file=` sẽ đọc đúng khoá này khỏi
 * kho lưu trữ: manifest là dữ liệu người phát hành nộp, không được để nó trỏ tới tệp bất kỳ
 * trong `data/uploads/` (lớp chống path traversal của `lib/nen/storage.ts` chặn `/` `..` nhưng
 * không chặn "đọc nhầm tệp phẳng khác").
 */
const KHOA_TEP_BLOCK = /^blocklib-[A-Za-z0-9._-]{1,160}\.dwg$/;

/** Trần độ dài chuỗi SVG xem trước lưu trong manifest (JSONB) — ảnh nhận diện, không phải bản vẽ. */
const TRAN_PREVIEW_SVG = 200_000;

/** `fileKey` có đúng khuôn tên tệp do máy chủ sinh không (dùng cho cả route `GET ?file=`). */
export function laKhoaTepBlockHopLe(fileKey: string): boolean {
  return KHOA_TEP_BLOCK.test(fileKey);
}

// ── Kiểm định (thuần, không chạm DB — test đơn vị được) ──────────────────────

/**
 * Ép dữ liệu manifest thô (JSON người phát hành nộp) về đúng hình dạng M100 §11.
 * Trả `null` kèm lỗi khi hình dạng sai — không "sửa hộ" dữ liệu.
 */
export function docManifest(tho: unknown): { manifest: BlockLibManifest | null; errors: string[] } {
  const errors: string[] = [];
  if (typeof tho !== "object" || tho === null || Array.isArray(tho)) {
    return { manifest: null, errors: ["Manifest không phải một đối tượng JSON."] };
  }
  const o = tho as Record<string, unknown>;
  const version = typeof o.version === "string" ? o.version.trim() : "";
  const dwgSha256 = typeof o.dwgSha256 === "string" ? o.dwgSha256.trim().toLowerCase() : "";
  if (!version) errors.push('Manifest thiếu "version" (nhãn phiên bản thư viện, vd "b1").');
  if (!SHA256_HEX.test(dwgSha256)) {
    errors.push('Manifest thiếu "dwgSha256" hợp lệ (64 ký tự hex của tệp .dwg).');
  }
  if (!Array.isArray(o.blocks) || o.blocks.length === 0) {
    errors.push('Manifest thiếu "blocks" hoặc danh sách rỗng — thư viện không có block nào.');
    return { manifest: null, errors };
  }

  const blocks: BlockManifestEntry[] = [];
  const idDaGap = new Set<string>();
  const tenDaGap = new Set<string>();
  o.blocks.forEach((btho, i) => {
    const nhan = `blocks[${i}]`;
    if (typeof btho !== "object" || btho === null || Array.isArray(btho)) {
      errors.push(`${nhan} không phải một đối tượng JSON.`);
      return;
    }
    const b = btho as Record<string, unknown>;
    const id = typeof b.id === "string" ? b.id.trim() : "";
    const blockName = typeof b.blockName === "string" ? b.blockName.trim() : "";
    const kind = typeof b.kind === "string" ? b.kind.trim() : "";
    if (!id) errors.push(`${nhan} thiếu "id".`);
    else if (idDaGap.has(id)) errors.push(`${nhan}: id trùng "${id}".`);
    else idDaGap.add(id);
    if (!blockName) errors.push(`${nhan}${id ? ` ("${id}")` : ""} thiếu "blockName".`);
    // Tên block trong AutoCAD KHÔNG phân biệt hoa thường: hai mục khai cùng tên khác kiểu chữ sẽ
    // trỏ về đúng một định nghĩa trong DWG — lỗi im lặng (bản C# BlockManifestLoader kiểm y hệt).
    else if (tenDaGap.has(blockName.toUpperCase())) {
      errors.push(
        `${nhan}${id ? ` ("${id}")` : ""}: tên block "${blockName}" đã được một mục khác dùng (AutoCAD không phân biệt hoa thường).`,
      );
    } else tenDaGap.add(blockName.toUpperCase());
    if (!(LOAI_BLOCK as readonly string[]).includes(kind)) {
      errors.push(
        `${nhan}${id ? ` ("${id}")` : ""}: kind "${kind}" lạ — chỉ nhận ${LOAI_BLOCK.join(" | ")}.`,
      );
    }
    if (b.attributes !== undefined && !Array.isArray(b.attributes)) {
      errors.push(`${nhan}${id ? ` ("${id}")` : ""}: "attributes" phải là danh sách chuỗi.`);
      // Bỏ qua block này ở các bước kiểm sau (kiemThuocTinhTheoLoai) — nếu vẫn đẩy vào `blocks`
      // với attributes rỗng, bước 3 sẽ tưởng block không khai thuộc tính và sinh thêm lỗi "thiếu
      // TAG"/"thiếu attributes" chồng lên đúng 1 lỗi gốc về kiểu dữ liệu ở trên.
      return;
    }
    const attributes = Array.isArray(b.attributes)
      ? b.attributes.filter((a): a is string => typeof a === "string").map((a) => a.trim())
      : undefined;

    // M104 §1 — bộ ba tuỳ chọn của block nằm ở tệp .dwg RIÊNG. Vắng cả ba = block trong tệp nền
    // (tương thích ngược: manifest phát hành trước M104 không có trường nào trong nhóm này).
    const fileKey = typeof b.fileKey === "string" ? b.fileKey.trim() : "";
    const fileSha256 = typeof b.fileSha256 === "string" ? b.fileSha256.trim().toLowerCase() : "";
    const previewSvg = typeof b.previewSvg === "string" ? b.previewSvg.trim() : "";
    const nhanB = `${nhan}${id ? ` ("${id}")` : ""}`;
    if (fileKey && !KHOA_TEP_BLOCK.test(fileKey)) {
      errors.push(
        `${nhanB}: "fileKey" không đúng khuôn tên tệp do máy chủ sinh (blocklib-….dwg) — không nhận khoá tự đặt.`,
      );
    }
    if (fileKey && !SHA256_HEX.test(fileSha256)) {
      errors.push(`${nhanB}: có "fileKey" thì phải kèm "fileSha256" (64 ký tự hex của tệp lẻ).`);
    }
    if (!fileKey && fileSha256) {
      errors.push(
        `${nhanB}: khai "fileSha256" nhưng thiếu "fileKey" — hash không trỏ tới tệp nào.`,
      );
    }
    if (previewSvg && (!previewSvg.startsWith("<svg") || previewSvg.length > TRAN_PREVIEW_SVG)) {
      errors.push(
        `${nhanB}: "previewSvg" phải là chuỗi SVG (bắt đầu bằng <svg) và ngắn hơn ${TRAN_PREVIEW_SVG} ký tự.`,
      );
    }

    blocks.push({
      id,
      blockName,
      kind: kind as LoaiBlock,
      system: typeof b.system === "string" ? b.system.trim() : undefined,
      scaleBySize: b.scaleBySize === true ? true : undefined,
      rotateToPath: b.rotateToPath === true ? true : undefined,
      attributes,
      takeoffItemId: typeof b.takeoffItemId === "string" ? b.takeoffItemId.trim() : undefined,
      paper: typeof b.paper === "string" ? b.paper.trim() : undefined,
      fileKey: fileKey || undefined,
      fileSha256: fileSha256 || undefined,
      previewSvg: previewSvg || undefined,
    });
  });

  if (errors.length > 0) return { manifest: null, errors };
  return { manifest: { version, dwgSha256, blocks }, errors };
}

/**
 * Yêu cầu thuộc tính tối thiểu theo loại block (M100 §11 + FR6/FR9a). Export để đường thêm block
 * từ web (M104) áp đúng một luật này cho entry mới thay vì chép lại.
 */
export function kiemThuocTinhTheoLoai(b: BlockManifestEntry, errors: string[]): void {
  if (b.kind === "equipment" && !(b.attributes ?? []).includes("TAG")) {
    errors.push(
      `Block "${b.id}" (thiết bị) phải khai thuộc tính "TAG" — XBOSS_VE_THIETBI bắt nhập tag lúc chèn (FR6).`,
    );
  }
  if (b.kind === "titleblock") {
    if (!b.paper) {
      errors.push(`Block "${b.id}" (khung tên) thiếu "paper" — mỗi khổ giấy một khung tên (FR9a).`);
    }
    if ((b.attributes ?? []).length === 0) {
      errors.push(
        `Block "${b.id}" (khung tên) chưa khai "attributes" — XBOSS_VE_TRANGIN cần thẻ để điền tên dự án/tỉ lệ/ngày.`,
      );
    }
  }
}

/**
 * Kiểm định một lượt phát hành thư viện block (M100 §10) — thuần, không chạm DB.
 *
 * @param manifestTho manifest JSON đã parse (chưa tin hình dạng)
 * @param dwg         nội dung tệp `.dwg` (chỉ băm, KHÔNG đọc nội dung)
 * @param dxfText     bản DXF sidecar của chính thư viện, để đối chiếu block khai ↔ block có thật
 */
export function kiemDinhManifest(
  manifestTho: unknown,
  dwg: Buffer,
  dxfText: string,
): KiemDinhBlockLib & { manifest: BlockLibManifest | null } {
  const { manifest, errors: loiHinhDang } = docManifest(manifestTho);
  const errors = [...loiHinhDang];
  const warnings: string[] = [];
  if (!manifest) return { ok: false, errors, warnings, manifest: null };

  // 1. Toàn vẹn tệp: hash khai trong manifest phải khớp tệp .dwg nộp kèm (M100 §7 FR2 — client
  //    cũng kiểm đúng hash này trước khi nhập block vào bản vẽ).
  const hashThat = createHash("sha256").update(dwg).digest("hex");
  if (hashThat !== manifest.dwgSha256) {
    errors.push(
      `dwgSha256 trong manifest (${manifest.dwgSha256.slice(0, 12)}…) không khớp tệp .dwg nộp kèm (${hashThat.slice(0, 12)}…).`,
    );
  }

  // 2. Tệp nộp lên đúng là DWG. Chỉ soi 4 byte chữ ký ("AC10.." — mọi đời DWG từ R14 tới 2026),
  //    KHÔNG parse nội dung (M100 §12: server không đọc DWG). Bắt đúng lỗi thật hay gặp: nộp
  //    nhầm bản DXF sidecar vào ô tệp .dwg.
  if (dwg.subarray(0, 4).toString("ascii") !== "AC10") {
    errors.push(
      "Tệp nộp ở ô .dwg không mang chữ ký DWG — lưu thư viện sang định dạng DWG rồi nộp lại (DXF nộp ở ô sidecar).",
    );
  }

  // 3. Thuộc tính bắt buộc theo loại block.
  for (const b of manifest.blocks) kiemThuocTinhTheoLoai(b, errors);

  // 4. DXF sidecar: cấu trúc hợp lệ rồi mới đối chiếu tên block.
  const cauTruc = validateDxf(dxfText);
  if (!cauTruc.valid) {
    errors.push(...cauTruc.errors.map((e) => `DXF sidecar lỗi cấu trúc: ${e}`));
    return { ok: false, errors, warnings, manifest };
  }

  let stats: KiemDinhBlockLib["stats"];
  try {
    const dxf = parseDxf(dxfText);
    // Tên block trong AutoCAD không phân biệt hoa thường → so ở dạng chữ hoa.
    const coTrongDxf = new Map(dxf.blocks.map((b) => [b.name.toUpperCase(), b]));
    stats = { blocksTrongDxf: dxf.blocks.length, blocksKhaiManifest: manifest.blocks.length };

    for (const b of manifest.blocks) {
      const trongDxf = coTrongDxf.get(b.blockName.toUpperCase());
      if (!trongDxf) {
        // M104 §1: block có `fileKey` nằm ở tệp .dwg RIÊNG, không nằm trong tệp nền — sidecar này
        // mô tả tệp nền nên không thể (và không cần) chứa nó. Tính toàn vẹn của tệp lẻ được canh
        // bằng `fileSha256`, và định nghĩa block được kiểm ngay lúc thêm (block-them-web.ts).
        if (b.fileKey) continue;
        // M100 §6.10: manifest khai block không có thật → CHẶN ngay lúc phát hành, vì client
        // coi thư viện như vậy là hỏng và từ chối dùng toàn bộ.
        errors.push(
          `Block "${b.id}": manifest khai tên "${b.blockName}" nhưng DXF sidecar không có định nghĩa block đó.`,
        );
        continue;
      }
      // Thuộc tính khai trong manifest nên có ATTDEF tương ứng trong định nghĩa block. Chỉ CẢNH
      // BÁO: block động/annotative có thể sinh thẻ theo cách parser tầng 3 chưa mô hình hết —
      // chặn cứng sẽ khoá việc phát hành vì lý do không thuộc lỗi của người phát hành.
      const theTrongDxf = new Set(
        (trongDxf.entities ?? [])
          .filter((e) => e.type === "ATTDEF" && e.attributeTag)
          .map((e) => (e.attributeTag as string).toUpperCase()),
      );
      for (const thuocTinh of b.attributes ?? []) {
        if (!theTrongDxf.has(thuocTinh.toUpperCase())) {
          warnings.push(
            `Block "${b.id}" (${b.blockName}) khai thuộc tính "${thuocTinh}" nhưng DXF sidecar không thấy ATTDEF tương ứng.`,
          );
        }
      }
    }
  } catch (e) {
    errors.push(`Không parse được DXF sidecar: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, errors, warnings, manifest };
  }

  // 5. Đối chiếu chéo với rule pack đang phát hành (M100 §18 — rủi ro "trôi tên" số 1).
  warnings.push(...doiChieuTakeoff(manifest));

  return { ok: errors.length === 0, errors, warnings, stats, manifest };
}

/**
 * Đối chiếu tên block trong manifest với `takeoff.blockNameMatchAny` của rule pack hiện hành —
 * chỉ trả CẢNH BÁO (M100 §10). Dùng đúng bộ khớp token-boundary của `dxf-parser` (một matcher duy
 * nhất cho cả layerMap lẫn takeoff, khớp bản C# `TokenMatcher`).
 */
export function doiChieuTakeoff(manifest: BlockLibManifest): string[] {
  const canhBao: string[] = [];
  const items = getCurrentRulePack().takeoff.items as ReadonlyArray<{
    id: string;
    measure: string;
    blockNameMatchAny?: readonly string[];
  }>;

  for (const b of manifest.blocks) {
    if (b.kind !== "equipment") continue;
    if (!b.takeoffItemId) {
      canhBao.push(
        `Block thiết bị "${b.id}" chưa khai "takeoffItemId" — XBOSS_BOCKL sẽ không đếm được block này.`,
      );
      continue;
    }
    const item = items.find((it) => it.id === b.takeoffItemId);
    if (!item) {
      canhBao.push(
        `Block "${b.id}" trỏ tới item takeoff "${b.takeoffItemId}" không có trong rule pack đang phát hành.`,
      );
      continue;
    }
    if (item.measure !== "count") {
      canhBao.push(
        `Block "${b.id}" trỏ tới item takeoff "${item.id}" có measure="${item.measure}" (phải là "count" mới đếm được block).`,
      );
      continue;
    }
    const tokens = (item.blockNameMatchAny ?? []).map((t) => t.toUpperCase());
    if (tokens.length === 0 || !hasAnyToken(b.blockName.toUpperCase(), tokens)) {
      canhBao.push(
        `Tên block "${b.blockName}" không khớp blockNameMatchAny [${(item.blockNameMatchAny ?? []).join(", ")}] ` +
          `của item "${item.id}" — XBOSS_BOCKL sẽ bóc sót.`,
      );
    }
  }
  return canhBao;
}

// ── Phát hành + đọc (chạm DB) ────────────────────────────────────────────────

type DongDb = {
  id: number;
  version: string;
  manifest: BlockLibManifest;
  storage_key: string;
  dwg_sha256: string;
  nguoi: string | null;
  created_at: string | null;
};

function veRow(r: DongDb): BlockLibRow {
  return {
    id: r.id,
    version: r.version,
    manifest: r.manifest,
    storageKey: r.storage_key,
    dwgSha256: r.dwg_sha256,
    nguoiPhatHanh: r.nguoi,
    createdAt: r.created_at,
  };
}

const CHON = `SELECT b.id, b.version, b.manifest, b.storage_key, b.dwg_sha256,
                     u.name AS nguoi, b.created_at
                FROM cad_block_libs b
                LEFT JOIN users u ON u.id = b.published_by`;

/**
 * Version hiện hành = bản phát hành mới nhất của ĐÚNG MỘT TẦNG (append-only nên id lớn nhất là
 * mới nhất). Không truyền `projectId` → bộ **toàn cục** (`project_id IS NULL`), y hệt hành vi
 * trước M113 (guardrail 1: plugin bản cũ không gửi `?project=` vẫn nhận đúng thư viện cũ).
 * Có `projectId` → bộ **của dự án đó**, `null` khi dự án chưa phát hành bộ riêng.
 */
export async function layBlockLibHienHanh(projectId?: number): Promise<BlockLibRow | null> {
  const r =
    projectId === undefined
      ? await queryOne<DongDb>(`${CHON} WHERE b.project_id IS NULL ORDER BY b.id DESC LIMIT 1`)
      : await queryOne<DongDb>(
          `${CHON} WHERE b.project_id = ? ORDER BY b.id DESC LIMIT 1`,
          projectId,
        );
  return r ? veRow(r) : null;
}

/** Nguồn của một block trong kết quả trộn hai tầng (M113 §4.3). */
export type NguonBlock = "global" | "project";

/**
 * Một mục manifest sau khi trộn: giữ NGUYÊN hợp đồng M100 §11, chỉ **thêm** nguồn và version của
 * bộ chứa nó — plugin cần biết tải tệp `.dwg` từ bộ nào (hash kiểm theo TỪNG bộ, không trộn) và
 * kỹ sư cần thấy block này là của dự án hay toàn cục.
 */
export type BlockTronEntry = BlockManifestEntry & { nguon: NguonBlock; libVersion: string };

/**
 * Trộn hai tầng thư viện block (M113 §4) — **chỗ duy nhất** biết luật đè, thuần, không chạm DB.
 *
 * Trộn theo `blocks[].id`: id có ở cả hai bộ → **bản của dự án thắng**; id chỉ có ở một bên → giữ.
 * Thứ tự giữ theo bộ toàn cục trước (block bị đè nằm đúng chỗ cũ), block riêng của dự án nối sau.
 * Dự án chưa có bộ riêng → kết quả **trùng khít** thư viện toàn cục (guardrail 1).
 */
export function tronThuVienBlock(
  toanCuc: BlockLibRow | null,
  cuaDuAn: BlockLibRow | null,
): BlockTronEntry[] {
  const duAn = new Map<string, BlockTronEntry>(
    (cuaDuAn?.manifest.blocks ?? []).map((b) => [
      b.id,
      { ...b, nguon: "project" as const, libVersion: cuaDuAn!.version },
    ]),
  );
  const ketQua: BlockTronEntry[] = [];
  const daDung = new Set<string>();
  for (const b of toanCuc?.manifest.blocks ?? []) {
    const deLen = duAn.get(b.id);
    if (deLen) {
      ketQua.push(deLen);
      daDung.add(b.id);
    } else {
      ketQua.push({ ...b, nguon: "global", libVersion: toanCuc!.version });
    }
  }
  for (const [id, b] of duAn) if (!daDung.has(id)) ketQua.push(b);
  return ketQua;
}

/**
 * Xung đột **tên block AutoCAD** giữa bộ của dự án và bộ toàn cục hiện hành (M113 §4) — thuần.
 *
 * Hai entry khác `id` mà cùng `blockName` thì sau khi trộn sẽ có hai định nghĩa cùng tên trong một
 * bản vẽ — điều AutoCAD không cho phép. Bắt **lúc phát hành bộ dự án**, không phải lúc dùng: người
 * phát hành là người sửa được, còn kỹ sư đang vẽ thì không. Cùng `id` (dự án đè bản toàn cục) là
 * chuyện bình thường, không phải xung đột. Tên block KHÔNG phân biệt hoa thường.
 */
export function kiemXungDotBlockName(
  blocksDuAn: readonly BlockManifestEntry[],
  toanCuc: BlockLibRow | null,
): string[] {
  if (!toanCuc) return [];
  const theoTen = new Map(
    toanCuc.manifest.blocks.map((b) => [b.blockName.toUpperCase(), b] as const),
  );
  const loi: string[] = [];
  for (const b of blocksDuAn) {
    const dung = theoTen.get(b.blockName.toUpperCase());
    if (!dung || dung.id === b.id) continue;
    loi.push(
      `Block "${b.id}" của dự án dùng tên block "${b.blockName}" đã thuộc block "${dung.id}" của ` +
        `bộ toàn cục ${toanCuc.version} — hai định nghĩa cùng tên không cùng tồn tại trong một bản vẽ. ` +
        `Đổi tên block, hoặc dùng đúng id "${dung.id}" nếu muốn ĐÈ block toàn cục đó.`,
    );
  }
  return loi;
}

/**
 * ETag của **kết quả trộn** (M113 §4.6): băm cặp (id bộ toàn cục, id bộ dự án) — đổi một trong hai
 * bộ thì client tải lại. Khác `etagBlockLib` (ETag của MỘT bộ, dùng cho tệp `.dwg` vì hash kiểm
 * theo từng bộ, không trộn).
 */
export function etagBlockLibTron(toanCuc: BlockLibRow | null, cuaDuAn: BlockLibRow | null): string {
  const cap = `${toanCuc?.id ?? 0}-${cuaDuAn?.id ?? 0}`;
  return `"tron-${createHash("sha256").update(cap).digest("hex").slice(0, 32)}"`;
}

/**
 * Chạy một khối thao tác trong đúng **tầng** của thư viện: không có dự án → giữ nguyên đường cũ
 * (ngoài mọi phạm vi dự án, đúng nhánh WITH CHECK "GUC rỗng" của 0145); có dự án → trong
 * `withProjectScope(projectId)` như mọi đường đọc/ghi theo dự án khác.
 */
function trongTang<T>(projectId: number | undefined, fn: () => Promise<T>): Promise<T> {
  return projectId === undefined ? fn() : withProjectScope(projectId, fn, { readOnly: false });
}

/** Lịch sử phát hành (mới → cũ) cho bảng điều khiển web. */
export async function layLichSuBlockLib(limit = 20): Promise<BlockLibRow[]> {
  const rows = await query<DongDb>(`${CHON} ORDER BY b.id DESC LIMIT ?`, limit);
  return rows.map(veRow);
}

/** Nội dung tệp `.dwg` của một bản phát hành — `null` khi tệp đã mất trên kho lưu trữ. */
export async function docTepBlockLib(row: BlockLibRow): Promise<Buffer | null> {
  return storageGet(ORG_THU_VIEN_BLOCK, row.storageKey);
}

/** ETag mạnh theo version + hash tệp — plugin cache cục bộ và hỏi lại bằng `If-None-Match`. */
export function etagBlockLib(row: BlockLibRow): string {
  return `"${row.version}-${row.dwgSha256.slice(0, 32)}"`;
}

/**
 * Phát hành một version thư viện block. Kiểm định trước, đạt mới ghi (M100 §10).
 *
 * Idempotent theo (version, hash tệp): phát hành lại đúng tệp cũ trả về đúng dòng cũ; cùng version
 * nhưng nội dung khác → xung đột, bắt tăng version (append-only, M100 §17 — không sửa version đã
 * phát hành vì máy kỹ sư đã cache theo ETag).
 */
export async function phatHanhBlockLib(input: {
  userId: number;
  manifestTho: unknown;
  dwg: Buffer;
  dxfText: string;
  /** M113 §6 — phát hành bộ **của dự án này**; vắng = bộ toàn cục, y hệt hôm nay (guardrail 1). */
  projectId?: number;
}): Promise<PhatHanhKetQua> {
  const { manifest, ...kiemDinh } = kiemDinhManifest(input.manifestTho, input.dwg, input.dxfText);
  if (!kiemDinh.ok || !manifest) return { status: "invalid", kiemDinh };

  // M113 §4/FR3 — bộ dự án phải kiểm thêm xung đột tên block với bộ toàn cục hiện hành. Đọc bộ
  // toàn cục NGOÀI phạm vi dự án (dòng project_id IS NULL ai cũng đọc được, nhưng giữ đúng tầng).
  if (input.projectId !== undefined) {
    const xungDot = kiemXungDotBlockName(manifest.blocks, await layBlockLibHienHanh());
    if (xungDot.length > 0) {
      return {
        status: "invalid",
        kiemDinh: { ...kiemDinh, ok: false, errors: [...kiemDinh.errors, ...xungDot] },
      };
    }
  }

  const hash = createHash("sha256").update(input.dwg).digest("hex");
  return trongTang(input.projectId, async () => {
    // Nhãn version chỉ duy nhất TRONG một tầng (0145): dự án A và dự án B cùng đặt 'b1' là hợp lệ.
    const daCo = await queryOne<{ id: number; dwg_sha256: string }>(
      `SELECT id, dwg_sha256 FROM cad_block_libs
        WHERE version = ? AND project_id IS NOT DISTINCT FROM ?`,
      manifest.version,
      input.projectId ?? null,
    );
    if (daCo) {
      if (daCo.dwg_sha256 === hash) {
        return { status: "idempotent", kiemDinh, id: daCo.id, version: manifest.version };
      }
      return {
        status: "version-conflict",
        message:
          `Version "${manifest.version}" đã phát hành với nội dung khác — thư viện là append-only, ` +
          `tăng version (vd "${manifest.version}" → kế tiếp) rồi phát hành lại.`,
      };
    }

    const storageKey = newBlockLibFileName(manifest.version);
    await storagePut(ORG_THU_VIEN_BLOCK, storageKey, input.dwg);
    // DXF sidecar đặt cạnh tệp .dwg cùng quy ước tên như plugin-upload — kiểm định lại được về sau
    // mà không cần AutoCAD.
    await storagePut(
      ORG_THU_VIEN_BLOCK,
      `${storageKey}.sidecar.dxf`,
      Buffer.from(input.dxfText, "utf8"),
    );

    const id = await ghiSoBlockLib({
      version: manifest.version,
      manifest,
      storageKey,
      dwgSha256: hash,
      userId: input.userId,
      projectId: input.projectId,
    });
    return { status: "created", kiemDinh, id, version: manifest.version };
  });
}

/**
 * Bước GHI SỔ của đường phát hành — tách riêng khỏi `phatHanhBlockLib` để M103 (duyệt đề xuất
 * block) tái dùng nguyên vẹn: gói ứng viên đã được kiểm định + lưu trữ từ lúc NHẬN đề xuất, lúc
 * duyệt chỉ còn việc ghi thành version mới. Không kiểm định lại ở đây — người gọi chịu trách
 * nhiệm (phatHanhBlockLib kiểm ngay trên, block-proposals kiểm lúc nhận).
 */
export async function ghiSoBlockLib(input: {
  version: string;
  manifest: BlockLibManifest;
  storageKey: string;
  dwgSha256: string;
  userId: number;
  /** Bộ của dự án (M113); vắng/null = bộ toàn cục. Người gọi phải đang ở đúng tầng (RLS 0145). */
  projectId?: number | null;
}): Promise<number> {
  return insertId(
    `INSERT INTO cad_block_libs (version, manifest, storage_key, dwg_sha256, published_by, project_id)
     VALUES (?, ?::jsonb, ?, ?, ?, ?)`,
    input.version,
    // Manifest lưu NGUYÊN dạng đã chuẩn hoá (không nhét kết quả kiểm định vào) — cột này chính là
    // thứ plugin tải về qua `?manifest=1`, phải đúng hợp đồng M100 §11.
    JSON.stringify(input.manifest),
    input.storageKey,
    input.dwgSha256,
    input.userId,
    input.projectId ?? null,
  );
}

/**
 * Quy ước tăng version thư viện: tăng **cụm chữ số cuối cùng** trong nhãn, giữ nguyên phần chữ
 * (`b1` → `b2`, `b9` → `b10`, `b0-mau` → `b1-mau`). Nhãn không có chữ số nào thì nối `-2`
 * (`beta` → `beta-2`) — vẫn là một nhãn mới, không bao giờ đè version đã phát hành (M100 §17).
 */
export function versionKeTiep(version: string): string {
  const m = /^(.*?)(\d+)(\D*)$/.exec(version);
  if (!m) return `${version}-2`;
  return `${m[1]}${String(Number(m[2]) + 1)}${m[3]}`;
}

/**
 * Version kế tiếp **chắc chắn chưa dùng**: `version` là UNIQUE nên nếu ai đó đã phát hành tay
 * đúng nhãn kế tiếp, INSERT sẽ nổ giữa transaction duyệt. Nhảy tiếp tới nhãn còn trống.
 */
export async function versionPhatHanhKeTiep(hienHanh: string, projectId?: number): Promise<string> {
  let ung = versionKeTiep(hienHanh);
  for (let i = 0; i < 50; i++) {
    // Nhãn duy nhất theo TỪNG tầng (0145) — nhãn dự án A đang dùng không chặn dự án B/toàn cục.
    const da = await queryOne<{ id: number }>(
      `SELECT id FROM cad_block_libs WHERE version = ? AND project_id IS NOT DISTINCT FROM ?`,
      ung,
      projectId ?? null,
    );
    if (!da) return ung;
    ung = versionKeTiep(ung);
  }
  throw new Error(`Không tìm được nhãn version trống sau "${hienHanh}"`);
}
