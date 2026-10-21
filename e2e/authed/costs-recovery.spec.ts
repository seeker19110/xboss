import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Lớp B của A4 §5: browser thật, giữ/đảo phản hồi HTTP để kiểm việc khôi phục và số liệu cũ.
// Dữ liệu chỉ là fixture response; không ghi chứng từ hay thay đổi dữ liệu tài chính trong DB.
test.use({ serviceWorkers: "block", reducedMotion: "reduce" });

function report(label = "Điện fixture", groupBy: "system" | "floor" = "system") {
  const totals = {
    budget: "1000.00",
    committed: "500.00",
    actual: "250.00",
    approvedUnpaid: "50.00",
  };
  return {
    rows: [
      {
        key: label,
        label,
        systemCode: null,
        unassigned: false,
        level: "none",
        usagePct: 50,
        ...totals,
      },
    ],
    selectedTotals: totals,
    projectTotals: totals,
    settings: { warnPct: 90, overPct: 100 },
    alerts: [],
    groupBy,
    metadata: {
      coverage: {
        reconciled: true,
        invalidScope: { boqItems: 0, poItems: 0, floorContracts: 0, payments: 0 },
        invalidQuantity: { poItems: 0 },
      },
    },
  };
}

async function mockCommercial(page: Page) {
  await page.route("**/api/contracts", (route) =>
    route.fulfill({
      json: {
        contracts: [
          {
            id: 1,
            code: "HD-FIXTURE",
            title: "Hợp đồng fixture",
            value: "1000.00",
            valueText: "1000.00",
            paid: "0.00",
            status: "active",
          },
        ],
      },
    }),
  );
  await page.route("**/api/insurance-bonds", (route) =>
    route.fulfill({ json: { items: [{ id: 1, kindLabel: "Bảo lãnh fixture", amount: 1000 }] } }),
  );
}

