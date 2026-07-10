import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateEvaluationInput: đủ ca hợp lệ/không hợp lệ", async () => {
  const { validateEvaluationInput } = await import("@/lib/subcontractors");

  assert.equal(
    validateEvaluationInput({
      period: "2026-Q3",
      safetyScore: 4,
      qualityScore: 5,
      scheduleScore: 3,
      manpowerScore: null,
      note: null,
    }),
    null,
  );
  assert.equal(
    validateEvaluationInput({
      period: "2026-07",
      safetyScore: 5,
      qualityScore: null,
      scheduleScore: null,
      manpowerScore: null,
      note: null,
    }),
    null,
  );
  assert.match(
    validateEvaluationInput({
      period: "",
      safetyScore: 4,
      qualityScore: null,
      scheduleScore: null,
      manpowerScore: null,
      note: null,
    })!,
    /kỳ đánh giá/i,
  );
  assert.match(
    validateEvaluationInput({
      period: "07-2026",
      safetyScore: 4,
      qualityScore: null,
      scheduleScore: null,
      manpowerScore: null,
      note: null,
    })!,
    /kỳ đánh giá/i,
  );
  assert.match(
    validateEvaluationInput({
      period: "2026-Q3",
      safetyScore: 6,
      qualityScore: null,
      scheduleScore: null,
      manpowerScore: null,
      note: null,
    })!,
    /an toàn/i,
  );
  assert.match(
    validateEvaluationInput({
      period: "2026-Q3",
      safetyScore: 0,
      qualityScore: null,
      scheduleScore: null,
      manpowerScore: null,
      note: null,
    })!,
    /an toàn/i,
  );
  assert.match(
    validateEvaluationInput({
      period: "2026-Q3",
      safetyScore: null,
      qualityScore: null,
      scheduleScore: null,
      manpowerScore: null,
      note: null,
    })!,
    /ít nhất 1 tiêu chí/i,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "listSubcontractors: gộp đúng discipline_contractors + subcontractor_profiles (kể cả supplier chưa có profile)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { listSubcontractors, upsertSubcontractorProfile } = await import("@/lib/subcontractors");

    const dien = await queryOne<{ id: number }>(`SELECT id FROM disciplines WHERE code = 'dien'`);
    assert.ok(dien, "disciplines seed phải có sẵn từ migration 0005_boq.sql");

    const withProfileId = await insertId(
      `INSERT INTO suppliers (name) VALUES ('NTP có hồ sơ Test')`,
    );
    const noProfileId = await insertId(
      `INSERT INTO suppliers (name) VALUES ('NTP chưa hồ sơ Test')`,
    );
    const materialVendorId = await insertId(
      `INSERT INTO suppliers (name) VALUES ('NCC vật tư Test')`,
    );

    await insertId(
      `INSERT INTO discipline_contractors (discipline_id, supplier_id, zone, floor_labels, is_primary)
       VALUES (?, ?, 'Zone 1', ARRAY['T1'], true)`,
      dien!.id,
      withProfileId,
    );
    await insertId(
      `INSERT INTO discipline_contractors (discipline_id, supplier_id, zone, is_primary)
       VALUES (?, ?, 'Zone 2', false)`,
      dien!.id,
      noProfileId,
    );

    await upsertSubcontractorProfile(withProfileId, {
      projectId: null,
      orgChartNote: "Sơ đồ test",
      siteRepName: "Nguyễn Văn A",
      siteRepPhone: "0900000000",
      capabilitySummary: "20 thợ điện",
    });

    const list = await listSubcontractors();
    const ids = list.map((s) => s.id);
    assert.ok(ids.includes(withProfileId));
    assert.ok(ids.includes(noProfileId));
    // NCC vật tư thường (không có discipline_contractors) không xuất hiện.
    assert.ok(!ids.includes(materialVendorId));

    const withProfile = list.find((s) => s.id === withProfileId)!;
    assert.equal(withProfile.siteRepName, "Nguyễn Văn A");
    assert.equal(withProfile.disciplines.length, 1);
    assert.equal(withProfile.disciplines[0].zone, "Zone 1");

    const noProfile = list.find((s) => s.id === noProfileId)!;
    assert.equal(noProfile.orgChartNote, null);
    assert.equal(noProfile.siteRepName, null);
    assert.equal(noProfile.disciplines[0].zone, "Zone 2");

    await run(
      `DELETE FROM discipline_contractors WHERE supplier_id IN (?, ?)`,
      withProfileId,
      noProfileId,
    );
    await run(`DELETE FROM subcontractor_profiles WHERE supplier_id = ?`, withProfileId);
    await run(
      `DELETE FROM suppliers WHERE id IN (?, ?, ?)`,
      withProfileId,
      noProfileId,
      materialVendorId,
    );
  },
);

