// M20 — Kho hồ sơ dự án: view hợp nhất các loại file đã có (biên bản/hồ sơ chất
// lượng, hợp đồng, phát sinh/VO, bản vẽ) + 1 bảng file tự do cấp dự án. Đọc chéo
// (không di trú dữ liệu, không tạo bảng đồng bộ) — liệt kê tĩnh từng nguồn trong code
// (không UNION SQL động qua introspection, xem docs/nang-cap/M20-kho-ho-so.md).
import { query } from "@/lib/db";
import { CAN, type User } from "@/lib/auth";
import { CONTRACT_KIND_LABEL, type ContractKind } from "@/lib/contracts";
import { VO_REASON_LABEL, type VoReason } from "@/lib/vo";
import { DRAWING_KIND_LABEL, type DrawingKind } from "@/lib/drawings";
import { DOC_CATEGORY_LABEL, type DocCategory } from "@/lib/qaqc";

export const DOCUMENT_SOURCES = ["task", "contract", "vo", "drawing", "project"] as const;
export type DocumentSource = (typeof DOCUMENT_SOURCES)[number];
export const DOCUMENT_SOURCE_LABEL: Record<DocumentSource, string> = {
  task: "Nghiệm thu",
  contract: "Hợp đồng",
  vo: "Phát sinh",
  drawing: "Bản vẽ",
  project: "Dự án",
};

export type HubDocument = {
  id: number;
  source: DocumentSource;
  title: string;
  category: string | null;
  systemCode: string | null;
  systemName: string | null;
  systemColor: string | null;
  floorLabel: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  uploaderName: string | null;
  viewUrl: string;
};

// Nghiệm thu/hồ sơ chất lượng (task_documents) — subcon chỉ thấy tài liệu của task
// được giao (lọc thẳng bằng SQL, tương đương canTouchTask nhưng tránh N truy vấn).
async function listTaskDocuments(user: User): Promise<HubDocument[]> {
  const subconFilter = user.role === "subcon" ? "AND t.assigned_to = ?" : "";
  const params = user.role === "subcon" ? [user.id] : [];
  const rows = await query<{
    id: number;
    title: string;
    docCategory: DocCategory | null;
    systemCode: string | null;
    systemName: string | null;
    systemColor: string | null;
    floorLabel: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string;
    uploaderName: string | null;
  }>(
    `SELECT td.id, t.name AS title, td.doc_category AS "docCategory",
            disc.code AS "systemCode", disc.name AS "systemName",
            disc.color AS "systemColor", wp.floor_label AS "floorLabel",
            td.mime_type AS "mimeType", td.size_bytes AS "sizeBytes",
            td.created_at AS "createdAt", u.name AS "uploaderName"
       FROM task_documents td
       JOIN tasks t ON t.id = td.task_id
       LEFT JOIN work_packages wp ON wp.id = t.package_id
       LEFT JOIN sheet_types st ON st.id = wp.sheet_type_id
       LEFT JOIN systems disc ON disc.id = st.system_id
       LEFT JOIN users u ON u.id = td.uploaded_by
      WHERE td.task_id IS NOT NULL ${subconFilter}
      ORDER BY td.id DESC`,
    ...params,
  );
  return rows.map((r) => ({
    id: r.id,
    source: "task",
    title: r.title,
    category: r.docCategory ? DOC_CATEGORY_LABEL[r.docCategory] : null,
    systemCode: r.systemCode,
    systemName: r.systemName,
    systemColor: r.systemColor,
    floorLabel: r.floorLabel,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt,
    uploaderName: r.uploaderName,
    viewUrl: `/api/documents/${r.id}`,
  }));
}

// Hợp đồng (contract_documents) — nhạy cảm thương mại, cùng quyền trang /contracts.
async function listContractDocuments(user: User): Promise<HubDocument[]> {
  if (!CAN.viewPayments(user.role)) return [];
  const rows = await query<{
    id: number;
    title: string;
    kind: ContractKind;
    systemCode: string | null;
    systemName: string | null;
    systemColor: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string;
    uploaderName: string | null;
  }>(
    `SELECT cd.id, c.title, c.kind,
            disc.code AS "systemCode", disc.name AS "systemName",
            disc.color AS "systemColor",
            cd.mime_type AS "mimeType", cd.size_bytes AS "sizeBytes",
            cd.created_at AS "createdAt", u.name AS "uploaderName"
       FROM contract_documents cd
       JOIN contracts c ON c.id = cd.contract_id
       LEFT JOIN systems disc ON disc.id = c.system_id
       LEFT JOIN users u ON u.id = cd.uploaded_by
      ORDER BY cd.id DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    source: "contract",
    title: r.title,
    category: CONTRACT_KIND_LABEL[r.kind],
    systemCode: r.systemCode,
    systemName: r.systemName,
    systemColor: r.systemColor,
    floorLabel: null,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt,
    uploaderName: r.uploaderName,
    viewUrl: `/api/contract-documents/${r.id}`,
  }));
}

// Phát sinh/VO (vo_documents) — giá trị thương mại nhạy cảm, cùng quyền trang /variations.
async function listVoDocuments(user: User): Promise<HubDocument[]> {
  if (!CAN.viewVariations(user.role)) return [];
  const rows = await query<{
    id: number;
    title: string;
    reason: VoReason;
    systemCode: string | null;
    systemName: string | null;
    systemColor: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string;
    uploaderName: string | null;
  }>(
    `SELECT vd.id, vo.title, vo.reason,
            disc.code AS "systemCode", disc.name AS "systemName",
            disc.color AS "systemColor",
            vd.mime_type AS "mimeType", vd.size_bytes AS "sizeBytes",
            vd.created_at AS "createdAt", u.name AS "uploaderName"
       FROM vo_documents vd
       JOIN variation_orders vo ON vo.id = vd.vo_id
       LEFT JOIN systems disc ON disc.id = vo.system_id
       LEFT JOIN users u ON u.id = vd.uploaded_by
      ORDER BY vd.id DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    source: "vo",
    title: r.title,
    category: VO_REASON_LABEL[r.reason],
    systemCode: r.systemCode,
    systemName: r.systemName,
    systemColor: r.systemColor,
    floorLabel: null,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt,
    uploaderName: r.uploaderName,
    viewUrl: `/api/vo-documents/${r.id}`,
  }));
}

