import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/bao-mat/auth";
import { log } from "@/lib/nen/log";
import { visibleProjectIds } from "@/lib/ha-tang/projects";
import {
  buildWeeklyReport,
  listReportProjects,
  reportRecipients,
  type ReportProject,
  weeklyToHtml,
  weeklyToTelegramText,
  sendTelegram,
  type AuditChainSummary,
} from "@/lib/tien-do/report";
import { verifyAuditChain } from "@/lib/bao-mat/audit-chain";
import { acquireSyncLock, releaseSyncLock } from "@/lib/ha-tang/sync-locks";

export const dynamic = "force-dynamic";

const LOCK_NAME = "cron:weekly-report";

// GET /api/cron/weekly-report
// Gọi bởi cron sáng thứ Hai (hoặc Admin/PM gọi tay để xem trước).
// Xác thực giống daily-report: Authorization: Bearer <CRON_SECRET> | session Admin/PM.
export async function GET(req: NextRequest) {
  const bySecret = checkCronSecret(req.headers.get("authorization"));
  const user = bySecret ? null : await getCurrentUser();
  const bySession = CAN.export(user?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json(
      { error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" },
      { status: 401 },
    );

  // M53 PR4: chống gửi trùng email/Telegram khi 2 request chạm route gần như đồng thời
  // (cùng lý do như daily-report).
  if (!(await acquireSyncLock(LOCK_NAME)))
    return NextResponse.json(
      { error: "Báo cáo tuần đang được gửi bởi tiến trình khác — thử lại sau ít phút" },
      { status: 429 },
    );

  try {
    const auditChain = await xacMinhAuditChain();
    // Cron (secret) gửi mọi dự án đang hoạt động; Admin/PM gọi tay chỉ dự án mình thấy.
    const projects = await listReportProjects(user ? await visibleProjectIds(user) : undefined);
    const results = [];
    for (const project of projects) results.push(await handleWeeklyReport(project, auditChain));
    return NextResponse.json({ projects: results, auditChain });
  } finally {
    await releaseSyncLock(LOCK_NAME);
  }
}

// Xác minh chuỗi hash audit_log (M43 PR3) MỘT lần cho cả lượt gửi — chuỗi audit là toàn hệ,
// không theo dự án. Lỗi khi xác minh không chặn gửi báo cáo — chỉ log, coi như "chưa xác
// minh được" trong nội dung gửi.
async function xacMinhAuditChain(): Promise<AuditChainSummary | undefined> {
  try {
    const chainResult = await verifyAuditChain();
    return { checked: chainResult.checked, errorCount: chainResult.errors.length };
  } catch (err) {
    log.error("weekly-report: verifyAuditChain lỗi", {
      route: "GET /api/cron/weekly-report",
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

// Mỗi dự án một báo cáo (chủ dự án chốt 2026-10-03).
async function handleWeeklyReport(project: ReportProject, auditChain?: AuditChainSummary) {
  const report = await buildWeeklyReport(project.id);

  const html = weeklyToHtml(report, process.env.APP_URL, auditChain);

  // Người nhận: REPORT_EMAIL_TO (phân tách bằng dấu phẩy) — mặc định Admin + PM của dự án.
  let to = (process.env.REPORT_EMAIL_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) to = (await reportRecipients(project.id)).map((r) => r.email);

  const telegramError = await sendTelegram(
    weeklyToTelegramText(report, process.env.APP_URL, auditChain),
  );
  const telegramSent = telegramError === null;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return {
      projectId: project.id,
      projectName: project.name,
      sent: telegramSent,
      emailSent: false,
      telegramSent,
      telegramError: telegramSent ? undefined : telegramError,
      reason: "Chưa cấu hình SMTP_HOST / SMTP_USER / SMTP_PASS — trả về preview",
      wouldSendTo: to,
      report,
    };
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
    subject: `📅 XBoss ${project.name} — báo cáo tuần ${report.weekFrom} → ${report.date} — ${report.completed.length} hoàn thành, ${report.newDelayed.length} trễ mới`,
    html,
  });

  return {
    projectId: project.id,
    projectName: project.name,
    sent: true,
    emailSent: true,
    to,
    telegramSent,
    telegramError: telegramSent ? undefined : telegramError,
    completed: report.completed.length,
    newDelayed: report.newDelayed.length,
    totalDelayed: report.totalDelayed,
  };
}
