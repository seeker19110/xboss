import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CAN } from "@/lib/bao-mat/auth";
import { VIEW_ONLY_ROLES } from "@/lib/nen/roles";

// ─────────────────────────────────────────────────────────────────────────────
// Hồi quy đợt audit toàn dự án 2026-09-05 (docs/audit.md §3/§4). Các lỗ hổng đã sửa:
//   1. ~20 handler GHI của nhánh engineering gate bằng `CAN.viewEngineeringGraph` —
//      quyền XEM có cả `bch` (VIEW_ONLY_ROLES) → vai trò chỉ-xem ghi được dữ liệu.
//   2. DELETE /api/floor-approvals/:id thiếu cách ly dự án (3 route anh em đều có).
//   3. Cùng route: chuỗi huỷ nghiệm thu không bọc transaction + FOR UPDATE.
//   4. listCrossProjectLessons không lọc dự án → rò rỉ bài học xuyên tổ chức.
//   5. POST memory/lessons lấy thẳng sourceProjectId từ body.
//   8. GET /api/suppliers/:id/summary trả công nợ cho mọi vai trò, không lọc dự án.
// ─────────────────────────────────────────────────────────────────────────────

const goc = new URL("../", import.meta.url).pathname;
const doc = (p: string) => readFileSync(join(goc, p), "utf8");

// Duyệt cây route, trả về [đường dẫn, nội dung] của mọi route.ts.
function moiRoute(thuMuc: string): [string, string][] {
  const kq: [string, string][] = [];
  for (const e of readdirSync(join(goc, thuMuc), { withFileTypes: true })) {
    const p = `${thuMuc}/${e.name}`;
    if (e.isDirectory()) kq.push(...moiRoute(p));
    else if (e.name === "route.ts") kq.push([p, doc(p)]);
  }
  return kq;
}

// Cắt file route thành từng handler HTTP để soi riêng cổng quyền của mỗi method.
function tachHandler(src: string): { method: string; than: string }[] {
  const phan = src.split(/\nexport async function (GET|POST|PATCH|PUT|DELETE)\b/);
  const kq: { method: string; than: string }[] = [];
  for (let i = 1; i < phan.length; i += 2) kq.push({ method: phan[i], than: phan[i + 1] });
  return kq;
}

