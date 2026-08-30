// Cấu hình PM2 cho XBoss — nguồn sự thật DUY NHẤT về cách chạy các tiến trình trên VPS.
//
// XBoss chạy tự host bằng PM2, KHÔNG dùng Docker (xem DEPLOY.md). Trước đây có song song hai
// đường triển khai (Docker Compose và PM2), nay chỉ còn PM2 — bớt một bộ artefact phải bảo trì
// và một lớp trừu tượng giữa lỗi production với người sửa.
//
// Dùng:
//   pm2 start ecosystem.config.js              # chạy cả app lẫn worker
//   pm2 start ecosystem.config.js --only xboss # chỉ chạy app (VPS không cần worker AI)
//   pm2 save && pm2 startup                    # tự bật lại sau khi máy reboot
//
// Các lần cập nhật sau dùng `bash deploy.sh` (build vào thư mục tạm → swap atomic → reload →
// health-check → tự rollback nếu hỏng), không chạy tay lại các lệnh trên.

const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

/**
 * Đọc file .env kiểu dotenv thành object.
 *
 * Cần thiết vì hai tiến trình lấy biến môi trường theo hai đường khác nhau: Next.js TỰ đọc
 * `.env.local`, còn `scripts/mepf/worker_entry.py` đọc thẳng `os.environ["DATABASE_URL"]` và
 * **ném KeyError ngay khi khởi động** nếu thiếu. Chạy bằng Docker thì compose truyền biến vào
 * container nên không lộ ra; chuyển sang PM2 thì phải tự nạp, nếu không worker chết ngay.
 */
function docEnv(duongDan) {
  if (!existsSync(duongDan)) return {};
  const ketQua = {};
  for (const dong of readFileSync(duongDan, "utf8").split(/\r?\n/)) {
    const sach = dong.trim();
    if (!sach || sach.startsWith("#")) continue;
    const dauBang = sach.indexOf("=");
    if (dauBang < 0) continue;
    const khoa = sach.slice(0, dauBang).trim();
    let giaTri = sach.slice(dauBang + 1).trim();
    // Bỏ cặp nháy bao ngoài nếu có
    if (
      (giaTri.startsWith('"') && giaTri.endsWith('"')) ||
      (giaTri.startsWith("'") && giaTri.endsWith("'"))
    ) {
      giaTri = giaTri.slice(1, -1);
    }
    if (khoa) ketQua[khoa] = giaTri;
  }
  return ketQua;
}

// Ưu tiên biến đã có sẵn trong môi trường shell, sau đó tới .env.local, cuối cùng .env
const envFile = {
  ...docEnv(join(__dirname, ".env")),
  ...docEnv(join(__dirname, ".env.local")),
};

/** Lấy biến theo thứ tự ưu tiên: môi trường thật → file env → mặc định. */
function bien(ten, macDinh) {
  return process.env[ten] ?? envFile[ten] ?? macDinh;
}

