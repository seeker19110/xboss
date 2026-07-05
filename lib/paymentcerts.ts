// M17 — Nghiệm thu khối lượng & thanh toán theo đợt (IPC): danh mục trạng thái,
// validate thuần, gợi ý KL từ tiến độ thực tế (trừ luỹ kế đợt trước), tổng hợp
// giá trị đợt (tạm ứng/giữ lại/đề nghị) và cảnh báo luỹ kế vượt giá trị hợp đồng.
// Xem docs/nang-cap/M17-thanh-toan-kl.md.
import { query, queryOne, run } from "@/lib/db";
import { boqExecutedQty } from "@/lib/boq";
import { nextSeqCode } from "@/lib/seqcode";
import { daysFromTodayISO } from "@/lib/date";

export const PAYMENT_CERT_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type PaymentCertStatus = (typeof PAYMENT_CERT_STATUSES)[number];
export const PAYMENT_CERT_STATUS_LABEL: Record<PaymentCertStatus, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  rejected: "Từ chối",
};

// Notification cert_pending: đợt 'submitted' quá N ngày chưa được quyết định.
export const CERT_PENDING_DAYS = 5;

export type CertLineInput = { boqItemId: number; qtyPeriod: number };

// Validate thuần (không chạm DB) — trả thông điệp lỗi tiếng Việt hoặc null.
export function validateCertItems(items: CertLineInput[]): string | null {
  if (!Array.isArray(items) || items.length === 0) return "Cần ít nhất 1 dòng khối lượng";
  const seen = new Set<number>();
  for (const [i, it] of items.entries()) {
    const n = i + 1;
    if (!Number.isInteger(it.boqItemId)) return `Dòng ${n}: thiếu dòng BOQ`;
    if (!Number.isFinite(it.qtyPeriod) || it.qtyPeriod < 0)
      return `Dòng ${n}: khối lượng đợt này phải ≥ 0`;
    if (seen.has(it.boqItemId)) return `Dòng ${n}: dòng BOQ trùng lặp trong cùng đợt`;
    seen.add(it.boqItemId);
  }
  return null;
}

export type CertItemRow = {
  id: number;
  boqItemId: number;
  boqCode: string;
  boqName: string;
  boqUnit: string;
  boqQtyContract: number;
  qtyPeriod: number;
  qtyCumulative: number;
  unitPrice: number;
};

export type PaymentCertRow = {
  id: number;
  code: string;
  contractId: number;
  contractCode: string;
  contractTitle: string;
  periodNo: number;
  periodLabel: string | null;
  status: PaymentCertStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  rejectReason: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  items: CertItemRow[];
};

async function fetchCerts(where: string, ...params: unknown[]): Promise<PaymentCertRow[]> {
  const rows = await query<PaymentCertRow>(
    `SELECT c.id, c.code, c.contract_id AS "contractId", ct.code AS "contractCode",
            ct.title AS "contractTitle", c.period_no AS "periodNo", c.period_label AS "periodLabel",
            c.status, c.submitted_at AS "submittedAt", c.decided_at AS "decidedAt",
            c.reject_reason AS "rejectReason",
            c.created_by AS "createdBy", u.name AS "createdByName", c.created_at AS "createdAt",
            COALESCE(
              json_agg(
                json_build_object(
                  'id', i.id, 'boqItemId', i.boq_item_id, 'boqCode', bi.code, 'boqName', bi.name,
                  'boqUnit', bi.unit, 'boqQtyContract', bi.qty_contract,
                  'qtyPeriod', i.qty_period, 'qtyCumulative', i.qty_cumulative,
                  'unitPrice', i.unit_price
                ) ORDER BY bi.code
              ) FILTER (WHERE i.id IS NOT NULL),
              '[]'
            ) AS items
       FROM payment_certs c
       JOIN contracts ct ON ct.id = c.contract_id
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN payment_cert_items i ON i.cert_id = c.id
       LEFT JOIN boq_items bi ON bi.id = i.boq_item_id
      ${where}
      GROUP BY c.id, ct.code, ct.title, u.name
      ORDER BY c.contract_id, c.period_no`,
    ...params,
  );
  return rows;
}

export async function listCertsByContract(contractId: number): Promise<PaymentCertRow[]> {
  return fetchCerts("WHERE c.contract_id = ?", contractId);
}

export async function getCert(id: number): Promise<PaymentCertRow | undefined> {
  return (await fetchCerts("WHERE c.id = ?", id))[0];
}

export async function nextPeriodNo(contractId: number): Promise<number> {
  const row = await queryOne<{ maxNo: number }>(
    `SELECT COALESCE(MAX(period_no), 0) AS "maxNo" FROM payment_certs WHERE contract_id = ?`,
    contractId,
  );
  return (row?.maxNo ?? 0) + 1;
}

