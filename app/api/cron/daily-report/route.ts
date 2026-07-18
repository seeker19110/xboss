import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { query } from "@/lib/db";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/auth";
import { buildDailyReport, reportToHtml, reportToTelegramText, sendTelegram } from "@/lib/report";
import { sendPushToAll } from "@/lib/push";
import { getEvmSeries } from "@/lib/evm";
import { getAlertThreshold } from "@/lib/alerts";
import { acquireSyncLock, releaseSyncLock } from "@/lib/sync-locks";

export const dynamic = "force-dynamic";

const LOCK_NAME = "cron:daily-report";

// GET /api/cron/daily-report
// Gọi bởi cron (Vercel Cron / crontab) lúc 8:00 sáng VN, hoặc Admin/PM gọi tay để xem trước.
// Xác thực: Authorization: Bearer <CRON_SECRET> | session Admin/PM.
// (Không nhận secret qua query param — URL bị ghi vào access log.)
export async function GET(req: NextRequest) {
  const bySecret = checkCronSecret(req.headers.get("authorization"));
  const bySession = CAN.export((await getCurrentUser())?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json(
      { error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" },
      { status: 401 },
    );

  // M53 PR4: chống gửi trùng email/Telegram/Push khi 2 request chạm route gần như đồng
  // thời (cron thật trùng lúc admin bấm xem trước, hoặc caller ngoài retry) — khoá ngắn
  // hạn, tự hết hạn sau 10 phút nếu process crash giữa chừng (không treo vĩnh viễn).
  if (!(await acquireSyncLock(LOCK_NAME)))
    return NextResponse.json(
      { error: "Báo cáo ngày đang được gửi bởi tiến trình khác — thử lại sau ít phút" },
      { status: 429 },
    );

  try {
    return await handleDailyReport();
  } finally {
    await releaseSyncLock(LOCK_NAME);
  }
}

async function handleDailyReport(): Promise<NextResponse> {
  const report = await buildDailyReport();

  // Cảnh báo SPI/CPI (M47 PR4): đánh giá trên toàn hệ (projectId=null — DB hiện chưa
  // multi-project trong ngữ cảnh cron, xem docs/nang-cap/M47-evm-bi.md mục PR4).
  // getEvmSeries trả null khi không có task nào (DB trống) → bỏ qua an toàn.
  const evmAlerts: string[] = [];
  const evm = await getEvmSeries({
    projectId: null,
    baselineId: null,
    systemId: null,
    source: "bills",
  });
  if (evm) {
    const spiBelow = await getAlertThreshold("spi_below", null);
    const cpiBelow = await getAlertThreshold("cpi_below", null);
    if (evm.summary.spi != null && evm.summary.spi < spiBelow)
      evmAlerts.push(
        `SPI = ${evm.summary.spi.toFixed(2)} (< ${spiBelow}) — tiến độ đang chậm so với kế hoạch`,
      );
    if (evm.summary.cpi != null && evm.summary.cpi < cpiBelow)
      evmAlerts.push(
        `CPI = ${evm.summary.cpi.toFixed(2)} (< ${cpiBelow}) — chi phí đang vượt so với giá trị đạt được`,
      );
  }

  const html = reportToHtml(report, process.env.APP_URL, evmAlerts);

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

  // Kênh Telegram (tuỳ chọn) — gửi song song với email, kênh nào cấu hình thì gửi kênh đó.
  const telegramError = await sendTelegram(
    reportToTelegramText(report, process.env.APP_URL, evmAlerts),
  );
  const telegramSent = telegramError === null;

  // Web Push tóm tắt tới mọi thiết bị đã đăng ký (no-op nếu chưa cấu hình VAPID).
  let pushSent = 0;
  if (report.totalDelayed > 0) {
    pushSent = await sendPushToAll({
      title: `🏗️ ${report.totalDelayed} hạng mục đang trễ`,
      body: `${report.newDelayed.length} mới quá hạn trong 24h · ${report.dueSoon.length} sắp đến hạn`,
      url: "/",
    }).catch(() => 0);
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    // Chưa cấu hình SMTP → trả về nội dung để xem trước (không gửi email).
    return NextResponse.json({
      sent: telegramSent,
      emailSent: false,
      telegramSent,
      telegramError: telegramSent ? undefined : telegramError,
      pushSent,
      evmAlerts,
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
    subject: `🏗️ XBoss ${report.date} — ${report.totalDelayed} hạng mục trễ (${report.newDelayed.length} việc mới)`,
    html,
  });

  return NextResponse.json({
    sent: true,
    emailSent: true,
    to,
    telegramSent,
    telegramError: telegramSent ? undefined : telegramError,
    pushSent,
    evmAlerts,
    totalDelayed: report.totalDelayed,
    newDelayed: report.newDelayed.length,
  });
}
