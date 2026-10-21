// A4-AC06: dữ liệu riêng trong DB E2E; không dùng ID cố định hoặc sửa dữ liệu seed dùng chung.
import { randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { Page } from "@playwright/test";
import { E2E_DB } from "../constants";
import { dungTaskTienDo, dungToChucCoLap } from "./co-lap";

type DuAnA4 = { id: number; name: string; status: "active" | "handover" | "closed" };
export type DongTangA4 = {
  billId: number;
  sheetTypeId: number;
  sheetCode: string;
  floorLabel: string;
  label: string;
  budget: string;
  actual: string;
  budgetDayDu: string;
  actualDayDu: string;
};

/** Tất cả giá trị tiền kỳ vọng là chuỗi literal, độc lập formatter/số học của app. */
async function taoDongTang(
  client: PoolClient,
  projectId: number,
  code: string,
  slug: string,
  budget: string,
  actual: string,
  budgetDayDu: string,
  actualDayDu: string,
): Promise<DongTangA4> {
  const tower = await client.query<{ id: number }>(
    "INSERT INTO towers (project_id, name) VALUES ($1, $2) RETURNING id",
    [projectId, `Tháp ${slug}`],
  );
  const sheet = await client.query<{ id: number }>(
    `INSERT INTO sheet_types (tower_id, code, name, slug)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [tower.rows[0].id, code, `Sheet ${slug}`, slug],
  );
  const sheetTypeId = sheet.rows[0].id;
  const contract = await client.query<{ id: number }>(
    `INSERT INTO contracts (code, kind, title, party_name, value, status, project_id)
     VALUES ($1, 'giao_thau', $2, $3, $4::numeric, 'active', $5) RETURNING id`,
    [`HD-${slug}`, `Hợp đồng ${slug}`, `Đối tác ${slug}`, budget, projectId],
  );
  await client.query(
    `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value, contract_id)
     VALUES ($1, 'T1', $2::numeric, $3)`,
    [sheetTypeId, budget, contract.rows[0].id],
  );
  const bill = await client.query<{ id: number }>(
    `INSERT INTO payment_bills
       (responsible, type, amount, paid_date, project_id, sheet_type_id, floor_label, contract_id)
     VALUES ($1, 'bill', $2::numeric, CURRENT_DATE, $3, $4, 'T1', $5) RETURNING id`,
    [`Người phụ trách ${slug}`, actual, projectId, sheetTypeId, contract.rows[0].id],
  );
  return {
    billId: bill.rows[0].id,
    sheetTypeId,
    sheetCode: code,
    floorLabel: "T1",
    label: `${code} · T1`,
    budget,
    actual,
    budgetDayDu,
    actualDayDu,
  };
}

export async function dungFixtureBaoCaoA4(vaiTro = ["pm"]) {
  if (!E2E_DB) throw new Error("Thiếu E2E_DATABASE_URL — fixture A4 chỉ dùng DB E2E");
  const co = await dungToChucCoLap(vaiTro, 4, { ganDuAn: false });
  const ngoai = await dungToChucCoLap([], 1);
  const h = randomBytes(6).toString("hex");
  const duAn: DuAnA4[] = [
    { id: co.duAn[0], name: `A4 đang thi công ${h}`, status: "active" },
    { id: co.duAn[1], name: `A4 bàn giao ${h}`, status: "handover" },
    { id: co.duAn[2], name: `A4 đã đóng ${h}`, status: "closed" },
    { id: co.duAn[3], name: `A4 chưa được gán ${h}`, status: "active" },
  ];
  const duAnNgoai: DuAnA4 = {
    id: ngoai.projectId,
    name: `A4 sentinel tổ chức B ${h}`,
    status: "active",
  };
  const pool = new Pool({ connectionString: E2E_DB, max: 1 });
  const client = await pool.connect();
  let dongTang: DongTangA4[];
  let sentinel: DongTangA4;
  try {
    await client.query("BEGIN");
    for (const project of [...duAn, duAnNgoai]) {
      await client.query("UPDATE projects SET name = $1, status = $2 WHERE id = $3", [
        project.name,
        project.status,
        project.id,
      ]);
    }
    for (const user of Object.values(co.nguoi)) {
      // Grant sai org là dữ liệu kiểm boundary có chủ đích, không phải quyền hợp lệ.
      for (const projectId of [...co.duAn.slice(0, 3), ngoai.projectId]) {
        await client.query("INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)", [
          user.id,
          projectId,
        ]);
      }
    }
    const code = `A4-${h}`;
    dongTang = [
      await taoDongTang(
        client,
        co.projectId,
        code,
        `a4-${h}-1`,
        "1000000000.00",
        "100000000.00",
        "1.000.000.000 đ",
        "100.000.000 đ",
      ),
      await taoDongTang(
        client,
        co.projectId,
        code,
        `a4-${h}-2`,
        "7000000000.00",
        "800000000.00",
        "7.000.000.000 đ",
        "800.000.000 đ",
      ),
    ];
    sentinel = await taoDongTang(
      client,
      ngoai.projectId,
      `ORG-B-${h}`,
      `a4-${h}-ngoai`,
      "9753100000.00",
      "8642000000.00",
      "9.753.100.000 đ",
      "8.642.000.000 đ",
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  // Ba dự án khả kiến có 3 task, tiến độ (25% + 100% + 25%) / 3 = 50%.
  // Task ở hai dự án bị loại sẽ làm KPI sai rõ ràng nếu visibility/org bị bỏ qua.
  await dungTaskTienDo(duAn[0].id, [0.25]);
  await dungTaskTienDo(duAn[1].id, [1]);
  await dungTaskTienDo(duAn[2].id, [0.25]);
  await dungTaskTienDo(duAn[3].id, [1, 1, 1, 1, 1, 1]);
  await dungTaskTienDo(duAnNgoai.id, [1, 1, 1, 1, 1]);
  return { co, ngoai, duAn, duAnNgoai, dongTang, sentinel };
}

/** Request phát từ trang thật, cùng cookie phiên; không giả lập transport/phản hồi. */
export async function docJsonTrinhDuyet<T = Record<string, unknown>>(
  page: Page,
  url: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const response = await page.evaluate(
    async ({ url, method, body }) => {
      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-XBoss-Money-Format": "decimal-string-v1",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json()) as unknown };
    },
    { url, method: options.method ?? "GET", body: options.body },
  );
  return response as { status: number; body: T };
}
