import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước mọi import
import { requestRieng } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as loi from "@/lib/nen/loi";
import { SoFixture, jreq, goi, uniq } from "./helpers/chuoi-nghiep-vu";

// QUALITY-FINAL-1 S15a — route API không lộ thông điệp lỗi thô (pg/nội bộ) ở phản hồi 500, nhưng
// vẫn giữ nguyên thông điệp + mã của lỗi nghiệp vụ 4xx. Chạy code route thật, chỉ stub biên.

const PG_THO =
  'duplicate key value violates unique constraint "contracts_code_key" (host=10.0.0.5)';

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const file = resolve(path);
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  });
  const mod = { exports: {} };
  runInNewContext(outputText, {
    module: mod,
    exports: mod.exports,
    URL,
    require: (name: string) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Chưa stub dependency: ${name}`);
    },
  });
  return mod.exports as T;
}

function routeTrao(awardTender: () => Promise<unknown>) {
  return load<{ POST(req: unknown, ctx: unknown): Promise<Response> }>(
    "app/api/tenders/[id]/award/route.ts",
    {
      "next/server": { NextResponse: { json: Response.json } },
      "@/lib/nen/loi": loi,
      "@/lib/bao-mat/auth": {
        getCurrentUser: async () => ({ id: 1, role: "pm", orgId: 1 }),
        CAN: { approve: () => true },
      },
      "@/lib/ha-tang/projects": { getCurrentProjectId: async () => 1 },
      "@/lib/tai-chinh/tender": { awardTender },
    },
  );
}

const reqTrao = { json: async () => ({ bidId: 5 }) };
const ctx = { params: Promise.resolve({ id: "3" }) };

test("S15a: tenders/award — lỗi bất ngờ (pg) ra 500 thông điệp chung, không lộ chuỗi thô", async () => {
  const route = routeTrao(async () => {
    throw Object.assign(new Error(PG_THO), { code: "23505" });
  });
  const res = await route.POST(reqTrao, ctx);
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code?: string };
  assert.equal(body.error, "Lỗi hệ thống");
  assert.equal(body.code, undefined);
  assert.ok(!JSON.stringify(body).includes("duplicate key"));
});

test("S15a: tenders/award — lỗi nghiệp vụ 4xx giữ thông điệp + code", async () => {
  const route = routeTrao(async () => {
    throw Object.assign(new Error("Gói thầu đã trao"), { status: 409, code: "da_trao" });
  });
  const res = await route.POST(reqTrao, ctx);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "Gói thầu đã trao", code: "da_trao" });
});

test("S15a: tenders/award — lỗi mang status 5xx vẫn ra 500 chung (không tin status ≥ 500)", async () => {
  const route = routeTrao(async () => {
    throw Object.assign(new Error(PG_THO), { status: 503 });
  });
  const res = await route.POST(reqTrao, ctx);
  assert.equal(res.status, 500);
  assert.equal(((await res.json()) as { error: string }).error, "Lỗi hệ thống");
});

test("S15a: materials/sync — lỗi bất ngờ ra 500 thông điệp chung; scope error giữ 4xx", async () => {
  class MaterialSyncScopeError extends Error {
    constructor(
      m: string,
      readonly status: number,
    ) {
      super(m);
    }
  }
  const nap = (runMaterialSync: () => Promise<unknown>) =>
    load<{ POST(): Promise<Response> }>("app/api/materials/sync/route.ts", {
      "next/server": { NextResponse: { json: Response.json } },
      "@/lib/bao-mat/auth": { getCurrentUser: async () => ({ id: 1, role: "pm", orgId: 1 }) },
      "@/lib/ha-tang/projects": { getCurrentProjectIdStrict: async () => 1 },
      "@/lib/ha-tang/feature-flags": { assertModuleEnabled: async () => null },
      "@/lib/vat-tu/material-sync": { runMaterialSync, MaterialSyncScopeError },
      "@/lib/nen/log": { log: { error() {}, warn() {}, info() {} } },
    });
  const loiTho = await nap(async () => {
    throw new Error(PG_THO);
  }).POST();
  assert.equal(loiTho.status, 500);
  assert.equal(((await loiTho.json()) as { error: string }).error, "Lỗi đồng bộ Google Sheet");

  const loiScope = await nap(async () => {
    throw new MaterialSyncScopeError("Sheet gắn dự án khác", 409);
  }).POST();
  assert.equal(loiScope.status, 409);
  assert.deepEqual(await loiScope.json(), { error: "Sheet gắn dự án khác" });
});

test("S15a: phanHoiLoiCoStatus — 4xx giữ thông điệp+code, còn lại 500 chung", async () => {
  const ok = loi.phanHoiLoiCoStatus(Object.assign(new Error("Sai"), { status: 422, code: "x" }));
  assert.equal(ok.status, 422);
  assert.deepEqual(await ok.json(), { error: "Sai", code: "x" });

  const khongStatus = loi.phanHoiLoiCoStatus(new Error(PG_THO), "Lỗi riêng của route");
  assert.equal(khongStatus.status, 500);
  assert.deepEqual(await khongStatus.json(), { error: "Lỗi riêng của route" });

  const nghiepVu = loi.phanHoiLoiCoStatus(loi.loiXungDot("Trùng"));
  assert.equal(nghiepVu.status, 409);
});

// ---------- Đề xuất: mở approval theo giá trị exact, cùng transaction ----------

test(
  "S15a: POST /api/proposals — mở approval với amount đọc lại từ DB (exact), cùng transaction với đề xuất",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const f = new SoFixture();
    const projectId = await f.duAn("S15a");
    const nguoiLap = await f.user("pm");
    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, 'proposal', ?)`,
      projectId,
      uniq("S15a flow "),
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, 1, 'pm', NULL)`,
      flowId,
    );
    try {
      const { POST } = await import("@/app/api/proposals/route");
      await f.vao(nguoiLap, projectId);
      const tao = await goi(
        requestRieng(() =>
          POST(jreq("/api/proposals", { kind: "other", title: "DX S15a", amount: "1234567.89" })),
        ),
      );
      assert.equal(tao.status, 201, JSON.stringify(tao.body));
      const rq = await queryOne<{ amount: string; status: string }>(
        `SELECT amount::text AS amount, status FROM approval_requests
          WHERE entity_type = 'proposal' AND entity_id = ?`,
        tao.body!.id as number,
      );
      assert.equal(rq?.amount, "1234567.89");
      assert.equal(rq?.status, "pending");
    } finally {
      await run(`DELETE FROM approval_requests WHERE project_id = ?`, projectId);
      await run(`DELETE FROM proposals WHERE project_id = ?`, projectId);
      await run(`DELETE FROM approval_flows WHERE id = ?`, flowId);
    }
  },
);
