import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Đợt 6 — Việc A: TÍNH BỀN của lệnh huỷ (kill switch) trong Safe Execution Engine (OS-4).
//
// Lỗi được vá: `executeExecutionRequest` ghi `UPDATE ... status='killed'` rồi `throw` NGAY SAU,
// cả hai nằm trong cùng một `withProjectScope(..., { readOnly: false })` — vốn bọc
// `withTransaction` — nên `throw` làm ROLLBACK xoá luôn lệnh huỷ. Bản ghi ở lại `authorized`
// với `approval_token` còn hạn 15 phút: bật kill switch rồi tắt lại trong cửa sổ đó thì chính
// yêu cầu lẽ ra đã bị huỷ vẫn thực thi được THẬT.
//
// Test gọi THẲNG hàm lib (không qua route) vì bất biến cần khoá nằm ở tầng lib — ranh giới
// transaction — và vì mã trạng thái HTTP của cụm `engineering` đang được đổi ở một việc khác
// cùng đợt; khoá mã HTTP ở đây sẽ đỏ giả. Phủ route `.../requests/:id/execute` đã có sẵn ở
// `tests/route-eng-quy-trinh.test.ts`.

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng tên/email khi nhiều ca cùng tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `AUTOKS ${uniq(ten)}`);
}

/** Mọi id khoá ngoại trong test phải đến từ đây, không gán cứng (bài học Đợt 4/5). */
async function taoUser(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, 'hash-test-autoks', 'admin')`,
    `AUTOKS ${ten}`,
    `autoks-${uniq(ten)}@test.local`,
  );
}

/** Dựng 1 yêu cầu thực thi đã được cấp token (trạng thái `authorized`). */
async function taoYeuCauDaCapToken(
  projectId: number,
  userId: number,
): Promise<{ id: string; token: string }> {
  const { createExecutionRequest, authorizeExecutionRequest } =
    await import("@/lib/ky-thuat/engineering-autonomy");
  const req = await createExecutionRequest(projectId, {
    capabilityKey: "cap_sync_twin_state",
    autonomyLevel: "A1",
    intent: `Đồng bộ snapshot Digital Twin ${uniq("intent")}`,
    targetData: { objectId: "AHU-01", value: 3200 },
    createdBy: userId,
  });
  const { token } = await authorizeExecutionRequest(projectId, req.id, userId);
  return { id: req.id, token };
}

type DongYeuCau = { status: string; approvalToken: string | null };

async function docYeuCau(requestId: string): Promise<DongYeuCau | undefined> {
  const { queryOne } = await import("@/lib/db");
  return queryOne<DongYeuCau>(
    `SELECT status, approval_token AS "approvalToken"
     FROM engineering_execution_requests WHERE id = ?`,
    requestId,
  );
}

async function donDep(projectId: number, userId: number): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM projects WHERE id = ?`, projectId);
  await run(`DELETE FROM users WHERE id = ?`, userId);
}

test(
  "kill switch bật → executeExecutionRequest ném lỗi VÀ lệnh huỷ được ghi bền (status='killed', token NULL)",
  S,
  async () => {
    const { toggleKillSwitch, executeExecutionRequest } =
      await import("@/lib/ky-thuat/engineering-autonomy");
    const projectId = await taoDuAn("ben");
    const userId = await taoUser("ben");
    try {
      const yc = await taoYeuCauDaCapToken(projectId, userId);
      await toggleKillSwitch(projectId, null, true, "Sự cố an toàn diễn tập", userId);

      await assert.rejects(
        () => executeExecutionRequest(projectId, yc.id, yc.token, "admin"),
        /Thực thi bị hủy bỏ: .*Kill Switch/,
        "phải ném đúng thông điệp huỷ (hợp đồng lỗi ra ngoài không đổi)",
      );

      const row = await docYeuCau(yc.id);
      assert.equal(row?.status, "killed", "lệnh huỷ phải CÒN trong DB sau khi hàm ném lỗi");
      assert.equal(row?.approvalToken, null, "cửa sổ token phải đóng ngay khi huỷ");
    } finally {
      await donDep(projectId, userId);
    }
  },
);

test(
  "kill switch bật rồi TẮT trong 15 phút → yêu cầu đã huỷ không thực thi lại được (lỗ hổng đã đóng)",
  S,
  async () => {
    const { toggleKillSwitch, executeExecutionRequest } =
      await import("@/lib/ky-thuat/engineering-autonomy");
    const projectId = await taoDuAn("tatlai");
    const userId = await taoUser("tatlai");
    try {
      const yc = await taoYeuCauDaCapToken(projectId, userId);
      await toggleKillSwitch(projectId, null, true, "Dừng khẩn cấp", userId);
      await assert.rejects(() => executeExecutionRequest(projectId, yc.id, yc.token, "admin"));

      // Tắt kill switch — token cũ vẫn còn trong tay người gọi và chưa hết hạn 15 phút.
      await toggleKillSwitch(projectId, null, false, "Phục hồi", userId);
      const { checkAutonomyAllowance } = await import("@/lib/ky-thuat/engineering-autonomy");
      const allow = await checkAutonomyAllowance(projectId, "cap_sync_twin_state", "A1", "admin");
      assert.equal(allow.allowed, true, "kill switch đã tắt thật (không phải đỏ giả)");

      await assert.rejects(
        () => executeExecutionRequest(projectId, yc.id, yc.token, "admin"),
        /chưa được cấp quyền/,
        "yêu cầu đã bị huỷ không được thực thi lại kể cả khi kill switch đã tắt",
      );
      const row = await docYeuCau(yc.id);
      assert.equal(row?.status, "killed", "vẫn ở 'killed', không nhảy sang 'completed'");
    } finally {
      await donDep(projectId, userId);
    }
  },
);

