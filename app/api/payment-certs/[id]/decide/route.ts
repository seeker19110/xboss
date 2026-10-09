import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { gioiHanGhiTaiChinh } from "@/lib/bao-mat/ratelimit";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { todayISO } from "@/lib/nen/date";
import { log } from "@/lib/nen/log";
import { certTotals, tinhLaiLuyKeDot } from "@/lib/tai-chinh/paymentcerts";
import {
  bamYeuCauQuyetDinh,
  canhBaoDot,
  docIdempotencyKey,
  docXacNhanCanhBao,
  ghiSnapshotQuyetDinh,
  khoaHopDongVaDot,
  kiemXacNhanCanhBao,
  kySauDaDuyet,
  kyTruocConMo,
  taoOperationId,
  timQuyetDinhDaGhi,
  type KetQuaQuyetDinh,
} from "@/lib/tai-chinh/ipc-quyet-dinh";
import { fitsNumeric, moneyToDecimal } from "@/lib/nen/money";
import {
  advanceApproval,
  kiemAmountTruocKhiDuyet,
  NON_APPROVER_ROLES,
} from "@/lib/tien-do/approvals";
import { emitWebhook } from "@/lib/bao-mat/webhooks";
import type { Role } from "@/lib/nen/roles";

export const dynamic = "force-dynamic";

type Decision = "approved" | "rejected";

/** Lỗi có chủ đích: status HTTP + mã máy đọc + dữ liệu kèm (vd cảnh báo hiện hành khi 409). */
function loi(status: number, message: string, code?: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { status, code, extra });
}

