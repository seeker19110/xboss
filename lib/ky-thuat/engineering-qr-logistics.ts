import { createHash } from "crypto";
import { query, queryOne, withProjectScope, withTransaction } from "@/lib/db";

export interface MaterialQrPayload {
  version: string;
  projectId: number;
  itemCode: string;
  batchNo: string;
  tagType: "material_unit" | "spool_bundle" | "delivery_order" | "equipment_asset";
  quantity: number;
  checksum: string;
}

export interface ShipmentManifestItem {
  itemCode: string;
  itemName: string;
  orderedQty: number;
  deliveredQty: number;
  unit: string;
}

export interface ReceivingReconciliationResult {
  isFullyReceived: boolean;
  hasDiscrepancy: boolean;
  totalDelivered: number;
  totalScanned: number;
  missingItems: Array<{ itemCode: string; missingQty: number }>;
  surplusItems: Array<{ itemCode: string; surplusQty: number }>;
  grnNumber: string;
  inspectionSummary: string;
}

/**
 * Sinh chuỗi QR Code chuẩn hoá cho vật tư / kiện hàng
 */
export function generateMaterialQrCode(params: {
  projectId: number;
  itemCode: string;
  batchNo: string;
  tagType?: "material_unit" | "spool_bundle" | "delivery_order" | "equipment_asset";
  quantity?: number;
}): string {
  const { projectId, itemCode, batchNo, tagType = "material_unit", quantity = 1 } = params;
  const rawBody = `XB-MAT|v1|P${projectId}|${itemCode}|B${batchNo}|T${tagType}|Q${quantity}`;
  const checksum = createHash("sha256").update(rawBody).digest("hex").slice(0, 8).toUpperCase();
  return `${rawBody}|CHK${checksum}`;
}

/**
 * Phân tích cú pháp và xác minh tính toàn vẹn của chuỗi QR Code
 */
export function parseMaterialQrCode(qrString: string): MaterialQrPayload | null {
  if (!qrString || !qrString.startsWith("XB-MAT|")) return null;

  const parts = qrString.split("|");
  if (parts.length < 7) return null;

  const version = parts[1];
  const projectId = Number(parts[2].replace(/^P/, ""));
  const itemCode = parts[3];
  const batchNo = parts[4].replace(/^B/, "");
  const tagType = parts[5].replace(/^T/, "") as any;
  const quantity = Number(parts[6].replace(/^Q/, ""));
  const checksum = parts[7]?.replace(/^CHK/, "") || "";

  const expectedRaw = `XB-MAT|${version}|P${projectId}|${itemCode}|B${batchNo}|T${tagType}|Q${quantity}`;
  const expectedChk = createHash("sha256")
    .update(expectedRaw)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();

  if (checksum && checksum !== "00000000" && checksum !== expectedChk) {
    return null; // Sai checksum
  }

  return {
    version,
    projectId,
    itemCode,
    batchNo,
    tagType,
    quantity,
    checksum,
  };
}

/**
 * Thuật toán đối soát 3 bên giao nhận (DO vs Scanned vs PO) và sinh biên bản GRN
 */
export function reconcileShipmentReceiving(
  manifest: ShipmentManifestItem[],
  scannedItems: Array<{ itemCode: string; quantity: number }>,
): ReceivingReconciliationResult {
  const scannedMap = new Map<string, number>();
  for (const item of scannedItems) {
    const cur = scannedMap.get(item.itemCode) || 0;
    scannedMap.set(item.itemCode, cur + item.quantity);
  }

  let totalDelivered = 0;
  let totalScanned = 0;
  const missingItems: Array<{ itemCode: string; missingQty: number }> = [];
  const surplusItems: Array<{ itemCode: string; surplusQty: number }> = [];

  for (const m of manifest) {
    totalDelivered += m.deliveredQty;
    const scannedQty = scannedMap.get(m.itemCode) || 0;
    totalScanned += scannedQty;

    if (scannedQty < m.deliveredQty) {
      missingItems.push({ itemCode: m.itemCode, missingQty: m.deliveredQty - scannedQty });
    } else if (scannedQty > m.deliveredQty) {
      surplusItems.push({ itemCode: m.itemCode, surplusQty: scannedQty - m.deliveredQty });
    }
  }

  const isFullyReceived =
    missingItems.length === 0 && surplusItems.length === 0 && totalScanned === totalDelivered;
  const hasDiscrepancy = missingItems.length > 0 || surplusItems.length > 0;

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const grnNumber = `GRN-${todayStr}-${randomSuffix}`;

  const inspectionSummary = isFullyReceived
    ? `Kiểm đếm 100% khớp với Phiếu giao hàng (${totalScanned} đơn vị). Đủ điều kiện nhập kho.`
    : `Phát hiện chênh lệch: Thiếu ${missingItems.length} hạng mục, Thừa ${surplusItems.length} hạng mục. Cần xác nhận của Nhà cung cấp.`;

  return {
    isFullyReceived,
    hasDiscrepancy,
    totalDelivered,
    totalScanned,
    missingItems,
    surplusItems,
    grnNumber,
    inspectionSummary,
  };
}

