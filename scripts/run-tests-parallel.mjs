// Bộ chạy test song song — tách khỏi run-tests.mjs cho dễ đọc.
//
// Vì sao cần: cách cũ chạy 210 file, mỗi file 1 tiến trình Node, TUẦN TỰ. Chi phí thật
// không nằm ở test (mỗi ca chỉ 0,2–0,5ms) mà ở 210 lần khởi động Node + transpile lại
// TypeScript. Đo được: file thuần ~0,9s/file, file chạm DB ~13,6s/file → tổng ~30 phút.
//
// Hai đòn bẩy, giữ nguyên lý do khiến bản cũ chọn tuần tự (xem comment đầu run-tests.mjs):
//
// 1. File KHÔNG chạm DB (~83 file): gộp hết vào MỘT tiến trình. Không có DB dùng chung
//    nên không có lớp lỗi nhiễu dữ liệu; node:test tự chạy song song trong process đó.
//
// 2. File CHẠM DB (~127 file): vẫn giữ 1 tiến trình / 1 file (không đổi ngữ nghĩa cô lập,
//    module cache vẫn riêng — quan trọng vì đã có tiền lệ test làm ô nhiễm NODE_ENV cho
//    file chạy sau), nhưng chạy N file ĐỒNG THỜI, mỗi worker trỏ vào MỘT DATABASE RIÊNG.
//    Database riêng chính là thứ cho phép song song mà không đụng nhau — đây là điểm khác
//    cốt lõi so với bản cũ, không phải "bỏ cô lập để lấy tốc độ".
//
// Database mỗi worker tạo bằng `CREATE DATABASE ... TEMPLATE <base>` sau khi base đã
// migrate một lần → copy nhanh và bỏ luôn chi phí ensureSchema() lặp ở từng tiến trình.

import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { cpus } from "node:os";
import { CO_MOCK_MODULE } from "./test-flags.mjs";

/** File có chạm DB không — quyết định gộp chung tiến trình hay tách riêng + cấp DB riêng. */
function chamDb(file) {
  const src = readFileSync(file, "utf8");
  return /HAS_TEST_DB|TEST_DATABASE_URL|@\/lib\/db|from "\.\/setup"|from "@\/tests\/setup"/.test(
    src,
  );
}

/** Số worker: ưu tiên biến môi trường, mặc định min(16, cpu-2), tối thiểu 1. */
function soWorker() {
  const env = Number(process.env.TEST_WORKERS);
  if (Number.isFinite(env) && env >= 1) return Math.floor(env);
  return Math.max(1, Math.min(16, cpus().length - 2));
}

/** Tách URL Postgres thành phần gốc + tên database. */
function tachUrl(url) {
  const u = new URL(url);
  const ten = u.pathname.replace(/^\//, "");
  return { u, ten };
}

function urlVoiDb(url, tenMoi) {
  const u = new URL(url);
  u.pathname = "/" + tenMoi;
  return u.toString();
}

/** Chạy 1 lệnh psql-ish qua pg client. */
async function sqlTrenDb(url, cauLenh) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const c of cauLenh) await client.query(c);
  } finally {
    await client.end();
  }
}

/** Chạy 1 tiến trình test, trả về {out, status} — stdout gom lại để đếm và in nguyên vẹn. */
function chayBatDongBo(args, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (status) => resolve({ out, status }));
  });
}

export async function chayNhanh({ files, tsxLoader, chayDongBo, thuKetQua }) {
  const baseUrl = process.env.TEST_DATABASE_URL;

  // Không có DB → mọi test tích hợp tự skip (tests/setup.ts). Gộp TẤT CẢ vào 1 tiến trình:
  // nhanh nhất và không có rủi ro gì vì chẳng file nào chạm DB thật.
  if (!baseUrl) {
    const { out, status } = chayDongBo([
      CO_MOCK_MODULE,
      `--import=${tsxLoader}`,
      "--test",
      ...files,
    ]);
    thuKetQua(`${files.length} file (không có TEST_DATABASE_URL — gộp 1 tiến trình)`, out, status);
    return;
  }

  const fileDb = files.filter(chamDb);
  const fileThuan = files.filter((f) => !chamDb(f));

  // --- Nhóm thuần: 1 tiến trình cho tất cả ---
  if (fileThuan.length) {
    const { out, status } = chayDongBo([
      CO_MOCK_MODULE,
      `--import=${tsxLoader}`,
      "--test",
      ...fileThuan,
    ]);
    thuKetQua(`${fileThuan.length} file không chạm DB (gộp 1 tiến trình)`, out, status);
  }

  if (!fileDb.length) return;

  // --- Nhóm DB: N worker, mỗi worker 1 database riêng ---
  const n = Math.min(soWorker(), fileDb.length);
  const { ten: tenBase } = tachUrl(baseUrl);
  const urlAdmin = urlVoiDb(baseUrl, "postgres");

  // Base phải có schema đầy đủ trước khi dùng làm template.
  process.stdout.write(`\n[song song] Chuẩn bị ${n} database worker từ template ${tenBase}…\n`);
  const mig = spawnSync(process.execPath, [`--import=${tsxLoader}`, "scripts/migrate.ts"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: baseUrl },
  });
  if (mig.status !== 0) {
    process.stdout.write((mig.stdout ?? "") + (mig.stderr ?? ""));
    throw new Error(
      "Không migrate được database base — dừng để không chạy test trên schema thiếu.",
    );
  }

  const tenWorker = Array.from({ length: n }, (_, i) => `${tenBase}_w${i + 1}`);
  for (const t of tenWorker) {
    // TEMPLATE đòi hỏi không có kết nối nào khác tới base — ta chưa chạy test nào nên an toàn.
    await sqlTrenDb(urlAdmin, [
      `DROP DATABASE IF EXISTS "${t}"`,
      `CREATE DATABASE "${t}" TEMPLATE "${tenBase}"`,
    ]);
  }

  // Chia việc kiểu hàng đợi: worker nào rảnh lấy file kế tiếp (cân tải tốt hơn chia đều,
  // vì thời gian mỗi file chênh nhau nhiều).
  let idx = 0;
  const ketQua = [];
  async function worker(i) {
    const url = urlVoiDb(baseUrl, tenWorker[i]);
    for (;;) {
      const k = idx++;
      if (k >= fileDb.length) return;
      const file = fileDb[k];
      const { out, status } = await chayBatDongBo(
        [CO_MOCK_MODULE, `--import=${tsxLoader}`, "--test", file],
        {
          TEST_DATABASE_URL: url,
          DATABASE_URL: url,
          // N worker × pool mặc định 10 sẽ vượt max_connections (mặc định 100). Ghim thấp.
          XBOSS_PG_POOL_MAX: process.env.XBOSS_PG_POOL_MAX ?? "3",
        },
      );
      ketQua[k] = { file, out, status };
    }
  }
  await Promise.all(Array.from({ length: n }, (_, i) => worker(i)));

  // In theo đúng thứ tự file để log ổn định, dễ so sánh giữa các lần chạy.
  for (const r of ketQua) if (r) thuKetQua(r.file, r.out, r.status);

  // Dọn database worker. Không chặn kết quả test nếu dọn lỗi.
  try {
    await sqlTrenDb(
      urlAdmin,
      tenWorker.map((t) => `DROP DATABASE IF EXISTS "${t}"`),
    );
  } catch {
    process.stdout.write("\n[song song] Cảnh báo: không dọn được database worker.\n");
  }
}
