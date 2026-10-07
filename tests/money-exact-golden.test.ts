import { HAS_TEST_DB } from "./setup"; // đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { query, queryOne } from "@/lib/db";
import {
  addMoney,
  fitsNumeric,
  ipcSumV1,
  isCanonicalDecimal,
  moneyToDecimal,
  mulRatio,
  parseFixedDecimalExact,
  parseMoneyExact,
  sumMoneyProductsExact,
  type IpcLineV1,
} from "@/lib/nen/money";

// QUALITY-FINAL-1 / S09 — golden + property test cho đường tiền exact (A3-AC01..AC04, phần
// utility của A3-AC06/Q-AC06). Oracle viết lại bằng số học bigint thuần (thương/dư), KHÔNG dùng
// float để kiểm bigint; parity đối chiếu PostgreSQL `numeric` thật khi có TEST_DATABASE_URL.
// Không đổi caller (S10): file này chỉ chứng minh hợp đồng của lib/nen/money.ts.

const P = { skip: !HAS_TEST_DB };

// ===== PRNG có seed cố định (LCG 64-bit trên bigint) — không Math.random, lặp lại được =====

const MASK64 = (1n << 64n) - 1n;
function taoPrng(seed: bigint) {
  let s = seed & MASK64;
  /** Số nguyên ngẫu nhiên trong [0, n). */
  const next = (n: bigint): bigint => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & MASK64;
    return (s >> 16n) % n;
  };
  /** Chuỗi `digits` chữ số thập phân ngẫu nhiên (có thể có số 0 đầu). */
  const chuSo = (digits: number): string =>
    Array.from({ length: digits }, () => next(10n).toString()).join("");
  /** Phần nguyên canonical (không số 0 thừa ở đầu) dài tối đa `maxDigits`. */
  const phanNguyen = (maxDigits: number): string => {
    const len = Number(next(BigInt(maxDigits + 1)));
    return len === 0 ? "0" : (BigInt(chuSo(len)) || 0n).toString();
  };
  /** bigint có dấu với tối đa `maxDigits` chữ số. */
  const soNguyen = (maxDigits: number): bigint => {
    const v = BigInt(phanNguyen(maxDigits));
    return next(2n) === 0n ? -v : v;
  };
  /** Chuỗi thập phân có dấu, phần lẻ dài đúng `scale` chữ số. */
  const thapPhan = (maxIntDigits: number, scale: number): string => {
    const sign = next(2n) === 0n ? "-" : "";
    const whole = phanNguyen(maxIntDigits);
    const frac = scale > 0 ? chuSo(scale) : "";
    // Số 0 chỉ có một dạng canonical: không sinh "-0.000".
    const zero = whole === "0" && /^0*$/.test(frac);
    return `${zero ? "" : sign}${whole}${scale > 0 ? `.${frac}` : ""}`;
  };
  return { next, soNguyen, thapPhan };
}

/** Oracle độc lập: chuỗi thập phân → minor scale 2, ties-away-from-zero bằng thương/dư. */
function oracleQuantize(decimal: string): bigint {
  const negative = decimal.startsWith("-");
  const [whole, frac = ""] = (negative ? decimal.slice(1) : decimal).split(".");
  const unscaled = BigInt(`${whole}${frac}`);
  let minor: bigint;
  if (frac.length <= 2) {
    minor = unscaled * 10n ** BigInt(2 - frac.length);
  } else {
    const d = 10n ** BigInt(frac.length - 2);
    minor = unscaled / d + (2n * (unscaled % d) >= d ? 1n : 0n);
  }
  return negative ? -minor : minor;
}

/** Oracle độc lập cho mulRatio: |a·n| chia |d| bằng thương/dư, rồi áp dấu. */
function oracleMulRatio(a: bigint, n: bigint, d: bigint): bigint {
  const p = a * n;
  const negative = p < 0n !== d < 0n && p !== 0n;
  const pa = p < 0n ? -p : p;
  const da = d < 0n ? -d : d;
  const q = pa / da + (2n * (pa % da) >= da ? 1n : 0n);
  return negative ? -q : q;
}

