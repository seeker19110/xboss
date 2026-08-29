// M103 — đề xuất block vào thư viện từ AutoCAD: hàng chờ + duyệt (M103 §1–§3).
/**
 * Nguyên tắc nền (M100 §18, giữ nguyên): thư viện block là **dữ liệu phát hành có version toàn
 * cục**. Đề xuất KHÔNG sửa thư viện; duyệt mới sinh version mới. Server không chạy AutoCAD nên
 * không gộp DWG được → plugin dựng sẵn "thư viện ứng viên" hoàn chỉnh (blocks.dwg + manifest đầy
 * đủ + sidecar DXF), server chỉ **kiểm định lại** rồi xếp hàng chờ; lúc duyệt chỉ còn thao tác
 * dữ liệu thuần: chép nguyên gói ứng viên thành một version `cad_block_libs` mới.
 *
 * Chống đua version (M103 §1 / AC4): mỗi đề xuất mang `base_lib_version`; server so với version
 * hiện hành cả lúc NHẬN lẫn lúc DUYỆT — lệch thì 409 và đánh dấu `stale`, người đề xuất chạy lại
 * lệnh. Nhờ đó hai đề xuất cùng base không bao giờ phát hành đè mất block của nhau.
 *
 * Kiểm định tái dùng nguyên `block-lib.ts` (`kiemDinhManifest` + đường ghi sổ `ghiSoBlockLib`),
 * không chép lại logic — một chỗ sửa, hai đường phát hành cùng đúng.
 */
import { createHash } from "node:crypto";
import { query, queryOne, run, insertId, withTransaction } from "@/lib/db";
import { storageGet, storagePut } from "@/lib/nen/storage";
import { newBlockLibFileName } from "@/lib/nen/photos";
import { parseDxf, type DxfEntityRaw } from "@/lib/ky-thuat/cad/dxf-parser";
import {
  LOAI_BLOCK,
  ORG_THU_VIEN_BLOCK,
  docManifest,
  ghiSoBlockLib,
  kiemDinhManifest,
  layBlockLibHienHanh,
  versionPhatHanhKeTiep,
  type BlockLibManifest,
  type BlockManifestEntry,
  type LoaiBlock,
} from "@/lib/ky-thuat/cad/block-lib";
import { dungPreviewSvg } from "@/lib/ky-thuat/cad/block-preview-svg";

// ── Hằng số & nhãn tiếng Việt ────────────────────────────────────────────────

export const TRANG_THAI_DE_XUAT = [
  "pending",
  "approved",
  "rejected",
  "stale",
  "withdrawn",
] as const;
export type TrangThaiDeXuat = (typeof TRANG_THAI_DE_XUAT)[number];

export const NHAN_TRANG_THAI_DE_XUAT: Record<TrangThaiDeXuat, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  stale: "Lỗi thời",
  withdrawn: "Đã thu hồi",
};

export const NHAN_LOAI_BLOCK: Record<LoaiBlock, string> = {
  fitting: "Phụ kiện",
  equipment: "Thiết bị",
  titleblock: "Khung tên",
  support: "Giá đỡ",
  sleeve: "Ống lồng",
  annotation: "Ký hiệu chú thích",
};

/**
 * Kind đếm khối lượng theo block (M103 §2) — bắt buộc khai `takeoff_item_id`.
 * `titleblock` và `annotation` (M110) đứng ngoài: khung tên và ký hiệu chú thích không phải khối
 * lượng thi công, ép khai `takeoff_item_id` chỉ tạo ra hạng mục ma trong BOQ.
 */
const KIND_DEM_KHOI_LUONG: readonly LoaiBlock[] = ["fitting", "equipment", "support", "sleeve"];

const SHA256_HEX = /^[0-9a-f]{64}$/;

// ── Đọc & kiểm metadata (thuần, không chạm DB) ───────────────────────────────

/** Metadata đề xuất — khoá JSON theo đúng hợp đồng M103 §3 (snake_case). */
export type MetaDeXuat = MetaBlockCoBan & {
  baseLibVersion: string;
  candidateManifest: unknown;
  sha256: string;
};