module.exports = {
  apps: [
    {
      // ── Ứng dụng Next.js ──────────────────────────────────────────────────
      name: "xboss",
      // Gọi thẳng binary của Next thay vì "npm start": PM2 quản lý đúng tiến trình Node thật
      // (tín hiệu dừng tới thẳng server, không qua lớp npm trung gian), và đây là điều kiện để
      // chạy được chế độ cluster bên dưới — `npm` không phải script Node nên PM2 không cluster
      // hoá được nó.
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0",
      cwd: __dirname,

      // 1 instance là đủ cho quy mô hiện tại. Muốn scale ngang trên cùng máy: đổi thành số
      // instance mong muốn (hoặc "max") và exec_mode "cluster" — NHƯNG phải hạ
      // XBOSS_PG_POOL_MAX tương ứng để N × pool < max_connections của Postgres, xem mục
      // "Chạy nhiều instance" trong DEPLOY.md.
      instances: 1,
      exec_mode: "fork",

      // Next.js tự đọc .env.local cho CODE ỨNG DỤNG, nhưng `next start` lấy cổng từ biến môi
      // trường THẬT của tiến trình — khai `PORT` trong .env.local thôi thì server vẫn nghe 3000.
      // Đây là cái bẫy im lặng: `deploy.sh` đọc PORT từ .env.local để dựng URL health-check, nên
      // lệch cổng là health-check trượt và deploy TỰ ROLLBACK dù app chạy hoàn toàn bình thường.
      // Nạp sẵn ở đây để cổng khai trong .env.local có hiệu lực thật.
      env: {
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        PORT: bien("PORT", "3000"),
      },

      // Chờ app tự báo sẵn sàng thay vì đoán theo thời gian; quá hạn thì PM2 coi như hỏng.
      // `deploy.sh` còn health-check `/api/health` sau reload nên đây chỉ là lưới thứ hai.
      listen_timeout: 15000,
      kill_timeout: 10000,
      max_restarts: 10,
      // Bản vẽ CAD lớn có thể đẩy heap lên cao trong lúc parse — cho ngưỡng rộng hơn mặc định
      max_memory_restart: "1G",

      // Không watch: deploy.sh chủ động reload, watch sẽ khởi động lại giữa lúc đang swap ".next"
      watch: false,

      out_file: "logs/xboss-out.log",
      error_file: "logs/xboss-error.log",
      merge_logs: true,
      time: true,
    },

    {
      // ── MEPF worker (daemon Python xử lý tác vụ AI kỹ thuật ngầm) ─────────
      // Poll hàng đợi `engineering_async_tasks` bằng SKIP LOCKED — không cần Redis/Celery.
      // Thiếu ANTHROPIC_API_KEY/OPENAI_API_KEY thì worker tự chạy dry-run.
      name: "mepf-worker",
      script: "scripts/mepf/worker_entry.py",
      interpreter: "python3",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",

      env: {
        // Worker đọc thẳng os.environ, không tự nạp file env — phải truyền vào tận nơi
        DATABASE_URL: bien("DATABASE_URL", ""),
        ANTHROPIC_API_KEY: bien("ANTHROPIC_API_KEY", ""),
        OPENAI_API_KEY: bien("OPENAI_API_KEY", ""),

        // BẮT BUỘC có CẢ thư mục cha lẫn thư mục src trong PYTHONPATH: MEPF-Agents tự import
        // theo kiểu `from src.state import ...` (cần thư mục cha) lẫn kiểu phẳng (cần src).
        // Thiếu thư mục cha thì `from src.state` ném ModuleNotFoundError và worker ÂM THẦM rơi
        // về dry-run — không báo lỗi, chỉ là mọi tác vụ AI đều trả kết quả giả.
        PYTHONPATH: `${__dirname}/mepf-worker:${__dirname}/mepf-worker/src:${__dirname}`,
        // Đường dẫn src của MEPF-Agents (worker_entry.py mặc định trỏ vào đường dẫn trong
        // container cũ, phải khai lại khi chạy thẳng trên máy).
        MEPF_AGENT_SRC: `${__dirname}/mepf-worker/src`,
        // Không đệm stdout, nếu không log chỉ hiện ra khi worker thoát
        PYTHONUNBUFFERED: "1",

        MEPF_WORKER_ID: bien("MEPF_WORKER_ID", "mepf-worker-1"),
        MEPF_WORKER_CONCURRENCY: bien("MEPF_WORKER_CONCURRENCY", "2"),
        MEPF_DRY_RUN: bien("MEPF_DRY_RUN", "false"),
        MEPF_POLL_INTERVAL: bien("MEPF_POLL_INTERVAL", "3"),
        MEPF_LEASE_MINUTES: bien("MEPF_LEASE_MINUTES", "10"),
      },

      kill_timeout: 15000,
      max_restarts: 10,
      max_memory_restart: "1G",
      watch: false,

      out_file: "logs/mepf-worker-out.log",
      error_file: "logs/mepf-worker-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
