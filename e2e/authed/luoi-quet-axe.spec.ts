import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Lưới quét axe tham số hoá (W4, GĐ2 "nâng tầm dự án") — bịt lỗ hổng docs/audit.md §5:
// spec axe được tuyên bố là cổng merge nhưng ~35 trang app/engineering/* cùng hub
// site/commercial/governance/mepf-process... chưa từng có spec nào quét (chính là nơi
// tập trung nhiều nhất vi phạm màu chữ trắng/nền accent sáng mà GĐ1 phải sửa ở 57 file —
// không ngẫu nhiên, chưa có trọng tài).
//
// Viết 45 spec thủ công không khả thi — loop qua danh sách route tĩnh, mỗi route:
// goto → chờ nội dung chính render thật (KHÔNG chỉ networkidle, trang rỗng cũng "idle") →
// axe quét serious/critical. Route ĐỘNG cần seed riêng (vd /engineering/*/[id]) không có
// trong danh sách — ngoài phạm vi route tĩnh của spec này.
//
// Kết quả chạy thật lần đầu (Postgres cổng 55504, 24-08-2026, desktop + mobile):
// 10 trang XANH thật, 41 trang ĐỎ — đa số cùng 1 nguyên nhân gốc: badge lọc-theo-vai-trò
// trong EngineeringNav.tsx (~dòng 616-618) dùng "bg-emerald-950/50 text-emerald-300" (nền
// trong suốt trộn màu tuỳ backdrop từng theme, không nằm trong bảng đã kiểm ở audit.md) —
// tương phản đo được chỉ 2,31:1 (cần 4,5:1) trên gần 30 trang /engineering/*.
//
// ĐÃ SỬA (24-08-2026): đổi cặp màu badge đó sang cặp đã kiểm sẵn ở docs/audit.md §13.3 —
// "bg-emerald-700 text-on-accent" (nền đặc, không phụ thuộc backdrop) = 5,48:1 mọi theme,
// đúng cặp pill "đang chọn" ngay phía trên trong cùng file (EngineeringNav.tsx dòng ~586).
// Icon UserCheck đổi màu theo cùng điều kiện. Đo lại: 15/41 trang chỉ có đúng 1 vi phạm
// này tự XANH — đã chuyển từ `test.fixme` sang assert thật (xem OK_ROUTES). Trang có thêm
// badge/nút RIÊNG cùng kiểu "-950/50 + accent-300" ở code của chính trang đó (không phải
// EngineeringNav) vẫn còn đỏ — sửa từng cái là việc lẻ theo trang, ngoài phạm vi ở đây.
//
// `.sidebar-label` (ProjectSwitcher/AppHeader) — đo tương phản 1,02:1 (fg #f1f5f9 / bg #f6f7f9) trên span
// KHÔNG có class màu chữ tường minh, chỉ kế thừa `color`. Đã kiểm computed style qua CDP ở
// trạng thái ổn định: `--foreground`/`--color-zinc-100` của html.light đúng
// (#14171d/#232833), span kế thừa màu ĐÚNG — không tái hiện được #f1f5f9 khi soi thủ công
// nhiều lần. Nghi lỗi THOÁNG QUA lúc hydrate/chuyển trạng thái loading→loaded của
// ProjectSwitcher (axe chụp đúng khoảnh khắc đó) — không phải 1 chỗ đổi class là xong, cần
// điều tra thời điểm re-render riêng. KHÔNG "gọn" như badge trên nên GIỮ NGUYÊN fixme,
// không tự sửa (đúng luật "đụng nhiều nơi/không chắc nguyên nhân thì dừng lại và báo").
//
// Còn lại: input/select thiếu <label> (rule "label"/"select-name") và icon-button thiếu
// accessible name (rule "button-name") rải rác ở nhiều trang autocomplete/form — lỗi lẻ
// theo từng trang, KHÔNG sửa ở việc này (ngoài phạm vi W4).

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// Chờ nội dung chính render thật — KHÔNG dùng networkidle vì trang rỗng cũng "idle" ngay
// sau khi mount. Tiêu chí: (1) skeleton tải "Đang tải" (PageSkeleton, aria-label cố định
// dùng chung mọi trang) nếu có phải biến mất, (2) main/body phải có nội dung văn bản thật
// sự đáng kể (không phải div rỗng) — bám cùng logic PageSkeleton ở app/components/Skeleton.tsx.
async function waitForContentReady(page: Page) {
  await page.waitForFunction(
    () => {
      const skeleton = document.querySelector('[aria-label="Đang tải"]');
      if (skeleton) return false;
      const root = document.querySelector("main") ?? document.body;
      return (root?.textContent?.trim().length ?? 0) > 40;
    },
    { timeout: 20_000 },
  );
}