export async function nextCertCode(): Promise<string> {
  return nextSeqCode("payment_certs", "code", "IPC-", 4);
}

// KL gợi ý cho đợt mới của 1 hợp đồng: với mỗi dòng BOQ thuộc contract_id, lấy KL
// thực hiện luỹ kế theo tiến độ (boqExecutedQty, M1) trừ qty_cumulative của đợt
// 'approved' gần nhất cùng dòng (đợt draft/rejected không tính) — không âm.
export async function suggestQtyForContract(
  contractId: number,
): Promise<
  {
    boqItemId: number;
    code: string;
    name: string;
    unit: string;
    unitPrice: number;
    qtySuggested: number;
  }[]
> {
  const items = await query<{
    id: number;
    code: string;
    name: string;
    unit: string;
    unitPrice: number;
  }>(
    `SELECT id, code, name, unit, unit_price AS "unitPrice" FROM boq_items WHERE contract_id = ? ORDER BY code`,
    contractId,
  );

  const lastCumulative = await query<{ boqItemId: number; qtyCumulative: number }>(
    `SELECT DISTINCT ON (i.boq_item_id) i.boq_item_id AS "boqItemId", i.qty_cumulative AS "qtyCumulative"
       FROM payment_cert_items i
       JOIN payment_certs c ON c.id = i.cert_id
      WHERE c.contract_id = ? AND c.status = 'approved'
      ORDER BY i.boq_item_id, c.period_no DESC`,
    contractId,
  );
  const cumMap = new Map(lastCumulative.map((r) => [r.boqItemId, Number(r.qtyCumulative)]));

  const result = [];
  for (const it of items) {
    const executed = await boqExecutedQty(it.id);
    const already = cumMap.get(it.id) ?? 0;
    result.push({
      boqItemId: it.id,
      code: it.code,
      name: it.name,
      unit: it.unit,
      unitPrice: Number(it.unitPrice),
      qtySuggested: Math.max(0, executed - already),
    });
  }
  return result;
}

// Chặn nhầm hợp đồng: mọi boqItemId gửi lên phải có contract_id = contractId của cert.
// Trả thông điệp lỗi dòng đầu tiên sai, hoặc null nếu tất cả đều đúng.
export async function checkCertLinesBelongToContract(
  contractId: number,
  boqItemIds: number[],
): Promise<string | null> {
  if (boqItemIds.length === 0) return null;
  const rows = await query<{ id: number }>(
    `SELECT id FROM boq_items WHERE id = ANY(?) AND contract_id = ?`,
    boqItemIds,
    contractId,
  );
  const ok = new Set(rows.map((r) => r.id));
  const bad = boqItemIds.find((id) => !ok.has(id));
  return bad != null ? `Dòng BOQ #${bad} không thuộc hợp đồng này` : null;
}

// Xoá dòng cũ + ghi lại toàn bộ dòng KL của đợt (dùng cho tạo mới và PATCH khi
// draft) — snapshot lại unit_price từ boq_items hiện tại + tự tính qty_cumulative
// = luỹ kế đợt 'approved' gần nhất cùng dòng (chưa tính đợt draft/rejected khác) + qty_period.
export async function saveCertItems(
  certId: number,
  contractId: number,
  lines: CertLineInput[],
): Promise<void> {
  const lastCumulative = await query<{ boqItemId: number; qtyCumulative: number }>(
    `SELECT DISTINCT ON (i.boq_item_id) i.boq_item_id AS "boqItemId", i.qty_cumulative AS "qtyCumulative"
       FROM payment_cert_items i
       JOIN payment_certs c ON c.id = i.cert_id
      WHERE c.contract_id = ? AND c.status = 'approved' AND c.id <> ?
      ORDER BY i.boq_item_id, c.period_no DESC`,
    contractId,
    certId,
  );
  const cumMap = new Map(lastCumulative.map((r) => [r.boqItemId, Number(r.qtyCumulative)]));

  const boqItems = await query<{ id: number; unitPrice: number }>(
    `SELECT id, unit_price AS "unitPrice" FROM boq_items WHERE id = ANY(?)`,
    lines.map((l) => l.boqItemId),
  );
  const priceMap = new Map(boqItems.map((b) => [b.id, Number(b.unitPrice)]));

  await run(`DELETE FROM payment_cert_items WHERE cert_id = ?`, certId);
  for (const line of lines) {
    const already = cumMap.get(line.boqItemId) ?? 0;
    await run(
      `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
       VALUES (?, ?, ?, ?, ?)`,
      certId,
      line.boqItemId,
      line.qtyPeriod,
      already + line.qtyPeriod,
      priceMap.get(line.boqItemId) ?? 0,
    );
  }
}

export type CertTotals = {
  periodValue: number;
  cumulativeValue: number;
  advanceDeduct: number;
  retentionDeduct: number;
  approvedValue: number;
};

