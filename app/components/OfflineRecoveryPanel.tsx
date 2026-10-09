"use client";
// Màn phục hồi hàng đợi ngoại tuyến (QUALITY-FINAL-1 S08 — A2 §5, D03/D04). Mở từ badge trên
// AppHeader hoặc chip trạng thái lưới tracking. Chỉ đọc trạng thái qua offlineQueue (vault của
// CHÍNH chủ đang đăng nhập); nội dung thao tác chỉ giải mã trong bộ nhớ. Phân biệt rõ "lưu trên
// thiết bị" với "đã lên máy chủ". Hành động: gửi lại ngay, mở khoá (cần mạng), bỏ TỪNG thao tác
// xung đột/bị từ chối sau khi xác nhận, giải quyết xung đột nhật ký (xem bản máy chủ rồi chọn).
// Không xoá hàng loạt, không đụng dữ liệu cũ v1 (chỉ đếm + giải thích).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CloudUpload,
  KeyRound,
  Lock,
  RefreshCw,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { Button, Chip } from "@/app/components/ui";
import { Skeleton } from "@/app/components/Skeleton";
import {
  offlineQueue,
  useOfflineQueueStatus,
  type NhatKyXungDot,
  type ThaoTacHangDoi,
} from "@/app/components/offlineQueue";
import type { DiaryNotePayload } from "@/app/components/offlineQueue/logic";
import { formatDateDMY } from "@/lib/nen/date";

// ── Trạng thái mở (dùng chung giữa badge và chip tracking) ─────────────────────────────────

let dangMo = false;
const ngheMo = new Set<() => void>();
const datMo = (v: boolean) => {
  dangMo = v;
  for (const fn of ngheMo) fn();
};

/** Mở màn phục hồi (badge AppHeader giữ host hiển thị). */
export function moManPhucHoiNgoaiTuyen(): void {
  datMo(true);
}

export function useManPhucHoiMo(): [boolean, () => void] {
  const mo = useSyncExternalStore(
    (fn) => {
      ngheMo.add(fn);
      return () => {
        ngheMo.delete(fn);
      };
    },
    () => dangMo,
    () => false,
  );
  return [mo, () => datMo(false)];
}

// ── Diễn giải tiếng Việt ─────────────────────────────────────────────────────────────────

const MA_LOI: Record<string, string> = {
  idempotency_conflict: "Mã thao tác đã được dùng cho nội dung khác",
  idempotency_key_invalid: "Mã thao tác không hợp lệ",
  idempotency_key_required: "Thiếu mã thao tác",
  precondition_invalid: "Phiên bản đối chiếu không hợp lệ",
  precondition_required: "Máy chủ yêu cầu phiên bản để đối chiếu",
  version_mismatch: "Bản trên máy chủ đã đổi sau khi bạn soạn",
  context_changed: "Dự án hoặc thiết bị đã đổi",
  context_expired: "Phiên ngoại tuyến đã hết hạn",
  context_invalid: "Phiên ngoại tuyến không hợp lệ",
  "2fa_required": "Tài khoản cần bật xác thực 2 lớp",
};

const THEO_STATUS: Record<number, string> = {
  400: "Dữ liệu gửi lên không hợp lệ",
  401: "Phiên đăng nhập đã hết hạn",
  403: "Không còn quyền thực hiện thao tác này",
  404: "Không còn tìm thấy dữ liệu trên máy chủ (có thể đã bị xoá)",
  408: "Máy chủ phản hồi quá lâu",
  409: "Xung đột với dữ liệu trên máy chủ",
  412: "Bản trên máy chủ đã đổi sau khi bạn soạn",
  413: "Dữ liệu quá lớn",
  422: "Máy chủ không chấp nhận nội dung",
  428: "Máy chủ yêu cầu phiên bản để đối chiếu",
  429: "Máy chủ đang bận — sẽ thử lại theo yêu cầu của máy chủ",
};

