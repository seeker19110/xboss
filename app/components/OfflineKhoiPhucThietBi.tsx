"use client";
// Khôi phục thao tác ngoại tuyến khi MẤT PROOF trình duyệt (M131 §3) — khối con của màn phục hồi
// (OfflineRecoveryPanel). Chỉ hiện khi trình duyệt này còn thao tác của chính chủ thuộc thiết bị
// CŨ (proof cũ đã mất → khoá không thuộc thiết bị này). Luồng: gửi yêu cầu (POST
// /api/offline/recovery) → Admin duyệt (thu hồi thiết bị cũ, người dùng đăng nhập lại) → "Hoàn tất"
// trên đúng trình duyệt này (POST .../complete) → gắn lại thao tác sang thiết bị hiện tại theo bản
// đồ khoá (chỉ id) rồi gửi như thường. Không màn nào ở đây nhận/hiện khoá.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, LifeBuoy, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Button, Chip } from "@/app/components/ui";
import { Skeleton } from "@/app/components/Skeleton";
import { offlineQueue, type MucKhoiPhuc } from "@/app/components/offlineQueue";

type ThietBiCuaToi = {
  id: string;
  createdAt: string;
  revokedAt: string | null;
  thisBrowser: boolean;
};
type YeuCau = {
  id: string;
  oldDeviceId: string;
  newDeviceId: string;
  status: "pending" | "approved" | "rejected" | "completed" | "expired";
  decideNote: string | null;
  keysRecovered: number | null;
  keysSkipped: number | null;
};
type DuLieu = {
  cu: { deviceId: string; soThaoTac: number }[];
  thietBi: ThietBiCuaToi[];
  yeuCau: YeuCau[];
};

const MAX_LY_DO = 500;

async function docJson<T>(url: string): Promise<{ status: number; body: T | null }> {
  const r = await fetch(url, { cache: "no-store" });
  return { status: r.status, body: (await r.json().catch(() => null)) as T | null };
}

const thongDiepLoi = (status: number, body: { error?: unknown } | null) =>
  status === 401
    ? "Phiên đăng nhập đã hết hạn (Admin duyệt khôi phục buộc đăng nhập lại) — đăng nhập rồi mở lại màn này."
    : typeof body?.error === "string"
      ? body.error
      : `Máy chủ không xử lý được (HTTP ${status}).`;

