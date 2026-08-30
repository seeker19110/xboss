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
// `.sidebar-label` (ProjectSwitcher/AppHeader, vd /engineering/cad-corridor,
// /engineering/zero-error) — đo tương phản 1,02:1 (fg #f1f5f9 / bg #f6f7f9) trên span
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

// ── 25 trang XANH thật — chạy thật, chờ nội dung, quét axe, assert rỗng (không fixme). ──
// 10 trang gốc + 15 trang tự xanh sau khi sửa badge EngineeringNav (xem comment đầu file).
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
  // 15 trang chuyển từ fixme → xanh thật sau khi sửa badge EngineeringNav (24-08-2026):
  { path: "/engineering/agent-sessions", name: "Phiên AI Agent" },
  { path: "/engineering/autonomy", name: "Quyền tự chủ AI (autonomy)" },
  { path: "/engineering/bim-viewer", name: "BIM Viewer" },
  { path: "/engineering/data-quality", name: "Chất lượng dữ liệu" },
  { path: "/engineering/graph", name: "Đồ thị tri thức (graph)" },
  { path: "/engineering/memory", name: "Bộ nhớ AI (memory)" },
  { path: "/engineering/predictions", name: "Dự đoán (predictions)" },
  { path: "/engineering/prescriptive", name: "Kê đơn (prescriptive)" },
  { path: "/engineering/quantum-hub", name: "Quantum Hub" },
  { path: "/engineering/reality", name: "Thực tế hỗn hợp (reality)" },
  { path: "/engineering/scan-to-bim", name: "Scan-to-BIM" },
  { path: "/engineering/suggestions", name: "Gợi ý AI (suggestions)" },
  { path: "/engineering/swarm", name: "Swarm" },
  { path: "/engineering/twin", name: "Digital Twin" },
  { path: "/engineering/workflows", name: "Quy trình tự động (workflows)" },
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
      path: "/mepf-process",
      name: "Quy trình MEPF",
      violations:
        "color-contrast x6 (đã giảm từ x8 sau khi sửa badge EngineeringNav — còn lại là badge/nút RIÊNG của trang này cùng kiểu -950/50+accent-300, không phải EngineeringNav) — vd .sm:inline, chữ #065f46 trên nền hiệu dụng #7b928d = 2.31:1 (cần 4,5:1).",
    },
    {
      path: "/combine",
      name: "Kết hợp mô hình (Combine/Clash)",
      violations:
        "color-contrast x7 — vd badge bg-rose-500/10 border-rose-500/20, chữ #cb4163 trên nền #fceaef = 4.05:1 (cần 4,5:1), cỡ chữ 10px in đậm. KHÔNG liên quan badge EngineeringNav (trang này không dùng EngineeringNav).",
    },
    {
      path: "/schedule",
      name: "Lịch trình (schedule)",
      violations:
        "color-contrast — quan sát ĐỎ nhất quán khi chạy qua Playwright test runner song song (2 worker, 52 node vi phạm), nhưng KHÔNG tái hiện khi quét cô lập bằng script node đơn (0 vi phạm, thử lại 3 lần) hay ở project mobile. Nghi ngờ đua dữ liệu/thời điểm animate progress bar (transition-all duration-500, dòng ~240 app/schedule/page.tsx) khi nhiều worker chạy song song — CHƯA xác định được nguyên nhân gốc chắc chắn, để fixme thay vì assert có thể flaky đỏ oan trong CI.",
    },
    {
      path: "/engineering",
      name: "Hub Kỹ thuật số (engineering)",
      violations:
        "color-contrast x5 (đã giảm từ x6 sau khi sửa badge EngineeringNav — còn lại là card/badge riêng của trang hub, không phải EngineeringNav).",
    },
  ];

  const ENG_FIXME: { path: string; name: string; violations: string }[] = [
    {
      path: "/engineering/auto-routing",
      name: "Định tuyến ống tự động",
      violations:
        "button-name x1 (icon-button không có accessible name) + color-contrast x1 (đã giảm từ x2 sau khi sửa badge EngineeringNav, còn 1 node riêng của trang) + label x11 (input số không có <label>) + select-name x2 (select không có <label>).",
    },
    {
      path: "/engineering/bidding-matrix",
      name: "Ma trận đấu thầu",
      violations:
        "color-contrast x1 (đã giảm từ x2 sau khi sửa badge EngineeringNav) + select-name x1 (select thiếu <label>).",
    },
    {
      path: "/engineering/bim",
      name: "BIM",
      violations:
        "select-name x2 (select thiếu <label>) — color-contrast (badge EngineeringNav) đã hết sau khi sửa, chỉ còn select-name.",
    },
    {
      path: "/engineering/cad-corridor",
      name: "Hành lang CAD",
      violations:
        "color-contrast x21 (đã giảm từ x37 sau khi sửa badge EngineeringNav) — RIÊNG, KHÔNG phải badge nav: '.sidebar-label' (AppHeader/ProjectSwitcher) chữ #f1f5f9 trên nền #f6f7f9 = 1.02:1 (gần vô hình). Đã kiểm computed style qua CDP ở trạng thái ổn định — CSS var đúng, không tái hiện được khi soi thủ công — nghi lỗi thoáng qua lúc hydrate ProjectSwitcher, KHÔNG sửa gọn được (xem comment đầu file) + label x4 (input số thiếu <label>).",
    },
    {
      path: "/engineering/cad-nesting",
      name: "Xếp hình CAD (nesting)",
      violations:
        'aria-prohibited-attr x1 (div[aria-label="Đang tải"] — PageSkeleton dùng aria-label trên div không có role hợp lệ, xem app/components/Skeleton.tsx) — color-contrast (badge EngineeringNav) đã hết sau khi sửa.',
    },
    {
      path: "/engineering/cad-tracking",
      name: "Theo dõi CAD",
      violations:
        "color-contrast x2 (đã giảm từ x3 sau khi sửa badge EngineeringNav) + select-name x1 (select thiếu <label>).",
    },
    {
      path: "/engineering/cashflow",
      name: "Dòng tiền động",
      violations:
        "color-contrast x1 (đã giảm từ x2 sau khi sửa badge EngineeringNav) — bg-amber-950/80, chữ #92400e trên nền #694533 = 1.18:1 + label x5 (input text thiếu <label>).",
    },
    {
      path: "/engineering/chuan-hoa-ban-ve",
      name: "Chuẩn hoá bản vẽ (đối chiếu — đã có spec chuan-hoa-ban-ve.spec.ts riêng)",
      violations:
        "color-contrast x1 — badge viền zinc-700, chữ #67707c trên nền #dde2ea = 3.85:1 (cần 4,5:1). KHÔNG liên quan badge EngineeringNav. Đưa vào lưới chung để cùng 1 mốc so sánh; spec riêng có phạm vi kiểm khác, KHÔNG trùng lặp.",
    },
    {
      path: "/engineering/esign",
      name: "Chữ ký điện tử (esign)",
      violations:
        "color-contrast x1 (đã giảm từ x2 sau khi sửa badge EngineeringNav) — bg-emerald-950/80, #065f46 trên #31554d = 1.07:1 + label x2 + select-name x1.",
    },
    {
      path: "/engineering/fidic-claims",
      name: "Khiếu nại FIDIC",
      violations:
        "color-contrast x2 (đã giảm từ x3 sau khi sửa badge EngineeringNav) + label x6 (input thiếu <label>) + select-name x2.",
    },
    {
      path: "/engineering/god-tier-studio",
      name: "God-tier Studio",
      violations:
        "button-name x1 (bg-sky-600, icon-button không có tên) + label x1 (input thiếu <label>). KHÔNG liên quan badge EngineeringNav.",
    },
    {
      path: "/engineering/hse-vision",
      name: "HSE Vision (AI an toàn)",
      violations:
        "color-contrast x2 (đã giảm từ x3 sau khi sửa badge EngineeringNav) — bg-rose-950/80, #be123c trên #6f3345 = 1.49:1 + label x3 (input thiếu <label>).",
    },
    {
      path: "/engineering/iot-telemetry",
      name: "IoT Telemetry",
      violations:
        "color-contrast x1 (đã giảm từ x2 sau khi sửa badge EngineeringNav) + label x1 + select-name x1.",
    },
    {
      path: "/engineering/mepf-studio",
      name: "MEPF Studio",
      violations:
        "color-contrast x5 — bg-violet-600, chữ #14171d trên #7f22fe = 3.04:1 (cần 4,5:1) + label x2. KHÔNG liên quan badge EngineeringNav (không đổi trước/sau).",
    },
    {
      path: "/engineering/nextgen-apex",
      name: "Nextgen Apex",
      violations:
        "color-contrast x3 (đã giảm từ x4 sau khi sửa badge EngineeringNav) + label x2 + select-name x1.",
    },
    {
      path: "/engineering/pipe-stash-hunter",
      name: "Pipe Stash Hunter",
      violations:
        "color-contrast x1 (đã giảm từ x2 sau khi sửa badge EngineeringNav) + label x9 (nhiều input số thiếu <label>) + select-name x1.",
    },
    {
      path: "/engineering/site-copilot",
      name: "Site Copilot",
      violations:
        "button-name x2 (icon-button thiếu tên) + color-contrast x1 (bg-violet-600, #14171d trên #7f22fe = 3.04:1). KHÔNG liên quan badge EngineeringNav (không đổi trước/sau).",
    },
    {
      path: "/engineering/spatial-viewer",
      name: "Spatial Viewer",
      violations:
        "button-name x4 (icon-button thiếu tên) + color-contrast x2 (đã giảm từ x3 sau khi sửa badge EngineeringNav) + select-name x1.",
    },
    {
      path: "/engineering/subcon-ai",
      name: "Subcon AI",
      violations:
        "color-contrast x2 (đã giảm từ x3 sau khi sửa badge EngineeringNav) + label x3 + select-name x2.",
    },
    {
      path: "/engineering/zalo-copilot",
      name: "Zalo Copilot",
      violations:
        "color-contrast x3 — bg-blue-950/80, chữ #2563eb trên nền #434f76 = 1.55:1. KHÔNG liên quan badge EngineeringNav.",
    },
    {
      path: "/engineering/zero-error",
      name: "Zero Error",
      violations:
        "color-contrast x32 (không đổi đáng kể — không phải badge EngineeringNav) — cùng lỗi '.sidebar-label' như /engineering/cad-corridor (1.02:1, xem comment đầu file) + label x4.",
    },
  ];

  for (const route of [...RED_ROUTES, ...ENG_FIXME]) {
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
    test.fixme(
      true,
      "color-contrast x21-44 (dao động theo số hàng công tác của tầng) — vd .text-zinc-600 trên nền .bg-zinc-950/50, cùng lớp 'chữ xám nhạt trên nền tối nhạt' GĐ1 đã sửa ở nơi khác nhưng chưa áp dụng cho trang chi tiết tầng này.",
    );
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