// Giá trị đợt: periodValue = Σ qty_period×unit_price; cumulativeValue tương tự
// với qty_cumulative; trừ tạm ứng/giữ lại theo % của hợp đồng → giá trị đề nghị.
export async function certTotals(certId: number): Promise<CertTotals> {
  const cert = await queryOne<{ contractId: number }>(
    `SELECT contract_id AS "contractId" FROM payment_certs WHERE id = ?`,
    certId,
  );
  if (!cert)
    return {
      periodValue: 0,
      cumulativeValue: 0,
      advanceDeduct: 0,
      retentionDeduct: 0,
      approvedValue: 0,
    };

  const contract = await queryOne<{ advancePct: number; retentionPct: number }>(
    `SELECT advance_pct AS "advancePct", retention_pct AS "retentionPct" FROM contracts WHERE id = ?`,
    cert.contractId,
  );
  const items = await query<{ qtyPeriod: number; qtyCumulative: number; unitPrice: number }>(
    `SELECT qty_period AS "qtyPeriod", qty_cumulative AS "qtyCumulative", unit_price AS "unitPrice"
       FROM payment_cert_items WHERE cert_id = ?`,
    certId,
  );

  const periodValue = items.reduce((s, i) => s + Number(i.qtyPeriod) * Number(i.unitPrice), 0);
  const cumulativeValue = items.reduce(
    (s, i) => s + Number(i.qtyCumulative) * Number(i.unitPrice),
    0,
  );
  const advanceDeduct = (periodValue * (contract?.advancePct ?? 0)) / 100;
  const retentionDeduct = (periodValue * (contract?.retentionPct ?? 0)) / 100;
  const approvedValue = periodValue - advanceDeduct - retentionDeduct;

  return { periodValue, cumulativeValue, advanceDeduct, retentionDeduct, approvedValue };
}

// Giá trị luỹ kế đã nghiệm thu của 1 hợp đồng = Σ cumulativeValue của đợt
// 'approved' mới nhất mỗi dòng BOQ — so với giá trị HĐ (gồm phụ lục) để tính %.
export async function contractCumulativeValue(contractId: number): Promise<number> {
  const rows = await query<{ value: number }>(
    `SELECT DISTINCT ON (i.boq_item_id) i.qty_cumulative * i.unit_price AS value
       FROM payment_cert_items i
       JOIN payment_certs c ON c.id = i.cert_id
      WHERE c.contract_id = ? AND c.status = 'approved'
      ORDER BY i.boq_item_id, c.period_no DESC`,
    contractId,
  );
  return rows.reduce((s, r) => s + Number(r.value), 0);
}

export type OverContractCert = {
  contractId: number;
  contractCode: string;
  contractTitle: string;
  cumulativeValue: number;
  contractValue: number;
};

// HĐ có đợt đã duyệt mà luỹ kế nghiệm thu vượt giá trị HĐ (gồm phụ lục) — nguồn
// notification cert_over_contract (dedup theo contract_id, cùng cơ chế cost_over).
export async function overContractCerts(): Promise<OverContractCert[]> {
  const contracts = await query<{
    id: number;
    code: string;
    title: string;
    value: number;
    addendaTotal: number;
  }>(
    `SELECT c.id, c.code, c.title, c.value,
            COALESCE((SELECT SUM(value_delta) FROM contract_addenda WHERE contract_id = c.id), 0) AS "addendaTotal"
       FROM contracts c
      WHERE EXISTS (SELECT 1 FROM payment_certs pc WHERE pc.contract_id = c.id AND pc.status = 'approved')`,
  );

  const result: OverContractCert[] = [];
  for (const c of contracts) {
    const cumulativeValue = await contractCumulativeValue(c.id);
    const contractValue = Number(c.value) + Number(c.addendaTotal);
    if (cumulativeValue > contractValue)
      result.push({
        contractId: c.id,
        contractCode: c.code,
        contractTitle: c.title,
        cumulativeValue,
        contractValue,
      });
  }
  return result;
}

// Đợt 'submitted' quá CERT_PENDING_DAYS ngày chưa được quyết định → nhắc Admin/PM.
export async function pendingCerts(
  days = CERT_PENDING_DAYS,
): Promise<{ id: number; code: string; contractCode: string; submittedAt: string }[]> {
  const limit = daysFromTodayISO(-days);
  return query(
    `SELECT c.id, c.code, ct.code AS "contractCode", c.submitted_at AS "submittedAt"
       FROM payment_certs c
       JOIN contracts ct ON ct.id = c.contract_id
      WHERE c.status = 'submitted' AND c.submitted_at IS NOT NULL AND c.submitted_at <= ?
      ORDER BY c.submitted_at`,
    limit,
  );
}