test.describe("Chi phí: khôi phục tải và giữ đúng báo cáo", () => {
  for (const failure of ["http", "network"] as const) {
    test(`${failure}: báo lỗi rồi Thử lại lấy được báo cáo`, async ({ page }) => {
      let calls = 0;
      await page.route(
        (url) => url.pathname === "/api/costs",
        async (route) => {
          calls += 1;
          if (calls === 1) {
            if (failure === "network") return route.abort("failed");
            return route.fulfill({ status: 503, json: { error: "fixture" } });
          }
          expect(route.request().headers()["x-xboss-money-format"]).toBe("decimal-string-v1");
          return route.fulfill({ json: report() });
        },
      );

      await page.goto("/costs");
      await expect(page.getByText("Đã xảy ra lỗi tải dữ liệu", { exact: true })).toBeVisible();
      await expect(page.getByText("Chưa có dữ liệu chi phí", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Thử lại", exact: true }).click();
      await expect(page.getByRole("row").filter({ hasText: "Điện fixture" })).toBeVisible();
      await expect(page.getByText("Đã duyệt chưa chi", { exact: true })).toBeVisible();
      expect(calls).toBe(2);
    });
  }

  test("đổi nhóm nhanh: phản hồi tầng cũ không ghi đè báo cáo hệ mới", async ({ page }) => {
    // Vẫn dùng HTTP thật, nhưng giữ request cũ dù client huỷ: generation phải bảo vệ cả
    // trường hợp response đã tới nơi/transport không còn huỷ được khi đổi lựa chọn.
    await page.addInitScript(() => {
      const originalFetch = window.fetch;
      window.fetch = (input, init) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          location.href,
        );
        return originalFetch(
          input,
          url.pathname === "/api/costs" ? { ...init, signal: undefined } : init,
        );
      };
    });
    let systemCalls = 0;
    let releaseFloor!: () => void;
    let floorStarted!: () => void;
    let floorFinished!: () => void;
    const heldFloor = new Promise<void>((resolve) => {
      releaseFloor = resolve;
    });
    const started = new Promise<void>((resolve) => {
      floorStarted = resolve;
    });
    const finished = new Promise<void>((resolve) => {
      floorFinished = resolve;
    });
    await page.route(
      (url) => url.pathname === "/api/costs",
      async (route) => {
        if (new URL(route.request().url()).searchParams.get("groupBy") === "floor") {
          floorStarted();
          await heldFloor;
          // Request đã bị huỷ vẫn phải giải phóng handler để test không để công việc dở.
          await route.fulfill({ json: report("Tầng phản hồi cũ", "floor") }).catch(() => {});
          floorFinished();
          return;
        }
        systemCalls += 1;
        await route.fulfill({ json: report(systemCalls === 1 ? "Hệ ban đầu" : "Hệ mới nhất") });
      },
    );

    await page.goto("/costs");
    await expect(page.getByRole("row").filter({ hasText: "Hệ ban đầu" })).toBeVisible();
    try {
      // Hai thao tác cùng lượt sự kiện mô phỏng đổi lựa chọn trước lần render loading.
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        buttons.find((b) => b.textContent?.trim() === "Theo tầng")!.click();
        buttons.find((b) => b.textContent?.trim() === "Theo hệ")!.click();
      });
      await started;
      await expect(page.getByRole("row").filter({ hasText: "Hệ mới nhất" })).toBeVisible();
      const staleResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/costs" &&
          new URL(response.url()).searchParams.get("groupBy") === "floor",
      );
      releaseFloor();
      await finished;
      await (await staleResponse).finished();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(page.getByRole("row").filter({ hasText: "Tầng phản hồi cũ" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Theo hệ", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      releaseFloor();
    }
  });

  test("đối soát hiện trước KPI, mở chi tiết bằng bàn phím và giữ a11y", async ({
    page,
    isMobile,
  }) => {
    const data = report();
    data.metadata.coverage.reconciled = false;
    data.metadata.coverage.invalidScope.payments = 1;
    await page.route(
      (url) => url.pathname === "/api/costs",
      (route) => route.fulfill({ json: data }),
    );
    await page.goto("/costs");
    const alert = page.getByRole("alert").filter({ hasText: "Báo cáo cần đối soát" });
    await expect(alert).toBeVisible();
    const beforeKpi = await alert.evaluate((node) => {
      const kpi = Array.from(document.querySelectorAll("main span")).find(
        (el) => el.textContent === "Tổng ngân sách dự án",
      );
      return !!kpi && !!(node.compareDocumentPosition(kpi) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(beforeKpi).toBe(true);

    const detail = page.getByRole("button", { name: "Xem chi tiết Điện fixture", exact: true });
    await detail.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Điện fixture", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("1.000 đ", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
    await page.getByRole("button", { name: "Sửa ngưỡng cảnh báo" }).click();
    const input = page.getByLabel("Cảnh báo khi cam kết đạt (%)", { exact: true });
    await expect(input).toHaveAttribute("inputmode", "decimal");
    if (isMobile)
      expect(
        await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ).toBeGreaterThanOrEqual(16);
  });

  for (const failure of ["http", "network"] as const) {
    test(`commercial ${failure}: costs lỗi vẫn xem HĐ/bảo lãnh, retry riêng chi phí`, async ({
      page,
    }) => {
      await mockCommercial(page);
      let calls = 0;
      await page.route(
        (url) => url.pathname === "/api/costs",
        (route) => {
          calls += 1;
          if (calls > 1) return route.fulfill({ json: report() });
          return failure === "network"
            ? route.abort("failed")
            : route.fulfill({ status: 503, json: { error: "fixture" } });
        },
      );
      await page.goto("/commercial?sub=costs");
      await expect(page.getByText("Đã xảy ra lỗi tải dữ liệu", { exact: true })).toBeVisible();
      await expect(page.getByText("Chưa có dữ liệu hạn mức chi phí.", { exact: true })).toHaveCount(
        0,
      );
      await page.getByRole("button", { name: /Hợp Đồng \(1\)/ }).click();
      await expect(page.getByRole("cell", { name: "HD-FIXTURE", exact: true })).toBeVisible();
      await page.getByRole("button", { name: /Bảo Lãnh.*\(1\)/ }).click();
      await expect(page.getByRole("cell", { name: "Bảo lãnh fixture", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Hạn Mức Chi Phí", exact: true }).click();
      await page.getByRole("button", { name: "Thử lại", exact: true }).click();
      await expect(page.getByRole("row").filter({ hasText: "Điện fixture" })).toBeVisible();
      expect(calls).toBe(2);
    });
  }

  test("commercial: tiền làm tròn exact, null giữ che và có cảnh báo đối soát", async ({
    page,
  }) => {
    await mockCommercial(page);
    const data = report("Dòng tiền exact");
    data.rows[0].budget = "1005000000.00"; // 1,005 tỷ: Number.toFixed(2) cũ làm xuống 1,00.
    data.rows[0].committed = "0.00";
    data.rows[0].actual = "0.00";
    const masked = {
      ...data.rows[0],
      key: "masked",
      label: "Dòng bị che",
      budget: null,
      committed: null,
      actual: null,
      usagePct: null,
    };
    data.metadata.coverage.reconciled = false;
    await page.route(
      (url) => url.pathname === "/api/costs",
      (route) => route.fulfill({ json: { ...data, rows: [...data.rows, masked] } }),
    );
    await page.goto("/commercial?sub=costs");
    const exact = page.getByRole("row").filter({ hasText: "Dòng tiền exact" });
    await expect(exact.getByRole("cell").nth(1)).toHaveText("1,01 tỷ");
    await expect(exact.getByRole("cell").nth(1)).toHaveAttribute("title", "1.005.000.000 đ");
    const hidden = page.getByRole("row").filter({ hasText: "Dòng bị che" });
    for (const index of [1, 2, 3, 4])
      await expect(hidden.getByRole("cell").nth(index)).toHaveText("—");
    await expect(
      page.getByRole("alert").filter({ hasText: "Báo cáo chi phí cần đối soát" }),
    ).toBeVisible();
  });
});
