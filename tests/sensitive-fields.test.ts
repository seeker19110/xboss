import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load (qua lib/auth)
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripSensitive } from "@/lib/sensitive-fields";
import { _resetPermissionCacheForTests } from "@/lib/permissions";
import type { Role } from "@/lib/roles";

// ===== M50 PR2 — Quyền theo trường (che trường tiền/đơn giá/tỷ lệ) =====
// Thuần logic (không chạm DB): kiểm stripSensitive che ĐÚNG trường theo perm mặc định
// (viewPayments/viewPayroll), giữ nguyên trường khác, không đụng bản gốc, mảng rỗng.
// Reset cache override PR1 về cold start → CAN dùng MẶC ĐỊNH (đọc override là fire-and-
// forget, không resolve trong 1 test đồng bộ → snapshot rỗng → mặc định).

const u = (role: Role) => ({ role });

test("stripSensitive[payroll]: bch bị che số tiền, admin/pm nguyên vẹn", () => {
  _resetPermissionCacheForTests();
  const rows = [
    {
      id: 1,
      period: "2026-07",
      personnelName: "Nguyễn A",
      workdays: 26,
      rate: 300000,
      gross: 7800000,
      deductions: 200000,
      net: 7600000,
      status: "draft",
    },
  ];

  // bch: có viewPayments (vào được trang) NHƯNG không viewPayroll → che số tiền.
  const forBch = stripSensitive("payroll", rows, u("bch"));
  assert.equal(forBch[0].rate, null);
  assert.equal(forBch[0].gross, null);
  assert.equal(forBch[0].deductions, null);
  assert.equal(forBch[0].net, null);
  // Trường KHÔNG tiền giữ nguyên.
  assert.equal(forBch[0].workdays, 26);
  assert.equal(forBch[0].personnelName, "Nguyễn A");
  assert.equal(forBch[0].period, "2026-07");

  // admin/pm: viewPayroll mặc định true → nguyên vẹn.
  for (const role of ["admin", "pm"] as const) {
    const out = stripSensitive("payroll", rows, u(role));
    assert.equal(out[0].rate, 300000);
    assert.equal(out[0].net, 7600000);
  }
});

test("stripSensitive: KHÔNG đụng bản ghi gốc (hàm thuần)", () => {
  _resetPermissionCacheForTests();
  const rows = [{ id: 1, rate: 300000, gross: 7800000, deductions: 0, net: 7800000, workdays: 26 }];
  const out = stripSensitive("payroll", rows, u("bch"));
  assert.equal(rows[0].rate, 300000, "bản gốc không được đổi");
  assert.equal(rows[0].gross, 7800000);
  assert.notEqual(out, rows, "trả mảng mới khi có che");
  assert.equal(out[0].rate, null);
});

test("stripSensitive[variation]: engineer che tổng + đơn giá dòng con lồng", () => {
  _resetPermissionCacheForTests();
  const rows = [
    {
      id: 1,
      code: "VO-0001",
      title: "Phát sinh X",
      proposedValue: 5000000,
      approvedValue: 3000000,
      lines: [
        { id: 10, code: "A1", name: "Ống", qtyProposed: 5, qtyApproved: 3, unitPrice: 1000000 },
        { id: 11, code: "A2", name: "Van", qtyProposed: 2, qtyApproved: 2, unitPrice: 500000 },
      ],
    },
  ];

  // engineer: viewVariations nhưng KHÔNG viewPayments → che.
  const eng = stripSensitive("variation", rows, u("engineer"));
  assert.equal(eng[0].proposedValue, null);
  assert.equal(eng[0].approvedValue, null);
  assert.equal(eng[0].lines[0].unitPrice, null);
  assert.equal(eng[0].lines[1].unitPrice, null);
  // Trường không tiền của dòng con giữ nguyên.
  assert.equal(eng[0].lines[0].qtyProposed, 5);
  assert.equal(eng[0].lines[0].code, "A1");
  assert.equal(eng[0].title, "Phát sinh X");
  assert.equal(eng[0].code, "VO-0001");
  // Bản gốc không đổi.
  assert.equal(rows[0].proposedValue, 5000000);
  assert.equal(rows[0].lines[0].unitPrice, 1000000);

  // admin: nguyên vẹn.
  const adm = stripSensitive("variation", rows, u("admin"));
  assert.equal(adm[0].proposedValue, 5000000);
  assert.equal(adm[0].lines[0].unitPrice, 1000000);
});

test("stripSensitive[contract]: engineer che, bch (viewPayments) nguyên vẹn", () => {
  _resetPermissionCacheForTests();
  const rows = [
    {
      id: 1,
      code: "HD-01",
      title: "HĐ",
      value: 9000000,
      advancePct: 10,
      retentionPct: 5,
      addendaTotal: 1000000,
      paid: 2000000,
      poCommitted: 500000,
    },
  ];
  const eng = stripSensitive("contract", rows, u("engineer"));
  assert.equal(eng[0].value, null);
  assert.equal(eng[0].advancePct, null);
  assert.equal(eng[0].retentionPct, null);
  assert.equal(eng[0].addendaTotal, null);
  assert.equal(eng[0].paid, null);
  assert.equal(eng[0].poCommitted, null);
  assert.equal(eng[0].title, "HĐ");

  // bch có viewPayments → contract KHÔNG che (khác payroll).
  const bch = stripSensitive("contract", rows, u("bch"));
  assert.equal(bch[0].value, 9000000);
  assert.equal(bch[0].advancePct, 10);
});

test("stripSensitive[paymentCert + certTotals]: che đúng theo viewPayments", () => {
  _resetPermissionCacheForTests();
  const certs = [
    {
      id: 1,
      code: "IPC-0001",
      items: [{ id: 5, boqCode: "A1", qtyPeriod: 3, unitPrice: 1000000 }],
    },
  ];
  const eng = stripSensitive("paymentCert", certs, u("engineer"));
  assert.equal(eng[0].items[0].unitPrice, null);
  assert.equal(eng[0].items[0].qtyPeriod, 3);

  const totals = [
    {
      periodValue: 3000000,
      cumulativeValue: 9000000,
      advanceDeduct: 300000,
      retentionDeduct: 150000,
      approvedValue: 2550000,
    },
  ];
  const engT = stripSensitive("certTotals", totals, u("engineer"));
  assert.equal(engT[0].periodValue, null);
  assert.equal(engT[0].approvedValue, null);

  // admin nguyên vẹn.
  const admT = stripSensitive("certTotals", totals, u("admin"));
  assert.equal(admT[0].periodValue, 3000000);
});

test("stripSensitive: mảng rỗng + entity lạ → trả nguyên", () => {
  _resetPermissionCacheForTests();
  const empty: unknown[] = [];
  assert.equal(stripSensitive("payroll", empty, u("bch")), empty);
  const rows = [{ id: 1, rate: 1 }];
  // Entity không khai báo → không đụng.
  assert.equal(stripSensitive("khong_ton_tai", rows, u("bch")), rows);
});
