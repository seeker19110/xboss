// Ghi file ảnh hiện trường có metadata staging + đối soát file mồ côi (QUALITY-FINAL-1 S06 —
// DATA-CONTRACTS §5, A2-AC10, APPROVAL D04: "staging + commit metadata + thu gom orphan có đối soát,
// không giả transaction DB bao trùm file").
//
// Vòng đời một file (bảng photo_upload_staging, migration 0164):
//   1. `datFileStaging`  — ghi + COMMIT dòng staging TRƯỚC, rồi mới đặt file lên storage.
//   2. caller ghi task_photos trong transaction và gọi `chotStaging` CÙNG transaction đó: COMMIT
//      thành công ⇔ dòng staging biến mất ⇔ file đã có chủ.
//   3. transaction lỗi/huỷ hoặc không dùng tới file (replay đồng thời) → `donFileStaging`: chỉ xoá
//      file khi dòng staging CÒN (COMMIT thật ra đã thành công mà mất phản hồi thì dòng đã mất →
//      không xoá nhầm file đang được tham chiếu).
//   4. tiến trình chết giữa chừng → dòng staging cũ còn lại → `doiSoatAnhMoCoi` (chạy đầu mỗi lần
//      upload của chính người đó) xoá file rồi xoá dòng.
// Thứ tự "xoá file rồi mới xoá dòng": dừng giữa chừng chỉ để lại dòng trỏ tới file đã mất (lần đối
// soát sau dọn nốt, storageDelete idempotent), không bao giờ để lại file không còn dấu vết.
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { storageDelete, storagePut } from "@/lib/nen/storage";
import { log } from "@/lib/nen/log";
import { damBaoNguCanhActor } from "@/lib/bao-mat/offline-devices";

type ChuFile = { id: number; orgId: number };

/** Dòng staging quá hạn này coi như mồ côi (request upload thật không kéo dài tới mức này). */
export const STAGING_MO_COI_SAU_PHUT = 60;
const GIOI_HAN_DOI_SOAT = 20;

/** Bước 1: ghi + COMMIT metadata staging, rồi đặt file. Đặt file lỗi → dọn dòng, ném lỗi. */
export async function datFileStaging(
  user: ChuFile,
  taskId: number,
  fileName: string,
  buf: Buffer,
): Promise<void> {
  damBaoNguCanhActor(user);
  await withTransaction(() =>
    run(
      `INSERT INTO photo_upload_staging (file_name, org_id, user_id, task_id) VALUES (?, ?, ?, ?)`,
      fileName,
      user.orgId,
      user.id,
      taskId,
    ),
  );
  try {
    await storagePut(user.orgId, fileName, buf);
  } catch (e) {
    await donFileStaging(user, fileName);
    throw e;
  }
}

/**
 * Bước 2 — gọi BÊN TRONG transaction ghi task_photos: xoá dòng staging để COMMIT đánh dấu file đã có
 * chủ. Không còn dòng (đã bị đối soát dọn file) → ném lỗi để transaction ROLLBACK, không ghi
 * metadata trỏ tới file đã xoá.
 */
export async function chotStaging(fileName: string): Promise<void> {
  const r = await run(`DELETE FROM photo_upload_staging WHERE file_name = ?`, fileName);
  if (r.changes !== 1) throw new Error("File ảnh staging không còn — huỷ ghi metadata");
}

/** Bước 3: dọn file chưa có chủ. Chỉ xoá khi dòng staging còn; lỗi storage → giữ dòng cho đối soát. */
export async function donFileStaging(user: ChuFile, fileName: string): Promise<void> {
  damBaoNguCanhActor(user);
  try {
    const con = await withTransaction(() =>
      queryOne(`SELECT 1 AS co FROM photo_upload_staging WHERE file_name = ?`, fileName),
    );
    if (!con) return;
    await storageDelete(user.orgId, fileName);
    await withTransaction(() =>
      run(`DELETE FROM photo_upload_staging WHERE file_name = ?`, fileName),
    );
  } catch (e) {
    // Không nuốt im: còn dòng staging thì lần đối soát sau dọn tiếp.
    log.warn("Không dọn được file ảnh staging — để đối soát sau", {
      loi: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Đối soát file mồ côi của CHÍNH actor (RLS staging theo user/org): dòng staging quá hạn mà
 * task_photos không tham chiếu → xoá file rồi xoá dòng; đã được tham chiếu (không thể xảy ra theo
 * thiết kế — phòng thủ) → chỉ xoá dòng, không bao giờ xoá file đang dùng. Trả số dòng đã xử lý.
 */
export async function doiSoatAnhMoCoi(
  user: ChuFile,
  truocPhut: number = STAGING_MO_COI_SAU_PHUT,
): Promise<number> {
  damBaoNguCanhActor(user);
  const cu = await withTransaction(() =>
    query<{ fileName: string; daDung: boolean }>(
      `SELECT s.file_name AS "fileName",
              EXISTS (SELECT 1 FROM task_photos p WHERE p.file_name = s.file_name) AS "daDung"
         FROM photo_upload_staging s
        WHERE s.org_id = ? AND s.user_id = ? AND s.created_at < now() - make_interval(mins => ?)
        ORDER BY s.created_at
        LIMIT ?`,
      user.orgId,
      user.id,
      truocPhut,
      GIOI_HAN_DOI_SOAT,
    ),
  );
  let daXuLy = 0;
  for (const r of cu) {
    try {
      if (!r.daDung) await storageDelete(user.orgId, r.fileName);
      await withTransaction(() =>
        run(`DELETE FROM photo_upload_staging WHERE file_name = ?`, r.fileName),
      );
      daXuLy++;
    } catch (e) {
      log.warn("Đối soát file ảnh staging lỗi — thử lại lần sau", {
        loi: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (daXuLy) log.info("Đã đối soát file ảnh mồ côi", { soFile: daXuLy });
  return daXuLy;
}