describe("audit 2026-09-05 — cổng quyền & cách ly dữ liệu", () => {
  it("ca 1 — quyền GHI của track engineering loại hết vai trò chỉ-xem và subcon", () => {
    for (const r of [...VIEW_ONLY_ROLES, "subcon"] as const) {
      assert.equal(CAN.manageEngineeringGraph(r), false, `${r} không được ghi`);
    }
    for (const r of ["admin", "pm", "engineer"] as const) {
      assert.equal(CAN.manageEngineeringGraph(r), true, `${r} phải ghi được`);
    }
    // Quyền XEM vẫn mở cho bch — đây là điểm khiến việc dùng nó làm cổng ghi là lỗi.
    assert.equal(CAN.viewEngineeringGraph("bch"), true);
  });

  it("ca 2 — không handler ghi nào còn gate bằng quyền XEM viewEngineeringGraph", () => {
    const pham: string[] = [];
    for (const [p, src] of moiRoute("app/api")) {
      for (const { method, than } of tachHandler(src)) {
        if (method !== "GET" && than.includes("CAN.viewEngineeringGraph")) {
          pham.push(`${p} ${method}`);
        }
      }
    }
    assert.deepEqual(pham, [], `handler ghi phải dùng CAN.manageEngineeringGraph: ${pham}`);
  });

  it("ca 3 — DELETE floor-approvals: cách ly dự án + transaction + FOR UPDATE", () => {
    const src = doc("app/api/floor-approvals/[id]/route.ts");
    assert.ok(src.includes("sheetTypeProjectId"), "phải đối chiếu dự án của sheet");
    assert.ok(src.includes("getCurrentProjectId"), "phải lấy dự án đang chọn");
    assert.ok(src.includes("withTransaction"), "chuỗi huỷ phải nằm trong 1 transaction");
    assert.ok(/FOR UPDATE/.test(src), "phải khoá bản ghi trước khi đọc-sửa-ghi");
  });

  it("ca 4 — bài học xuyên dự án luôn phải lọc theo danh sách dự án được thấy", () => {
    const lib = doc("lib/ky-thuat/engineering-memory-bank.ts");
    assert.ok(
      /export async function listCrossProjectLessons\([\s\S]*?projectIds: number\[\]/.test(lib),
      "listCrossProjectLessons phải nhận projectIds (bắt buộc, không tuỳ chọn)",
    );
    assert.ok(
      lib.includes("if (projectIds.length === 0) return [];"),
      "không thấy dự án nào → trả rỗng, không trả toàn bộ bảng",
    );
    for (const p of [
      "app/api/engineering/memory/lessons/route.ts",
      "app/api/engineering/memory/transfer/route.ts",
    ]) {
      assert.ok(doc(p).includes("visibleProjectIds"), `${p} phải truyền dự án được thấy`);
    }
    assert.ok(
      doc("app/api/engineering/memory/lessons/route.ts").includes("chotProjectIdChoGhi"),
      "POST không được tin sourceProjectId từ body",
    );
  });

  it("ca 5 — công nợ NCC gate bằng CAN.viewPayments và lọc theo dự án", () => {
    const src = doc("app/api/suppliers/[id]/summary/route.ts");
    assert.ok(src.includes("CAN.viewPayments"), "khối tiền phải gate bằng quyền xem thanh toán");
    assert.ok(src.includes("getCurrentProjectId"), "công nợ phải lọc theo dự án đang chọn");
    const lib = doc("lib/tai-chinh/procurement.ts");
    assert.ok(
      /supplierSummary\(\s*supplierId: number,\s*projectId: number/.test(lib),
      "supplierSummary phải nhận projectId bắt buộc",
    );
    // Vai trò chỉ-xem/subcon không có quyền xem tiền → API trả null cho khối tiền.
    for (const r of [...VIEW_ONLY_ROLES.filter((x) => x !== "bch"), "subcon"] as const) {
      assert.equal(CAN.viewPayments(r), false, `${r} không được xem tiền`);
    }
  });

  it("ca 6 — tiền không được cộng/nhân trên float JS ở so sánh thầu & công nợ", () => {
    const tender = doc("lib/tai-chinh/tender.ts");
    assert.ok(
      /SUM\(bp\.unit_price \* ti\.qty\)[\s\S]*?::text/.test(tender),
      "tổng giá chào phải tính trong SQL rồi ::text (xếp hạng nhà thầu)",
    );
    assert.ok(
      !/prices\[it\.boqItemId\] \* it\.qty/.test(tender),
      "không được nhân đơn giá × khối lượng trên float JS",
    );
    for (const p of ["lib/tai-chinh/procurement.ts", "lib/tai-chinh/finance.ts"]) {
      assert.ok(doc(p).includes("parseMoney"), `${p} phải trừ tiền qua lib/nen/money.ts`);
    }
  });

  it("ca 7 — mốc 'hôm nay' của nhánh engineering theo giờ VN, không theo UTC máy chủ", () => {
    assert.ok(
      doc("lib/ky-thuat/engineering-mepf-predictive.ts").includes("daysFromTodayISO"),
      "ngày bảo dưỡng kế tiếp phải dùng helper giờ VN",
    );
    const ev = doc("app/api/engineering/subcon-ai/evaluate/route.ts");
    assert.ok(ev.includes("todayISO().slice(0, 7)"), "kỳ đánh giá YYYY-MM phải theo giờ VN");
    assert.ok(!/now\.getFullYear\(\)/.test(ev), "không dựng kỳ từ giờ máy chủ");
  });
});