// ===== A3-AC01 — số lớn vượt Number.MAX_SAFE_INTEGER, biên NUMERIC(15,2) =====

test("A3-AC01 [U]: 90071992547409.91 + 0.01 = 90071992547409.92 qua utility", () => {
  const tong = addMoney(parseMoneyExact("90071992547409.91"), parseMoneyExact("0.01"));
  assert.equal(moneyToDecimal(tong), "90071992547409.92");
  assert.equal(tong, 9007199254740992n);
  assert.equal(tong > BigInt(Number.MAX_SAFE_INTEGER), true);
  // Cùng phép cộng qua wire canonical (không quantize).
  const wire = addMoney(
    parseFixedDecimalExact("90071992547409.91", 2),
    parseFixedDecimalExact("0.01", 2),
  );
  assert.equal(moneyToDecimal(wire), "90071992547409.92");
});

test("A3-AC01 [U]: fitsNumeric(…, 15) chặn đúng biên một ô NUMERIC(15,2)", () => {
  assert.equal(fitsNumeric(parseFixedDecimalExact("9999999999999.99", 2), 15), true);
  assert.equal(fitsNumeric(parseFixedDecimalExact("-9999999999999.99", 2), 15), true);
  assert.equal(fitsNumeric(parseFixedDecimalExact("10000000000000.00", 2), 15), false);
  assert.equal(fitsNumeric(parseFixedDecimalExact("-10000000000000.00", 2), 15), false);
  // Quantize trước rồi mới kiểm biên: .995 làm tròn lên 10^13 → tràn, giống PostgreSQL.
  assert.equal(fitsNumeric(parseMoneyExact("9999999999999.995"), 15), false);
  // Tổng vượt biên một ô vẫn là giá trị hợp lệ của utility/aggregate.
  assert.equal(fitsNumeric(9007199254740992n, 15), false);
  assert.equal(moneyToDecimal(9007199254740992n), "90071992547409.92");
  for (const p of [0, -1, 1.5, NaN, 1001]) {
    assert.throws(() => fitsNumeric(1n, p), /numeric_precision_unsupported/);
  }
});

test("A3-AC01 [P]: SUM numeric và cột NUMERIC(15,2) khớp utility", P, async () => {
  const tong = await queryOne<{ amount: string }>(
    `SELECT SUM(x::numeric)::text AS amount FROM jsonb_array_elements_text(?::jsonb) AS t(x)`,
    JSON.stringify(["90071992547409.91", "0.01"]),
  );
  assert.equal(tong?.amount, "90071992547409.92");
  assert.equal(parseFixedDecimalExact(tong!.amount, 2), 9007199254740992n);

  // Biên một ô: PostgreSQL từ chối (22003) đúng các giá trị fitsNumeric báo false.
  for (const value of [
    "9999999999999.99",
    "-9999999999999.99",
    "10000000000000.00",
    "-10000000000000.00",
    "9999999999999.995",
    "0.00",
  ]) {
    let pgFits = true;
    try {
      await queryOne(`SELECT ?::numeric(15,2) AS v`, value);
    } catch (err) {
      assert.equal((err as { code?: string }).code, "22003");
      pgFits = false;
    }
    assert.equal(fitsNumeric(parseMoneyExact(value), 15), pgFits, value);
  }
});

// ===== A3-AC02 — làm tròn, zero canonical, input sai bị chặn =====

