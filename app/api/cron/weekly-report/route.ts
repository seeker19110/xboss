import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { query } from "@/lib/db";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/auth";
import { log } from "@/lib/log";
import {
  buildWeeklyReport,
  weeklyToHtml,
  weeklyToTelegramText,
  sendTelegram,
  type AuditChainSummary,
} from "@/lib/report";
import { verifyAuditChain } from "@/lib/audit-chain";

export const dynamic = "force-dynamic";

// GET /api/cron/weekly-report
// Gọi bởi cron sáng thứ Hai (hoặc Admin/PM gọi tay để xem trước).
// Xác thực giống daily-report: Authorization: Bearer <CRON_SECRET> | session Admin/PM.
export async function GET(req: NextRequest) {
  const bySecret = checkCronSecret(req.headers.get("authorization"));
  const bySession = CAN.export((await getCurrentUser())?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json(
      { error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" },
      { status: 401 },
    );

  const report = await buildWeeklyReport();

  // Xác minh chuỗi hash audit_log (M43 PR3) — chạy trong process, không spawn subprocess
  // (route Next.js). Lỗi khi xác minh không chặn gửi báo cáo (báo cáo vẫn hữu ích dù thiếu
  // dòng audit chain) — chỉ log, coi như "chưa xác minh được" trong nội dung gửi.
  let auditChain: AuditChainSummary | undefined;
  try {
    const chainResult = await verifyAuditChain();
    auditChain = { checked: chainResult.checked, errorCount: chainResult.errors.length };
  } catch (err) {
    log.error("weekly-report: verifyAuditChain lỗi", {
      route: "GET /api/cron/weekly-report",
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const html = weeklyToHtml(report, process.env.APP_URL, auditChain);

  // Người nhận: REPORT_EMAIL_TO (phân tách bằng dấu phẩy) — mặc định mọi Admin + PM.
  let to = (process.env.REPORT_EMAIL_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) {
    const rows = await query<{ email: string }>(
      `SELECT email FROM users WHERE role IN ('admin','pm')`,
    );
    to = rows.map((r) => r.email);
  }

  const telegramError = await sendTelegram(
    weeklyToTelegramText(report, process.env.APP_URL, auditChain),
  );
  const telegramSent = telegramError === null;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return NextResponse.json({
      sent: telegramSent,
      emailSent: false,
      telegramSent,
      telegramError: telegramSent ? undefined : telegramError,
      reason: "Chưa cấu hình SMTP_HOST / SMTP_USER / SMTP_PASS — trả về preview",
      wouldSendTo: to,
      report,
      auditChain,
    });
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? `"XBoss" <${SMTP_USER}>`,
    to: to.join(", "),
    subject: `📅 XBoss báo cáo tuần ${report.weekFrom} → ${report.date} — ${report.completed.length} hoàn thành, ${report.newDelayed.length} trễ mới`,
    html,
  });

  return NextResponse.json({
    sent: true,
    emailSent: true,
    to,
    telegramSent,
    telegramError: telegramSent ? undefined : telegramError,
    completed: report.completed.length,
    newDelayed: report.newDelayed.length,
    totalDelayed: report.totalDelayed,
    auditChain,
  });
}
