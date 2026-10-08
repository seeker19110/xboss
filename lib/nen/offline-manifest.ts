// Resource manifest của khoá vault offline (QUALITY-FINAL-1 S05 — DATA-MIGRATIONS §2).
//
// THUẦN (không DB): chuẩn hoá + băm manifest. Mỗi khoá vault gắn MỘT manifest bất biến do server
// cấp: tập task đã tải + hành động được phép trên task (tick — gồm cả tick_batch — và ảnh) và/hoặc
// năng lực nhật ký trong khoảng ngày cụ thể của đúng một dự án. Client không tự mở rộng: thêm tài
// nguyên = xin khoá mới (manifest mới), không sửa manifest cũ. Kiểm quyền từng tài nguyên với
// quyền HIỆN HÀNH nằm ở lib/bao-mat/offline-vault.ts (lúc cấp lẫn lúc mở khoá).
import { sha256Hex } from "@/lib/nen/offline-crypto";

export const MANIFEST_TASK_ACTIONS = ["photo", "tick"] as const;
export type ManifestTaskAction = (typeof MANIFEST_TASK_ACTIONS)[number];

export type OfflineManifest = {
  v: 1;
  projectId: number;
  /** ID task tăng dần, không trùng. */
  tasks: number[];
  /** Hành động trên task, sắp xếp cố định; rỗng ⇔ tasks rỗng. */
  taskActions: ManifestTaskAction[];
  /** Năng lực nhật ký [from, to] (YYYY-MM-DD, tối đa MAX_DIARY_DAYS ngày) hoặc null. */
  diary: { from: string; to: string } | null;
};

/** Trần số task trong 1 manifest — khoá nhỏ theo nhóm tài nguyên, thu hồi ít ảnh hưởng. */
export const MAX_MANIFEST_TASKS = 500;
export const MAX_DIARY_DAYS = 31;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseId(v: unknown): number | null {
  if (typeof v !== "number" && (typeof v !== "string" || !/^[1-9]\d*$/.test(v))) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function ngayHopLe(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const soNgay = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export type KetQuaManifest = { ok: true; manifest: OfflineManifest } | { ok: false; error: string };

/** Chuẩn hoá manifest client đề xuất cho dự án `projectId` (dự án lấy từ server, không từ body). */
export function chuanHoaManifest(input: unknown, projectId: number): KetQuaManifest {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, error: "Manifest không hợp lệ" };
  const o = input as Record<string, unknown>;
  const khoaLa = Object.keys(o).filter((k) => !["tasks", "taskActions", "diary"].includes(k));
  if (khoaLa.length > 0) return { ok: false, error: "Manifest có trường không được hỗ trợ" };

  const tasksRaw = o.tasks ?? [];
  const actsRaw = o.taskActions ?? [];
  if (!Array.isArray(tasksRaw) || !Array.isArray(actsRaw))
    return { ok: false, error: "tasks/taskActions phải là mảng" };
  if (tasksRaw.length > MAX_MANIFEST_TASKS)
    return { ok: false, error: `Tối đa ${MAX_MANIFEST_TASKS} task mỗi khoá` };
  const tasks = new Set<number>();
  for (const t of tasksRaw) {
    const id = parseId(t);
    if (id == null) return { ok: false, error: "ID task không hợp lệ" };
    tasks.add(id);
  }
  const acts = new Set<ManifestTaskAction>();
  for (const a of actsRaw) {
    if (!(MANIFEST_TASK_ACTIONS as readonly unknown[]).includes(a))
      return { ok: false, error: "Hành động task không hợp lệ" };
    acts.add(a as ManifestTaskAction);
  }
  if ((tasks.size === 0) !== (acts.size === 0))
    return { ok: false, error: "tasks và taskActions phải cùng có hoặc cùng rỗng" };

  let diary: OfflineManifest["diary"] = null;
  if (o.diary != null) {
    const d = o.diary as Record<string, unknown>;
    if (typeof d !== "object" || Array.isArray(d) || !ngayHopLe(d.from) || !ngayHopLe(d.to))
      return { ok: false, error: "Khoảng ngày nhật ký không hợp lệ" };
    const n = soNgay(d.from, d.to);
    if (n < 1 || n > MAX_DIARY_DAYS)
      return { ok: false, error: `Khoảng ngày nhật ký 1–${MAX_DIARY_DAYS} ngày` };
    diary = { from: d.from, to: d.to };
  }
  if (tasks.size === 0 && !diary) return { ok: false, error: "Manifest rỗng" };

  return {
    ok: true,
    manifest: {
      v: 1,
      projectId,
      tasks: [...tasks].sort((a, b) => a - b),
      taskActions: MANIFEST_TASK_ACTIONS.filter((a) => acts.has(a)),
      diary,
    },
  };
}

/** JSON chuẩn (thứ tự khoá cố định) — nguồn của manifest_hash. */
export function chuoiManifest(m: OfflineManifest): string {
  return JSON.stringify({
    v: m.v,
    projectId: m.projectId,
    tasks: m.tasks,
    taskActions: m.taskActions,
    diary: m.diary ? { from: m.diary.from, to: m.diary.to } : null,
  });
}

export const bamManifest = (m: OfflineManifest): Promise<string> => sha256Hex(chuoiManifest(m));

/**
 * Đọc lại manifest đã lưu (jsonb) — chỉ nhận khi nó ĐÃ ở dạng chuẩn: đúng tập khoá, chuẩn hoá lại
 * ra đúng chuỗi cũ (task tăng dần không trùng, hành động đúng thứ tự). Manifest bị sửa ngoài luồng
 * cấp khoá → null (caller khoá luôn khoá đó; hash/AAD cũng sẽ không khớp).
 */
export function docManifestDaLuu(raw: unknown, projectId: number): OfflineManifest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const khoa = Object.keys(o).sort().join(",");
  if (khoa !== "diary,projectId,taskActions,tasks,v" || o.v !== 1 || o.projectId !== projectId)
    return null;
  const kq = chuanHoaManifest(
    { tasks: o.tasks, taskActions: o.taskActions, diary: o.diary },
    projectId,
  );
  if (!kq.ok) return null;
  // jsonb tự sắp lại thứ tự khoá object nên so theo từng trường, không so chuỗi JSON thô.
  const d = o.diary as Record<string, unknown> | null;
  if (d != null && Object.keys(d).sort().join(",") !== "from,to") return null;
  const m = kq.manifest;
  const giongNhau =
    JSON.stringify(o.tasks) === JSON.stringify(m.tasks) &&
    JSON.stringify(o.taskActions) === JSON.stringify(m.taskActions) &&
    (d == null ? m.diary == null : d.from === m.diary?.from && d.to === m.diary?.to);
  return giongNhau ? m : null;
}
