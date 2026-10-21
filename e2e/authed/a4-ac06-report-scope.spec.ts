import { test, expect, type Page } from "@playwright/test";
import { dangNhapCoLap } from "../helpers/co-lap";
import { docJsonTrinhDuyet, dungFixtureBaoCaoA4 } from "../helpers/a4-report-fixtures";

// A4-AC06 lớp B: sáu ca dùng HTTP/DB thật, chạy lại trên hai project desktop/mobile.
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" });
test.describe.configure({ timeout: 90_000 });

type DanhSach = {
  projects: { id: number; name: string; status: string; orgId: number }[];
  orgs: { id: number; name: string }[];
};
type Kpi = {
  totalProjects: number;
  activeCount: number;
  handoverCount: number;
  closedCount: number;
  taskCount: number;
  totalDelayed: number;
  avgProgress: number | null;
  progressAvailable: boolean;
  coverage: { validTasks: number; excludedTasks: number };
};
type BaoCao = {
  moneyFormat: string;
  rows: {
    key: string;
    label: string;
    sheetTypeId: number;
    floorLabel: string;
    budget: string;
    committed: string;
    actual: string;
  }[];
  selectedTotals: { budget: string; committed: string; actual: string };
  projectTotals: { budget: string; committed: string; actual: string };
  metadata: { projectId: number; coverage: { reconciled: boolean } };
};
type DanhSachPhieu = {
  moneyFormat: string;
  bills: { id: number; amount: string; sheetTypeId: number; floorLabel: string }[];
};

async function chonDuAn(page: Page, projectId: number) {
  const response = await docJsonTrinhDuyet(page, "/api/project/select", {
    method: "POST",
    body: { projectId },
  });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ok: true });
}

test("A4-AC06: Portfolio list/KPI/filter cùng org và visibility, kể cả grant sai org", async ({
  page,
}) => {
  const fixture = await dungFixtureBaoCaoA4();
  await dangNhapCoLap(page, fixture.co.nguoi.pm.email);
  await page.goto("/portfolio");
  const main = page.locator("main");
  const kpiDuAn = main
    .locator("p")
    .filter({ hasText: /^Số dự án$/ })
    .locator("..");
  await expect(kpiDuAn.locator("p").nth(1)).toHaveText("3");
  const kpiDangThiCong = main
    .locator("p")
    .filter({ hasText: /^Đang thi công$/ })
    .locator("..");
  await expect(kpiDangThiCong.locator("p").nth(1)).toHaveText("1");
  await expect(main.getByText("50%", { exact: true })).toBeVisible();
  await expect(main.getByText("3 việc", { exact: true })).toBeVisible();
  await expect(main.getByRole("heading", { level: 3 })).toHaveCount(3);
  for (const project of fixture.duAn.slice(0, 3)) {
    await expect(main.getByRole("heading", { name: project.name, exact: true })).toBeVisible();
  }
  await expect(main).not.toContainText(fixture.duAn[3].name);
  await expect(main).not.toContainText(fixture.duAnNgoai.name);
  // Grant sai org không được làm lộ option lọc tổ chức thứ hai.
  await expect(
    main.getByLabel("Tổ chức", { exact: true }).locator(`option[value="${fixture.ngoai.orgId}"]`),
  ).toHaveCount(0);

  for (const query of ["", `?org=${fixture.co.orgId}`]) {
    const list = await docJsonTrinhDuyet<DanhSach>(page, `/api/projects${query}`);
    const kpi = await docJsonTrinhDuyet<Kpi>(page, `/api/portfolio/kpi${query}`);
    expect(list.status).toBe(200);
    expect(kpi.status).toBe(200);
    expect(list.body.projects.map((project) => project.id).sort((a, b) => a - b)).toEqual(
      fixture.duAn
        .slice(0, 3)
        .map((project) => project.id)
        .sort((a, b) => a - b),
    );
    expect(list.body.projects.map((project) => project.status).sort()).toEqual([
      "active",
      "closed",
      "handover",
    ]);
    expect(list.body.projects.every((project) => project.orgId === fixture.co.orgId)).toBe(true);
    expect(list.body.orgs.map((org) => org.id)).toEqual([fixture.co.orgId]);
    expect(kpi.body).toEqual({
      totalProjects: 3,
      activeCount: 1,
      handoverCount: 1,
      closedCount: 1,
      taskCount: 3,
      totalDelayed: 0,
      avgProgress: 0.5,
      progressAvailable: true,
      coverage: { validTasks: 3, excludedTasks: 0 },
    });
  }
  const foreignList = await docJsonTrinhDuyet<DanhSach>(
    page,
    `/api/projects?org=${fixture.ngoai.orgId}`,
  );
  const foreignKpi = await docJsonTrinhDuyet<Kpi>(
    page,
    `/api/portfolio/kpi?org=${fixture.ngoai.orgId}`,
  );
  expect(foreignList.status).toBe(200);
  expect(foreignList.body.projects).toEqual([]);
  expect(foreignKpi.status).toBe(200);
  expect(foreignKpi.body).toEqual({
    totalProjects: 0,
    activeCount: 0,
    handoverCount: 0,
    closedCount: 0,
    taskCount: 0,
    totalDelayed: 0,
    avgProgress: null,
    progressAvailable: false,
    coverage: { validTasks: 0, excludedTasks: 0 },
  });
});