/**
 * Phần metadata **mô tả chính block** — dùng chung cho cả đường đề xuất từ AutoCAD (M103 §3) lẫn
 * đường thêm thẳng từ web (M104 §2), để hai đường không bao giờ lệch luật bắt buộc theo kind.
 */
export type MetaBlockCoBan = {
  blockName: string;
  kind: LoaiBlock;
  systemId: string | null;
  takeoffItemId: string | null;
  paperSize: string | null;
  note: string | null;
};

/** `block_name` → `blockName` — hợp đồng M103 dùng snake_case, M104 §2 dùng camelCase. */
function camel(khoa: string): string {
  return khoa.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Đọc chuỗi theo khoá snake_case, chấp nhận cả biến thể camelCase cùng nghĩa. */
function chuoi(o: Record<string, unknown>, khoa: string): string {
  const v = o[khoa] ?? o[camel(khoa)];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Ép phần metadata mô tả block về đúng hình dạng, kèm kiểm **metadata đủ theo kind**
 * (M103 §2/§3d): hệ bắt buộc trừ khung tên, item bóc tách bắt buộc với kind đếm khối lượng,
 * khổ giấy chỉ (và bắt buộc) với khung tên.
 */
export function docMetaBlockCoBan(tho: unknown): { meta: MetaBlockCoBan | null; errors: string[] } {
  const errors: string[] = [];
  if (typeof tho !== "object" || tho === null || Array.isArray(tho)) {
    return { meta: null, errors: ["meta không phải một đối tượng JSON."] };
  }
  const o = tho as Record<string, unknown>;

  const blockName = chuoi(o, "block_name");
  const kind = chuoi(o, "kind");
  const systemId = chuoi(o, "system_id");
  const takeoffItemId = chuoi(o, "takeoff_item_id");
  const paperSize = chuoi(o, "paper_size");
  const note = chuoi(o, "note");

  if (!blockName) errors.push('Thiếu "block_name" — tên block trong tệp .dwg.');
  else if (blockName.length > 255) errors.push('"block_name" dài quá 255 ký tự.');
  if (!(LOAI_BLOCK as readonly string[]).includes(kind)) {
    errors.push(`"kind" lạ — chỉ nhận ${LOAI_BLOCK.join(" | ")}.`);
  }
  if (kind !== "titleblock") {
    if (!systemId) {
      errors.push('Thiếu "system_id" — mọi block trừ khung tên đều phải thuộc một hệ.');
    }
    if (paperSize) {
      errors.push('"paper_size" chỉ dành cho khung tên (kind = titleblock).');
    }
  } else if (!paperSize) {
    errors.push('Khung tên thiếu "paper_size" — mỗi khổ giấy một khung tên (M100 FR9a).');
  }
  if ((KIND_DEM_KHOI_LUONG as readonly string[]).includes(kind) && !takeoffItemId) {
    errors.push(
      `Thiếu "takeoff_item_id" — block loại ${kind} được đếm khối lượng, phải trỏ tới một item bóc tách.`,
    );
  }

  if (errors.length > 0) return { meta: null, errors };
  return {
    meta: {
      blockName,
      kind: kind as LoaiBlock,
      systemId: systemId || null,
      takeoffItemId: takeoffItemId || null,
      paperSize: paperSize || null,
      note: note || null,
    },
    errors,
  };
}

/**
 * Metadata gói đề xuất từ AutoCAD = phần mô tả block (chung với M104) + 3 trường riêng của đường
 * đề xuất: version nền, manifest ứng viên, hash tệp ứng viên.
 */
export function docMetaDeXuat(tho: unknown): { meta: MetaDeXuat | null; errors: string[] } {
  const { meta: coBan, errors: loiCoBan } = docMetaBlockCoBan(tho);
  const errors = [...loiCoBan];
  if (typeof tho !== "object" || tho === null || Array.isArray(tho)) {
    return { meta: null, errors };
  }
  const o = tho as Record<string, unknown>;

  const baseLibVersion = chuoi(o, "base_lib_version");
  const sha256 = chuoi(o, "sha256").toLowerCase();
  if (!baseLibVersion) {
    errors.push('Thiếu "base_lib_version" — version thư viện mà ứng viên được dựng lên.');
  }
  if (!SHA256_HEX.test(sha256)) {
    errors.push('Thiếu "sha256" hợp lệ (64 ký tự hex của tệp .dwg ứng viên).');
  }
  const candidateManifest = o.candidate_manifest;
  if (
    typeof candidateManifest !== "object" ||
    candidateManifest === null ||
    Array.isArray(candidateManifest)
  ) {
    errors.push('Thiếu "candidate_manifest" — manifest ĐẦY ĐỦ của thư viện sau khi thêm block.');
  }

  if (errors.length > 0 || !coBan) return { meta: null, errors };
  return { meta: { ...coBan, baseLibVersion, candidateManifest, sha256 }, errors };
}

/** So sánh hai mục manifest đã chuẩn hoá — JSONB không giữ thứ tự khoá nên không so bằng chuỗi. */
function mucBangNhau(a: BlockManifestEntry, b: BlockManifestEntry): boolean {
  const attr = (x?: string[]) => (x ?? []).join("\u0000");
  return (
    a.id === b.id &&
    a.blockName === b.blockName &&
    a.kind === b.kind &&
    (a.system ?? null) === (b.system ?? null) &&
    (a.scaleBySize ?? false) === (b.scaleBySize ?? false) &&
    (a.rotateToPath ?? false) === (b.rotateToPath ?? false) &&
    (a.takeoffItemId ?? null) === (b.takeoffItemId ?? null) &&
    (a.paper ?? null) === (b.paper ?? null) &&
    attr(a.attributes) === attr(b.attributes)
  );
}

/**
 * Manifest ứng viên phải **đúng bằng manifest hiện hành cộng đúng 1 entry mới** mang tên
 * `blockName` (M103 §3b). Đề xuất là đường THÊM block, không phải đường sửa/xoá block đã phát
 * hành — sửa/xoá vẫn đi đường phát hành thư viện của Admin/PM.
 */
export function soSanhManifestUngVien(
  hienHanh: BlockLibManifest,
  ungVien: BlockLibManifest,
  blockName: string,
): string[] {
  const errors: string[] = [];
  const cu = new Map(hienHanh.blocks.map((b) => [b.id, b]));
  const moi = new Map(ungVien.blocks.map((b) => [b.id, b]));

  for (const [id, b] of cu) {
    const t = moi.get(id);
    if (!t) {
      errors.push(
        `Manifest ứng viên thiếu block "${id}" của thư viện hiện hành — đề xuất chỉ được THÊM block, không được bỏ bớt.`,
      );
    } else if (!mucBangNhau(b, t)) {
      errors.push(
        `Block "${id}" bị sửa so với thư viện hiện hành — đề xuất chỉ được THÊM block mới, sửa block cũ đi đường phát hành thư viện.`,
      );
    } else if (
      (b.fileKey ?? null) !== (t.fileKey ?? null) ||
      (b.fileSha256 ?? null) !== (t.fileSha256 ?? null)
    ) {
      // M104 §1: block thêm từ web nằm ở tệp .dwg riêng. Ứng viên phải GIỮ NGUYÊN `fileKey` của
      // chúng — bỏ đi thì version mới sẽ trỏ block đó vào tệp nền (không có định nghĩa) và cả
      // thư viện hỏng theo. `mucBangNhau` không so nhóm này nên kiểm riêng, thông điệp rõ ràng.
      errors.push(
        `Block "${id}" mất/đổi "fileKey" so với thư viện hiện hành — manifest ứng viên phải giữ nguyên các block thêm từ web.`,
      );
    }
  }

  const themMoi = [...moi.keys()].filter((id) => !cu.has(id));
  if (themMoi.length === 0) {
    errors.push("Manifest ứng viên không thêm block nào so với thư viện hiện hành.");
  } else if (themMoi.length > 1) {
    errors.push(
      `Manifest ứng viên thêm ${themMoi.length} block (${themMoi.join(", ")}) — mỗi lần chỉ đề xuất đúng 1 block.`,
    );
  } else {
    const themVao = moi.get(themMoi[0]) as BlockManifestEntry;
    if (themVao.blockName.toUpperCase() !== blockName.toUpperCase()) {
      errors.push(
        `Block mới trong manifest tên "${themVao.blockName}" nhưng meta khai "${blockName}" — hai chỗ phải khớp.`,
      );
    }
  }
  return errors;
}

// ── Nhận đề xuất (chạm DB) ───────────────────────────────────────────────────

export type NhanDeXuatKetQua =
  | { status: "invalid"; errors: string[] }
  | {
      status: "conflict";
      loai: "trung-ten" | "stale" | "chua-co-thu-vien";
      message: string;
      versionHienHanh?: string;
    }
  | { status: "created" | "idempotent"; id: number; coPreview: boolean };

type DongDeXuat = {
  id: number;
  block_name: string;
  kind: string;
  system_id: string | null;
  takeoff_item_id: string | null;
  paper_size: string | null;
  note: string | null;
  base_lib_version: string;
  candidate_manifest: BlockLibManifest;
  candidate_storage_key: string;
  candidate_dwg_sha256: string;
  preview_svg: string | null;
  status: string;
  reject_reason: string | null;
  published_version: string | null;
  proposed_by: number;
  nguoi_de_xuat: string | null;
  decided_by: number | null;
  nguoi_quyet_dinh: string | null;
  decided_at: string | null;
  created_at: string | null;
};

export type DeXuatBlock = {
  id: number;
  blockName: string;
  kind: string;
  kindNhan: string;
  systemId: string | null;
  takeoffItemId: string | null;
  paperSize: string | null;
  note: string | null;
  baseLibVersion: string;
  dwgSha256: string;
  previewSvg: string | null;
  status: string;
  statusNhan: string;
  rejectReason: string | null;
  publishedVersion: string | null;
  nguoiDeXuat: string | null;
  nguoiDeXuatId: number;
  nguoiQuyetDinh: string | null;
  decidedAt: string | null;
  createdAt: string | null;
};

function veDeXuat(r: DongDeXuat): DeXuatBlock {
  return {
    id: r.id,
    blockName: r.block_name,
    kind: r.kind,
    kindNhan: NHAN_LOAI_BLOCK[r.kind as LoaiBlock] ?? r.kind,
    systemId: r.system_id,
    takeoffItemId: r.takeoff_item_id,
    paperSize: r.paper_size,
    note: r.note,
    baseLibVersion: r.base_lib_version,
    dwgSha256: r.candidate_dwg_sha256,
    previewSvg: r.preview_svg,
    status: r.status,
    statusNhan: NHAN_TRANG_THAI_DE_XUAT[r.status as TrangThaiDeXuat] ?? r.status,
    rejectReason: r.reject_reason,
    publishedVersion: r.published_version,
    nguoiDeXuat: r.nguoi_de_xuat,
    nguoiDeXuatId: r.proposed_by,
    nguoiQuyetDinh: r.nguoi_quyet_dinh,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
  };
}

const CHON_DE_XUAT = `SELECT p.id, p.block_name, p.kind, p.system_id, p.takeoff_item_id,
                             p.paper_size, p.note, p.base_lib_version, p.candidate_manifest,
                             p.candidate_storage_key, p.candidate_dwg_sha256, p.preview_svg,
                             p.status, p.reject_reason, p.published_version, p.proposed_by,
                             u.name AS nguoi_de_xuat, p.decided_by, d.name AS nguoi_quyet_dinh,
                             p.decided_at, p.created_at
                        FROM cad_block_proposals p
                        LEFT JOIN users u ON u.id = p.proposed_by
                        LEFT JOIN users d ON d.id = p.decided_by`;

/**
 * Nhận một gói đề xuất từ plugin. Thứ tự kiểm bám M103 §3: metadata → toàn vẹn tệp → base version
 * → idempotency → trùng tên → manifest ứng viên → sidecar. Chỉ khi qua hết mới lưu tệp và ghi
 * dòng — không có đề xuất nửa vời.
 */
export async function nhanDeXuat(input: {
  userId: number;
  metaTho: unknown;
  dwg: Buffer;
  dxfText: string;
}): Promise<NhanDeXuatKetQua> {
  // (d) Metadata đủ theo kind — kiểm thuần trước, rẻ nhất.
  const { meta, errors: loiMeta } = docMetaDeXuat(input.metaTho);
  if (!meta) return { status: "invalid", errors: loiMeta };

  // (a) sha256 khai trong meta khớp tệp DWG nộp kèm.
  const hash = createHash("sha256").update(input.dwg).digest("hex");
  if (hash !== meta.sha256) {
    return {
      status: "invalid",
      errors: [
        `sha256 khai trong meta (${meta.sha256.slice(0, 12)}…) không khớp tệp .dwg ứng viên (${hash.slice(0, 12)}…).`,
      ],
    };
  }

  // (e) base_lib_version phải là version hiện hành.
  const hienHanhRow = await layBlockLibHienHanh();
  if (!hienHanhRow) {
    return {
      status: "conflict",
      loai: "chua-co-thu-vien",
      message:
        "Chưa phát hành thư viện block nền nào — Admin/PM phát hành bản nền trước, rồi mới đề xuất thêm block.",
    };
  }
  if (hienHanhRow.version !== meta.baseLibVersion) {
    return {
      status: "conflict",
      loai: "stale",
      message:
        `Thư viện đã sang version ${hienHanhRow.version} trong khi đề xuất dựng trên ${meta.baseLibVersion} — ` +
        `chạy lại lệnh XBOSS_VE_DEXUAT để plugin tải thư viện mới rồi dựng lại ứng viên.`,
      versionHienHanh: hienHanhRow.version,
    };
  }

  // Idempotent theo (block_name, sha256, pending): plugin gửi lại đúng gói này (mất mạng giữa
  // chừng) trả lại dòng cũ thay vì tạo đôi — phải kiểm TRƯỚC luật trùng tên, nếu không chính bản
  // gửi lại sẽ bị chính nó chặn 409.
  const daCo = await queryOne<{ id: number; co_preview: boolean }>(
    `SELECT id, (preview_svg IS NOT NULL) AS co_preview FROM cad_block_proposals
      WHERE upper(block_name) = upper(?) AND candidate_dwg_sha256 = ? AND status = 'pending'`,
    meta.blockName,
    hash,
  );
  if (daCo) return { status: "idempotent", id: daCo.id, coPreview: daCo.co_preview };

  // (c) Trùng tên với thư viện hiện hành hoặc một đề xuất pending khác → 409, bắt đổi tên.
  //     Tên block trong AutoCAD KHÔNG phân biệt hoa thường.
  const { manifest: hienHanh, errors: loiHienHanh } = docManifest(hienHanhRow.manifest);
  if (!hienHanh) {
    return {
      status: "invalid",
      errors: [
        `Manifest của thư viện hiện hành (${hienHanhRow.version}) không đọc được: ${loiHienHanh.join(" · ")}`,
      ],
    };
  }
  if (hienHanh.blocks.some((b) => b.blockName.toUpperCase() === meta.blockName.toUpperCase())) {
    return {
      status: "conflict",
      loai: "trung-ten",
      message: `Thư viện ${hienHanhRow.version} đã có block tên "${meta.blockName}" — đặt tên khác rồi gửi lại.`,
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
      message: `Đã có đề xuất #${trungCho.id} đang chờ duyệt cho block tên "${meta.blockName}" — đặt tên khác rồi gửi lại.`,
      versionHienHanh: hienHanhRow.version,
    };
  }

  // (b) Manifest ứng viên hợp lệ (tái dùng nguyên validator phát hành: hash, chữ ký DWG, thuộc
  //     tính theo loại, đối chiếu DXF sidecar) và đúng bằng "hiện hành + 1 entry mới".
  const kiemDinh = kiemDinhManifest(meta.candidateManifest, input.dwg, input.dxfText);
  if (!kiemDinh.ok || !kiemDinh.manifest) {
    return { status: "invalid", errors: kiemDinh.errors };
  }
  const loiSoSanh = soSanhManifestUngVien(hienHanh, kiemDinh.manifest, meta.blockName);
  if (loiSoSanh.length > 0) return { status: "invalid", errors: loiSoSanh };

  // (f) Sidecar DXF phải có định nghĩa block mang đúng tên đó. `kiemDinhManifest` đã phủ luật này
  //     cho MỌI block khai trong manifest; kiểm lại ở đây để (1) thông điệp trỏ đúng block đang
  //     đề xuất và (2) lấy hình học dựng ảnh xem trước.
  let coDinhNghia = false;
  let hinhHoc: DxfEntityRaw[] | undefined;
  try {
    const dxf = parseDxf(input.dxfText);
    const dinhNghia = dxf.blocks.find((b) => b.name.toUpperCase() === meta.blockName.toUpperCase());
    if (dinhNghia) {
      coDinhNghia = true;
      hinhHoc = dinhNghia.entities;
    }
  } catch {
    coDinhNghia = false;
  }
  if (!coDinhNghia) {
    return {
      status: "invalid",
      errors: [
        `DXF sidecar không có định nghĩa block "${meta.blockName}" — xuất lại sidecar từ chính thư viện ứng viên.`,
      ],
    };
  }

  // Ảnh xem trước là best-effort: hỏng thì lưu null, KHÔNG làm hỏng đề xuất (M103 §3).
  let previewSvg: string | null = null;
  try {
    previewSvg = dungPreviewSvg(hinhHoc, meta.blockName);
  } catch {
    previewSvg = null;
  }

  const storageKey = newBlockLibFileName(`dx-${meta.blockName}`);
  await storagePut(ORG_THU_VIEN_BLOCK, storageKey, input.dwg);
  // Sidecar đặt cạnh tệp .dwg cùng quy ước tên như đường phát hành — kiểm định lại được về sau
  // mà không cần AutoCAD.
  await storagePut(
    ORG_THU_VIEN_BLOCK,
    `${storageKey}.sidecar.dxf`,
    Buffer.from(input.dxfText, "utf8"),
  );

  const id = await insertId(
    `INSERT INTO cad_block_proposals
       (block_name, kind, system_id, takeoff_item_id, paper_size, note, base_lib_version,
        candidate_manifest, candidate_storage_key, candidate_dwg_sha256, preview_svg,
        status, proposed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, 'pending', ?)`,
    meta.blockName,
    meta.kind,
    meta.systemId,
    meta.takeoffItemId,
    meta.paperSize,
    meta.note,
    meta.baseLibVersion,
    JSON.stringify(kiemDinh.manifest),
    storageKey,
    hash,
    previewSvg,
    input.userId,
  );
  return { status: "created", id, coPreview: previewSvg !== null };
}

// ── Đọc danh sách ────────────────────────────────────────────────────────────

/**
 * Hàng chờ + lịch sử đề xuất. `chiNguoiDeXuat` khác `undefined` thì chỉ trả đề xuất của người đó
 * (engineer chỉ thấy của mình — Admin/PM thấy tất cả, ranh giới quyền do route quyết).
 */
export async function layDanhSachDeXuat(opts?: {
  status?: string;
  chiNguoiDeXuat?: number;
  limit?: number;
}): Promise<DeXuatBlock[]> {
  const dieuKien: string[] = [];
  const thamSo: unknown[] = [];
  if (opts?.status && (TRANG_THAI_DE_XUAT as readonly string[]).includes(opts.status)) {
    dieuKien.push(`p.status = ?`);
    thamSo.push(opts.status);
  }
  if (opts?.chiNguoiDeXuat !== undefined) {
    dieuKien.push(`p.proposed_by = ?`);
    thamSo.push(opts.chiNguoiDeXuat);
  }
  const where = dieuKien.length > 0 ? ` WHERE ${dieuKien.join(" AND ")}` : "";
  const rows = await query<DongDeXuat>(
    `${CHON_DE_XUAT}${where} ORDER BY p.id DESC LIMIT ?`,
    ...thamSo,
    Math.min(Math.max(opts?.limit ?? 100, 1), 500),
  );
  return rows.map(veDeXuat);
}

// ── Tải tệp ứng viên (bổ sung — người duyệt đang duyệt "mù", chỉ có preview SVG best-effort) ──

export type LayTepUngVienKetQua =
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "missing-file" }
  | { status: "ok"; blockName: string; sha256: string; buf: Buffer };

/**
 * Đọc tệp .dwg ứng viên của một đề xuất (`candidate_storage_key`) — cho người duyệt/chính người
 * đề xuất tải về đối chiếu trước khi Duyệt & Phát Hành, thay vì chỉ tin ảnh xem trước SVG dựng
 * best-effort từ sidecar DXF. Quyền do caller (route) tự quyết định qua `coQuyenDuyet`
 * (`CAN.approve`) — hàm này chỉ so thêm `proposed_by` khi không có quyền duyệt.
 */
export async function layTepUngVien(input: {
  id: number;
  userId: number;
  coQuyenDuyet: boolean;
}): Promise<LayTepUngVienKetQua> {
  const dx = await queryOne<{
    block_name: string;
    candidate_storage_key: string;
    candidate_dwg_sha256: string;
    proposed_by: number;
  }>(
    `SELECT block_name, candidate_storage_key, candidate_dwg_sha256, proposed_by
       FROM cad_block_proposals WHERE id = ?`,
    input.id,
  );
  if (!dx) return { status: "not-found" };
  if (!input.coQuyenDuyet && dx.proposed_by !== input.userId) return { status: "forbidden" };

  // `candidate_storage_key` luôn do server sinh lúc `nhanDeXuat` (không nhận từ input client) —
  // đọc thẳng qua storageGet, không ghép chuỗi/đường dẫn nào từ tham số route.
  const buf = await storageGet(ORG_THU_VIEN_BLOCK, dx.candidate_storage_key);
  if (!buf) return { status: "missing-file" };
  return { status: "ok", blockName: dx.block_name, sha256: dx.candidate_dwg_sha256, buf };
}

// ── Duyệt / từ chối ──────────────────────────────────────────────────────────

export type QuyetDinhKetQua =
  | { status: "not-found" }
  | { status: "conflict"; loai: "stale" | "khong-cho-duyet"; message: string }
  | { status: "approved"; version: string; libId: number }
  | { status: "rejected" };

/**
 * Duyệt = phát hành: chép nguyên gói ứng viên thành version thư viện mới. Toàn bộ nằm trong 1
 * transaction, khoá dòng đề xuất (`FOR UPDATE`) để hai người duyệt cùng lúc không phát hành đôi.
 * Re-check `base_lib_version` ngay trước khi ghi — lệch thì đánh dấu `stale` và 409 (AC4).
 */
export async function duyetDeXuat(input: {
  id: number;
  userId: number;
}): Promise<Exclude<QuyetDinhKetQua, { status: "rejected" }>> {
  return withTransaction(async () => {
    // Khoá advisory theo bảng thư viện: 2 giao dịch duyệt song song sẽ xếp hàng, giao dịch sau
    // đọc được version vừa phát hành → rơi đúng nhánh 409 stale thay vì nổ UNIQUE(version) 500.
    await run(`SELECT pg_advisory_xact_lock(hashtext('cad_block_libs'))`);
    const dx = await queryOne<{
      id: number;
      status: string;
      base_lib_version: string;
      candidate_manifest: BlockLibManifest;
      candidate_storage_key: string;
      candidate_dwg_sha256: string;
    }>(
      `SELECT id, status, base_lib_version, candidate_manifest, candidate_storage_key,
              candidate_dwg_sha256
         FROM cad_block_proposals WHERE id = ? FOR UPDATE`,
      input.id,
    );
    if (!dx) return { status: "not-found" };
    if (dx.status !== "pending") {
      return {
        status: "conflict",
        loai: "khong-cho-duyet",
        message: `Đề xuất #${dx.id} không còn ở trạng thái chờ duyệt (đang "${NHAN_TRANG_THAI_DE_XUAT[dx.status as TrangThaiDeXuat] ?? dx.status}").`,
      };
    }

    const hienHanh = await layBlockLibHienHanh();
    if (!hienHanh || hienHanh.version !== dx.base_lib_version) {
      await run(`UPDATE cad_block_proposals SET status = 'stale' WHERE id = ?`, dx.id);
      return {
        status: "conflict",
        loai: "stale",
        message:
          `Thư viện đã sang version ${hienHanh?.version ?? "(chưa có)"} trong khi đề xuất dựng trên ` +
          `${dx.base_lib_version} — đề xuất đã đánh dấu lỗi thời, người đề xuất chạy lại lệnh XBOSS_VE_DEXUAT.`,
      };
    }

    const versionMoi = await versionPhatHanhKeTiep(hienHanh.version);
    // Nhãn version nằm trong CẢ cột `version` lẫn manifest (plugin đọc `manifest.version` sau khi
    // tải về) — đồng bộ hai chỗ, nếu không client sẽ tưởng cache còn mới.
    const manifest: BlockLibManifest = {
      ...dx.candidate_manifest,
      version: versionMoi,
      dwgSha256: dx.candidate_dwg_sha256,
    };
    const libId = await ghiSoBlockLib({
      version: versionMoi,
      manifest,
      storageKey: dx.candidate_storage_key,
      dwgSha256: dx.candidate_dwg_sha256,
      userId: input.userId,
    });
    await run(
      `UPDATE cad_block_proposals
          SET status = 'approved', published_version = ?, decided_by = ?, decided_at = now()
        WHERE id = ?`,
      versionMoi,
      input.userId,
      dx.id,
    );
    return { status: "approved", version: versionMoi, libId };
  });
}

/** Từ chối một đề xuất — lý do bắt buộc (người đề xuất cần biết phải sửa gì). */
export async function tuChoiDeXuat(input: {
  id: number;
  userId: number;
  reason: string;
}): Promise<Exclude<QuyetDinhKetQua, { status: "approved" }>> {
  const lyDo = input.reason.trim();
  const kq = await run(
    `UPDATE cad_block_proposals
        SET status = 'rejected', reject_reason = ?, decided_by = ?, decided_at = now()
      WHERE id = ? AND status = 'pending'`,
    lyDo,
    input.userId,
    input.id,
  );
  if (kq.changes > 0) return { status: "rejected" };

  const dx = await queryOne<{ status: string }>(
    `SELECT status FROM cad_block_proposals WHERE id = ?`,
    input.id,
  );
  if (!dx) return { status: "not-found" };
  return {
    status: "conflict",
    loai: "khong-cho-duyet",
    message: `Đề xuất #${input.id} không còn ở trạng thái chờ duyệt (đang "${NHAN_TRANG_THAI_DE_XUAT[dx.status as TrangThaiDeXuat] ?? dx.status}").`,
  };
}

// ── Thu hồi (người đề xuất tự rút lại) ───────────────────────────────────────

export type ThuHoiKetQua =
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "conflict"; message: string }
  | { status: "withdrawn" };

