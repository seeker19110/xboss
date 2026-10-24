import "./setup"; // chặn DATABASE_URL thật trước mọi kiểm thử
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Socket } from "node:net";
import nodemailer from "nodemailer";

// Dùng sendMail thật như ba route cron. streamTransport chỉ biên soạn trong bộ nhớ,
// SMTP giả chỉ nghe loopback; không nạp cấu hình SMTP hoặc gọi provider của ứng dụng.
const NGUOI_GUI = '"XBoss" <xboss@sender.invalid>';
const TIEU_DE = "🏗️ Báo cáo tiến độ công trường — kỹ sư và trưởng dự án";

async function bienSoan(nguoiNhan: string) {
  const mailer = nodemailer.createTransport({ streamTransport: true, buffer: true });
  return mailer.sendMail({
    from: NGUOI_GUI,
    to: nguoiNhan,
    subject: TIEU_DE,
    html: "<p>Báo cáo thử nghiệm, không gửi ra ngoài.</p>",
  });
}

const CAC_DIA_CHI_HOI_QUY = [
  {
    ghsa: "GHSA-8c8m-p3m8-cjg8",
    ten: "chú thích lồng nhau không biến nội dung chú thích thành người nhận",
    to: "Victim (x(y) <evil@evil.invalid>) <v@victim.invalid>",
    expected: "v@victim.invalid",
  },
  {
    ghsa: "GHSA-m943-m63m-w62w",
    ten: "dấu chấm phẩy trong chú thích không kết thúc nhóm địa chỉ",
    to: "G: (a; <evil@evil.invalid>) <v@victim.invalid>;",
    expected: "v@victim.invalid",
  },
  {
    ghsa: "GHSA-85x2-q946-cp5h",
    ten: "dấu lớn hơn trong local-part có nháy không đổi miền người nhận",
    to: '<"a@evil.invalid>"@victim.invalid>',
    // MimeNode._normalizeAddress thay <> bằng khoảng trắng trước khi tạo envelope.
    // Ký tự @evil.invalid ở đây thuộc local-part có nháy, không phải miền nhận thư.
    expected: '"a@evil.invalid "@victim.invalid',
  },
];

for (const ca of CAC_DIA_CHI_HOI_QUY) {
  // Nguồn PoC và miền hợp lệ: https://github.com/nodemailer/nodemailer/security/advisories/<ghsa>.
  test(`Nodemailer ${ca.ghsa}: ${ca.ten}`, async () => {
    const info = await bienSoan(ca.to);
    assert.deepEqual(
      info.envelope.to,
      [ca.expected],
      "envelope phải giữ đúng mailbox sau chuẩn hoá của transport",
    );
    assert.deepEqual(
      info.envelope.to.map((address) => address.slice(address.lastIndexOf("@") + 1)),
      ["victim.invalid"],
      "không chuyển miền nhận thư sang evil.invalid",
    );
  });
}

test("Nodemailer: danh sách người nhận có dấu phẩy và tên tiếng Việt vẫn biên soạn được", async () => {
  const info = await bienSoan(
    '"Kỹ sư hiện trường" <engineer@victim.invalid>, "Trưởng dự án" <pm@victim.invalid>',
  );
  assert.equal(info.envelope.from, "xboss@sender.invalid");
  assert.deepEqual(info.envelope.to, ["engineer@victim.invalid", "pm@victim.invalid"]);
  assert.ok(Buffer.isBuffer(info.message));
  const message = info.message.toString("utf8");
  assert.match(message, /^Subject: =\?UTF-8\?/im, "tiêu đề tiếng Việt được mã hoá MIME");
  assert.match(message, /Content-Type: text\/html; charset=utf-8/i);
});