test("A3-AC02 [U]: ±0.005 → ±0.01, mulRatio(-1n,1n,2n) = -1n, zero canonical", () => {
  assert.equal(moneyToDecimal(parseMoneyExact("0.005")), "0.01");
  assert.equal(moneyToDecimal(parseMoneyExact("-0.005")), "-0.01");
  assert.equal(moneyToDecimal(parseMoneyExact("0.00499999")), "0.00");
  assert.equal(moneyToDecimal(parseMoneyExact("-0.00499999")), "0.00");
  assert.equal(mulRatio(-1n, 1n, 2n), -1n);
  assert.equal(mulRatio(1n, 1n, 2n), 1n);
  assert.equal(mulRatio(-3n, 1n, 2n), -2n);
  assert.equal(mulRatio(-1n, 1n, 3n), 0n);
  // Zero chỉ có một dạng: không "-0.00" dù đầu vào âm làm tròn về 0.
  for (const z of ["0", "0.00", "-0.00", "-0.004", "0.000"]) {
    assert.equal(moneyToDecimal(parseMoneyExact(z)), "0.00");
  }
  assert.equal(isCanonicalDecimal(moneyToDecimal(0n), 2), true);
  assert.throws(() => mulRatio(1n, 1n, 0n), RangeError);
  assert.throws(() => mulRatio(0n, 1n, 0n), /mẫu số phải khác 0/);
});

const WIRE_SAI = [
  "",
  " ",
  "1.00 ",
  "\t1.00",
  "+1.00",
  "-0.00",
  "-0",
  "01.00",
  "1",
  "1.0",
  "1.000",
  ".10",
  "1.",
  "1,00",
  "1.000,50",
  "1 000.00",
  "1_000.00",
  "1e2",
  "1E+2",
  "0x10",
  "NaN",
  "Infinity",
  "-Infinity",
  "１.００", // chữ số toàn hình (Unicode)
];

test("A3-AC02 [U]: validator wire canonical tách khỏi parser, từ chối mọi dạng sai", () => {
  for (const value of WIRE_SAI) {
    assert.equal(isCanonicalDecimal(value, 2), false, JSON.stringify(value));
    assert.throws(() => parseFixedDecimalExact(value, 2), /decimal_wire_invalid/);
  }
  for (const value of [null, undefined, 1, 1n, NaN, Infinity, {}, [], true]) {
    assert.equal(isCanonicalDecimal(value, 2), false);
  }
  for (const value of ["0.00", "1.00", "-1.00", "90071992547409.92", "-0.01"]) {
    assert.equal(isCanonicalDecimal(value, 2), true, value);
  }
  assert.equal(isCanonicalDecimal("1.005", 3), true);
  assert.equal(isCanonicalDecimal("1.005", 2), false);
  assert.equal(isCanonicalDecimal("12", 0), true);
  assert.equal(isCanonicalDecimal("1".repeat(1025), 0), false);
  for (const scale of [-1, 19, 0.5, NaN]) {
    assert.throws(() => isCanonicalDecimal("1.00", scale), /decimal_scale_unsupported/);
  }
});

test("A3-AC02 [U]: parser quantize vẫn từ chối locale/exponent/NaN/Infinity/+", () => {
  for (const value of [
    "+1",
    "1,00",
    "1.000,50",
    "1 000",
    "1e3",
    "1E-2",
    "NaN",
    "Infinity",
    "-Infinity",
    "0x10",
  ]) {
    assert.throws(() => parseMoneyExact(value), TypeError, value);
  }
  for (const value of [Number.NaN, Infinity, 1.5, null, undefined]) {
    assert.throws(() => parseMoneyExact(value as unknown as string), TypeError);
  }
});

test(
  "A3-AC02 [P]: numeric đặc biệt của PostgreSQL bị parser từ chối, không thành 0",
  P,
  async () => {
    const rows = await query<{ v: string }>(
      `SELECT x::numeric::text AS v FROM unnest(ARRAY['NaN', 'Infinity', '-Infinity']) AS t(x)`,
    );
    assert.deepEqual(
      rows.map((r) => r.v),
      ["NaN", "Infinity", "-Infinity"],
    );
    for (const { v } of rows) {
      assert.throws(() => parseMoneyExact(v), TypeError);
      assert.equal(isCanonicalDecimal(v, 2), false);
    }
  },
);

// ===== A3-AC03 — 10.000 dòng 0.01, chia partition rồi gộp =====