/** Lý do (tiếng Việt) từ kết quả máy chủ gần nhất — chỉ mã máy, không có thông điệp gốc. */
export function lyDoKetQua(kq: ThaoTacHangDoi["lastResult"]): string | null {
  if (!kq) return null;
  const theoMa = kq.code ? MA_LOI[kq.code] : undefined;
  const theoStatus = THEO_STATUS[kq.status] ?? (kq.status >= 500 ? "Lỗi máy chủ" : "Lỗi khác");
  return `${theoMa ?? theoStatus} (HTTP ${kq.status}${kq.code ? ` · ${kq.code}` : ""})`;
}

function moTaThaoTac(op: ThaoTacHangDoi): string {
  if (op.kind === "diary_note")
    return op.ngayNhatKy ? `Nhật ký ngày ${formatDateDMY(op.ngayNhatKy)}` : "Nhật ký ngày";
  if (op.kind === "photo") return "Ảnh hiện trường";
  if (op.soO && op.soO > 1) return `Đánh dấu ${op.soO} ô tiến độ`;
  return "Đánh dấu ô tiến độ";
}

const gio = (ms: number) =>
  new Date(ms).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });

type Nhom = {
  khoa: string;
  tieuDe: string;
  moTa: string;
  ds: ThaoTacHangDoi[];
  canhBao?: boolean;
};

function chiaNhom(ds: ThaoTacHangDoi[]): Nhom[] {
  const mo = ds.filter((o) => o.moDuoc);
  return [
    {
      khoa: "pending",
      tieuDe: "Chờ gửi",
      moTa: "Đã lưu trên thiết bị, CHƯA lên máy chủ. Tự gửi khi có mạng.",
      ds: mo.filter((o) => o.state === "pending" && o.tries === 0),
    },
    {
      khoa: "retry",
      tieuDe: "Chờ gửi lại",
      moTa: "Đã thử gửi nhưng chưa xong (mất mạng/máy chủ bận) — vẫn giữ trên thiết bị.",
      ds: mo.filter((o) => o.state === "pending" && o.tries > 0),
    },
    {
      khoa: "sending",
      tieuDe: "Đang gửi",
      moTa: "Đang gửi lên máy chủ — chưa xác nhận đã lưu.",
      ds: mo.filter((o) => o.state === "sending"),
    },
    {
      khoa: "conflict",
      tieuDe: "Cần xác minh",
      moTa: "Máy chủ có dữ liệu khác với bản trên thiết bị. Chưa ghi đè gì — bạn chọn cách xử lý.",
      ds: mo.filter((o) => o.state === "conflict"),
      canhBao: true,
    },
    {
      khoa: "rejected",
      tieuDe: "Bị từ chối",
      moTa: "Máy chủ không nhận thao tác. Vẫn giữ trên thiết bị để bạn xem lại.",
      ds: mo.filter((o) => o.state === "rejected"),
      canhBao: true,
    },
    {
      khoa: "paused_auth",
      tieuDe: "Tạm dừng — cần đăng nhập",
      moTa: "Phiên đăng nhập hết hạn. Đăng nhập lại đúng tài khoản để tiếp tục gửi.",
      ds: mo.filter((o) => o.state === "paused_auth"),
      canhBao: true,
    },
  ];
}

// ── Màn chính ────────────────────────────────────────────────────────────────────────────

