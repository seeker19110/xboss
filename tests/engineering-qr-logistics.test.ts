import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateMaterialQrCode,
  parseMaterialQrCode,
  reconcileShipmentReceiving,
  createMaterialShipment,
  listMaterialShipments,
  scanReceiveQrTag,
} from "@/lib/engineering-qr-logistics";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M78: QR Code Generator & Parser — Sinh mã và xác thực Checksum", () => {
  const qrString = generateMaterialQrCode({
    projectId: 1,
    itemCode: "VALVE-DN100",
    batchNo: "LOT-01",
    tagType: "material_unit",
    quantity: 5,
  });

  assert.ok(qrString.startsWith("XB-MAT|v1|P1|VALVE-DN100|BLOT-01|Tmaterial_unit|Q5|CHK"));

  // Parse hợp lệ
  const parsed = parseMaterialQrCode(qrString);
  assert.ok(parsed);
  assert.equal(parsed.projectId, 1);
  assert.equal(parsed.itemCode, "VALVE-DN100");
  assert.equal(parsed.batchNo, "LOT-01");
  assert.equal(parsed.quantity, 5);

  // Parse mã bị sửa đổi (Tampered)
  const tampered = qrString.replace("VALVE-DN100", "VALVE-DN200");
  const tamperedParsed = parseMaterialQrCode(tampered);
  assert.equal(tamperedParsed, null, "Mã bị can thiệp sai checksum phải bị từ chối");
});

test("M78: Receiving Reconciliation — Đối soát 3 bên giao nhận và lập GRN", () => {
  const manifest = [
    { itemCode: "PIPE-DN100", itemName: "Ống thép", orderedQty: 50, deliveredQty: 50, unit: "cây" },
    {
      itemCode: "VALVE-DN100",
      itemName: "Van cổng",
      orderedQty: 10,
      deliveredQty: 10,
      unit: "cái",
    },
  ];

  // 1. Giao đủ 100%
  const scannedFull = [
    { itemCode: "PIPE-DN100", quantity: 50 },
    { itemCode: "VALVE-DN100", quantity: 10 },
  ];
  const fullRes = reconcileShipmentReceiving(manifest, scannedFull);
  assert.equal(fullRes.isFullyReceived, true);
  assert.equal(fullRes.hasDiscrepancy, false);
  assert.ok(fullRes.grnNumber.startsWith("GRN-"));

  // 2. Giao thiếu van (chỉ quét được 8 van)
  const scannedShort = [
    { itemCode: "PIPE-DN100", quantity: 50 },
    { itemCode: "VALVE-DN100", quantity: 8 },
  ];
  const shortRes = reconcileShipmentReceiving(manifest, scannedShort);
  assert.equal(shortRes.isFullyReceived, false);
  assert.equal(shortRes.hasDiscrepancy, true);
  assert.equal(shortRes.missingItems.length, 1);
  assert.equal(shortRes.missingItems[0].itemCode, "VALVE-DN100");
  assert.equal(shortRes.missingItems[0].missingQty, 2);
});

test("M78: Vòng đời QR Logistics trong DB", { skip: !HAS_DB }, async () => {
  const projectId = 1;
  const userId = 1;

  // 1. Tạo Shipment
  const shipment = await createMaterialShipment({
    projectId,
    shipmentCode: "SHP-TEST-01",
    doNumber: "DO-1234",
    poNumber: "PO-5678",
    supplierName: "Nhà Cung Cấp Alpha",
    manifest: [
      { itemCode: "VALVE-DN100", itemName: "Van", orderedQty: 10, deliveredQty: 10, unit: "cái" },
    ],
    createdBy: userId,
  });

  assert.ok(shipment.id);

  // 2. Quét nhận vật tư bằng QR Code
  const qrCode = generateMaterialQrCode({
    projectId,
    itemCode: "VALVE-DN100",
    batchNo: "LOT-TEST",
    quantity: 10,
  });

  const scannedTag = await scanReceiveQrTag({
    projectId,
    qrCode,
    userId,
    locationNote: "Kho Hiện Trường A",
  });

  assert.ok(scannedTag.id);
  assert.equal(scannedTag.status, "scanned_on_site");
});