test("A3-AC03 [U]: 10.000 × 0.01 = 100.00; partition ngẫu nhiên gộp lại không đổi", () => {
  const rows = Array.from({ length: 10_000 }, () => parseFixedDecimalExact("0.01", 2));
  const tongTrucTiep = addMoney(...rows);
  assert.equal(moneyToDecimal(tongTrucTiep), "100.00");
  // Hai dòng cùng số tiền là hai khoản khác nhau — không dedup theo giá trị.
  assert.equal(new Set(rows).size, 1);
  assert.equal(addMoney(...new Set(rows)), 1n);

  const rng = taoPrng(20260925n);
  for (let lan = 0; lan < 5; lan++) {
    const soNhom = Number(rng.next(97n)) + 2;
    const nhom = Array.from({ length: soNhom }, () => [] as bigint[]);
    for (const row of rows) nhom[Number(rng.next(BigInt(soNhom)))].push(row);
    const tongNhom = nhom.map((g) => addMoney(...g));
    assert.equal(addMoney(...tongNhom), tongTrucTiep);
  }
});

test("A3-AC03 [P]: SUM 10.000 dòng 0.01 = 100.00, GROUP BY rồi SUM lại bằng nhau", P, async () => {
  const row = await queryOne<{ tong: string; tongNhom: string; tongDistinct: string }>(
    `WITH r AS (SELECT g, 0.01::numeric(15,2) AS amount FROM generate_series(1, 10000) g),
          n AS (SELECT (g * 7919) % 37 AS k, SUM(amount) AS s FROM r GROUP BY 1)
     SELECT (SELECT SUM(amount) FROM r)::text AS tong,
            (SELECT SUM(s) FROM n)::text AS "tongNhom",
            (SELECT SUM(DISTINCT amount) FROM r)::text AS "tongDistinct"`,
  );
  assert.equal(row?.tong, "100.00");
  assert.equal(row?.tongNhom, "100.00");
  // SUM(DISTINCT) gộp nhầm 10.000 khoản thành 1 — lý do A3-FR03 cấm dùng để chữa join nhân đôi.
  assert.equal(row?.tongDistinct, "0.01");
  assert.equal(parseFixedDecimalExact(row!.tong, 2), 10_000n);
});

// ===== A3-AC04 — property test có seed, oracle bigint, parity PostgreSQL =====

const SO_MAU = 3000;

test("A3-AC04 [U]: round-trip, triệt tiêu, giao hoán, quantize và mulRatio khớp oracle", () => {
  const rng = taoPrng(0x5309n);
  for (let i = 0; i < SO_MAU; i++) {
    const a = rng.soNguyen(30);
    const b = rng.soNguyen(18);
    const c = rng.soNguyen(6);
    // Round-trip: minor → canonical → minor, qua cả parser lẫn validator.
    const text = moneyToDecimal(a);
    assert.equal(isCanonicalDecimal(text, 2), true, text);
    assert.equal(parseFixedDecimalExact(text, 2), a);
    assert.equal(parseMoneyExact(text), a);
    // Triệt tiêu và giao hoán/kết hợp.
    assert.equal(addMoney(a, -a), 0n);
    assert.equal(addMoney(a, b, c), addMoney(c, a, b));
    assert.equal(addMoney(addMoney(a, b), c), addMoney(a, addMoney(b, c)));
    // Quantize chuỗi nhiều số lẻ.
    const dec = rng.thapPhan(25, Number(rng.next(7n)));
    assert.equal(parseMoneyExact(dec), oracleQuantize(dec), dec);
    // mulRatio: oracle thương/dư + đối xứng dấu.
    const n = rng.soNguyen(6);
    let d = rng.soNguyen(6);
    if (d === 0n) d = 7n;
    assert.equal(mulRatio(a, n, d), oracleMulRatio(a, n, d));
    assert.equal(mulRatio(-a, n, d), -mulRatio(a, n, d));
    assert.equal(mulRatio(a, n, -d), -mulRatio(a, n, d));
  }
});