// Bản vẽ (drawing_revisions) — mọi vai trò đăng nhập kể cả subcon (cần bản vẽ tại
// hiện trường, đúng quyền xem của M8). system_group là nhãn tự do (không FK cứng vào
// systems) nên không lọc chéo bảng — chỉ hiển thị đúng label người dùng đã nhập.
async function listDrawingDocuments(): Promise<HubDocument[]> {
  const rows = await query<{
    id: number;
    name: string;
    kind: DrawingKind;
    systemGroup: string | null;
    floorLabel: string | null;
    mimeType: string;
    sizeBytes: number | null;
    createdAt: string;
    uploaderName: string | null;
  }>(
    `SELECT r.id, d.name, d.kind, d.system_group AS "systemGroup", d.floor_label AS "floorLabel",
            r.mime_type AS "mimeType", r.size_bytes AS "sizeBytes",
            r.created_at AS "createdAt", u.name AS "uploaderName"
       FROM drawing_revisions r
       JOIN drawings d ON d.id = r.drawing_id
       LEFT JOIN users u ON u.id = r.uploaded_by
      ORDER BY r.id DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    source: "drawing",
    title: r.name,
    category: DRAWING_KIND_LABEL[r.kind],
    systemCode: null,
    systemName: r.systemGroup,
    systemColor: null,
    floorLabel: r.floorLabel,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt,
    uploaderName: r.uploaderName,
    viewUrl: `/api/drawings/revisions/${r.id}/file`,
  }));
}

// File tự do cấp dự án (project_documents, mới ở M20) — mọi vai trò đăng nhập xem được.
async function listProjectDocuments(): Promise<HubDocument[]> {
  const rows = await query<{
    id: number;
    title: string;
    category: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string;
    uploaderName: string | null;
  }>(
    `SELECT pd.id, pd.title, pd.category, pd.mime_type AS "mimeType",
            pd.size_bytes AS "sizeBytes", pd.created_at AS "createdAt", u.name AS "uploaderName"
       FROM project_documents pd LEFT JOIN users u ON u.id = pd.uploaded_by
      ORDER BY pd.id DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    source: "project",
    title: r.title,
    category: r.category,
    systemCode: null,
    systemName: null,
    systemColor: null,
    floorLabel: null,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt,
    uploaderName: r.uploaderName,
    viewUrl: `/api/project-documents/${r.id}`,
  }));
}

export type DocumentHubFilters = {
  system?: string;
  floor?: string;
  source?: DocumentSource;
  q?: string;
};

// Hợp nhất mọi nguồn (mỗi hàm nguồn tự lọc quyền của mình) rồi lọc hệ/tầng/nguồn/tìm
// kiếm trong bộ nhớ — dữ liệu 1 dự án xây dựng không đủ lớn để cần đẩy lọc xuống SQL
// cho từng nguồn khác cấu trúc, giữ đúng KISS.
export async function listAllDocuments(
  user: User,
  filters: DocumentHubFilters = {},
): Promise<HubDocument[]> {
  const results = await Promise.all([
    listTaskDocuments(user),
    listContractDocuments(user),
    listVoDocuments(user),
    listDrawingDocuments(),
    listProjectDocuments(),
  ]);
  let all = results.flat();

  if (filters.system) all = all.filter((d) => d.systemCode === filters.system);
  // Nguồn không có tầng (contract/vo/project) ẩn khi có lọc tầng cụ thể — rõ ràng hơn
  // là giả định chúng "luôn khớp mọi tầng".
  if (filters.floor) all = all.filter((d) => d.floorLabel === filters.floor);
  if (filters.source) all = all.filter((d) => d.source === filters.source);
  if (filters.q) {
    const needle = filters.q.trim().toLowerCase();
    all = all.filter((d) => d.title.toLowerCase().includes(needle));
  }

  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