async function analyzeSerious(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

async function scanRoute(page: Page, path: string) {
  await page.goto(path);
  await waitForContentReady(page);
  const serious = await analyzeSerious(page);
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

type Route = { path: string; name: string };

// ── Trang XANH thật — chạy thật, chờ nội dung, quét axe, assert rỗng (không fixme). ──
// 10 trang gốc + 11 trang tự xanh sau khi sửa badge EngineeringNav (xem comment đầu file).
// (5 trong số 11 — memory/prescriptive/quantum-hub/suggestions/swarm — đã bị xoá khỏi sản
// phẩm cùng route/UI của chúng, nên đã bỏ khỏi danh sách dưới đây.)
const OK_ROUTES: Route[] = [
  { path: "/site", name: "Hub Hiện trường (site)" },
  { path: "/commercial", name: "Hub Thương mại (commercial)" },
  { path: "/governance", name: "Quản trị dự án (governance)" },
  { path: "/engineering-intelligence", name: "Trí tuệ kỹ thuật (tổng quan)" },
  // Biến thể DrawingsPage theo fixedKind — cùng component /ban-ve nhưng route riêng.
  { path: "/mo-hinh-bim", name: "Mô hình BIM" },
  { path: "/shopdrawings", name: "Bản vẽ shop drawing" },
  { path: "/ban-ve-hoan-cong", name: "Bản vẽ hoàn công" },
  { path: "/ban-ve-thiet-ke", name: "Bản vẽ thiết kế" },
  { path: "/bien-phap-thi-cong", name: "Biện pháp thi công" },
  { path: "/engineering/mepf-lifecycle", name: "Vòng đời MEPF" },
  // 11 trang chuyển từ fixme → xanh thật sau khi sửa badge EngineeringNav (24-08-2026):
  { path: "/engineering/agent-sessions", name: "Phiên AI Agent" },
  { path: "/engineering/data-quality", name: "Chất lượng dữ liệu" },
  { path: "/engineering/workflows", name: "Quy trình tự động (workflows)" },
  // Audit layout 2026-10-01: quét lại trên bản production (light + darkblue, desktop + mobile)
  // — hub /engineering đã xanh thật (card/badge riêng được sửa ở các đợt sau), bỏ fixme.
  { path: "/engineering", name: "Hub Kỹ thuật số (engineering)" },
  // 2026-10-03: sửa trang (label/aria-label cho input/select, badge dùng công thức Chip) → xanh thật.
  { path: "/engineering/bidding-matrix", name: "Ma trận đấu thầu" },
  { path: "/engineering/cashflow", name: "Dòng tiền động" },
  { path: "/engineering/esign", name: "Chữ ký điện tử (esign)" },
  { path: "/mepf-process", name: "Quy trình MEPF" },
];

test.describe("Lưới quét axe — các trang chưa phủ (sau đăng nhập)", () => {
  for (const route of OK_ROUTES) {
    test(`${route.name} (${route.path}) không có vi phạm a11y nghiêm trọng (axe)`, async ({
      page,
    }) => {
      await scanRoute(page, route.path);
    });
  }

  // ── 41 trang ĐỎ — fixme kèm vi phạm cụ thể đo được (đo bằng script node đứng ngoài
  // Playwright test runner + axe-core, cùng logic waitForContentReady, cổng 55504,
  // 24-08-2026). Số node có thể lệch ±vài đơn vị giữa các lần chạy vì một số phần tử theo
  // enable trạng thái, nhưng RULE ID thì lặp lại nhất quán. Giữ nguyên thân test thật (không
  // xoá) — chỉ cần bỏ dòng `test.fixme(...)` đầu thân khi trang được sửa xong. ──

  const RED_ROUTES: { path: string; name: string; violations: string }[] = [
    {
      path: "/schedule",
      name: "Lịch trình (schedule)",
      violations:
        "color-contrast — quan sát ĐỎ nhất quán khi chạy qua Playwright test runner song song (2 worker, 52 node vi phạm), nhưng KHÔNG tái hiện khi quét cô lập bằng script node đơn (0 vi phạm, thử lại 3 lần) hay ở project mobile. Nghi ngờ đua dữ liệu/thời điểm animate progress bar (transition-all duration-500, dòng ~240 app/schedule/page.tsx) khi nhiều worker chạy song song — CHƯA xác định được nguyên nhân gốc chắc chắn, để fixme thay vì assert có thể flaky đỏ oan trong CI.",
    },
  ];

  for (const route of RED_ROUTES) {
    test(`${route.name} (${route.path}) không có vi phạm a11y nghiêm trọng (axe)`, async ({
      page,
    }) => {
      // Đỏ thật, đã đo (xem `violations`) — a11y ~41 trang là việc riêng ngoài phạm vi W4.
      // Thân test GIỮ NGUYÊN (không xoá) để spec chạy thật ngay khi bỏ dòng fixme dưới đây.
      test.fixme(true, route.violations);
      await scanRoute(page, route.path);
    });
  }

  // Route ĐỘNG /work-fronts/[floor] — không bịa id, đi qua UI thật từ /work-fronts (đã có
  // dữ liệu seed cố định — xem work-fronts.spec.ts) để lấy đúng đường dẫn tầng thật.
  test("Mặt bằng thi công — chi tiết 1 tầng ([floor]) không có vi phạm a11y nghiêm trọng (axe)", async ({
    page,
  }) => {
    await page.goto("/work-fronts");
    const region = page.getByRole("region", { name: "Ma trận mặt bằng thi công" });
    await expect(region).toBeVisible({ timeout: 15_000 });
    const firstFloorLink = region.locator("tbody tr").first().locator("a").first();
    await firstFloorLink.click();
    await expect(page).toHaveURL(/\/work-fronts\/.+/);
    await waitForContentReady(page);
    const serious = await analyzeSerious(page);
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