// POST /api/payment-certs/:id/decide — CĐT/TVGS quyết định.
// body: { decision: 'approved'|'rejected', rejectReason?, acknowledged?, reason?, warningVersion? }
// header (tuỳ chọn): Idempotency-Key: <uuid> — retry cùng key + cùng payload trả kết quả bước
// cũ (`replayed: true`), không chạy bước kế; cùng key khác payload → 409 idempotency_conflict.
// approved sinh 1 dòng payment_bills (amount = giá trị đề nghị sau trừ tạm ứng/giữ lại) ở trạng
// thái 'committed' — M129: đã duyệt ≠ đã chi, đánh dấu chi qua POST /api/payments/bills/:id/pay;
// rejected bắt buộc rejectReason. Scoped theo dự án đang chọn (M22).
// M46 PR2: có approval_request đang pending cho IPC này → quyền/SoD do advanceApproval quyết
// định thay CAN.approve; approve ở bước CHƯA CUỐI chỉ ghi nhận bước (snapshot 'pending'), chưa
// sinh payment_bills/đổi status. reject ở bất kỳ bước nào chốt ngay.
// S13c (A5-FR06..FR09): khoá HĐ → đợt trước mọi lookup; luỹ kế tính lại dưới khoá; kỳ sau đã
// duyệt → 409 reconciliation_required; có cảnh báo vượt HĐ → phải xác nhận đúng warningVersion
// hiện tại + lý do (409 acknowledgement_required / warning_changed) — cảnh báo, không hard-cap.
// Chuyển trạng thái + phiếu + snapshot quyết định + audit trigger trong CÙNG một transaction.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const gioiHan = await gioiHanGhiTaiChinh("ipc-duyet", user.id);
  if (gioiHan)
    return NextResponse.json(
      { error: gioiHan.error },
      { status: 429, headers: { "Retry-After": gioiHan.retryAfter } },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const decision = body?.decision as Decision;
  if (decision !== "approved" && decision !== "rejected")
    return NextResponse.json({ error: "decision phải là approved/rejected" }, { status: 422 });
  const rejectReason = typeof body?.rejectReason === "string" ? body.rejectReason.trim() : "";
  if (decision === "rejected" && !rejectReason)
    return NextResponse.json({ error: "Cần nhập lý do từ chối" }, { status: 422 });
  const xacNhan = docXacNhanCanhBao(body as Record<string, unknown>);
  if (typeof xacNhan === "string") return NextResponse.json({ error: xacNhan }, { status: 422 });
  const key = docIdempotencyKey(req.headers.get("Idempotency-Key"));
  if (key === "invalid")
    return NextResponse.json(
      { error: "Idempotency-Key phải là UUID", code: "idempotency_key_invalid" },
      { status: 422 },
    );
  const operationId = key ?? taoOperationId();
  const requestHash = bamYeuCauQuyetDinh({ certId: id, decision, rejectReason, xacNhan });

  const projectId = await getCurrentProjectId(user);

  let ketQua: KetQuaQuyetDinh & { replayed?: boolean };
  try {
    ketQua = await withTransaction(async () => {
      const goc = projectId != null ? await khoaHopDongVaDot(id, projectId, user.orgId) : undefined;
      if (!goc) throw loi(404, "Không tìm thấy đợt thanh toán");

      // Retry cùng Idempotency-Key: phát lại kết quả bước đã ghi — vẫn kiểm người gọi hiện tại
      // (cùng actor, vai trò chưa đổi, còn quyền duyệt), không cho key bỏ qua quyền vừa bị thu.
      if (key) {
        const cu = await timQuyetDinhDaGhi(id, key);
        if (cu) {
          if (cu.actorId !== user.id || cu.requestHash !== requestHash)
            throw loi(
              409,
              "Idempotency-Key đã dùng cho một quyết định khác — tạo key mới cho quyết định mới",
              "idempotency_conflict",
            );
          const conQuyen =
            cu.actorRole === user.role &&
            !NON_APPROVER_ROLES.includes(user.role as Role) &&
            (cu.buoc === "engine" || CAN.approve(user.role));
          if (!conQuyen) throw loi(403, "Bạn không còn quyền duyệt đợt thanh toán này");
          return { ...cu.ketQua, replayed: true };
        }
      }

      if (goc.status !== "submitted")
        throw loi(409, "Chỉ quyết định được đợt đã trình (đã được trình CĐT/TVGS)");

      const liveRequest = await queryOne<{ id: number }>(
        `SELECT id FROM approval_requests WHERE entity_type = 'payment_cert' AND entity_id = ? AND status = 'pending'`,
        id,
      );
      let buocKetQua: KetQuaQuyetDinh;
      if (liveRequest) {
        // S13d: ngưỡng bước duyệt so theo approval_requests.amount — chốt lại theo giá trị đợt
        // HIỆN TẠI (dưới khoá HĐ → đợt) trước khi engine chọn bước, kể cả request mở/trình trước
        // bản vá S10a còn mang amount lúc lập nháp. Từ chối không phụ thuộc ngưỡng → bỏ qua. Giá
        // trị đợt tràn NUMERIC(15,2) không so ở đây (thông điệp tràn lộ độ lớn cho người thiếu
        // viewPayments): `kiemTranGiaTri` phía dưới chặn 422 và rollback cả bước, không duyệt được.
        if (decision === "approved") {
          const { periodValue } = await certTotals(id);
          if (fitsNumeric(periodValue, 15))
            await kiemAmountTruocKhiDuyet({
              entityType: "payment_cert",
              entityId: id,
              projectId: goc.projectId,
              amountMinor: periodValue,
            });
        }
        // Kiểm quyền/SoD + ghi bước TRƯỚC các kiểm nghiệp vụ dưới: người không có quyền nhận 403,
        // không thấy cảnh báo. Lỗi 409 phía sau throw → rollback cả bước vừa ghi.
        const result = await advanceApproval({
          entityType: "payment_cert",
          entityId: id,
          user,
          decision: decision === "rejected" ? "reject" : "approve",
          note: decision === "rejected" ? rejectReason : (xacNhan.reason ?? null),
        });
        buocKetQua =
          result.status === "pending"
            ? { result: "pending", currentSeq: result.currentSeq, nextRole: result.nextRole }
            : { result: decision };
      } else {
        // D01: tái kiểm với dữ liệu có hiệu lực dưới khoá HĐ → đợt, không dùng snapshot lúc
        // xác thực (admin có thể vừa siết approve trong lúc request chờ khoá).
        if (!(await kiemQuyenTaiLucGhi(() => CAN.approve(user.role))))
          throw loi(403, "Chỉ Admin/PM được duyệt đợt thanh toán");
        buocKetQua = { result: decision };
      }

      // Luỹ kế tính lại dưới khoá HĐ → đợt từ tập đợt approved kỳ trước (A5-FR06) — không dùng
      // luỹ kế lưu từ lúc nháp. Cảnh báo dựng trên đúng số này.
      await tinhLaiLuyKeDot(id);
      const canh = await canhBaoDot(id);
      if (decision === "approved") {
        const truoc = await kyTruocConMo(goc.contractId, goc.periodNo);
        if (truoc)
          throw loi(
            409,
            `Đợt ${truoc.code} (kỳ ${truoc.periodNo}) của hợp đồng này đang ` +
              `${truoc.status === "draft" ? "nháp" : "chờ duyệt"} — duyệt hoặc từ chối kỳ trước rồi mới duyệt kỳ này`,
            "previous_period_open",
          );
        const sau = await kySauDaDuyet(goc.contractId, goc.periodNo);
        if (sau)
          throw loi(
            409,
            `Đợt ${sau.code} (kỳ ${sau.periodNo}) của hợp đồng này đã được duyệt — không duyệt kỳ trước sau kỳ sau. ` +
              "Cần đối soát: từ chối đợt này và lập chứng từ điều chỉnh",
            "reconciliation_required",
          );
        // Dữ liệu đợt không lưu được (tràn NUMERIC) là lỗi 422 TRƯỚC chuyện xác nhận cảnh báo.
        kiemTranGiaTri(id, await certTotals(id), user.role);
        const loiXacNhan = kiemXacNhanCanhBao(canh, xacNhan);
        if (loiXacNhan)
          throw loi(409, loiXacNhan.message, loiXacNhan.code, {
            vuotHopDong: canh.vuotHopDong,
            warningVersion: canh.warningVersion,
          });
      }

      let paymentBillId: number | null = null;
      if (buocKetQua.result === "rejected") {
        await run(
          `UPDATE payment_certs SET status = 'rejected', decided_at = ?, decided_by = ?, reject_reason = ? WHERE id = ?`,
          todayISO(),
          user.id,
          rejectReason,
          id,
        );
      } else if (buocKetQua.result === "approved") {
        paymentBillId = await sinhPhieuVaDuyet(id, goc, user);
      }
      // Bước 'pending' của engine: không đụng payment_bills/status — chỉ ghi snapshot bước.

      await ghiSnapshotQuyetDinh({
        certId: id,
        goc,
        actor: user,
        operationId,
        requestHash,
        buoc: liveRequest ? "engine" : "legacy",
        ketQua: buocKetQua,
        canh,
        xacNhan,
        rejectReason: decision === "rejected" ? rejectReason : null,
        paymentBillId,
      });
      return buocKetQua;
    });
  } catch (err: unknown) {
    const e = err as {
      message?: string;
      status?: number;
      code?: string;
      extra?: Record<string, unknown>;
    };
    // Chỉ lỗi có chủ đích (status) trả thông điệp; lỗi bất ngờ (pg/mã nội bộ) chỉ log.
    if (e.status) {
      if (e.code === "warning_changed" || e.code === "acknowledgement_required")
        log.info("payment-certs/decide: chặn duyệt chờ xác nhận cảnh báo", {
          certId: id,
          reason: e.code,
        });
      return NextResponse.json(
        { error: e.message, ...(e.code ? { code: e.code } : {}), ...(e.extra ?? {}) },
        { status: e.status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    log.error("payment-certs/decide: lỗi không lường trước", {
      certId: id,
      err: err instanceof Error ? err.message : String(err),
      pgCode: e.code,
    });
    return NextResponse.json(
      { error: "Lỗi máy chủ khi quyết định đợt thanh toán" },
      { status: 500 },
    );
  }

  const phatLai = ketQua.replayed === true ? { replayed: true } : {};
  if (ketQua.result === "pending")
    return NextResponse.json({
      decided: id,
      pending: true,
      currentSeq: ketQua.currentSeq,
      nextRole: ketQua.nextRole,
      operationId,
      ...phatLai,
    });

  // IPC vừa CHUYỂN sang approved THẬT (gồm cả nhánh legacy lẫn bước cuối engine) — phát sau
  // COMMIT; không phát khi reject, bước giữa hay phát lại idempotent.
  if (ketQua.result === "approved" && !ketQua.replayed) {
    const c = await queryOne<{ code: string; contractId: number; periodNo: number }>(
      `SELECT code, contract_id AS "contractId", period_no AS "periodNo" FROM payment_certs WHERE id = ?`,
      id,
    );
    await emitWebhook("payment_cert.approved", projectId, {
      certId: id,
      code: c?.code ?? null,
      contractId: c?.contractId ?? null,
      periodNo: c?.periodNo ?? null,
    });
  }
  return NextResponse.json({ decided: id, decision: ketQua.result, operationId, ...phatLai });
}

/**
 * payment_bills.amount là NUMERIC(15,2): ghi chuỗi canonical exact (không qua float); vượt cột →
 * 422 rõ ràng thay vì lỗi tràn số 500 của Postgres, không clamp. S10a L6: người duyệt có thể
 * không có viewPayments → thông điệp cụ thể làm lộ độ lớn giá trị (≥ 10^13 đ). Không có quyền
 * xem tiền → thông điệp chung; lý do thật log server.
 */
function kiemTranGiaTri(
  id: number,
  totals: { approvedValue: bigint; periodValue: bigint },
  role: Role,
): void {
  // S13d: kiểm cả giá trị đợt (như submit) — đợt tràn bỏ qua bước chốt lại amount ở trên nên
  // không bao giờ được duyệt với ngưỡng cũ.
  if (fitsNumeric(totals.approvedValue, 15) && fitsNumeric(totals.periodValue, 15)) return;
  log.warn("payment-certs/decide: giá trị đề nghị vượt NUMERIC(15,2)", {
    certId: id,
    reason: "approved_value_overflow",
  });
  if (CAN.viewPayments(role))
    throw loi(
      422,
      "Giá trị đề nghị thanh toán vượt giới hạn lưu trữ của phiếu thanh toán",
      "amount_overflow",
    );
  throw loi(
    422,
    "Không thể duyệt đợt này do dữ liệu đợt không hợp lệ — liên hệ Admin/PM kiểm tra lại đợt",
    "cert_invalid",
  );
}

/**
 * Bước cuối approved: sinh payment_bills (giá trị đề nghị exact) + chuyển đợt sang approved.
 * M129: phiếu ở trạng thái 'committed' (cam kết, chưa chi — paid_at NULL); paid_date = ngày lập
 * phiếu (ngày duyệt). Chỉ khi đánh dấu chi (…/pay, người khác người duyệt) mới thành thực chi.
 */
async function sinhPhieuVaDuyet(
  id: number,
  goc: { contractId: number; periodNo: number },
  user: { id: number; role: Role },
): Promise<number> {
  const contract = await queryOne<{
    title: string;
    partyName: string | null;
    supplierName: string | null;
    projectId: number | null;
  }>(
    `SELECT ct.title, ct.party_name AS "partyName", s.name AS "supplierName",
            ct.project_id AS "projectId"
       FROM contracts ct LEFT JOIN suppliers s ON s.id = ct.party_supplier_id
      WHERE ct.id = ?`,
    goc.contractId,
  );
  const totals = await certTotals(id);
  kiemTranGiaTri(id, totals, user.role);
  const responsible = contract?.supplierName ?? contract?.partyName ?? contract?.title ?? "—";

  // M51 PR1: project_id của bill lấy từ hợp đồng (cert.contractId → contracts.project_id)
  // để RLS lọc đúng dự án.
  const billId = await insertId(
    `INSERT INTO payment_bills (responsible, type, amount, description, paid_date, contract_id, payment_cert_id, created_by, project_id, pay_status)
     VALUES (?, 'bill', ?, ?, ?, ?, ?, ?, ?, 'committed')`,
    responsible,
    moneyToDecimal(totals.approvedValue),
    `Đợt ${goc.periodNo} — ${contract?.title ?? ""}`,
    todayISO(),
    goc.contractId,
    id,
    user.id,
    contract?.projectId ?? null,
  );
  await run(
    `UPDATE payment_certs SET status = 'approved', decided_at = ?, decided_by = ? WHERE id = ?`,
    todayISO(),
    user.id,
    id,
  );
  return billId;
}
