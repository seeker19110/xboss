import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat, datCookie } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Cụm XÁC THỰC — bề mặt bảo mật quan trọng nhất của app. Test thực thi route thật:
//   app/api/auth/login/route.ts, login/2fa, logout, me, password.
//
// Vì sao đáng viết kỹ: đây là nơi một lỗi không gây lỗi hiển thị nào mà lặng lẽ cho người lạ
// vào. Các bất biến dưới đây đều là thứ chỉ lộ ra khi CHẠY route thật — grep mã nguồn hay
// tái hiện SQL đều không bắt được.

const S = { skip: !HAS_TEST_DB };

// Mật khẩu dùng cho tài khoản test — KHÔNG phải bí mật thật (DB ephemeral trong CI/local).
// Gom về hằng thay vì rải chuỗi cạnh chữ "password" ở 12 chỗ: rule generic-api-key của
// gitleaks bắt đúng dạng đó và làm đỏ CI. Giá trị cũng nằm trong allowlist .gitleaks.toml
// theo đúng khuôn đã dùng cho secret E2E.
const MK = "mk-test-xboss-khong-bi-mat";
const MK_MOI = "mk-test-xboss-doi-moi";
const MK_SAI = "mk-test-xboss-sai";
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (t: string) => `${t}${RUN}${++seq}`;

const jreq = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });

/** Tạo user với mật khẩu THẬT (hash bằng chính hashPassword của sản phẩm). */
async function taoUser(role: string, matKhau: string, ten: string) {
  const { insertId, queryOne } = await import("@/lib/db");
  const { hashPassword } = await import("@/lib/bao-mat/auth");
  const email = `auth-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, ?, ?, 1)`,
    `Auth ${ten}`,
    email,
    hashPassword(matKhau),
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, email, passwordHash: u!.password_hash };
}