test("A3-AC04 [U]: tổng tích hoán vị và dòng đối không đổi kết quả exact", () => {
  const rng = taoPrng(0x1fc5n);
  for (let lan = 0; lan < 50; lan++) {
    const lines = Array.from({ length: Number(rng.next(40n)) + 1 }, () => ({
      quantity: rng.thapPhan(9, 3),
      unitPrice: rng.thapPhan(11, 2),
    }));
    const tong = sumMoneyProductsExact(lines);
    assert.equal(sumMoneyProductsExact(lines.toReversed()), tong);
    // Dòng đối: đảo dấu khối lượng (số 0 giữ nguyên để không sinh "-0.000" sai canonical).
    const doi = lines.map((l) => ({
      quantity: l.quantity.startsWith("-")
        ? l.quantity.slice(1)
        : /^0\.0+$/.test(l.quantity)
          ? l.quantity
          : `-${l.quantity}`,
      unitPrice: l.unitPrice,
    }));
    assert.equal(sumMoneyProductsExact([...lines, ...doi]), 0n);
  }
});

test("A3-AC04 [P]: parity với PostgreSQL numeric trên mẫu có seed", P, async () => {
  const rng = taoPrng(0xa3ac04n);

  // 1) Quantize 2 số lẻ: round(x, 2) của PostgreSQL (half away from zero).
  const decs = Array.from({ length: SO_MAU }, () => rng.thapPhan(25, Number(rng.next(7n))));
  const q = await query<{ i: number; v: string }>(
    `SELECT (t.i - 1)::int AS i, round(t.x::numeric, 2)::text AS v
       FROM jsonb_array_elements_text(?::jsonb) WITH ORDINALITY AS t(x, i) ORDER BY t.i`,
    JSON.stringify(decs),
  );
  assert.equal(q.length, decs.length);
  for (const { i, v } of q) {
    assert.equal(moneyToDecimal(parseMoneyExact(decs[i])), v, decs[i]);
  }

  // 2) Cộng: SUM numeric khớp addMoney, kể cả tổng vượt 2^53.
  const amounts = Array.from({ length: SO_MAU }, () => moneyToDecimal(rng.soNguyen(20)));
  const s = await queryOne<{ v: string }>(
    `SELECT SUM(x::numeric)::text AS v FROM jsonb_array_elements_text(?::jsonb) AS t(x)`,
    JSON.stringify(amounts),
  );
  assert.equal(s?.v, moneyToDecimal(addMoney(...amounts.map((a) => parseFixedDecimalExact(a, 2)))));

  // 3) mulRatio: round(a·n / d, 0). Mẫu d mang scale 12 để PostgreSQL giữ đủ chữ số lẻ khi
  //    chia (|d| ≤ 10^6 nên phần lẻ cách .5 ít nhất 5·10^-7) — tránh làm tròn kép của numeric.
  const triples = Array.from({ length: SO_MAU }, () => {
    let d = rng.soNguyen(6);
    if (d === 0n) d = -3n;
    return [rng.soNguyen(30).toString(), rng.soNguyen(6).toString(), d.toString()];
  });
  const m = await query<{ i: number; v: string }>(
    `SELECT (t.i - 1)::int AS i,
            round((t.x->>0)::numeric * (t.x->>1)::numeric / (t.x->>2)::numeric(30,12), 0)::text AS v
       FROM jsonb_array_elements(?::jsonb) WITH ORDINALITY AS t(x, i) ORDER BY t.i`,
    JSON.stringify(triples),
  );
  for (const { i, v } of m) {
    const [a, n, d] = triples[i].map((x) => BigInt(x));
    assert.equal(mulRatio(a, n, d).toString(), v, triples[i].join(" "));
  }
});

// ===== ipc-sum-v1 (A3-FR05, phần utility của A3-AC06 / Q-AC06) =====

