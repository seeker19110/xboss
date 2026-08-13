// Sửa ngày BĐ/KT bị lệch 1 ngày do lỗi múi giờ của `toISO` trước đây (xem PROGRESS.md
// mục "Rà nguồn sai lệch dữ liệu ... 2026-08-12" và lib/import.ts).
//
// Bối cảnh: cả 2 đường import thật đọc file bằng `cellDates: true`, nên ô ngày về tới
// `toISO` là `Date` do SheetJS dựng theo GIỜ ĐỊA PHƯƠNG; bản cũ quy đổi qua
// `toISOString()` nên mọi ngày lùi 1 hôm khi server chạy ở múi giờ dương (gồm giờ VN).
// Server chạy ở UTC hoặc múi giờ âm thì KHÔNG bị — vì vậy script này không "cộng 1 ngày
// cho tất cả" mà **đọc lại chính file Excel nguồn** rồi chỉ sửa đúng những hàng mang dấu
// vết lệch (ngày trong DB = ngày đúng − 1).
//
// Nguyên tắc an toàn:
//   - MẶC ĐỊNH chỉ xem trước (dry-run), không ghi gì. Phải truyền `--apply` mới ghi.
//   - Chỉ sửa hàng lệch ĐÚNG 1 ngày. Hàng lệch kiểu khác = có thể do người dùng đã sửa
//     ngày trong app sau khi import → KHÔNG đụng, chỉ liệt kê ra để người vận hành xem.
//   - Lũy đẳng: chạy lại lần 2 không còn gì để sửa.
//   - Sau khi đổi ngày KT, gọi lại recomputeTask/recomputePackage để trạng thái "trễ"
//     được tính lại theo ngày mới (đúng như PATCH ngày trong app).
//
// Chạy:
//   npx tsx scripts/backfill-import-dates.ts                    # xem trước
//   npx tsx scripts/backfill-import-dates.ts --apply            # ghi thật
//   npx tsx scripts/backfill-import-dates.ts --file=<đường dẫn> # file Excel khác
//   npx tsx scripts/backfill-import-dates.ts --project=<id>     # chọn dự án khi trùng mã sheet
//
// ⚠️ Thao tác ĐỤNG DỮ LIỆU → theo DoD trong CLAUDE.md phải tập dượt trên bản sao trước,
//    KHÔNG chạy thẳng production. Tập dượt ở đâu tuỳ cách deploy:
//      - VPS tự host: DB staging riêng (`bash deploy.sh --staging`, docs/ops/staging.md).
//      - Vercel + Postgres quản lý (Supabase/Neon): tạo branch/bản sao DB rồi trỏ
//        DATABASE_URL vào đó. Lưu ý Preview deployment của Vercel MẶC ĐỊNH dùng chung
//        DATABASE_URL với Production — "chạy thử trên preview" không phải là staging.
//
// Script chạy từ MÁY LOCAL/CI trỏ vào DATABASE_URL đích, không cần chạy trong runtime của
// app (trên Vercel cũng không chạy được trong runtime: serverless, không có shell thường
// trực). Cùng đường với `npm run db:seed` mô tả ở DEPLOY.md Cách C.
//
// Ghi chú múi giờ: runtime Vercel chạy UTC nên dữ liệu import QUA APP ở đó không dính lỗi
// (đo trên file gốc: ở UTC, bản toISO cũ và mới cho kết quả y hệt). Đường dính lỗi là nơi
// process chạy ở múi giờ dương — VPS có set TZ, hoặc `npm run db:seed` chạy từ máy cá nhân
// ở VN (UTC+7). Chạy xem trước để biết chắc, đừng suy đoán.
import "./env";
import * as XLSX from "xlsx";
import { query, run, withTransaction } from "../lib/db";
import { SHEET_MAP, classifyRow, toISO } from "../lib/import";
import { recomputeTask, recomputePackage } from "../lib/recompute";
import { addDaysISO } from "../lib/date";

const DATA_START = 5; // phải khớp lib/import.ts

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const PROJECT_ARG = args.find((a) => a.startsWith("--project="))?.slice("--project=".length);
const PROJECT_ID = PROJECT_ARG ? Number(PROJECT_ARG) : null;
if (PROJECT_ARG && !Number.isInteger(PROJECT_ID)) {
  console.error(`❌ --project phải là số nguyên (nhận "${PROJECT_ARG}")`);
  process.exit(1);
}
const FILE =
  args.find((a) => a.startsWith("--file="))?.slice("--file=".length) ??
  process.env.XLSX_FILE ??
  "./attachments/GIA THÀNH - TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx";