export default function OfflineRecoveryPanel({ onClose }: { onClose: () => void }) {
  const snap = useOfflineQueueStatus();
  const [ds, setDs] = useState<ThaoTacHangDoi[] | null>(null);
  const [legacy, setLegacy] = useState(0);
  const [thongBao, setThongBao] = useState("");
  const [dangLam, setDangLam] = useState(false);
  const [xungDot, setXungDot] = useState<string | null>(null);
  /** Lần đọc danh sách gần nhất lỗi (IndexedDB) — KHÔNG được hiển thị như "không còn gì". */
  const [loiDoc, setLoiDoc] = useState(false);
  const tieuDeRef = useRef<HTMLHeadingElement>(null);

  const taiLai = useCallback(async () => {
    try {
      const [list, soCu] = await Promise.all([
        offlineQueue.danhSachThaoTac(),
        offlineQueue.demLegacy(),
      ]);
      setDs(list);
      setLegacy(soCu);
      setLoiDoc(false);
    } catch {
      setDs(null);
      setLoiDoc(true);
    }
  }, []);

  // Tải lại mỗi khi trạng thái hàng đợi đổi (gửi xong, khoá/mở vault, mất/có mạng).
  useEffect(() => {
    void taiLai();
  }, [snap, taiLai]);

  // Focus vào tiêu đề khi mở (Modal không cướp focus nếu đã có phần tử trong panel giữ focus).
  useEffect(() => {
    if (!xungDot) tieuDeRef.current?.focus();
  }, [xungDot]);

  const vaultMo = snap.vault === "active";
  const coTheMoKhoa = !vaultMo && snap.online && !snap.quarantined && snap.vault !== "disabled";

  const guiLai = async () => {
    setDangLam(true);
    setThongBao("Đang gửi lại các thao tác chờ…");
    let tb: string;
    try {
      tb = (await offlineQueue.guiLaiNgay())
        ? "Đã thử gửi lại. Xem trạng thái từng thao tác bên dưới."
        : "Chưa gửi lại được — cần có mạng và kho ngoại tuyến đang mở.";
    } catch {
      tb = "Gửi lại thất bại do lỗi đọc/ghi trên thiết bị — thao tác vẫn giữ nguyên, thử lại sau.";
    }
    await taiLai();
    setDangLam(false);
    setThongBao(tb);
  };

  const thuLaiDoc = async () => {
    setDangLam(true);
    setThongBao("Đang đọc lại dữ liệu trên thiết bị…");
    await offlineQueue.lamMoi();
    await taiLai();
    setDangLam(false);
    setThongBao("");
  };

  const moKhoa = async () => {
    setDangLam(true);
    setThongBao("Đang xác minh với máy chủ để mở khoá…");
    const ok = await offlineQueue.moKhoa().catch(() => false);
    await taiLai();
    setDangLam(false);
    setThongBao(
      ok
        ? "Đã mở khoá kho ngoại tuyến cho tài khoản này."
        : "Chưa mở khoá được — kiểm tra mạng hoặc đăng nhập lại rồi thử lại.",
    );
  };

  const bo = async (op: ThaoTacHangDoi) => {
    const ok = await appConfirm(
      `Bỏ thao tác "${moTaThaoTac(op)}" khỏi thiết bị? Nội dung này CHƯA lên máy chủ và sẽ mất hẳn — không hoàn tác được.`,
      { danger: true, confirmLabel: "Bỏ thao tác này" },
    );
    if (!ok) return;
    setDangLam(true);
    let tb: string;
    try {
      tb = (await offlineQueue.boThaoTac(op.operationId))
        ? "Đã bỏ 1 thao tác khỏi thiết bị."
        : "Thao tác đã đổi trạng thái — đã tải lại danh sách.";
    } catch {
      tb = "Chưa bỏ được thao tác do lỗi trên thiết bị — thao tác vẫn còn, thử lại.";
    }
    await taiLai();
    setDangLam(false);
    setThongBao(tb);
  };

  const khongDocDuoc = loiDoc || snap.docLoi;
  const nhom = ds ? chiaNhom(ds) : [];
  const soMo = ds?.filter((o) => o.moDuoc).length ?? 0;
  // Mọi op của tài khoản này mà phiên hiện tại không đọc được (khoá chưa mở/hết hạn/khác dự án).
  const soKhoa = Math.max(0, snap.total - soMo);
  // Chỉ khẳng định "đã lên máy chủ" khi ĐỌC ĐƯỢC thiết bị và thật sự không còn gì.
  const rong = ds !== null && !khongDocDuoc && snap.total === 0 && legacy === 0;
  const tomTat = snap.quarantined
    ? "Lưu ngoại tuyến đang tạm khoá."
    : khongDocDuoc
      ? "Không đọc được thao tác ngoại tuyến trên thiết bị — chưa xác định được còn gì chưa lên máy chủ."
      : snap.total > 0
        ? `${snap.total} thao tác đang lưu trên thiết bị, chưa lên máy chủ.`
        : "Không có thao tác nào chờ gửi.";

  return (
    <Modal onClose={onClose} className="max-w-xl">
      {xungDot ? (
        <XungDotNhatKy
          operationId={xungDot}
          onXong={(tb) => {
            setXungDot(null);
            setThongBao(tb);
            void taiLai();
          }}
        />
      ) : (
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                ref={tieuDeRef}
                tabIndex={-1}
                className="text-lg font-bold text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
              >
                Thao tác ngoại tuyến
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                &quot;Lưu trên thiết bị&quot; chưa phải là đã lên máy chủ: mất máy, xoá dữ liệu
                trình duyệt hoặc đăng nhập tài khoản khác trước khi gửi xong có thể làm mất thao
                tác.
              </p>
            </div>
            <Button variant="ghost" size="icon" icon={X} aria-label="Đóng" onClick={onClose} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {snap.online ? (
              <Chip tone="info" icon={CloudUpload}>
                Có mạng
              </Chip>
            ) : (
              <Chip tone="warning" icon={WifiOff}>
                Mất mạng
              </Chip>
            )}
            {vaultMo ? (
              <Chip tone="success" icon={KeyRound}>
                Kho ngoại tuyến đang mở
              </Chip>
            ) : (
              <Chip tone="neutral" icon={Lock}>
                Kho ngoại tuyến đang khoá
              </Chip>
            )}
            {snap.sending && <Chip tone="info">Đang gửi…</Chip>}
          </div>

          <p role="status" aria-live="polite" className="text-sm text-zinc-200">
            {tomTat}
            {thongBao ? ` ${thongBao}` : ""}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={RefreshCw}
              disabled={dangLam || !snap.online || !vaultMo || soMo === 0}
              onClick={guiLai}
            >
              Gửi lại ngay
            </Button>
            {coTheMoKhoa && (snap.total > 0 || soKhoa > 0) && (
              <Button variant="secondary" icon={KeyRound} disabled={dangLam} onClick={moKhoa}>
                Mở khoá
              </Button>
            )}
          </div>

          {khongDocDuoc && (
            <div
              role="alert"
              className="rounded-xl border border-amber-800 bg-zinc-950/70 p-4 space-y-3"
            >
              <p className="flex items-start gap-2 text-sm text-amber-300">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                Không đọc được dữ liệu ngoại tuyến trên thiết bị (bộ nhớ trình duyệt đang bị chặn,
                bận hoặc lỗi). Có thể vẫn còn thao tác chưa lên máy chủ — đừng xoá dữ liệu trình
                duyệt hay đăng xuất cho tới khi đọc lại được.
              </p>
              <Button variant="secondary" icon={RefreshCw} disabled={dangLam} onClick={thuLaiDoc}>
                Thử lại
              </Button>
            </div>
          )}

          {ds === null ? (
            loiDoc ? null : (
              <div className="space-y-2" aria-hidden="true">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            )
          ) : rong ? (
            <p className="rounded-xl bg-zinc-950/70 border border-zinc-800 p-4 text-sm text-zinc-300">
              Không có thao tác nào trên thiết bị — mọi thay đổi đã lên máy chủ.
            </p>
          ) : (
            <div className="space-y-4">
              {nhom
                .filter((n) => n.ds.length > 0)
                .map((n) => (
                  <section key={n.khoa} aria-labelledby={`nhom-${n.khoa}`} className="space-y-2">
                    <h3
                      id={`nhom-${n.khoa}`}
                      className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${
                        n.canhBao ? "text-amber-300" : "text-zinc-300"
                      }`}
                    >
                      {n.canhBao && <AlertTriangle className="w-4 h-4" aria-hidden="true" />}
                      {n.tieuDe} ({n.ds.length})
                    </h3>
                    <p className="text-xs text-zinc-400">{n.moTa}</p>
                    <ul className="space-y-2">
                      {n.ds.map((op) => (
                        <DongThaoTac
                          key={op.operationId}
                          op={op}
                          dangLam={dangLam}
                          onBo={() => void bo(op)}
                          onXem={() => setXungDot(op.operationId)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              {soKhoa > 0 && (
                <section aria-labelledby="nhom-khoa" className="space-y-2">
                  <h3
                    id="nhom-khoa"
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-300"
                  >
                    <Lock className="w-4 h-4" aria-hidden="true" /> Bị khoá ({soKhoa})
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Thao tác của tài khoản này nhưng chưa đọc được: kho ngoại tuyến đang khoá, khoá
                    đã hết hạn hoặc thuộc dự án khác. Vẫn giữ trên thiết bị — có mạng thì bấm
                    &quot;Mở khoá&quot; hoặc chuyển về đúng dự án để gửi.
                  </p>
                </section>
              )}
              {legacy > 0 && (
                <section aria-labelledby="nhom-legacy" className="space-y-2">
                  <h3
                    id="nhom-legacy"
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300"
                  >
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Dữ liệu cũ chưa rõ chủ
                    ({legacy})
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Hàng đợi phiên bản cũ không ghi người tạo nên không được gửi hay gán cho tài
                    khoản đang đăng nhập. Dữ liệu được giữ nguyên, cách ly và không hiển thị nội
                    dung. Liên hệ quản trị để đối soát theo thiết bị.
                  </p>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function DongThaoTac({
  op,
  dangLam,
  onBo,
  onXem,
}: {
  op: ThaoTacHangDoi;
  dangLam: boolean;
  onBo: () => void;
  onXem: () => void;
}) {
  const lyDo = lyDoKetQua(op.lastResult);
  const xuLyDuoc = op.state === "conflict" || op.state === "rejected";
  return (
    <li className="rounded-xl bg-zinc-950/70 border border-zinc-800 p-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-zinc-100">{moTaThaoTac(op)}</span>
        <span className="text-xs text-zinc-400">Lưu lúc {gio(op.queuedAt)}</span>
      </div>
      {lyDo && <p className="text-xs text-zinc-300">Lý do: {lyDo}</p>}
      {op.state === "pending" && op.tries > 0 && op.nextAttemptAt > Date.now() && (
        <p className="text-xs text-zinc-400">Thử lại sau {gio(op.nextAttemptAt)}</p>
      )}
      {xuLyDuoc && (
        <div className="flex flex-wrap gap-2">
          {op.state === "conflict" && op.kind === "diary_note" && (
            <Button size="sm" variant="secondary" disabled={dangLam} onClick={onXem}>
              Xem &amp; giải quyết
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={Trash2} disabled={dangLam} onClick={onBo}>
            Bỏ thao tác này
          </Button>
        </div>
      )}
    </li>
  );
}

// ── Giải quyết xung đột nhật ký (A2-FR11) ────────────────────────────────────────────────

type BanMayChu = {
  etag: string | null;
  khoaSo: boolean;
  noiDung: Omit<DiaryNotePayload, "date" | "photoIds"> & { soAnh: number };
};

function docBanMayChu(j: Record<string, unknown>): BanMayChu {
  const d = (j.diary ?? null) as Record<string, string | null> | null;
  const mp = Array.isArray(j.manpower)
    ? (j.manpower as { crew: string; headcount: number; note?: string | null }[])
    : [];
  return {
    etag: typeof j.etag === "string" ? j.etag : null,
    khoaSo: d?.status === "locked",
    noiDung: {
      weatherAm: d?.weatherAm ?? null,
      weatherPm: d?.weatherPm ?? null,
      workDone: d?.workDone ?? null,
      obstacles: d?.obstacles ?? null,
      safetyNote: d?.safetyNote ?? null,
      manpower: mp,
      soAnh: Array.isArray(j.photoIds) ? j.photoIds.length : 0,
    },
  };
}

function CotNhatKy({ tieuDe, noiDung }: { tieuDe: string; noiDung: BanMayChu["noiDung"] | null }) {
  const tong = noiDung?.manpower.reduce((s, m) => s + (Number(m.headcount) || 0), 0) ?? 0;
  const dong = (nhan: string, v: string | null | undefined) => (
    <div>
      <dt className="text-xs text-zinc-400">{nhan}</dt>
      <dd className="text-sm text-zinc-100 whitespace-pre-wrap break-words">{v?.trim() || "—"}</dd>
    </div>
  );
  return (
    <section className="rounded-xl bg-zinc-950/70 border border-zinc-800 p-3 space-y-2 min-w-0">
      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">{tieuDe}</h4>
      {noiDung ? (
        <dl className="space-y-2">
          {dong(
            "Thời tiết sáng / chiều",
            `${noiDung.weatherAm ?? "—"} / ${noiDung.weatherPm ?? "—"}`,
          )}
          {dong("Công việc đã làm", noiDung.workDone)}
          {dong("Vướng mắc", noiDung.obstacles)}
          {dong("An toàn", noiDung.safetyNote)}
          {dong(
            "Nhân lực",
            noiDung.manpower.length
              ? `${tong} người — ${noiDung.manpower.map((m) => `${m.crew}: ${m.headcount}`).join(", ")}`
              : null,
          )}
          {dong("Ảnh đính kèm", `${noiDung.soAnh} ảnh`)}
        </dl>
      ) : (
        <p className="text-sm text-zinc-400">Máy chủ chưa có nhật ký cho ngày này.</p>
      )}
    </section>
  );
}

function XungDotNhatKy({
  operationId,
  onXong,
}: {
  operationId: string;
  onXong: (thongBao: string) => void;
}) {
  const [ban, setBan] = useState<NhatKyXungDot | null>(null);
  const [mayChu, setMayChu] = useState<BanMayChu | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [dangLam, setDangLam] = useState(false);
  const [thongBao, setThongBao] = useState("");
  /** Tăng để tải lại cả bản thiết bị lẫn bản máy chủ (nút "Tải lại"). */
  const [lanTai, setLanTai] = useState(0);
  const tieuDeRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    tieuDeRef.current?.focus();
  }, []);

  const taiLai = () => {
    setDangTai(true);
    setLoi(null);
    setMayChu(null);
    setThongBao("");
    setLanTai((n) => n + 1);
  };

  useEffect(() => {
    let huy = false;
    (async () => {
      let xem: NhatKyXungDot | null;
      try {
        xem = await offlineQueue.xemNhatKyXungDot(operationId);
      } catch {
        if (huy) return;
        setLoi("Không đọc được dữ liệu ngoại tuyến trên thiết bị — bấm Tải lại để thử lại.");
        setDangTai(false);
        return;
      }
      if (huy) return;
      if (!xem) {
        setLoi("Không đọc được bản trên thiết bị (kho đang khoá hoặc thao tác đã đổi trạng thái).");
        setDangTai(false);
        return;
      }
      setBan(xem);
      // Bản máy chủ: server kiểm quyền xem nhật ký; không có quyền/không có mạng → không so sánh.
      try {
        const r = await fetch(`/api/diaries/${xem.payload.date}`, { cache: "no-store" });
        const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
        if (huy) return;
        if (!r.ok || !j) {
          setLoi(
            r.status === 403
              ? "Bạn không còn quyền xem nhật ký ngày này trên máy chủ."
              : `Không tải được bản trên máy chủ (HTTP ${r.status}).`,
          );
        } else setMayChu(docBanMayChu(j));
      } catch {
        if (!huy) setLoi("Mất kết nối — cần có mạng để xem bản trên máy chủ.");
      } finally {
        if (!huy) setDangTai(false);
      }
    })();
    return () => {
      huy = true;
    };
  }, [operationId, lanTai]);

  const giuThietBi = async () => {
    if (!ban || !mayChu) return;
    const ok = await appConfirm(
      "Gửi bản trên thiết bị THAY bản đang có trên máy chủ? Nội dung người khác đã lưu ở bản máy chủ sẽ bị thay thế khi gửi.",
      { confirmLabel: "Giữ bản trên thiết bị" },
    );
    if (!ok) return;
    setDangLam(true);
    setThongBao("Đang lưu lựa chọn trên thiết bị…");
    const kq = await offlineQueue.giuBanNhatKyThietBi(operationId, mayChu.etag);
    setDangLam(false);
    if (kq.ok)
      onXong(kq.canhBao ?? "Đã xếp bản trên thiết bị để gửi lại theo phiên bản máy chủ vừa xem.");
    else setThongBao(kq.error);
  };

  const dungMayChu = async () => {
    const ok = await appConfirm(
      "Dùng bản trên máy chủ và BỎ bản nhật ký trên thiết bị? Bản trên thiết bị chưa lên máy chủ sẽ mất hẳn.",
      { danger: true, confirmLabel: "Bỏ bản trên thiết bị" },
    );
    if (!ok) return;
    setDangLam(true);
    try {
      const xong = await offlineQueue.boThaoTac(operationId);
      onXong(
        xong ? "Đã bỏ bản trên thiết bị, giữ bản trên máy chủ." : "Thao tác đã đổi trạng thái.",
      );
    } catch {
      setThongBao("Chưa bỏ được bản trên thiết bị do lỗi đọc/ghi — bản này vẫn còn, thử lại.");
    } finally {
      setDangLam(false);
    }
  };

  const chanGiu = !mayChu || mayChu.khoaSo || !!ban?.coBanMoiHon;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          size="icon"
          icon={ArrowLeft}
          aria-label="Quay lại danh sách"
          onClick={() => onXong("")}
        />
        <div className="min-w-0">
          <h2
            ref={tieuDeRef}
            tabIndex={-1}
            className="text-lg font-bold text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
          >
            Xung đột nhật ký{ban ? ` ngày ${formatDateDMY(ban.payload.date)}` : ""}
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Máy chủ đã có bản khác với bản bạn soạn trên thiết bị. Chưa có gì bị ghi đè. So sánh rồi
            chọn bản giữ lại — hệ thống không tự gộp nội dung.
          </p>
        </div>
      </div>

      <p role="status" aria-live="polite" className="text-sm text-zinc-200">
        {dangTai ? "Đang tải bản trên máy chủ…" : thongBao}
      </p>
      {loi && (
        <p role="alert" className="text-sm text-amber-300">
          {loi}
        </p>
      )}

      {dangTai ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        ban && (
          <div className="grid gap-3 sm:grid-cols-2">
            <CotNhatKy
              tieuDe="Bản trên thiết bị (chưa lên máy chủ)"
              noiDung={{ ...ban.payload, soAnh: ban.payload.photoIds.length }}
            />
            {mayChu && (
              <CotNhatKy tieuDe="Bản trên máy chủ" noiDung={mayChu.etag ? mayChu.noiDung : null} />
            )}
          </div>
        )
      )}

      {mayChu?.khoaSo && (
        <p className="text-sm text-amber-300">
          Nhật ký ngày này đã khoá sổ trên máy chủ — không thể gửi bản thiết bị đè lên.
        </p>
      )}
      {ban?.coBanMoiHon && (
        <p className="text-sm text-zinc-300">
          Thiết bị còn bản nháp mới hơn cho ngày này — bản mới hơn sẽ được gửi; bản xung đột này chỉ
          còn lựa chọn bỏ đi.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={dangLam || chanGiu} onClick={giuThietBi}>
          Giữ bản trên thiết bị
        </Button>
        {/* Chưa xem được bản máy chủ thì không cho "dùng" nó (người dùng chưa biết sẽ giữ gì). */}
        <Button variant="secondary" disabled={dangLam || !ban || !mayChu} onClick={dungMayChu}>
          Dùng bản máy chủ
        </Button>
        <Button variant="ghost" icon={RefreshCw} disabled={dangLam || dangTai} onClick={taiLai}>
          Tải lại
        </Button>
      </div>
    </div>
  );
}
