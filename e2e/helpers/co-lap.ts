// Dữ liệu CÔ LẬP cho e2e (S15): mỗi lần gọi tạo MỘT tổ chức mới + dự án + người dùng riêng thẳng
// vào DB test (E2E_DATABASE_URL). Lý do: các spec authed chạy song song trên cùng DB seed — KPI
// Portfolio/hợp đồng/IPC của tổ chức 1 bị spec khác đọc (vd payment-certs.spec.ts đòi EmptyState
// "Chưa có hợp đồng nào"), nên spec cần số liệu chính xác phải làm việc trong tổ chức riêng.
// Id do DB cấp (không hard-code); tên/email/mã có hậu tố ngẫu nhiên nên chạy lại nhiều lần được.
import { randomBytes, scryptSync } from "node:crypto";
import { Pool } from "pg";
import { expect, type Page } from "@playwright/test";
import { E2E_DB } from "../constants";

export const MAT_KHAU_CO_LAP = "e2e-co-lap-pw";

/** Cùng định dạng `salt:hash` (scrypt 64 byte) với hashPassword của lib/bao-mat/auth. */
function bamMatKhau(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

export type NguoiCoLap = { id: number; email: string; role: string };
export type ToChucCoLap = {
  orgId: number;
  projectId: number;
  /** Mọi dự án đã tạo (phần tử đầu = projectId). */
  duAn: number[];
  /** Người dùng theo vai trò đã yêu cầu. */
  nguoi: Record<string, NguoiCoLap>;
};

async function voiPool<T>(fn: (p: Pool) => Promise<T>): Promise<T> {
  if (!E2E_DB) throw new Error("Thiếu E2E_DATABASE_URL");
  const pool = new Pool({ connectionString: E2E_DB, max: 1 });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

const hauTo = () => randomBytes(4).toString("hex");

/** Tổ chức mới + `soDuAn` dự án rỗng + 1 người cho mỗi vai trò (cùng mật khẩu MAT_KHAU_CO_LAP). */
export async function dungToChucCoLap(vaiTro: string[], soDuAn = 1): Promise<ToChucCoLap> {
  const h = hauTo();
  return voiPool(async (p) => {
    const org = await p.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [
      `E2E cô lập ${h}`,
    ]);
    const orgId = org.rows[0].id as number;
    const duAn: number[] = [];
    for (let i = 0; i < soDuAn; i++) {
      const r = await p.query(`INSERT INTO projects (name, org_id) VALUES ($1, $2) RETURNING id`, [
        `DA cô lập ${h}-${i + 1}`,
        orgId,
      ]);
      duAn.push(r.rows[0].id as number);
    }
    const nguoi: Record<string, NguoiCoLap> = {};
    for (const role of vaiTro) {
      const email = `e2e-${role}-${h}@co-lap.test`;
      const r = await p.query(
        `INSERT INTO users (name, email, password_hash, role, org_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [`E2E ${role} ${h}`, email, bamMatKhau(MAT_KHAU_CO_LAP), role, orgId],
      );
      nguoi[role] = { id: r.rows[0].id as number, email, role };
    }
    return { orgId, projectId: duAn[0], duAn, nguoi };
  });
}

/** Cây WBS tối thiểu cho 1 dự án: `tienDo[i]` = progress_percent của task thứ i. */
export async function dungTaskTienDo(projectId: number, tienDo: number[]): Promise<void> {
  const h = hauTo();
  await voiPool(async (p) => {
    const tw = await p.query(
      `INSERT INTO towers (project_id, name) VALUES ($1, 'Tháp E2E') RETURNING id`,
      [projectId],
    );
    const st = await p.query(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES ($1, $2, 'Sheet E2E', $3) RETURNING id`,
      [tw.rows[0].id, `S${h}`, `s-${h}`],
    );
    const wp = await p.query(
      `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES ($1, $2, 'Nhóm E2E', 1) RETURNING id`,
      [st.rows[0].id, `P${h}`],
    );
    for (let i = 0; i < tienDo.length; i++) {
      await p.query(
        `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          wp.rows[0].id,
          `T${h}-${i}`,
          `Task E2E ${i}`,
          i + 1,
          tienDo[i],
          tienDo[i] >= 1 ? "hoan_thanh" : "chuan_bi",
        ],
      );
    }
  });
}

/**
 * 1 tháp → 1 sheet có NGƯỜI PHỤ TRÁCH `responsible` → 1 nhóm có nhãn tầng: trang /payments (chế độ
 * "Người phụ trách") chỉ hiện khối phiếu của người có ô tầng × hệ — dữ liệu đầu vào, không phải
 * trạng thái nghiệp vụ.
 */
export async function dungSheetNguoiPhuTrach(
  projectId: number,
  responsible: string,
): Promise<void> {
  const h = hauTo();
  await voiPool(async (p) => {
    const tw = await p.query(
      `INSERT INTO towers (project_id, name) VALUES ($1, 'Tháp E2E') RETURNING id`,
      [projectId],
    );
    const st = await p.query(
      `INSERT INTO sheet_types (tower_id, code, name, slug, responsible)
       VALUES ($1, $2, 'Sheet E2E', $3, $4) RETURNING id`,
      [tw.rows[0].id, `S${h}`, `s-${h}`, responsible],
    );
    await p.query(
      `INSERT INTO work_packages (sheet_type_id, code, name, sort_order, floor_label)
       VALUES ($1, $2, 'Nhóm E2E', 1, 'T1')`,
      [st.rows[0].id, `P${h}`],
    );
  });
}

/** Gắn dòng BOQ vào hợp đồng (không có route nào ghi `boq_items.contract_id`). */
export async function ganBoqVaoHopDong(boqId: number, contractId: number): Promise<void> {
  await voiPool((p) =>
    p.query(`UPDATE boq_items SET contract_id = $1 WHERE id = $2`, [contractId, boqId]),
  );
}

/** Đăng nhập bằng UI (trình duyệt không mang storageState admin chung). */
export async function dangNhapCoLap(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(MAT_KHAU_CO_LAP);
  await page.getByRole("button", { name: /Đăng nhập/ }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Đăng nhập/ })).toHaveCount(0);
}

/** fetch cùng origin trong ngữ cảnh trang (cookie phiên tự đính kèm; `page.request` có thể mất cookie). */
export async function goiApi(
  page: Page,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  return page.evaluate(
    async ({ method, url, body }) => {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { method, url, body },
  );
}