type DbRow = {
  id: number;
  code: string;
  startDate: string | null;
  endDate: string | null;
  packageId?: number;
};

type Fix = {
  table: "work_packages" | "tasks";
  id: number;
  sheet: string;
  code: string;
  packageId: number | null;
  startFrom: string | null;
  startTo: string | null;
  endFrom: string | null;
  endTo: string | null;
};

// Ngày trong DB có mang đúng dấu vết lệch 1 ngày so với ngày đúng không?
// Trả về ngày đúng khi cần sửa, null khi để nguyên (khớp rồi, hoặc lệch kiểu khác).
function shiftedByOneDay(dbDate: string | null, correct: string | null): string | null {
  if (!dbDate || !correct) return null; // thiếu một trong hai → không đủ căn cứ, bỏ qua
  if (dbDate === correct) return null; // đã đúng
  return addDaysISO(dbDate, 1) === correct ? correct : null;
}

async function main() {
  console.log(`📄 File nguồn: ${FILE}`);
  console.log(APPLY ? "✍️  CHẾ ĐỘ GHI THẬT (--apply)" : "👀 Chỉ xem trước — KHÔNG ghi gì");

  // Đọc y hệt đường import thật, và ở múi giờ nào cũng cho cùng kết quả sau khi toISO
  // đã sửa (xem tests/import-tz.test.ts).
  const workbook = XLSX.readFile(FILE, { cellDates: true });

  const fixes: Fix[] = [];
  const others: string[] = []; // lệch kiểu khác — chỉ báo cáo
  let missing = 0; // có trong file nhưng không có trong DB
  let compared = 0;

  for (const sheetName of workbook.SheetNames) {
    const info = SHEET_MAP[sheetName];
    if (!info) continue;

    // Đa dự án: cùng mã sheet có thể tồn tại ở nhiều dự án (M22+). File Excel chỉ thuộc
    // MỘT dự án — không tự đoán là dự án nào, bắt người vận hành chỉ rõ bằng --project.
    const sts = await query<{ id: number; projectId: number | null }>(
      `SELECT st.id, tw.project_id AS "projectId"
         FROM sheet_types st LEFT JOIN towers tw ON tw.id = st.tower_id
        WHERE st.code = ? ${PROJECT_ID != null ? "AND tw.project_id = ?" : ""}
        ORDER BY st.id`,
      info.code,
      ...(PROJECT_ID != null ? [PROJECT_ID] : []),
    );
    if (sts.length === 0) {
      console.warn(`⚠️  Sheet ${info.code}: không có trong DB — bỏ qua.`);
      continue;
    }
    if (sts.length > 1) {
      console.error(
        `❌ Sheet ${info.code} tồn tại ở ${sts.length} dự án (${sts.map((s) => s.projectId).join(", ")}). ` +
          `Chạy lại kèm --project=<id> để chỉ rõ dự án của file này.`,
      );
      process.exit(1);
    }
    const st = sts[0];

    // Nạp sẵn toàn bộ hàng của sheet để tra theo mã (tránh N+1 query).
    const pkgs = await query<DbRow>(
      `SELECT id, code, start_date::text AS "startDate", end_date::text AS "endDate"
         FROM work_packages WHERE sheet_type_id = ?`,
      st.id,
    );
    const tasks = await query<DbRow>(
      `SELECT t.id, t.code, t.package_id AS "packageId",
              t.start_date::text AS "startDate", t.end_date::text AS "endDate"
         FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
        WHERE wp.sheet_type_id = ?`,
      st.id,
    );
    const pkgByCode = new Map(pkgs.map((p) => [p.code, p]));
    // Mã task chỉ duy nhất trong PHẠM VI NHÓM (UNIQUE(package_id, code)) — tra theo cặp.
    const taskByKey = new Map(tasks.map((t) => [`${t.packageId}|${t.code}`, t]));

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
    }) as unknown[][];

    let currentPkg: DbRow | null = null;
    let currentPkgCode = "";

    for (let i = DATA_START; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const kind = classifyRow(row, i, currentPkgCode);
      if (kind.kind === "skip") continue;

      const startCorrect = toISO(row[4]);
      const endCorrect = toISO(row[6]);

      const dbRow: DbRow | null =
        kind.kind === "pkg"
          ? (pkgByCode.get(kind.code) ?? null)
          : currentPkg
            ? (taskByKey.get(`${currentPkg.id}|${kind.code}`) ?? null)
            : null;

      if (kind.kind === "pkg") {
        currentPkg = dbRow;
        currentPkgCode = kind.code;
      }
      if (!dbRow) {
        missing++;
        continue;
      }
      compared++;

      const startTo = shiftedByOneDay(dbRow.startDate, startCorrect);
      const endTo = shiftedByOneDay(dbRow.endDate, endCorrect);

      // Lệch nhưng KHÔNG phải dấu vết 1 ngày → nhiều khả năng người dùng đã sửa trong
      // app. Không đụng vào, chỉ nêu ra.
      for (const [nhan, db, dung, to] of [
        ["BĐ", dbRow.startDate, startCorrect, startTo],
        ["KT", dbRow.endDate, endCorrect, endTo],
      ] as const) {
        if (db && dung && db !== dung && !to)
          others.push(
            `${info.code}/${dbRow.code} ngày ${nhan}: DB=${db}, file=${dung} (lệch khác 1 ngày — giữ nguyên)`,
          );
      }

      if (startTo || endTo)
        fixes.push({
          table: kind.kind === "pkg" ? "work_packages" : "tasks",
          id: dbRow.id,
          sheet: info.code,
          code: dbRow.code,
          packageId: kind.kind === "pkg" ? null : (currentPkg?.id ?? null),
          startFrom: dbRow.startDate,
          startTo,
          endFrom: dbRow.endDate,
          endTo,
        });
    }
  }

  console.log(`\n🔍 Đối chiếu ${compared} hàng; ${missing} hàng trong file không có trong DB.`);
  console.log(`   Cần sửa (lệch đúng 1 ngày): ${fixes.length} hàng.`);
  console.log(`   Lệch kiểu khác, GIỮ NGUYÊN: ${others.length} hàng.`);
  for (const o of others.slice(0, 20)) console.log(`     · ${o}`);
  if (others.length > 20) console.log(`     · … và ${others.length - 20} hàng nữa`);
  for (const f of fixes.slice(0, 20))
    console.log(
      `     → ${f.sheet}/${f.code}: BĐ ${f.startFrom ?? "—"}→${f.startTo ?? "(giữ)"} , ` +
        `KT ${f.endFrom ?? "—"}→${f.endTo ?? "(giữ)"}`,
    );
  if (fixes.length > 20) console.log(`     → … và ${fixes.length - 20} hàng nữa`);

  if (!APPLY) {
    console.log(`\n👀 Xem trước xong — chưa ghi gì. Chạy lại với --apply để sửa thật.`);
    process.exit(0);
  }
  if (fixes.length === 0) {
    console.log(`\n✅ Không có gì để sửa.`);
    process.exit(0);
  }

  const touchedTasks = new Set<number>();
  const touchedPkgs = new Set<number>();

  await withTransaction(async () => {
    for (const f of fixes) {
      // Chỉ ghi cột thật sự lệch — cột còn lại giữ nguyên giá trị hiện có.
      await run(
        `UPDATE ${f.table} SET start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date) WHERE id = ?`,
        f.startTo,
        f.endTo,
        f.id,
      );
      if (f.table === "tasks") {
        touchedTasks.add(f.id);
        if (f.packageId) touchedPkgs.add(f.packageId);
      } else touchedPkgs.add(f.id);
    }
  });
  console.log(`\n✍️  Đã sửa ngày cho ${fixes.length} hàng.`);

  // Ngày KT đổi → trạng thái "trễ" phải tính lại (deriveStatus dùng ngày KT hiệu lực).
  for (const id of touchedTasks) await recomputeTask(id, "backfill-import-dates");
  // Nhóm đổi ngày → task con đang KẾ THỪA ngày nhóm (end_date NULL) cũng phải tính lại.
  for (const pkgId of touchedPkgs) {
    const inherit = await query<{ id: number }>(
      `SELECT id FROM tasks WHERE package_id = ? AND end_date IS NULL`,
      pkgId,
    );
    for (const t of inherit) await recomputeTask(t.id, "backfill-import-dates");
    await recomputePackage(pkgId);
  }
  console.log(
    `🔄 Đã tính lại trạng thái cho ${touchedTasks.size} task + ${touchedPkgs.size} nhóm.`,
  );
  console.log(`\n🎉 Xong. Chạy lại script (không --apply) để xác nhận không còn hàng nào lệch.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Backfill lỗi:", err);
  process.exit(1);
});