test(
  "getSubcontractor: tính công nợ đúng khớp contracts/payment_bills, UNIQUE(supplier_id, period) chặn trùng kỳ",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { getSubcontractor } = await import("@/lib/subcontractors");

    const supplierId = await insertId(`INSERT INTO suppliers (name) VALUES ('NTP Công Nợ Test')`);
    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, party_supplier_id, value, status)
       VALUES ('HD-NTP-TEST', 'giao_thau', 'HĐ giao thầu test', ?, 1000000, 'active')`,
      supplierId,
    );
    await insertId(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, contract_id)
       VALUES ('NTP Công Nợ Test', 'bill', 300000, '2026-07-01', ?)`,
      contractId,
    );

    const detail = await getSubcontractor(supplierId);
    assert.ok(detail);
    assert.equal(detail!.debt.contractValue, 1000000);
    assert.equal(detail!.debt.paid, 300000);
    assert.equal(detail!.debt.outstanding, 700000);
    assert.equal(detail!.debt.contracts.length, 1);
    assert.equal(detail!.debt.contracts[0].code, "HD-NTP-TEST");

    // UNIQUE(supplier_id, period) — chèn trùng kỳ phải lỗi.
    await insertId(
      `INSERT INTO subcon_evaluations (supplier_id, period, safety_score) VALUES (?, '2026-Q3', 5)`,
      supplierId,
    );
    await assert.rejects(
      insertId(
        `INSERT INTO subcon_evaluations (supplier_id, period, quality_score) VALUES (?, '2026-Q3', 4)`,
        supplierId,
      ),
    );

    const detail2 = await getSubcontractor(supplierId);
    assert.equal(detail2!.evaluations.length, 1);
    assert.equal(detail2!.evaluationAverage.latestPeriod, "2026-Q3");
    assert.equal(detail2!.evaluationAverage.avgScore, 5);

    await run(`DELETE FROM payment_bills WHERE contract_id = ?`, contractId);
    await run(`DELETE FROM subcon_evaluations WHERE supplier_id = ?`, supplierId);
    await run(`DELETE FROM contracts WHERE id = ?`, contractId);
    await run(`DELETE FROM suppliers WHERE id = ?`, supplierId);
  },
);

test(
  "canViewSubcontractor: subcon chỉ xem đúng NTP của mình (users.supplier_id)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { canViewSubcontractor } = await import("@/lib/auth");

    const supplierAId = await insertId(`INSERT INTO suppliers (name) VALUES ('NTP A Test')`);
    const supplierBId = await insertId(`INSERT INTO suppliers (name) VALUES ('NTP B Test')`);
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role, supplier_id)
       VALUES ('Subcon Test', 'subcontest@test.local', 'x', 'subcon', ?)`,
      supplierAId,
    );
    const user = {
      id: userId,
      name: "Subcon Test",
      email: "subcontest@test.local",
      role: "subcon" as const,
    };

    assert.equal(await canViewSubcontractor(user, supplierAId), true);
    assert.equal(await canViewSubcontractor(user, supplierBId), false);

    // Vai trò khác không bị giới hạn.
    const pmUser = { ...user, role: "pm" as const };
    assert.equal(await canViewSubcontractor(pmUser, supplierBId), true);

    await run(`DELETE FROM users WHERE id = ?`, userId);
    await run(`DELETE FROM suppliers WHERE id IN (?, ?)`, supplierAId, supplierBId);
  },
);