test("A4-AC06: hai sheet trùng code/T1 giữ dòng, tiền và drilldown riêng; từ chối chọn org khác", async ({
  page,
}) => {
  const fixture = await dungFixtureBaoCaoA4();
  await dangNhapCoLap(page, fixture.co.nguoi.pm.email);
  await chonDuAn(page, fixture.co.projectId);
  await page.goto("/costs");
  await page.getByRole("button", { name: "Theo tầng", exact: true }).click();
  const detailName = `Xem chi tiết ${fixture.dongTang[0].label}`;
  await expect(page.getByRole("button", { name: detailName, exact: true })).toHaveCount(2);

  const report = await docJsonTrinhDuyet<BaoCao>(page, "/api/costs?groupBy=floor&includeVo=1");
  expect(report.status).toBe(200);
  expect(report.body.moneyFormat).toBe("decimal-string-v1");
  expect(report.body.metadata.projectId).toBe(fixture.co.projectId);
  expect(report.body.metadata.coverage.reconciled).toBe(true);
  expect(report.body.rows).toHaveLength(2);
  expect(new Set(report.body.rows.map((row) => row.key)).size).toBe(2);
  expect(report.body.rows.map((row) => row.sheetTypeId).sort((a, b) => a - b)).toEqual(
    fixture.dongTang.map((row) => row.sheetTypeId).sort((a, b) => a - b),
  );
  expect(report.body.selectedTotals).toMatchObject({
    budget: "8000000000.00",
    committed: "8000000000.00",
    actual: "900000000.00",
  });
  // BOQ dự án rỗng; budget tầng là proxy HĐ. Tổng dự án vẫn phải loại toàn bộ sentinel org B.
  expect(report.body.projectTotals).toMatchObject({
    budget: "0.00",
    committed: "8000000000.00",
    actual: "900000000.00",
  });

  for (const expected of fixture.dongTang) {
    expect(report.body.rows.find((row) => row.sheetTypeId === expected.sheetTypeId)).toMatchObject({
      label: expected.label,
      floorLabel: "T1",
      budget: expected.budget,
      committed: expected.budget,
      actual: expected.actual,
    });
    // Nhãn giống nhau: nhận diện hàng bằng tiền oracle của đúng sheet, không chọn theo thứ tự.
    const row = page.getByRole("row").filter({
      has: page.locator(`td[title="${expected.budgetDayDu}"]`),
    });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").nth(3)).toHaveAttribute("title", expected.actualDayDu);
    await row.getByRole("button", { name: detailName, exact: true }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: expected.label, exact: true });
    await expect(dialog).toBeVisible();
    for (const label of ["Ngân sách", "Cam kết"]) {
      await expect(
        dialog.getByText(label, { exact: true }).locator("..").getByText(expected.budgetDayDu, {
          exact: true,
        }),
      ).toBeVisible();
    }
    await expect(dialog.getByText(expected.actualDayDu, { exact: true })).toBeVisible();
    for (const other of fixture.dongTang.filter(
      (item) => item.sheetTypeId !== expected.sheetTypeId,
    )) {
      await expect(dialog).not.toContainText(other.budgetDayDu);
      await expect(dialog).not.toContainText(other.actualDayDu);
    }
    await expect(dialog.getByRole("link")).toHaveCount(1);
    await expect(dialog.getByRole("link")).toHaveAttribute("href", "/payments");
    await expect(dialog).not.toContainText(fixture.sentinel.label);
    await expect(dialog).not.toContainText(fixture.sentinel.budgetDayDu);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }

  // Đi theo link thật và kiểm request do trang đích phát: href đúng chưa chứng minh scope đích.
  const first = fixture.dongTang[0];
  await page
    .getByRole("row")
    .filter({ has: page.locator(`td[title="${first.budgetDayDu}"]`) })
    .getByRole("button", { name: detailName, exact: true })
    .click();
  const destinationDialog = page.getByRole("dialog", { name: first.label, exact: true });
  await expect(destinationDialog).toBeVisible();
  const billsPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/payments/bills" &&
      response.request().method() === "GET",
  );
  const [billsResponse] = await Promise.all([
    billsPromise,
    destinationDialog.getByRole("link").click(),
  ]);
  await expect(page).toHaveURL(/\/payments(?:\?.*)?$/);
  expect(billsResponse.status()).toBe(200);
  expect(billsResponse.request().headers()["x-xboss-money-format"]).toBe("decimal-string-v1");
  const destination = (await billsResponse.json()) as DanhSachPhieu;
  expect(destination.moneyFormat).toBe("decimal-string-v1");
  expect(destination.bills.map((bill) => bill.id).sort((a, b) => a - b)).toEqual(
    fixture.dongTang.map((row) => row.billId).sort((a, b) => a - b),
  );
  for (const row of fixture.dongTang) {
    expect(destination.bills.find((bill) => bill.id === row.billId)).toMatchObject({
      amount: row.actual,
      sheetTypeId: row.sheetTypeId,
      floorLabel: row.floorLabel,
    });
  }
  expect(destination.bills.map((bill) => bill.id)).not.toContain(fixture.sentinel.billId);
  expect(JSON.stringify(destination)).not.toContain(fixture.sentinel.actual);
  expect(JSON.stringify(destination)).not.toContain(fixture.sentinel.sheetCode);
  const paymentsMain = page.locator("main");
  await expect(paymentsMain.getByText("Đã thanh toán", { exact: true }).first()).toBeVisible();
  await expect(paymentsMain).not.toContainText(fixture.sentinel.sheetCode);
  await expect(paymentsMain).not.toContainText(fixture.sentinel.actualDayDu);
  await expect(paymentsMain).not.toContainText(fixture.duAnNgoai.name);

  await page.goto("/costs");
  await page.getByRole("button", { name: "Theo tầng", exact: true }).click();
  await expect(page.getByRole("button", { name: detailName, exact: true })).toHaveCount(2);
  const cookieBefore = (await page.context().cookies()).find(
    (cookie) => cookie.name === "xboss_project",
  );
  expect(cookieBefore?.value).toBe(String(fixture.co.projectId));
  const forbidden = await docJsonTrinhDuyet(page, "/api/project/select", {
    method: "POST",
    body: { projectId: fixture.duAnNgoai.id },
  });
  expect(forbidden.status).toBe(403);
  expect(Object.keys(forbidden.body)).toEqual(["error"]);
  expect(
    (await page.context().cookies()).find((cookie) => cookie.name === "xboss_project")?.value,
  ).toBe(cookieBefore?.value);
  const after = await docJsonTrinhDuyet<BaoCao>(page, "/api/costs?groupBy=floor&includeVo=1");
  expect(after.status).toBe(200);
  expect(after.body.metadata.projectId).toBe(fixture.co.projectId);
  expect(after.body.rows).toEqual(report.body.rows);
  await expect(page.locator("main")).not.toContainText(fixture.sentinel.label);
  await expect(page.locator("main")).not.toContainText(fixture.sentinel.actualDayDu);
});

