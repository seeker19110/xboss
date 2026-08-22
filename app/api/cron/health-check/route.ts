import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { query, insertId } from "@/lib/db";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/auth";
import { sendTelegram } from "@/lib/report";
import { runHealthChecks, type HealthCheckReport } from "@/lib/healthcheck";
import { acquireSyncLock, releaseSyncLock } from "@/lib/sync-locks";

export const dynamic = "force-dynamic";

const LOCK_NAME = "cron:health-check";

// GET /api/cron/health-check
// Gọi bởi cron ngoài 2 lần/ngày (vd 8:00 và 20:00 VN — xem DEPLOY.md), hoặc Admin/PM gọi
// tay để xem trước. Xác thực: Authorization: Bearer <CRON_SECRET> | session Admin/PM.
// Chỉ gửi email/Telegram khi có lỗi (fail) hoặc cảnh báo (warn) — chạy sạch thì không làm
// phiền, chỉ ghi log vào health_check_runs để xem lịch sử trên /tech.
export async function GET(req: NextRequest) {
  const bySecret = checkCronSecret(req.headers.get("authorization"));
  const bySession = CAN.export((await getCurrentUser())?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json(
      { error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" },
      { status: 401 },
    );

  if (!(await acquireSyncLock(LOCK_NAME)))
    return NextResponse.json(
      { error: "Kiểm tra hệ thống đang chạy bởi tiến trình khác — thử lại sau ít phút" },
      { status: 429 },
    );

  try {
    return await handleHealthCheck();
  } finally {
    await releaseSyncLock(LOCK_NAME);
  }
}

async function handleHealthCheck(): Promise<NextResponse> {
  const report = await runHealthChecks();

  let emailSent = false;
  let telegramSent = false;
  let telegramError: string | null = null;

  if (report.hasIssues) {
    const text = reportToTelegramText(report);
    telegramError = await sendTelegram(text);
    telegramSent = telegramError === null;

    const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
    if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      let to = (process.env.REPORT_EMAIL_TO ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (to.length === 0) {
        const rows = await query<{ email: string }>(`SELECT email FROM users WHERE role = 'admin'`);
        to = rows.map((r) => r.email);
      }
      if (to.length > 0) {
        const transporter = nodemailer.createTransport({
          host: SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: Number(process.env.SMTP_PORT ?? 587) === 465,
          auth: { user: SMTP_USER, pass: SMTP_PASS },
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM ?? `"XBoss" <${SMTP_USER}>`,
          to: to.join(", "),
          subject: `⚠️ XBoss — kiểm tra hệ thống phát hiện ${report.failCount} lỗi, ${report.warnCount} cảnh báo`,
          html: reportToHtml(report),
        });
        emailSent = true;
      }
    }
  }

  const runId = await insertId(
    `INSERT INTO health_check_runs (has_issues, fail_count, warn_count, results, notified, triggered_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    report.hasIssues,
    report.failCount,
    report.warnCount,
    JSON.stringify(report.items),
    emailSent || telegramSent,
    "cron",
  );

  return NextResponse.json({
    runId,
    hasIssues: report.hasIssues,
    failCount: report.failCount,
    warnCount: report.warnCount,
    emailSent,
    telegramSent,
    telegramError: telegramSent ? undefined : telegramError,
    items: report.items,
  });
}

function reportToTelegramText(r: HealthCheckReport): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = [
    `⚠️ <b>XBoss — Kiểm tra trạng thái hệ thống</b>`,
    `${r.failCount} lỗi · ${r.warnCount} cảnh báo`,
    "",
  ];
  for (const it of r.items.filter((i) => i.status === "fail" || i.status === "warn")) {
    const icon = it.status === "fail" ? "🔴" : "🟡";
    lines.push(`${icon} <b>${esc(it.label)}</b> — ${esc(it.detail)}`);
  }
  return lines.join("\n").slice(0, 4000);
}

function reportToHtml(r: HealthCheckReport): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = r.items
    .map((it) => {
      const color = it.status === "fail" ? "#dc2626" : it.status === "warn" ? "#d97706" : "#059669";
      const label = it.status === "fail" ? "Lỗi" : it.status === "warn" ? "Cảnh báo" : "OK";
      return `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb">${esc(it.label)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;color:${color};font-weight:600">${label}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb">${esc(it.detail)}</td></tr>`;
    })
    .join("");
  return `<div style="font-family:sans-serif">
    <h2>Kiểm tra trạng thái hoạt động XBoss</h2>
    <p>${r.failCount} lỗi · ${r.warnCount} cảnh báo — lúc ${new Date(r.checkedAt).toLocaleString("vi-VN")}</p>
    <table style="border-collapse:collapse">
      <thead><tr><th style="padding:6px 10px;border:1px solid #e5e7eb">Hạng mục</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb">Trạng thái</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb">Chi tiết</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}