test("ipc-sum-v1 [U]: hai dòng 0.001 × 5.00 → periodValue 0.01, không phải 0.02", () => {
  const lines: IpcLineV1[] = [
    { qtyPeriod: "0.001", unitPrice: "5.00" },
    { qtyPeriod: "0.001", unitPrice: "5.00" },
  ];
  const t = ipcSumV1(lines, { advancePct: "0.00", retentionPct: "0.00" });
  assert.equal(moneyToDecimal(t.periodValue), "0.01");
  // Round từng dòng (v1 cũ / cách sai) cho 0.02 — ipc-sum-v1 KHÔNG làm vậy.
  const perLine = lines.reduce(
    (sum, l) => sum + ipcSumV1([l], { advancePct: "0.00", retentionPct: "0.00" }).periodValue,
    0n,
  );
  assert.equal(moneyToDecimal(perLine), "0.02");
});

test("ipc-sum-v1 [U]: golden tạm ứng 10,25% = 1025/10000, giữ lại tính trên periodValue", () => {
  const cases: {
    lines: IpcLineV1[];
    advancePct: string;
    retentionPct: string;
    expect: [string, string, string, string];
  }[] = [
    {
      lines: [
        { qtyPeriod: "10.000", unitPrice: "1000.00" },
        { qtyPeriod: "5.000", unitPrice: "2000.00" },
      ],
      advancePct: "10.00",
      retentionPct: "5.00",
      expect: ["20000.00", "2000.00", "1000.00", "17000.00"],
    },
    {
      // 94.00 × 10,25% = 9.635 → 9.64 (ties xa 0); 5% = 4.70.
      lines: [{ qtyPeriod: "1.000", unitPrice: "94.00" }],
      advancePct: "10.25",
      retentionPct: "5.00",
      expect: ["94.00", "9.64", "4.70", "79.66"],
    },
    {
      // periodValue round trước (1.005 × 100.00 = 100.50) rồi mới nhân tỷ lệ.
      lines: [{ qtyPeriod: "1.005", unitPrice: "100.00" }],
      advancePct: "10.25",
      retentionPct: "5.00",
      expect: ["100.50", "10.30", "5.03", "85.17"],
    },
    {
      // Dòng âm (giảm trừ) — làm tròn đối xứng dấu.
      lines: [{ qtyPeriod: "-1.000", unitPrice: "94.00" }],
      advancePct: "10.25",
      retentionPct: "5.00",
      expect: ["-94.00", "-9.64", "-4.70", "-79.66"],
    },
    {
      // Tổng vượt 2^53 đồng×100 vẫn exact tới từng xu.
      lines: [
        { qtyPeriod: "10.000", unitPrice: "9007199254740.99" },
        { qtyPeriod: "1.000", unitPrice: "0.02" },
      ],
      advancePct: "10.25",
      retentionPct: "5.00",
      expect: ["90071992547409.92", "9232379236109.52", "4503599627370.50", "76336013683929.90"],
    },
    {
      lines: [],
      advancePct: "10.25",
      retentionPct: "5.00",
      expect: ["0.00", "0.00", "0.00", "0.00"],
    },
  ];
  for (const c of cases) {
    const t = ipcSumV1(c.lines, { advancePct: c.advancePct, retentionPct: c.retentionPct });
    assert.deepEqual(
      [t.periodValue, t.advanceDeduct, t.retentionDeduct, t.approvedValue].map(moneyToDecimal),
      c.expect,
    );
    // approved = period − advance − retention exact (không round lại).
    assert.equal(t.approvedValue, t.periodValue - t.advanceDeduct - t.retentionDeduct);
  }
});