for (const role of ["engineer", "subcon", "viewer", "cdt"]) {
  test(`A4-AC06: ${role} có membership thật vẫn nhận 403, không lộ báo cáo/tiền trong body và DOM`, async ({
    page,
  }) => {
    const fixture = await dungFixtureBaoCaoA4([role]);
    await dangNhapCoLap(page, fixture.co.nguoi[role].email);
    await chonDuAn(page, fixture.co.projectId);
    for (const query of ["groupBy=system", "groupBy=floor", "export=excel"]) {
      const response = await docJsonTrinhDuyet(page, `/api/costs?${query}`);
      expect(response.status, query).toBe(403);
      expect(response.body, query).toEqual({ error: "Chỉ Admin/PM/BCH được xem chi phí" });
      for (const field of [
        "rows",
        "totals",
        "selectedTotals",
        "projectTotals",
        "alerts",
        "metadata",
      ]) {
        expect(response.body, `${role}: không được lộ ${field}`).not.toHaveProperty(field);
      }
    }
    await page.goto("/costs");
    await expect(page.getByText("Không có quyền truy cập", { exact: true })).toBeVisible();
    // Kiểm cả DOM bị ẩn, không chỉ các role đang nằm trong accessibility tree.
    await expect(page.locator("table")).toHaveCount(0);
    await expect(page.locator('button[aria-label^="Xem chi tiết "]')).toHaveCount(0);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    for (const row of [...fixture.dongTang, fixture.sentinel]) {
      await expect(page.locator("main")).not.toContainText(row.label);
      await expect(page.locator("main")).not.toContainText(row.budgetDayDu);
      await expect(page.locator("main")).not.toContainText(row.actualDayDu);
    }
  });
}
