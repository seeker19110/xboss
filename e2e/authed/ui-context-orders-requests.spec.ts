import { test, expect, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const material = {
  id: 880_001,
  name: "Vật tư kiểm chứng R3",
  unit: "m",
  sheetCode: "ACMV",
  qtyPlanned: 10,
  qtyUsed: 2,
};
const order = {
  id: 880_002,
  poCode: "PO-R3-001",
  status: "draft",
  expectedDate: null,
  note: null,
  supplierId: 77,
  supplierName: "NCC kiểm chứng",
  createdByName: "Người kiểm chứng",
  createdAt: "2026-10-24T00:00:00Z",
  itemCount: 1,
  totalOrdered: 2,
  totalReceived: 0,
};
const request = {
  id: 880_003,
  prCode: "PR-R3-001",
  materialId: material.id,
  materialName: material.name,
  unit: "m",
  qtyRequested: 2,
  status: "approved",
  note: null,
  reviewNote: null,
  requestedBy: 1,
  requestedByName: "Người kiểm chứng",
  reviewedByName: null,
  reviewedAt: null,
  createdAt: "2026-10-24T00:00:00Z",
};

async function setup(page: Page) {
  const counts = { approvedPRs: 0, contracts: 0, purchaseOrders: 0, purchaseRequests: 0 };
  const payloads: unknown[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) =>
    ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
      ? route.continue()
      : route.fulfill({ status: 403, json: { error: "Mutation ngoài fixture bị chặn" } }),
  );
  await page.route("**/api/materials", (route) =>
    route.fulfill({ json: { materials: [material] } }),
  );
  await page.route("**/api/suppliers", (route) =>
    route.fulfill({ json: { suppliers: [{ id: 77, name: order.supplierName, avgRating: 4 }] } }),
  );
  await page.route("**/api/engineering/logistics/shipments", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/contracts?kind=ncc", (route) => {
    counts.contracts++;
    return route.fulfill({ json: { contracts: [] } });
  });
  await page.route(/\/api\/purchase-orders(?:\?.*)?$/, (route) => {
    if (route.request().method() === "POST") {
      payloads.push(route.request().postDataJSON());
      return route.fulfill({ status: 403, json: { error: "Không ghi PO fixture" } });
    }
    counts.purchaseOrders++;
    return route.fulfill({ json: { orders: [order] } });
  });
  await page.route(/\/api\/purchase-requests(?:\?.*)?$/, (route) => {
    counts.purchaseRequests++;
    if (new URL(route.request().url()).searchParams.get("status") === "approved")
      counts.approvedPRs++;
    return route.fulfill({ json: { requests: [request] } });
  });
  return { counts, payloads, errors };
}

test("mở PO không tải hai nguồn không consumer; PR approved vẫn lọc qua loadPRs", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/procurement?tab=orders");
  await expect(page.getByText(order.poCode, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lập Đơn Hàng PO", exact: true })).toBeVisible();
  await expect(page.getByText("1 Mục", { exact: true })).toBeVisible();
  await expect(page.getByText("1 Đơn", { exact: true })).toBeVisible();
  await test.info().attach("initial-orders-request-counts", {
    body: JSON.stringify(state.counts),
    contentType: "application/json",
  });
  expect({ approvedPRs: state.counts.approvedPRs, contracts: state.counts.contracts }).toEqual({
    approvedPRs: 0,
    contracts: 0,
  });
  await page.getByRole("button", { name: /Yêu Cầu Mua Sắm \(PR\)/ }).click();
  await expect(page.getByText(request.prCode, { exact: true })).toBeVisible();
  // Chọn theo option để giữ nguyên selector chạy được trên cả baseline và candidate.
  const status = page
    .getByRole("combobox")
    .filter({ has: page.locator('option[value="approved"]') });
  await status.selectOption("approved");
  await expect.poll(() => state.counts.approvedPRs).toBe(1);
  await expect(page.getByText(request.prCode, { exact: true })).toBeVisible();
  expect(state.counts.contracts).toBe(0);
  expect(state.errors).toEqual([]);
});

test("bỏ prefetch thừa vẫn giữ danh mục form và payload PO cùng KPI", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/procurement?tab=orders");
  await expect(page.getByText(order.poCode, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lập Đơn Hàng PO", exact: true }).click();
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("button", { name: "Phát Hành Đơn Hàng", exact: true }) });
  await dialog.getByRole("combobox").nth(0).selectOption("77");
  await dialog.getByRole("combobox").nth(1).selectOption(String(material.id));
  await dialog.getByRole("spinbutton").nth(0).fill("2");
  await dialog.getByRole("spinbutton").nth(1).fill("3.5");
  await dialog.locator("textarea").fill("PO fixture giữ nguyên");
  await dialog.getByRole("button", { name: "Phát Hành Đơn Hàng", exact: true }).click();
  await expect.poll(() => state.payloads.length).toBe(1);
  expect(state.payloads[0]).toEqual({
    supplierId: 77,
    contractId: null,
    expectedDate: null,
    note: "PO fixture giữ nguyên",
    items: [{ materialId: material.id, qtyOrdered: 2, unitPrice: 3.5 }],
  });
  await expect(page.getByText("1 Mục", { exact: true })).toBeVisible();
  await expect(page.getByText("1 Đơn", { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});
