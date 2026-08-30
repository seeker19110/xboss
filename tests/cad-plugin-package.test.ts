// P8 — thông tin gói cài plugin AutoCAD lộ ra web (/engineering/cai-dat-plugin).
// Route GET /api/engineering/cad/plugin-package gọi getCurrentUser() (next/headers) nên không
// gọi handler trực tiếp ngoài request scope thật của Next (đúng quy ước
// tests/engineering-cad-rule-pack.test.ts) — kiểm 2 lớp:
//   (1) lib/ky-thuat/cad/dashboard.ts: hàm thuần bocVersionTuNoiDung + đọc thật
//       Directory.Build.props + lọc sha256 hợp lệ từ biến môi trường — không cần DB;
//   (2) lớp mỏng của route (auth 401/403, force-dynamic) kiểm qua mã nguồn route.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  bocVersionTuNoiDung,
  docVersionGoiCai,
  layThongTinGoiCai,
} from "@/lib/ky-thuat/cad/dashboard";

// ===== (1) lib thuần =====

test("bocVersionTuNoiDung: bóc đúng version từ thẻ <Version>", () => {
  const noiDung = `<Project><PropertyGroup><Version>1.2.3</Version></PropertyGroup></Project>`;
  assert.equal(bocVersionTuNoiDung(noiDung), "1.2.3");
});

test("bocVersionTuNoiDung: null khi không có thẻ <Version> (fail mềm, không bịa số)", () => {
  assert.equal(bocVersionTuNoiDung(`<Project><PropertyGroup></PropertyGroup></Project>`), null);
  assert.equal(bocVersionTuNoiDung(""), null);
});

test("docVersionGoiCai: đọc đúng version thật từ plugin-autocad/Directory.Build.props", async () => {
  const version = await docVersionGoiCai();
  // Nguồn sự thật duy nhất — đối chiếu trực tiếp với tệp thật, không hard-code số version ở đây
  // để test không tự lệch mỗi lần phát hành bản mới (chỉ CLAUDE.md's Directory.Build.props đổi).
  const propsPath = join(process.cwd(), "plugin-autocad", "Directory.Build.props");
  const noiDungThat = readFileSync(propsPath, "utf-8");
  assert.equal(version, bocVersionTuNoiDung(noiDungThat));
  assert.ok(version, "phải đọc được version thật (tệp Directory.Build.props tồn tại trong repo)");
});

test("layThongTinGoiCai: sha256 null khi thiếu biến môi trường XBOSS_PLUGIN_SHA256", async () => {
  const cu = process.env.XBOSS_PLUGIN_SHA256;
  delete process.env.XBOSS_PLUGIN_SHA256;
  try {
    const tt = await layThongTinGoiCai();
    assert.equal(tt.sha256, null);
  } finally {
    if (cu !== undefined) process.env.XBOSS_PLUGIN_SHA256 = cu;
  }
});

test("layThongTinGoiCai: nhận sha256 hợp lệ (64 hex, không phân biệt hoa/thường)", async () => {
  const cu = process.env.XBOSS_PLUGIN_SHA256;
  process.env.XBOSS_PLUGIN_SHA256 = "A".repeat(64);
  try {
    const tt = await layThongTinGoiCai();
    assert.equal(tt.sha256, "a".repeat(64));
  } finally {
    if (cu === undefined) delete process.env.XBOSS_PLUGIN_SHA256;
    else process.env.XBOSS_PLUGIN_SHA256 = cu;
  }
});

test("layThongTinGoiCai: bỏ qua giá trị sha256 gõ nhầm (không đủ 64 hex), tránh checksum giả", async () => {
  const cu = process.env.XBOSS_PLUGIN_SHA256;
  process.env.XBOSS_PLUGIN_SHA256 = "khong-phai-sha256";
  try {
    const tt = await layThongTinGoiCai();
    assert.equal(tt.sha256, null);
  } finally {
    if (cu === undefined) delete process.env.XBOSS_PLUGIN_SHA256;
    else process.env.XBOSS_PLUGIN_SHA256 = cu;
  }
});

// ===== (2) lớp mỏng của route =====

test("route plugin-package: có kiểm đăng nhập 401, kiểm quyền 403, force-dynamic", () => {
  const src = readFileSync(
    join(process.cwd(), "app/api/engineering/cad/plugin-package/route.ts"),
    "utf-8",
  );
  assert.ok(src.includes("getCurrentUser"), "phải gọi getCurrentUser()");
  assert.ok(src.includes("status: 401"), "phải trả 401 khi chưa đăng nhập");
  assert.ok(src.includes("CAN.viewEngineeringGraph(user.role)"), "phải kiểm quyền qua CAN");
  assert.ok(src.includes("status: 403"), "phải trả 403 khi thiếu quyền");
  assert.ok(
    src.includes('export const dynamic = "force-dynamic"'),
    "route phải khai force-dynamic",
  );
});