/** Dọn rate-limit để ca sau không thừa hưởng bộ đếm sai của ca trước. */
async function xoaRateLimit() {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM login_rate_limits`);
}

test(
  "POST /api/auth/login: thiếu email hoặc mật khẩu → 400, không đụng tới hàm băm",
  S,
  async () => {
    // Ép kiểu chuỗi TRƯỚC khi gọi verifyPassword là có chủ đích: scryptSync ném TypeError nếu
    // nhận non-string, vừa lộ 500 vừa không tính vào rate-limit chống brute-force.
    await xoaRateLimit();
    const { POST } = await import("@/app/api/auth/login/route");
    for (const body of [
      {},
      { email: "a@b.c" },
      { password: MK_SAI },
      { email: 123, password: MK_SAI },
    ]) {
      const res = await POST(jreq(body));
      assert.equal(res.status, 400, `body ${JSON.stringify(body)} phải là 400`);
    }
    // Thân request không phải JSON hợp lệ cũng phải là 400, không phải 500.
    const res = await POST(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        body: "{khong-phai-json",
      }),
    );
    assert.equal(res.status, 400);
  },
);

test(
  "POST /api/auth/login: sai mật khẩu và email không tồn tại trả CÙNG một thông báo",
  S,
  async () => {
    // Thông báo khác nhau sẽ biến form đăng nhập thành công cụ dò email có tồn tại hay không.
    await xoaRateLimit();
    const u = await taoUser("pm", MK, "same");
    const { POST } = await import("@/app/api/auth/login/route");

    const saiMk = await POST(jreq({ email: u.email, password: MK_SAI }));
    const khongCo = await POST(
      jreq({ email: `khong-ton-tai-${RUN}@test.local`, password: MK_SAI }),
    );
    assert.equal(saiMk.status, 401);
    assert.equal(khongCo.status, 401);
    assert.equal((await saiMk.json()).error, (await khongCo.json()).error);
  },
);

test("POST /api/auth/login: đúng mật khẩu → 200 + cookie phiên httpOnly", S, async () => {
  await xoaRateLimit();
  const u = await taoUser("pm", MK, "ok");
  const { POST } = await import("@/app/api/auth/login/route");
  const res = await POST(jreq({ email: u.email, password: MK }));
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.user.id, u.id);
  // Không được trả password_hash ra ngoài dưới bất kỳ hình thức nào.
  assert.equal(JSON.stringify(json).includes("password"), false);

  const { COOKIE } = await import("@/lib/bao-mat/session-token");
  const cookie = res.cookies.get(COOKIE);
  assert.ok(cookie, "phải set cookie phiên");
  assert.equal(cookie!.httpOnly, true, "cookie phiên PHẢI httpOnly — JS không được đọc");
  assert.equal(cookie!.sameSite, "lax");

  // Token phải verify được bằng chính parseToken của sản phẩm và trỏ đúng user.
  const { parseToken } = await import("@/lib/bao-mat/session-token");
  assert.equal(parseToken(cookie!.value)?.uid, u.id);
});

test("POST /api/auth/login: email không phân biệt hoa/thường và khoảng trắng thừa", S, async () => {
  // Người dùng gõ email có hoa hoặc dính dấu cách khi copy — chặn họ đăng nhập vì lý do đó là
  // lỗi trải nghiệm, không phải bảo mật.
  await xoaRateLimit();
  const u = await taoUser("pm", MK, "case");
  const { POST } = await import("@/app/api/auth/login/route");
  const res = await POST(jreq({ email: `  ${u.email.toUpperCase()}  `, password: MK }));
  assert.equal(res.status, 200);
});

test("POST /api/auth/login: quá 5 lần sai → 429 kèm Retry-After", S, async () => {
  // Không có chặn brute-force thì mật khẩu yếu bị dò ra chỉ còn là vấn đề thời gian.
  await xoaRateLimit();
  const u = await taoUser("pm", MK, "brute");
  const { POST } = await import("@/app/api/auth/login/route");
  const ip = { "x-forwarded-for": `10.0.0.${(seq % 200) + 1}` };

  for (let i = 0; i < 5; i++) {
    const r = await POST(jreq({ email: u.email, password: MK_SAI }, ip));
    assert.equal(r.status, 401, `lần sai thứ ${i + 1} phải là 401`);
  }
  const chan = await POST(jreq({ email: u.email, password: MK_SAI }, ip));
  assert.equal(chan.status, 429);
  assert.ok(Number(chan.headers.get("Retry-After")) > 0, "phải nói rõ chờ bao lâu");

  // Đang bị chặn thì MẬT KHẨU ĐÚNG cũng không vào được — nếu không, kẻ dò chỉ cần
  // thử tiếp là qua được hàng rào.
  const dungNhungBiChan = await POST(jreq({ email: u.email, password: MK }, ip));
  assert.equal(dungNhungBiChan.status, 429);
});

test("POST /api/auth/login: đăng nhập ĐÚNG xoá bộ đếm sai trước đó", S, async () => {
  await xoaRateLimit();
  const u = await taoUser("pm", MK, "reset");
  const { POST } = await import("@/app/api/auth/login/route");
  const ip = { "x-forwarded-for": "10.9.9.9" };
  for (let i = 0; i < 3; i++) await POST(jreq({ email: u.email, password: MK_SAI }, ip));
  assert.equal((await POST(jreq({ email: u.email, password: MK }, ip))).status, 200);
  // Sau khi vào được, bộ đếm phải sạch: 3 lần sai nữa vẫn chưa chạm ngưỡng 5.
  for (let i = 0; i < 3; i++) {
    const r = await POST(jreq({ email: u.email, password: MK_SAI }, ip));
    assert.equal(r.status, 401, "bộ đếm phải được xoá sau lần đăng nhập thành công");
  }
});

test("POST /api/auth/login: user đã bật 2FA KHÔNG được cấp cookie phiên ngay", S, async () => {
  // Đây là bất biến sống còn của 2FA: nếu bước 1 đã set cookie thì lớp thứ hai thành trang trí.
  await xoaRateLimit();
  const u = await taoUser("admin", MK, "twofa");
  const { run } = await import("@/lib/db");
  await run(`UPDATE users SET totp_enabled_at = NOW(), totp_secret = 'X' WHERE id = ?`, u.id);

  const { POST } = await import("@/app/api/auth/login/route");
  const res = await POST(jreq({ email: u.email, password: MK }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.need2fa, true);
  assert.ok(json.pending, "phải trả token tạm cho bước 2");
  assert.equal(json.user, undefined, "chưa qua 2FA thì chưa được coi là đã đăng nhập");

  const { COOKIE } = await import("@/lib/bao-mat/session-token");
  assert.equal(res.cookies.get(COOKIE), undefined, "TUYỆT ĐỐI không set cookie phiên ở bước 1");

  // Token tạm KHÔNG được dùng thay cookie phiên (5 phần, phần thứ 4 là "2fa").
  const { parseToken } = await import("@/lib/bao-mat/session-token");
  assert.equal(parseToken(json.pending), null, "token chờ-2FA không được parse thành phiên hợp lệ");
});

test("GET /api/auth/me: chưa đăng nhập → 401 và user null", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/auth/me/route");
  const res = await GET();
  assert.equal(res.status, 401);
  assert.equal((await res.json()).user, null);
});

test("GET /api/auth/me: có phiên hợp lệ → trả user, không lộ hash mật khẩu", S, async () => {
  const u = await taoUser("pm", MK, "me");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { GET } = await import("@/app/api/auth/me/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.id, u.id);
  assert.equal(JSON.stringify(body).includes(u.passwordHash), false);
  assert.equal(JSON.stringify(body).includes("password"), false);
});

test("GET /api/auth/me: cookie bị sửa chữ ký → 401", S, async () => {
  const u = await taoUser("pm", MK, "meforge");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { COOKIE } = await import("@/lib/bao-mat/session-token");
  datCookie(COOKIE, `${u.id}.${Date.now() + 86400000}.abcdef123456.0.0.1.deadbeefdeadbeef`);
  const { GET } = await import("@/app/api/auth/me/route");
  assert.equal((await GET()).status, 401);
});

test("GET /api/auth/me: đổi mật khẩu làm mọi phiên cũ hết hiệu lực", S, async () => {
  // pwFrag trong token là 12 ký tự đầu của hash. Đổi mật khẩu → hash đổi → token cũ vô hiệu.
  // Đây là thứ giữ cho "đổi mật khẩu vì nghi bị lộ" thực sự có tác dụng.
  const u = await taoUser("pm", MK, "pwchange");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { GET } = await import("@/app/api/auth/me/route");
  assert.equal((await GET()).status, 200);

  const { run } = await import("@/lib/db");
  const { hashPassword } = await import("@/lib/bao-mat/auth");
  await run(`UPDATE users SET password_hash = ? WHERE id = ?`, hashPassword(MK_MOI), u.id);
  assert.equal((await GET()).status, 401, "phiên ký bằng hash cũ phải hết hiệu lực");
});

test("GET /api/auth/me: thu hồi phiên (session_version) vô hiệu token cũ", S, async () => {
  const u = await taoUser("pm", MK, "revoke");
  dangNhap({ id: u.id, passwordHash: u.passwordHash, sessionVersion: 0 });
  const { GET } = await import("@/app/api/auth/me/route");
  assert.equal((await GET()).status, 200);

  const { run } = await import("@/lib/db");
  await run(`UPDATE users SET session_version = session_version + 1 WHERE id = ?`, u.id);
  assert.equal((await GET()).status, 401, "admin thu hồi phiên thì token cũ phải chết ngay");
});

test("GET /api/auth/me: user bị xoá thì phiên cũ không còn dùng được", S, async () => {
  const u = await taoUser("pm", MK, "deleted");
  dangNhap({ id: u.id, passwordHash: u.passwordHash });
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM users WHERE id = ?`, u.id);
  const { GET } = await import("@/app/api/auth/me/route");
  assert.equal((await GET()).status, 401);
});

test("GET /api/auth/me: cờ bắt buộc bật 2FA được báo về client ngay lần gọi đầu", S, async () => {
  // /api/auth/me nằm trong whitelist của proxy nên luôn qua; route tự đọc cờ từ token để
  // client redirect ngay, thay vì phải đợi một API khác trả 403 rồi mới biết.
  const u = await taoUser("admin", MK, "must2fa");
  dangNhap({ id: u.id, passwordHash: u.passwordHash, mustSetup2fa: true });
  const { GET } = await import("@/app/api/auth/me/route");
  const res = await GET();
  const body = await res.json();
  assert.equal(body.code, "2fa_required");
  assert.ok(body.user, "vẫn trả user để client biết là ai đang bị chặn");
});

test("POST /api/auth/logout: xoá cookie phiên bằng maxAge 0", S, async () => {
  const { POST } = await import("@/app/api/auth/logout/route");
  const res = await POST();
  assert.equal(res.status, 200);
  const { COOKIE } = await import("@/lib/bao-mat/session-token");
  const cookie = res.cookies.get(COOKIE);
  assert.ok(cookie);
  assert.equal(cookie!.value, "");
  assert.equal(cookie!.maxAge, 0);
  assert.equal(cookie!.httpOnly, true);
});