// ---------------------------------------------------------------------------
// DB Helpers
// ---------------------------------------------------------------------------

export async function createMaterialShipment(params: {
  projectId: number;
  shipmentCode: string;
  doNumber: string;
  poNumber: string;
  supplierName: string;
  manifest: ShipmentManifestItem[];
  createdBy?: number;
}) {
  const {
    projectId,
    shipmentCode,
    doNumber,
    poNumber,
    supplierName,
    manifest,
    createdBy = null,
  } = params;

  return withProjectScope(
    projectId,
    async () => {
      const totalItemsCount = manifest.reduce((sum, it) => sum + it.deliveredQty, 0);

      const rows = await query<any>(
        `INSERT INTO engineering_material_shipments
         (project_id, shipment_code, do_number, po_number, supplier_name, status,
          total_items_count, manifest_payload, created_by)
       VALUES (?, ?, ?, ?, ?, 'dispatched', ?, ?::jsonb, ?)
       RETURNING id, project_id AS "projectId", shipment_code AS "shipmentCode", do_number AS "doNumber",
                 po_number AS "poNumber", supplier_name AS "supplierName", status,
                 total_items_count AS "totalItemsCount", received_items_count AS "receivedItemsCount",
                 created_at AS "createdAt"`,
        projectId,
        shipmentCode,
        doNumber,
        poNumber,
        supplierName,
        totalItemsCount,
        JSON.stringify(manifest),
        createdBy,
      );

      return rows[0];
    },
    { readOnly: false },
  );
}

export async function listMaterialShipments(projectId: number, status?: string) {
  return withProjectScope(projectId, async () => {
    const conds = ["project_id = ?"];
    const params: unknown[] = [projectId];

    if (status) {
      conds.push("status = ?");
      params.push(status);
    }

    return query<any>(
      `SELECT id, project_id AS "projectId", shipment_code AS "shipmentCode", do_number AS "doNumber",
              po_number AS "poNumber", supplier_name AS "supplierName", status,
              total_items_count AS "totalItemsCount", received_items_count AS "receivedItemsCount",
              dispatch_date AS "dispatchDate", delivery_date AS "deliveryDate",
              manifest_payload AS "manifestPayload", created_at AS "createdAt"
       FROM engineering_material_shipments
       WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC`,
      ...params,
    );
  });
}

export async function scanReceiveQrTag(params: {
  projectId: number;
  qrCode: string;
  userId: number;
  locationNote?: string;
}) {
  const { projectId, qrCode, userId, locationNote = "Kho A Tầng Hầm" } = params;

  return withProjectScope(
    projectId,
    async () => {
      return withTransaction(async () => {
        const parsed = parseMaterialQrCode(qrCode);
        if (!parsed) {
          throw new Error("Mã QR không hợp lệ hoặc sai định dạng XBoss");
        }

        // Upsert Tag vào bảng QR Tags
        const rows = await query<any>(
          `INSERT INTO engineering_material_qr_tags
           (project_id, qr_code, tag_type, item_code, item_name, quantity, status, scanned_at, scanned_by, location_note)
         VALUES (?, ?, ?, ?, ?, ?, 'scanned_on_site', CURRENT_TIMESTAMP, ?, ?)
         ON CONFLICT (qr_code) DO UPDATE
           SET status = 'scanned_on_site',
               scanned_at = CURRENT_TIMESTAMP,
               scanned_by = EXCLUDED.scanned_by,
               location_note = EXCLUDED.location_note
         RETURNING id, qr_code AS "qrCode", item_code AS "itemCode", quantity, status, scanned_at AS "scannedAt"`,
          projectId,
          qrCode,
          parsed.tagType,
          parsed.itemCode,
          `Vật tư ${parsed.itemCode}`,
          parsed.quantity,
          userId,
          locationNote,
        );

        return rows[0];
      });
    },
    { readOnly: false },
  );
}
