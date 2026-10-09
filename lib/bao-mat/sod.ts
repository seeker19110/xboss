// lib/sod.ts — M50 PR3: báo cáo phân tách nhiệm vụ (Separation of Duties) mềm cho kiểm
// toán. SoD CƯỠNG BỨC (creator ≠ approver) đã có trong Approval Engine (M46,
// approval_requests/approval_actions chặn ngay lúc duyệt — xem lib/approvals.ts). File
// này chỉ BÁO CÁO các trường hợp "mềm": dữ liệu hợp lệ về mặt kỹ thuật (không bị chặn)
// nhưng cùng 1 người vừa tạo vừa xử lý bước sau — phục vụ câu hỏi kiểm toán, không tự
// chặn ghi dữ liệu.
//
// Mỗi rule = 1 câu SQL (qua lib/db, placeholder `?`, KHÔNG nối chuỗi giá trị) + mô tả
// tiếng Việt. Chỉ dựa cột CÓ THẬT trong schema — rule nào thiếu cột người-thực-hiện cần
// đối chiếu thì BỊ BỎ, ghi chú ngay bên dưới (không tạo migration mới để chế thêm cột).
import { query, withProjectScope } from "@/lib/db";

export type SodViolation = Record<string, unknown>;
export type SodRuleResult = {
  rule: string;
  description: string;
  violations: SodViolation[];
};

type SodRule = {
  key: string;
  description: string;
  run: (days: number, orgId: number) => Promise<SodViolation[]>;
};

const RULES: SodRule[] = [
  {
    key: "create_and_approve",
    description:
      "Cùng một người vừa tạo vừa duyệt cùng 1 hồ sơ: qua Approval Engine (M46, " +
      "approval_requests.created_by = approval_actions.actor_id khi decision='approve') " +
      "hoặc dữ liệu thanh toán khối lượng (IPC) từ trước M46 (payment_certs.created_by = decided_by), " +
      "hoặc chứng từ điều chỉnh/huỷ hiệu lực IPC (M128, payment_cert_adjustments.created_by = decided_by).",
    run: async (days, orgId) => {
      const [engineRows, ipcRows, adjRows] = await Promise.all([
        query<SodViolation>(
          `SELECT 'approval_engine' AS source, ar.entity_type AS "entityType",
                  ar.entity_id AS "entityId", ar.created_by AS "userId",
                  u.name AS "userName", aa.step_seq AS "stepSeq", aa.at AS "at"
             FROM approval_requests ar
             JOIN approval_actions aa ON aa.request_id = ar.id AND aa.decision = 'approve'
             JOIN users u ON u.id = ar.created_by
             JOIN projects p ON p.id = ar.project_id AND p.org_id = ?
            WHERE aa.actor_id = ar.created_by
              AND ar.created_at >= now() - make_interval(days => ?)
            ORDER BY aa.at DESC`,
          orgId,
          days,
        ),
        query<SodViolation>(
          `SELECT 'payment_cert' AS source, 'payment_cert' AS "entityType", pc.id AS "entityId",
                  pc.created_by AS "userId", u.name AS "userName", NULL::int AS "stepSeq",
                  pc.decided_at AS "at"
             FROM payment_certs pc
             JOIN users u ON u.id = pc.created_by
             JOIN contracts c ON c.id = pc.contract_id
             JOIN projects p ON p.id = c.project_id AND p.org_id = ?
            WHERE pc.decided_by IS NOT NULL
              AND pc.decided_by = pc.created_by
              AND pc.created_at >= now() - make_interval(days => ?)
            ORDER BY pc.decided_at DESC`,
          orgId,
          days,
        ),
        // M128: bảng FORCE RLS theo dự án (0168, không nhánh GUC rỗng) — báo cáo liên dự án của
        // tổ chức nên mở phạm vi '*' rồi tự lọc org qua projects, như 2 nguồn trên.
        withProjectScope("*", () =>
          query<SodViolation>(
            `SELECT 'payment_cert_adjustment' AS source,
                    'payment_cert_adjustment' AS "entityType", a.id AS "entityId",
                    a.created_by AS "userId", u.name AS "userName", NULL::int AS "stepSeq",
                    a.decided_at AS "at"
               FROM payment_cert_adjustments a
               JOIN users u ON u.id = a.created_by
               JOIN projects p ON p.id = a.project_id AND p.org_id = ?
              WHERE a.decided_by IS NOT NULL
                AND a.decided_by = a.created_by
                AND a.created_at >= now() - make_interval(days => ?)
              ORDER BY a.decided_at DESC`,
            orgId,
            days,
          ),
        ),
      ]);
      return [...engineRows, ...ipcRows, ...adjRows];
    },
  },
  {
    key: "po_create_and_receive",
    description:
      "Cùng một người vừa lập đơn mua hàng (purchase_orders.created_by) vừa ghi nhận " +
      "phiếu nhập kho nhận hàng cho chính đơn đó (warehouse_receipts.received_by).",
    run: (days, orgId) =>
      query<SodViolation>(
        `SELECT po.id AS "poId", po.po_code AS "poCode", po.created_by AS "userId",
                u.name AS "userName", wr.id AS "receiptId",
                wr.receipt_code AS "receiptCode", wr.received_at AS "at"
           FROM purchase_orders po
           JOIN warehouse_receipts wr ON wr.po_id = po.id
           JOIN users u ON u.id = po.created_by
           JOIN projects p ON p.id = po.project_id AND p.org_id = ?
          WHERE po.created_by IS NOT NULL
            AND po.created_by = wr.received_by
            AND po.created_at >= now() - make_interval(days => ?)
          ORDER BY wr.received_at DESC`,
        orgId,
        days,
      ),
  },
  // Rule "vừa ghi chi vừa duyệt chi" (cash_transactions/advances, migrations/0037_finance.sql):
  // BỊ BỎ — cả hai bảng chỉ có cột NGƯỜI GHI (cash_transactions.recorded_by,
  // advances.created_by), KHÔNG có cột người-duyệt riêng (không có quy trình duyệt chi tách
  // vai trò ở tầng schema/route hiện tại — advances chỉ có `status` open/partially_settled/
  // settled, không ai "duyệt" ghi nhận). Không có cột để đối chiếu → không viết rule, không
  // chế thêm cột (đúng phạm vi PR3). Nếu sau này M50+ thêm quy trình duyệt chi có cột
  // approved_by, bổ sung rule tại đây qua migration mới.
];

// Chạy toàn bộ rule SoD, giới hạn theo `days` (created_at gần đây) và CHỈ trong tổ chức
// `orgId` (S02 — cô lập tenant: hồ sơ suy org qua dự án; admin org khác không thấy vi phạm
// của org mình).
export async function buildSodReport(days: number, orgId: number): Promise<SodRuleResult[]> {
  const out: SodRuleResult[] = [];
  for (const r of RULES) {
    const violations = await r.run(days, orgId);
    out.push({ rule: r.key, description: r.description, violations });
  }
  return out;
}