export default function OfflineKhoiPhucThietBi({
  vaultMo,
  onDem,
}: {
  vaultMo: boolean;
  /** Báo số thao tác thuộc thiết bị cũ — màn cha không được nói "đã lên máy chủ hết" khi còn. */
  onDem: (soThaoTac: number) => void;
}) {
  const [duLieu, setDuLieu] = useState<DuLieu | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [thongBao, setThongBao] = useState("");
  const [dangLam, setDangLam] = useState(false);
  const [lyDo, setLyDo] = useState<Record<string, string>>({});

  const taiLai = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      // Còn bản đồ khôi phục từ lần trước (op thuộc dự án vừa mở) → gắn tiếp trước khi liệt kê.
      const gan = await offlineQueue.ganLaiTheoKhoiPhuc();
      if (gan.daGan > 0) setThongBao(`Đã gắn lại ${gan.daGan} thao tác từ thiết bị cũ.`);
      const cu = await offlineQueue.thietBiCuConThaoTac();
      onDem(cu.reduce((n, d) => n + d.soThaoTac, 0));
      if (cu.length === 0) {
        setDuLieu({ cu, thietBi: [], yeuCau: [] });
        return;
      }
      const [tb, yc] = await Promise.all([
        docJson<{ devices?: ThietBiCuaToi[]; error?: unknown }>("/api/offline/devices"),
        docJson<{ requests?: YeuCau[]; error?: unknown }>("/api/offline/recovery"),
      ]);
      const hong = tb.status !== 200 ? tb : yc.status !== 200 ? yc : null;
      if (hong) {
        setLoi(thongDiepLoi(hong.status, hong.body));
        return;
      }
      setDuLieu({ cu, thietBi: tb.body?.devices ?? [], yeuCau: yc.body?.requests ?? [] });
    } catch {
      setLoi("Không đọc được dữ liệu trên thiết bị hoặc mất kết nối — thử lại.");
    } finally {
      setDangTai(false);
    }
  }, [onDem]);

  useEffect(() => {
    if (vaultMo) void taiLai();
  }, [vaultMo, taiLai]);

  if (!vaultMo) return null;
  if (!duLieu && !loi)
    return dangTai ? (
      <div aria-hidden="true">
        <Skeleton className="h-16" />
      </div>
    ) : null;
  if (duLieu && duLieu.cu.length === 0 && !thongBao) return null;

  const trinhDuyetNay = duLieu?.thietBi.find((t) => t.thisBrowser)?.id ?? null;

  const guiYeuCau = async (oldDeviceId: string) => {
    setDangLam(true);
    setThongBao("Đang gửi yêu cầu khôi phục…");
    try {
      const r = await fetch("/api/offline/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldDeviceId, reason: lyDo[oldDeviceId]?.trim() || null }),
      });
      const j = (await r.json().catch(() => null)) as { error?: unknown } | null;
      setThongBao(
        r.ok
          ? "Đã gửi yêu cầu — chờ Admin duyệt. Khi được duyệt bạn cần đăng nhập lại rồi mở màn này để hoàn tất."
          : thongDiepLoi(r.status, j),
      );
      if (r.ok) await taiLai();
    } catch {
      setThongBao("Mất kết nối — chưa gửi được yêu cầu, thử lại khi có mạng.");
    } finally {
      setDangLam(false);
    }
  };

  const hoanTat = async (y: YeuCau) => {
    setDangLam(true);
    setThongBao("Đang khôi phục khoá cho trình duyệt này…");
    try {
      const r = await fetch(`/api/offline/recovery/${y.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = (await r.json().catch(() => null)) as {
        mapping?: MucKhoiPhuc[];
        skipped?: number;
        error?: unknown;
      } | null;
      if (!r.ok || !j) {
        setThongBao(thongDiepLoi(r.status, j));
        return;
      }
      const mapping = Array.isArray(j.mapping) ? j.mapping : [];
      const gan = await offlineQueue.ganLaiTheoKhoiPhuc(mapping);
      setThongBao(
        `Đã khôi phục ${mapping.length} khoá` +
          (j.skipped ? `, bỏ qua ${j.skipped} khoá không còn quyền` : "") +
          `; gắn lại ${gan.daGan} thao tác để gửi.` +
          (gan.conLai > 0
            ? ` Còn ${gan.conLai} thao tác thuộc dự án khác — chuyển sang dự án đó rồi mở lại màn này.`
            : ""),
      );
      await taiLai();
    } catch {
      setThongBao("Chưa hoàn tất được (mất kết nối hoặc lỗi thiết bị) — thử lại.");
    } finally {
      setDangLam(false);
    }
  };

  return (
    <section
      aria-labelledby="khoi-phuc-thiet-bi-cu"
      className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 space-y-3"
    >
      <h3
        id="khoi-phuc-thiet-bi-cu"
        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-300"
      >
        <LifeBuoy className="w-4 h-4" aria-hidden="true" /> Thao tác của trình duyệt cũ
      </h3>
      <p className="text-xs text-zinc-400">
        Trình duyệt này đã mất mã nhận diện cũ (xoá dữ liệu duyệt web/đổi máy) nên khoá cũ không mở
        được. Gửi yêu cầu để Admin duyệt; sau khi duyệt, hoàn tất trên ĐÚNG trình duyệt này để lấy
        lại thao tác. Admin không xem được nội dung thao tác.
      </p>
      {thongBao && (
        <p role="status" aria-live="polite" className="text-sm text-zinc-200">
          {thongBao}
        </p>
      )}
      {loi ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-amber-300">{loi}</p>
          <Button variant="secondary" icon={RefreshCw} disabled={dangTai} onClick={taiLai}>
            Thử lại
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {duLieu?.cu.map((d) => {
            const tb = duLieu.thietBi.find((t) => t.id === d.deviceId);
            const yc = duLieu.yeuCau.find((y) => y.oldDeviceId === d.deviceId);
            const nhanTb = tb
              ? `Trình duyệt đăng ký ngày ${new Date(tb.createdAt).toLocaleDateString("vi-VN")}`
              : "Trình duyệt cũ";
            return (
              <li
                key={d.deviceId}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 space-y-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-100">{nhanTb}</span>
                  <span className="text-xs text-zinc-400">{d.soThaoTac} thao tác chưa mở được</span>
                </div>
                {!tb ? (
                  <p className="text-xs text-zinc-400">
                    Không tìm thấy thiết bị này trong tài khoản/tổ chức hiện tại — không khôi phục
                    được từ đây.
                  </p>
                ) : yc?.status === "pending" ? (
                  <Chip tone="warning" icon={Clock}>
                    Chờ Admin duyệt
                  </Chip>
                ) : yc?.status === "approved" ? (
                  yc.newDeviceId === trinhDuyetNay ? (
                    <Button
                      variant="primary"
                      icon={ShieldCheck}
                      disabled={dangLam}
                      onClick={() => void hoanTat(yc)}
                    >
                      Hoàn tất khôi phục
                    </Button>
                  ) : (
                    <p className="text-xs text-zinc-400">
                      Đã duyệt cho một trình duyệt khác — hoàn tất trên trình duyệt đó.
                    </p>
                  )
                ) : yc?.status === "completed" ? (
                  <div className="space-y-1">
                    <Chip tone="success" icon={CheckCircle2}>
                      Đã khôi phục
                    </Chip>
                    <p className="text-xs text-zinc-400">
                      Thao tác còn lại thuộc dự án khác (mở dự án đó rồi quay lại màn này) hoặc
                      không còn quyền nên không khôi phục được.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {yc?.status === "rejected" && (
                      <p className="flex items-center gap-1.5 text-xs text-zinc-300">
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        Yêu cầu trước bị từ chối{yc.decideNote ? `: ${yc.decideNote}` : ""}.
                      </p>
                    )}
                    <label className="block space-y-1">
                      <span className="text-xs text-zinc-400">Lý do (không bắt buộc)</span>
                      <textarea
                        value={lyDo[d.deviceId] ?? ""}
                        maxLength={MAX_LY_DO}
                        rows={2}
                        onChange={(e) => setLyDo((cu) => ({ ...cu, [d.deviceId]: e.target.value }))}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        placeholder="Vd: đã xoá dữ liệu trình duyệt, còn nhật ký chưa gửi"
                      />
                    </label>
                    <Button
                      variant="secondary"
                      icon={LifeBuoy}
                      disabled={dangLam}
                      onClick={() => void guiYeuCau(d.deviceId)}
                    >
                      Yêu cầu khôi phục
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