/**
 * Người gửi đề xuất tự thu hồi đề xuất SAI của chính mình, khi còn `pending` (Admin/PM vẫn dùng
 * `tuChoiDeXuat` như cũ để từ chối đề xuất của người khác kèm lý do). UPDATE điều kiện
 * `proposed_by`+`status` là 1 câu lệnh nguyên tử (CAS) — không cần transaction/khoá riêng, cùng
 * cách `tuChoiDeXuat` đang làm.
 */
export async function thuHoiDeXuat(input: { id: number; userId: number }): Promise<ThuHoiKetQua> {
  const kq = await run(
    `UPDATE cad_block_proposals
        SET status = 'withdrawn', decided_by = ?, decided_at = now()
      WHERE id = ? AND proposed_by = ? AND status = 'pending'`,
    input.userId,
    input.id,
    input.userId,
  );
  if (kq.changes > 0) return { status: "withdrawn" };

  const dx = await queryOne<{ status: string; proposed_by: number }>(
    `SELECT status, proposed_by FROM cad_block_proposals WHERE id = ?`,
    input.id,
  );
  if (!dx) return { status: "not-found" };
  if (dx.proposed_by !== input.userId) return { status: "forbidden" };
  return {
    status: "conflict",
    message: `Đề xuất #${input.id} không còn ở trạng thái chờ duyệt (đang "${NHAN_TRANG_THAI_DE_XUAT[dx.status as TrangThaiDeXuat] ?? dx.status}") — không thu hồi được.`,
  };
}
