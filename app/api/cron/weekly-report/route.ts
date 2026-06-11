import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { query } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { buildWeeklyReport, weeklyToHtml, weeklyToTelegramText, sendTelegram } from "@/lib/report";

export const dynamic = "force-dynamic";

// GET /api/cron/weekly-report
// Gọi bởi cron sáng thứ Hai (hoặc Admin/PM gọi tay để xem trước).
// Xác thực giống daily-report: Authorization: Bearer <CRON_SECRET> | session Admin/PM.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const bySecret = !!secret && auth === `Bearer ${secret}`;
  const bySession = CAN.export((await getCurrentUser())?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json({ error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" }, { status: 401 });

  const report = await buildWeeklyReport();
  const html = weeklyToHtml(report, process.env.APP_URL);

  // Người nhận: REPORT_EMAIL_TO (phân tách bằng dấu phẩy) — mặc định mọi Admin + PM.
  let to = (process.env.REPORT_EMAIL_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) {
    const rows = await query<{ email: string }>(`SELECT email FROM users WHERE role IN ('admin','pm')`);
    to = rows.map((r) => r.email);
  }

  const telegramError = await sendTelegram(weeklyToTelegramText(report, process.env.APP_URL));
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
    sent: true, emailSent: true, to, telegramSent,
    telegramError: telegramSent ? undefined : telegramError,
    completed: report.completed.length, newDelayed: report.newDelayed.length, totalDelayed: report.totalDelayed,
  });
}