test("đường hạnh phúc: authorized + token đúng + kill switch tắt → completed", S, async () => {
  const { executeExecutionRequest } = await import("@/lib/ky-thuat/engineering-autonomy");
  const projectId = await taoDuAn("okok");
  const userId = await taoUser("okok");
  try {
    const yc = await taoYeuCauDaCapToken(projectId, userId);
    const done = await executeExecutionRequest(projectId, yc.id, yc.token, "admin");
    assert.equal(done.status, "completed");
    assert.equal(done.approvalToken, null);
    assert.equal((done.executionResult as { success?: boolean } | null)?.success, true);

    const row = await docYeuCau(yc.id);
    assert.equal(row?.status, "completed");
    assert.equal(row?.approvalToken, null);
  } finally {
    await donDep(projectId, userId);
  }
});

test("token dùng 1 lần: gọi lần 2 với cùng token → thất bại, không thực thi lại", S, async () => {
  const { executeExecutionRequest } = await import("@/lib/ky-thuat/engineering-autonomy");
  const projectId = await taoDuAn("motlan");
  const userId = await taoUser("motlan");
  try {
    const yc = await taoYeuCauDaCapToken(projectId, userId);
    const lan1 = await executeExecutionRequest(projectId, yc.id, yc.token, "admin");
    assert.equal(lan1.status, "completed");

    await assert.rejects(
      () => executeExecutionRequest(projectId, yc.id, yc.token, "admin"),
      /chưa được cấp quyền/,
    );
  } finally {
    await donDep(projectId, userId);
  }
});

test(
  "hai lời gọi ĐỒNG THỜI cùng token: đúng 1 lần thành công, lần còn lại bị chặn",
  S,
  async () => {
    const { executeExecutionRequest } = await import("@/lib/ky-thuat/engineering-autonomy");
    const projectId = await taoDuAn("dongthoi");
    const userId = await taoUser("dongthoi");
    try {
      const yc = await taoYeuCauDaCapToken(projectId, userId);
      const ketQua = await Promise.allSettled([
        executeExecutionRequest(projectId, yc.id, yc.token, "admin"),
        executeExecutionRequest(projectId, yc.id, yc.token, "admin"),
      ]);
      const thanhCong = ketQua.filter((r) => r.status === "fulfilled");
      const thatBai = ketQua.filter((r) => r.status === "rejected");
      assert.equal(thanhCong.length, 1, `phải đúng 1 lần thành công: ${JSON.stringify(ketQua)}`);
      assert.equal(thatBai.length, 1, "lời gọi thứ hai phải bị chặn, không thực thi lần hai");
      // Bị chặn ĐÚNG bởi cơ chế chống đua (khoá dòng / UPDATE có điều kiện), không phải lỗi lạ.
      const loi = (thatBai[0] as PromiseRejectedResult).reason as Error;
      assert.match(loi.message, /chưa được cấp quyền|đã được thực thi bởi một tiến trình khác/);

      const row = await docYeuCau(yc.id);
      assert.equal(row?.status, "completed");
      assert.equal(row?.approvalToken, null);
    } finally {
      await donDep(projectId, userId);
    }
  },
);

test("cách ly dự án: gọi bằng projectId khác → không tìm thấy yêu cầu", S, async () => {
  const { executeExecutionRequest } = await import("@/lib/ky-thuat/engineering-autonomy");
  const projectA = await taoDuAn("cachlyA");
  const projectB = await taoDuAn("cachlyB");
  const userId = await taoUser("cachly");
  try {
    const yc = await taoYeuCauDaCapToken(projectA, userId);
    await assert.rejects(
      () => executeExecutionRequest(projectB, yc.id, yc.token, "admin"),
      /Không tìm thấy yêu cầu thực thi/,
    );
    const row = await docYeuCau(yc.id);
    assert.equal(row?.status, "authorized", "yêu cầu của dự án A không được đụng tới");
  } finally {
    const { run } = await import("@/lib/db");
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, projectA, projectB);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  }
});

test(
  "kill switch bật giữa lúc chờ: yêu cầu của dự án KHÁC không bị ghi 'killed' lây",
  S,
  async () => {
    const { toggleKillSwitch, executeExecutionRequest } =
      await import("@/lib/ky-thuat/engineering-autonomy");
    const projectA = await taoDuAn("lanA");
    const projectB = await taoDuAn("lanB");
    const userId = await taoUser("lan");
    try {
      const ycA = await taoYeuCauDaCapToken(projectA, userId);
      const ycB = await taoYeuCauDaCapToken(projectB, userId);
      await toggleKillSwitch(projectA, null, true, "Chỉ dự án A", userId);

      await assert.rejects(() => executeExecutionRequest(projectA, ycA.id, ycA.token, "admin"));

      const rowA = await docYeuCau(ycA.id);
      assert.equal(rowA?.status, "killed");
      const rowB = await docYeuCau(ycB.id);
      assert.equal(rowB?.status, "authorized", "yêu cầu dự án B không được đụng tới");
      assert.equal(rowB?.approvalToken, ycB.token);
    } finally {
      const { run } = await import("@/lib/db");
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, projectA, projectB);
      await run(`DELETE FROM users WHERE id = ?`, userId);
    }
  },
);