test("ipc-sum-v1 [U]: wire sai bị từ chối, không đoán scale", () => {
  const ok = { advancePct: "10.00", retentionPct: "5.00" };
  const dong = (qtyPeriod: string, unitPrice: string) => [{ qtyPeriod, unitPrice }];
  // qty phải đúng scale 3, đơn giá scale 2, rate scale 2.
  assert.throws(() => ipcSumV1(dong("1.00", "1.00"), ok), /decimal_wire_invalid/);
  assert.throws(() => ipcSumV1(dong("1.000", "1.0"), ok), /decimal_wire_invalid/);
  assert.throws(() => ipcSumV1(dong("1e3", "1.00"), ok), /decimal_wire_invalid/);
  assert.throws(
    () => ipcSumV1(dong("1.000", "1.00"), { advancePct: "10.25%", retentionPct: "5.00" }),
    /decimal_wire_invalid/,
  );
  assert.throws(
    () => ipcSumV1(dong("1.000", "1.00"), { advancePct: "10.00", retentionPct: "5" }),
    /decimal_wire_invalid/,
  );
  assert.throws(() => ipcSumV1(null as never, ok), /money_lines_invalid/);
  assert.throws(() => ipcSumV1([null as never], ok), /money_lines_invalid/);
  assert.throws(() => ipcSumV1([], null as never), /ipc_rates_invalid/);
});

/** ipc-sum-v1 viết bằng SQL numeric — nhân `0.01` thay vì `/ 100` (xem test bẫy bên dưới). */
const IPC_SUM_V1_SQL = `
  WITH l AS (SELECT * FROM jsonb_to_recordset(?::jsonb) AS r("qtyPeriod" numeric, "unitPrice" numeric)),
       p AS (SELECT round(COALESCE(SUM(l."qtyPeriod" * l."unitPrice"), 0), 2) AS v FROM l),
       k AS (SELECT v, round(v * ?::numeric * 0.01, 2) AS adv, round(v * ?::numeric * 0.01, 2) AS ret FROM p)
  SELECT v::text AS period, adv::text AS adv, ret::text AS ret, (v - adv - ret)::text AS appr FROM k`;

test("ipc-sum-v1 [P]: parity với công thức SQL numeric trên mẫu có seed", P, async () => {
  const rng = taoPrng(0x1bc5a1n);
  for (let lan = 0; lan < 60; lan++) {
    const lines: IpcLineV1[] = Array.from({ length: Number(rng.next(25n)) }, () => ({
      qtyPeriod: rng.thapPhan(8, 3),
      unitPrice: rng.thapPhan(10, 2),
    }));
    const pct = () => {
      const v = rng.next(10001n); // 0.00 … 100.00
      return `${v / 100n}.${(v % 100n).toString().padStart(2, "0")}`;
    };
    const rates = { advancePct: pct(), retentionPct: pct() };
    const row = await queryOne<{ period: string; adv: string; ret: string; appr: string }>(
      IPC_SUM_V1_SQL,
      JSON.stringify(lines),
      rates.advancePct,
      rates.retentionPct,
    );
    const t = ipcSumV1(lines, rates);
    assert.deepEqual(
      [t.periodValue, t.advanceDeduct, t.retentionDeduct, t.approvedValue].map(moneyToDecimal),
      [row!.period, row!.adv, row!.ret, row!.appr],
      JSON.stringify({ lines, rates }),
    );
  }
});

test(
  "ipc-sum-v1 [P]: bẫy SQL — round(v * rate / 100, 2) làm tròn kép khi v lớn, nhân 0.01 thì không",
  P,
  async () => {
    // PostgreSQL chọn scale thương theo độ lớn (≥16 chữ số có nghĩa): v ~ 10^13 chỉ còn 4 số lẻ
    // → .854950 bị làm tròn thành .8550 rồi lên .86. ipc-sum-v1 đúng là .85 (S10 phải dùng
    // nhân 0.01 hoặc helper exact, không viết `/ 100`).
    const row = await queryOne<{ chia: string; nhan: string }>(
      `SELECT round(v * 10.25 / 100, 2)::text AS chia, round(v * 10.25 * 0.01, 2)::text AS nhan
         FROM (SELECT ?::numeric(15,2) AS v) t`,
      "9999999999910.78",
    );
    const t = ipcSumV1([{ qtyPeriod: "1.000", unitPrice: "9999999999910.78" }], {
      advancePct: "10.25",
      retentionPct: "0.00",
    });
    assert.equal(moneyToDecimal(t.advanceDeduct), "1024999999990.85");
    assert.equal(row?.nhan, "1024999999990.85");
    assert.equal(row?.chia, "1024999999990.86");
  },
);
