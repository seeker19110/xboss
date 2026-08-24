import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROLES, type Role } from "@/lib/nen/roles";

// V3 (audit 2026-08-24, lỗ hổng Cao A4) — 14 route engineering ghi dữ liệu trước đây chỉ
// kiểm đăng nhập, không kiểm quyền: viewer/cdt/subcon tạo được mô hình BIM, giả telemetry
// IoT sinh cảnh báo HSE CRITICAL, thầu phụ tự chấm điểm tín nhiệm của chính mình.
// Test thuần (không cần DB): (1) ma trận quyền 7 vai trò cho 4 cặp quyền mới;
// (2) mã nguồn 4 route đại diện thật sự gọi đúng quyền; (3) bất biến "không còn route
// engineering ghi dữ liệu nào thiếu CAN.".

const GOC = path.join(process.cwd(), "app/api/engineering");

// ── (1) Ma trận quyền 7 vai trò ────────────────────────────────────────────────
test("CAN: ma trận 7 vai trò cho 4 cặp quyền engineering mới", async () => {
  const { CAN } = await import("@/lib/bao-mat/auth");

  const xem: Role[] = ["admin", "pm", "engineer", "bch"];
  const ghi: Role[] = ["admin", "pm", "engineer"];
  const ghiThauPhu: Role[] = ["admin", "pm"]; // ngoại lệ: engineer + subcon không được chấm

  const mongDoi: Record<string, Role[]> = {
    viewEngineeringBim: xem,
    manageEngineeringBim: ghi,
    viewEngineeringIot: xem,
    manageEngineeringIot: ghi,
    viewEngineeringGodTier: xem,
    manageEngineeringGodTier: ghi,
    viewEngineeringSubconAi: xem,
    manageEngineeringSubconAi: ghiThauPhu,
  };

  for (const [khoa, duocPhep] of Object.entries(mongDoi)) {
    const fn = (CAN as Record<string, (r?: Role) => boolean>)[khoa];
    assert.equal(typeof fn, "function", `thiếu quyền ${khoa} trong map CAN`);
    for (const role of ROLES) {
      assert.equal(fn(role), duocPhep.includes(role), `${khoa} sai với vai trò ${role}`);
    }
    // Chưa đăng nhập / vai trò rỗng → luôn từ chối.
    assert.equal(fn(undefined), false, `${khoa} phải từ chối khi không có vai trò`);
  }

  // Vai trò chỉ-xem và subcon KHÔNG được ghi ở cả 4 nhóm.
  for (const role of ["bch", "cdt", "viewer", "subcon"] as Role[]) {
    for (const khoa of [
      "manageEngineeringBim",
      "manageEngineeringIot",
      "manageEngineeringGodTier",
      "manageEngineeringSubconAi",
    ]) {
      const fn = (CAN as Record<string, (r?: Role) => boolean>)[khoa];
      assert.equal(fn(role), false, `${khoa} không được mở cho ${role}`);
    }
  }
});

// ── (2) Mã nguồn route đại diện gọi đúng quyền ─────────────────────────────────
test("4 route đại diện (bim/iot/subcon-ai/god-tier) gọi đúng cặp quyền", () => {
  const daiDien: Record<string, { view?: string; manage: string }> = {
    "bim-models/route.ts": { view: "viewEngineeringBim", manage: "manageEngineeringBim" },
    "iot/telemetry/route.ts": { view: "viewEngineeringIot", manage: "manageEngineeringIot" },
    "subcon-ai/evaluate/route.ts": { manage: "manageEngineeringSubconAi" },
    "god-tier/models/route.ts": { view: "viewEngineeringGodTier", manage: "manageEngineeringGodTier" },
  };

  for (const [tuongDoi, quyen] of Object.entries(daiDien)) {
    const src = fs.readFileSync(path.join(GOC, tuongDoi), "utf8");
    assert.ok(src.includes(`CAN.${quyen.manage}(user.role)`), `${tuongDoi} thiếu ${quyen.manage}`);
    if (quyen.view) {
      assert.ok(src.includes(`CAN.${quyen.view}(user.role)`), `${tuongDoi} thiếu ${quyen.view}`);
    }
    assert.ok(src.includes("status: 403"), `${tuongDoi} phải trả 403 khi thiếu quyền`);
    assert.ok(src.includes("status: 401"), `${tuongDoi} phải trả 401 khi chưa đăng nhập`);
  }
});

// ── (3) Bất biến: mọi route engineering ghi dữ liệu đều có kiểm quyền ──────────
test("không còn route engineering POST/PATCH/DELETE nào thiếu CAN.", () => {
  const thieu: string[] = [];
  const duyet = (thuMuc: string) => {
    for (const muc of fs.readdirSync(thuMuc, { withFileTypes: true })) {
      const p = path.join(thuMuc, muc.name);
      if (muc.isDirectory()) duyet(p);
      else if (muc.name === "route.ts") {
        const src = fs.readFileSync(p, "utf8");
        if (/export async function (POST|PATCH|DELETE)\b/.test(src) && !src.includes("CAN.")) {
          thieu.push(path.relative(process.cwd(), p));
        }
      }
    }
  };
  duyet(GOC);
  assert.deepEqual(thieu, [], `route ghi dữ liệu thiếu kiểm quyền:\n${thieu.join("\n")}`);
});

// ── (4) subcon-ai/evaluate không còn nhận chỉ số từ body ──────────────────────
test("subcon-ai/evaluate: không nhận chỉ số tự khai từ body, không có mặc định đẹp", () => {
  const src = fs.readFileSync(path.join(GOC, "subcon-ai/evaluate/route.ts"), "utf8");
  // Chỉ được lấy đúng profileId từ body; mọi chỉ số khác phải tính từ hệ thống.
  assert.ok(src.includes("const { profileId } = body;"), "body chỉ được cung cấp profileId");
  for (const xau of ["onTimeRate", "ncrCount", "hseScore", "?? 90", "?? 95"]) {
    assert.ok(!src.includes(xau), `route vẫn còn tham chiếu chỉ số tự khai: ${xau}`);
  }
  assert.ok(src.includes("tinhChiSoThauPhu"), "route phải tính chỉ số từ dữ liệu hệ thống");
});
