import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat, dangNhapDuAn } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Cụm CRON — 8 route KHÔNG chạy dưới danh nghĩa người dùng đăng nhập bình thường, mà được
// gọi tự động (Vercel Cron/crontab) bằng CRON_SECRET, hoặc thủ công bởi Admin/PM để xem
// trước. Rủi ro đặc thù của cụm này: (1) secret sai/thiếu lọt qua; (2) hai lần gọi gần như
// đồng thời (cron thật trùng lúc admin bấm tay) gửi trùng email/Telegram; (3) route xoá dữ
// liệu (retention) chạy nhầm chế độ apply thật khi không ai yêu cầu.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (t: string) => `${t}${RUN}${++seq}`;

const req = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, { headers });

async function taoUser(role: string, ten: string) {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `cron-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-cron', ?, 1)`,
    `Cron ${ten}`,
    email,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

/** Đặt CRON_SECRET cho ca test, dọn lại sau khi xong. */
function datCronSecret(secret: string | undefined): () => void {
  const cu = process.env.CRON_SECRET;
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;
  return () => {
    if (cu === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = cu;
  };
}

// Mỗi route cron dùng chung đúng một khối kiểm quyền: Bearer CRON_SECRET HOẶC session
// Admin/PM (CAN.export). Test chung cho toàn bộ 8 route thay vì lặp lại 8 lần.
const CAC_ROUTE_CRON: Array<{
  ten: string;
  path: string;
  import: () => Promise<{ GET: (r: NextRequest) => Promise<Response> }>;
}> = [
  {
    ten: "daily-report",
    path: "/api/cron/daily-report",
    import: () => import("@/app/api/cron/daily-report/route"),
  },
  {
    ten: "weekly-report",
    path: "/api/cron/weekly-report",
    import: () => import("@/app/api/cron/weekly-report/route"),
  },
  {
    ten: "health-check",
    path: "/api/cron/health-check",
    import: () => import("@/app/api/cron/health-check/route"),
  },
  {
    ten: "deliver-webhooks",
    path: "/api/cron/deliver-webhooks",
    import: () => import("@/app/api/cron/deliver-webhooks/route"),
  },
  {
    ten: "refresh-views",
    path: "/api/cron/refresh-views",
    import: () => import("@/app/api/cron/refresh-views/route"),
  },
  {
    ten: "sync-integrations",
    path: "/api/cron/sync-integrations",
    import: () => import("@/app/api/cron/sync-integrations/route"),
  },
  {
    ten: "sync-sheets",
    path: "/api/cron/sync-sheets",
    import: () => import("@/app/api/cron/sync-sheets/route"),
  },
  {
    ten: "retention",
    path: "/api/cron/retention",
    import: () => import("@/app/api/cron/retention/route"),
  },
];

for (const r of CAC_ROUTE_CRON) {
  test(`GET ${r.path}: không có Bearer, không đăng nhập → 401`, S, async () => {
    const restore = datCronSecret("secret-that-toi-that");
    try {
      dangXuat();
      const { GET } = await r.import();
      const res = await GET(req(r.path));
      assert.equal(res.status, 401);
    } finally {
      restore();
    }
  });

  test(`GET ${r.path}: Bearer SAI secret → 401 (không được đoán gần đúng là qua)`, S, async () => {
    const restore = datCronSecret("secret-that-toi-that-dai-32-ky-tu");
    try {
      dangXuat();
      const { GET } = await r.import();
      const res = await GET(req(r.path, { authorization: "Bearer secret-gan-dung" }));
      assert.equal(res.status, 401);
    } finally {
      restore();
    }
  });

  test(
    `GET ${r.path}: chưa cấu hình CRON_SECRET thì Bearer bất kỳ đều KHÔNG qua được`,
    S,
    async () => {
      // checkCronSecret trả false ngay khi thiếu secret cấu hình — không được coi "chưa cấu
      // hình" là "mở toang cho ai gửi Bearer gì cũng được".
      const restore = datCronSecret(undefined);
      try {
        dangXuat();
        const { GET } = await r.import();
        const res = await GET(req(r.path, { authorization: "Bearer bat-ky-gia-tri-nao" }));
        assert.equal(res.status, 401);
      } finally {
        restore();
      }
    },
  );

  test(`GET ${r.path}: vai trò engineer (không phải Admin/PM) không được gọi tay`, S, async () => {
    const restore = datCronSecret("secret-that-toi-that-dai-32-ky-tu");
    try {
      const eng = await taoUser("engineer", `${r.ten}-eng`);
      dangNhap({ id: eng.id, passwordHash: eng.passwordHash });
      const { GET } = await r.import();
      const res = await GET(req(r.path));
      assert.equal(res.status, 401);
    } finally {
      restore();
    }
  });
}

test(
  "GET /api/cron/retention: session Admin gọi KHÔNG kèm ?apply=1 → dry-run, không xoá gì",
  S,
  async () => {
    const admin = await taoUser("admin", "retention-dry");
    dangNhap({ id: admin.id, passwordHash: admin.passwordHash });
    const { GET } = await import("@/app/api/cron/retention/route");
    const res = await GET(req("/api/cron/retention"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.apply, false);
    assert.match(body.note, /Chạy thử/);
    assert.equal(body.deleted, 0, "dry-run không được xoá bất cứ dòng nào");
    // Mọi mục trong báo cáo dry-run phải có deleted = 0 — gọi nhầm URL không tham số không
    // được phép xoá bất cứ dòng nào; đây là bất biến an toàn quan trọng nhất của route này.
    assert.ok(Array.isArray(body.targets));
    for (const dong of body.targets) {
      assert.equal(dong.deleted, 0, `dòng "${dong.key}" không được xoá gì khi chưa apply=1`);
    }
  },
);

test(
  "GET /api/cron/daily-report: 2 lần gọi gần như đồng thời — lần 2 bị khoá (429), không gửi trùng",
  S,
  async () => {
    // Khoá sync_locks chống đúng kịch bản thật: cron thật trùng lúc admin bấm "xem trước".
    const restore = datCronSecret("secret-that-toi-that-dai-32-ky-tu");
    try {
      const { run } = await import("@/lib/db");
      await run(`DELETE FROM sync_locks WHERE name = 'cron:daily-report'`);
      dangXuat();
      const { GET } = await import("@/app/api/cron/daily-report/route");
      const header = { authorization: "Bearer secret-that-toi-that-dai-32-ky-tu" };

      const [a, b] = await Promise.all([
        GET(req("/api/cron/daily-report", header)),
        GET(req("/api/cron/daily-report", header)),
      ]);
      const statuses = [a.status, b.status].sort();
      assert.deepEqual(statuses, [200, 429], "một request phải qua, một request phải bị khoá");
    } finally {
      restore();
    }
  },
);

test(
  "GET /api/cron/daily-report: khoá tự giải phóng sau khi xử lý xong, gọi lại được ngay",
  S,
  async () => {
    const restore = datCronSecret("secret-that-toi-that-dai-32-ky-tu");
    try {
      const { run } = await import("@/lib/db");
      await run(`DELETE FROM sync_locks WHERE name = 'cron:daily-report'`);
      dangXuat();
      const { GET } = await import("@/app/api/cron/daily-report/route");
      const header = { authorization: "Bearer secret-that-toi-that-dai-32-ky-tu" };
      assert.equal((await GET(req("/api/cron/daily-report", header))).status, 200);
      // Không còn giữ khoá — lần gọi kế tiếp (tuần tự, không phải đua) phải qua bình thường.
      assert.equal((await GET(req("/api/cron/daily-report", header))).status, 200);
    } finally {
      restore();
    }
  },
);

test("GET /api/cron/daily-report: Bearer ĐÚNG secret, không cần đăng nhập → 200", S, async () => {
  const restore = datCronSecret("secret-that-toi-that-dai-32-ky-tu");
  try {
    const { run } = await import("@/lib/db");
    await run(`DELETE FROM sync_locks WHERE name = 'cron:daily-report'`);
    dangXuat();
    const { GET } = await import("@/app/api/cron/daily-report/route");
    const res = await GET(
      req("/api/cron/daily-report", { authorization: "Bearer secret-that-toi-that-dai-32-ky-tu" }),
    );
    assert.equal(res.status, 200);
  } finally {
    restore();
  }
});

test("GET /api/cron/weekly-report: Bearer đúng secret → 200", S, async () => {
  const restore = datCronSecret("secret-that-toi-that-dai-32-ky-tu");
  try {
    const { run } = await import("@/lib/db");
    await run(`DELETE FROM sync_locks WHERE name = 'cron:weekly-report'`);
    dangXuat();
    const { GET } = await import("@/app/api/cron/weekly-report/route");
    const res = await GET(
      req("/api/cron/weekly-report", { authorization: "Bearer secret-that-toi-that-dai-32-ky-tu" }),
    );
    assert.equal(res.status, 200);
  } finally {
    restore();
  }
});

test(
  "GET /api/cron/health-check: Bearer đúng secret → 200, ghi lịch sử vào health_check_runs",
  S,
  async () => {
    const restore = datCronSecret("secret-that-toi-that-dai-32-ky-tu");
    try {
      const { run, queryOne } = await import("@/lib/db");
      await run(`DELETE FROM sync_locks WHERE name = 'cron:health-check'`);
      dangXuat();
      const { GET } = await import("@/app/api/cron/health-check/route");
      const res = await GET(
        req("/api/cron/health-check", {
          authorization: "Bearer secret-that-toi-that-dai-32-ky-tu",
        }),
      );
      assert.equal(res.status, 200);
      const row = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM health_check_runs WHERE checked_at > NOW() - interval '1 minute'`,
      );
      assert.ok(Number(row?.n ?? 0) > 0, "phải ghi lại lịch sử lần chạy để xem trên /tech");
    } finally {
      restore();
    }
  },
);

test(
  "GET /api/cron/refresh-views: Bearer đúng secret → 200, làm mới đủ danh sách view khai báo",
  S,
  async () => {
    const restore = datCronSecret("secret-that-toi-that-dai-32-ky-tu");
    try {
      dangXuat();
      const { GET } = await import("@/app/api/cron/refresh-views/route");
      const res = await GET(
        req("/api/cron/refresh-views", {
          authorization: "Bearer secret-that-toi-that-dai-32-ky-tu",
        }),
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.results ?? body);
    } finally {
      restore();
    }
  },
);

test(
  "GET /api/cron/sync-integrations: Bearer đúng secret, không có tích hợp nào bật → 200 rỗng",
  S,
  async () => {
    const restore = datCronSecret("secret-that-toi-that-dai-32-ky-tu");
    try {
      dangXuat();
      const { GET } = await import("@/app/api/cron/sync-integrations/route");
      const res = await GET(
        req("/api/cron/sync-integrations", {
          authorization: "Bearer secret-that-toi-that-dai-32-ky-tu",
        }),
      );
      assert.equal(res.status, 200);
    } finally {
      restore();
    }
  },
);

test(
  "GET /api/cron/retention: Bearer đúng secret (không session) cũng dry-run mặc định",
  S,
  async () => {
    const restore = datCronSecret("secret-that-toi-that-dai-32-ky-tu");
    try {
      dangXuat();
      const { GET } = await import("@/app/api/cron/retention/route");
      const res = await GET(
        req("/api/cron/retention", { authorization: "Bearer secret-that-toi-that-dai-32-ky-tu" }),
      );
      assert.equal(res.status, 200);
      assert.equal((await res.json()).apply, false);
    } finally {
      restore();
    }
  },
);

test(
  "GET /api/cron/retention: ?apply=1 → body.apply = true (chạy thật, không còn ghi chú dry-run)",
  S,
  async () => {
    const admin = await taoUser("admin", "retention-apply");
    dangNhap({ id: admin.id, passwordHash: admin.passwordHash });
    const { GET } = await import("@/app/api/cron/retention/route");
    const res = await GET(req("/api/cron/retention?apply=1"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.apply, true);
    assert.equal(body.note, undefined, "chạy thật thì không còn ghi chú 'chưa xoá gì'");
  },
);

test("GET /api/cron/deliver-webhooks: session PM (không cần secret) → 200", S, async () => {
  const { insertId } = await import("@/lib/db");
  const pm = await taoUser("pm", "webhooks-pm");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `Cron PM ${RUN}`);
  await dangNhapDuAn({ id: pm.id, passwordHash: pm.passwordHash }, projectId);
  const { GET } = await import("@/app/api/cron/deliver-webhooks/route");
  const res = await GET(req("/api/cron/deliver-webhooks"));
  assert.equal(res.status, 200);
});