async function smtpCucBo(t: TestContext, tuChoiNguoiNhan = false) {
  const commands: string[] = [];
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    socket.setEncoding("utf8");
    socket.write("220 localhost SMTP thử nghiệm\r\n");
    let pending = "";
    let data: string[] | null = null;
    let acceptedRecipients = 0;
    socket.on("data", (chunk: string) => {
      pending += chunk;
      let end: number;
      while ((end = pending.indexOf("\r\n")) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        if (data) {
          if (line === ".") {
            messages.push(data.join("\r\n"));
            data = null;
            socket.write("250 2.0.0 Đã nhận thư thử nghiệm\r\n");
          } else data.push(line);
          continue;
        }
        commands.push(line);
        if (line.startsWith("EHLO "))
          socket.write("250-localhost\r\n250-PIPELINING\r\n250 AUTH PLAIN\r\n");
        else if (line.startsWith("AUTH PLAIN "))
          socket.write("235 2.7.0 Xác thực thử nghiệm thành công\r\n");
        else if (line.startsWith("MAIL FROM:")) {
          acceptedRecipients = 0;
          socket.write("250 2.1.0 OK\r\n");
        } else if (line.startsWith("RCPT TO:")) {
          if (!tuChoiNguoiNhan) acceptedRecipients++;
          socket.write(tuChoiNguoiNhan ? "550 5.1.1 Từ chối người nhận\r\n" : "250 2.1.5 OK\r\n");
        } else if (line === "DATA") {
          // DATA có thể đã được pipeline cùng RCPT. Không nhận body khi mọi RCPT bị từ chối.
          if (acceptedRecipients === 0) socket.write("503 5.5.1 Cần người nhận hợp lệ\r\n");
          else {
            data = [];
            socket.write("354 Kết thúc bằng dấu chấm\r\n");
          }
        } else if (line === "QUIT") socket.end("221 2.0.0 Tạm biệt\r\n");
        else socket.write("500 5.5.1 Lệnh không hỗ trợ\r\n");
      }
    });
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const mailer = nodemailer.createTransport({
    host: "127.0.0.1",
    port: address.port,
    secure: false,
    auth: { user: "smtp-local@sender.invalid", pass: "synthetic-test-only" },
    connectionTimeout: 2000,
    greetingTimeout: 2000,
    socketTimeout: 2000,
  });
  t.after(() => mailer.close());
  return { mailer, commands, messages };
}

test(
  "Nodemailer SMTP: gửi đúng To/Bcc khi server hỗ trợ PIPELINING, không lộ header Bcc",
  { timeout: 5000 },
  async (t) => {
    const { mailer, commands, messages } = await smtpCucBo(t);
    const info = await mailer.sendMail({
      from: NGUOI_GUI,
      to: '"Kỹ sư" <engineer@victim.invalid>, "Trưởng dự án" <pm@victim.invalid>',
      bcc: "admin@other.invalid",
      subject: TIEU_DE,
      html: "<p>Báo cáo thử nghiệm.</p>",
    });
    const expected = ["engineer@victim.invalid", "pm@victim.invalid", "admin@other.invalid"];
    assert.deepEqual(info.accepted, expected);
    assert.deepEqual(info.rejected, []);
    assert.deepEqual(
      commands.filter((line) => line.startsWith("RCPT TO:")),
      expected.map((email) => `RCPT TO:<${email}>`),
    );
    assert.ok(
      commands.some((line) => line.startsWith("AUTH PLAIN ")),
      "giữ đường xác thực SMTP",
    );
    assert.equal(messages.length, 1, "mỗi sendMail chỉ gửi một nội dung");
    assert.doesNotMatch(
      messages[0],
      /^Bcc:/im,
      "người nhận Bcc không xuất hiện trong nội dung SMTP",
    );
    assert.match(messages[0], /^Subject: =\?UTF-8\?/im);
  },
);

test(
  "Nodemailer SMTP: server từ chối người nhận thì sendMail báo lỗi và không gửi nội dung thư",
  { timeout: 5000 },
  async (t) => {
    const { mailer, commands, messages } = await smtpCucBo(t, true);
    await assert.rejects(
      mailer.sendMail({
        from: NGUOI_GUI,
        to: "pm@victim.invalid",
        subject: TIEU_DE,
        html: "<p>Thử nghiệm</p>",
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error && "code" in error && "responseCode" in error);
        assert.equal(error.code, "EENVELOPE");
        assert.equal(error.responseCode, 550);
        return true;
      },
    );
    assert.equal(commands.filter((line) => line.startsWith("RCPT TO:")).length, 1);
    assert.deepEqual(messages, []);
  },
);
