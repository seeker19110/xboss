import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getCurrentUser, CAN } from "@/lib/auth";
import { query, insertId } from "@/lib/db";
import { WEBHOOK_EVENTS, validateWebhookUrl } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

type WebhookRow = {
  id: number;
  projectId: number | null;
  projectName: string | null;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
};

type DeliveryRow = {
  id: number;
  webhookId: number;
  event: string;
  status: string;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string;
  createdAt: string;
};

// Lọc + kiểm danh sách sự kiện gửi lên: phải là mảng không rỗng, mọi phần tử thuộc whitelist.
function parseEvents(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const set = new Set<string>();
  for (const e of raw) {
    if (typeof e !== "string" || !(WEBHOOK_EVENTS as readonly string[]).includes(e)) return null;
    set.add(e);
  }
  return [...set];
}

// GET /api/admin/webhooks — danh sách webhook (KHÔNG kèm secret) + 10 delivery gần nhất mỗi cái.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageIntegrations(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý webhook" }, { status: 403 });

  const webhooks = await query<WebhookRow>(
    `SELECT w.id, w.project_id AS "projectId", p.name AS "projectName", w.url, w.events,
            w.active, w.created_at AS "createdAt"
       FROM webhooks w
       LEFT JOIN projects p ON p.id = w.project_id
      ORDER BY w.id DESC`,
  );

  // 10 delivery gần nhất mỗi webhook (ROW_NUMBER phân vùng theo webhook_id) — 1 truy vấn.
  const ids = webhooks.map((w) => w.id);
  const deliveries =
    ids.length > 0
      ? await query<DeliveryRow>(
          `SELECT id, webhook_id AS "webhookId", event, status, attempts,
                  last_error AS "lastError", next_retry_at AS "nextRetryAt", created_at AS "createdAt"
             FROM (
               SELECT id, webhook_id, event, status, attempts, last_error, next_retry_at, created_at,
                      ROW_NUMBER() OVER (PARTITION BY webhook_id ORDER BY id DESC) AS rn
                 FROM webhook_deliveries
                WHERE webhook_id = ANY(?)
             ) d
            WHERE rn <= 10
            ORDER BY webhook_id DESC, id DESC`,
          ids,
        )
      : [];

  const byWebhook = new Map<number, DeliveryRow[]>();
  for (const d of deliveries) {
    byWebhook.set(d.webhookId, [...(byWebhook.get(d.webhookId) ?? []), d]);
  }

  return NextResponse.json({
    webhooks: webhooks.map((w) => ({ ...w, deliveries: byWebhook.get(w.id) ?? [] })),
    events: WEBHOOK_EVENTS,
  });
}

// POST /api/admin/webhooks { url, events[], projectId? } → tạo webhook + sinh secret.
// Secret CHỈ trả về 1 lần duy nhất tại đây (như API key) — GET không bao giờ trả secret.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageIntegrations(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý webhook" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const urlCheck = validateWebhookUrl(String(body.url ?? ""));
  if (!urlCheck.ok) return NextResponse.json({ error: urlCheck.error }, { status: 422 });

  const events = parseEvents(body.events);
  if (!events)
    return NextResponse.json(
      { error: "Danh sách sự kiện không hợp lệ (phải chọn ít nhất 1 sự kiện hợp lệ)" },
      { status: 422 },
    );

  const projectId =
    body.projectId != null && body.projectId !== "" ? Number(body.projectId) : null;
  if (projectId != null && !Number.isInteger(projectId))
    return NextResponse.json({ error: "projectId không hợp lệ" }, { status: 400 });

  const secret = randomBytes(32).toString("hex");
  const id = await insertId(
    `INSERT INTO webhooks (project_id, url, secret, events, active, created_by)
     VALUES (?, ?, ?, ?, TRUE, ?)`,
    projectId,
    urlCheck.url,
    secret,
    events,
    user.id,
  );

  return NextResponse.json({ id, secret }, { status: 201 });
}
