"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Hash,
  Save,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Download,
  Sparkles,
} from "lucide-react";
import { Button, ButtonLink } from "@/app/components/ui";
import { Skeleton } from "@/app/components/Skeleton";
import { redirectToLogin } from "@/app/lib/me";

// M101 PR4 (§6.3) — mục "Mã BOQ theo dự án" của bảng điều khiển plugin AutoCAD.
//
// Rule pack là tệp dùng chung toàn công ty nên `boqCode` trong đó để trống; mã BOQ thật thì mỗi
// dự án một khác. Admin/PM gán ở đây → plugin gọi /api/engineering/cad/rule-pack?project=<id>
// nhận rule pack đã có mã, cột A của Excel bóc tách tự điền và sheet `Doi-chieu` so được KL bóc
// với KL hợp đồng. Mã chưa có dòng BOQ tương ứng vẫn lưu được, chỉ cảnh báo (dự án có thể chưa
// nhập BOQ vào XBoss) — chặn cứng sẽ khoá luôn việc chuẩn bị mã trước.

type DongMap = {
  takeoffItemId: string;
  ten: string;
  nhom: string;
  donVi: string;
  boqCode: string;
  tenBoq: string | null;
  klBoq: number | null;
};

type DuLieuMap = {
  projectId: number;
  rulePackVersion: string;
  choSua: boolean;
  items: DongMap[];
};

export default function MaBoqDuAnPanel() {
  const [duLieu, setDuLieu] = useState<DuLieuMap | null>(null);
  const [nhap, setNhap] = useState<Record<string, string>>({});
  const [loi, setLoi] = useState<string | null>(null);
  const [dangLuu, setDangLuu] = useState(false);
  const [thanhCong, setThanhCong] = useState<string | null>(null);
  // M108 §6.5 — gợi ý mã BOQ. CHỈ điền vào ô nhập, KHÔNG tự lưu: người dùng vẫn phải bấm Lưu.
  const [dangGoiY, setDangGoiY] = useState(false);
  const [lyDoGoiY, setLyDoGoiY] = useState<string | null>(null);
  const [maDoGoiY, setMaDoGoiY] = useState<Record<string, { doTinCay: number; lyDo: string }>>({});

  const tai = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/cad/boq-map");
      if (res.status === 401) return redirectToLogin();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoi(data.error || "Không tải được map mã BOQ.");
        return;
      }
      setLoi(null);
      setDuLieu(data as DuLieuMap);
      setNhap(
        Object.fromEntries((data.items as DongMap[]).map((i) => [i.takeoffItemId, i.boqCode])),
      );
    } catch {
      setLoi("Lỗi mạng — không tải được map mã BOQ.");
    }
  }, []);

  useEffect(() => {
    void tai();
  }, [tai]);

  /**
   * Xin gợi ý mã BOQ. Kết quả chỉ ĐIỀN SẴN vào ô nhập và đánh dấu dòng nào do máy đề xuất —
   * đường ghi vẫn là nút Lưu như cũ, không có đường tắt nào ghi thẳng (M108 AC11).
   */
  async function xinGoiY() {
    setDangGoiY(true);
    setLoi(null);
    setThanhCong(null);
    setLyDoGoiY(null);
    try {
      const res = await fetch("/api/engineering/cad/boq-map/suggest", { method: "POST" });
      if (res.status === 401) return redirectToLogin();
      const data = (await res.json().catch(() => ({}))) as {
        goiY?: { tu: string; den: string | null; doTinCay: number; lyDo: string }[];
        lyDoAiKhongChay?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setLoi(data.error || "Không lấy được gợi ý.");
        return;
      }
      const co = (data.goiY ?? []).filter((g) => g.den);
      setNhap((cu) => {
        const moi = { ...cu };
        for (const g of co) {
          // Không đè lên mã người đã gõ — gợi ý chỉ điền vào chỗ còn trống.
          if (!(moi[g.tu] ?? "").trim()) moi[g.tu] = g.den as string;
        }
        return moi;
      });
      setMaDoGoiY(
        Object.fromEntries(co.map((g) => [g.tu, { doTinCay: g.doTinCay, lyDo: g.lyDo }])),
      );
      setLyDoGoiY(
        data.lyDoAiKhongChay ??
          (co.length === 0
            ? "Không có gợi ý nào đủ căn cứ — gán tay như cũ."
            : `Đã điền sẵn ${co.length} mã — kiểm lại rồi bấm Lưu.`),
      );
    } catch {
      setLoi("Lỗi mạng — không lấy được gợi ý.");
    } finally {
      setDangGoiY(false);
    }
  }

  async function luu() {
    if (!duLieu) return;
    setDangLuu(true);
    setThanhCong(null);
    setLoi(null);
    try {
      const res = await fetch("/api/engineering/cad/boq-map", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: duLieu.items.map((i) => ({
            takeoffItemId: i.takeoffItemId,
            boqCode: nhap[i.takeoffItemId] ?? "",
          })),
        }),
      });
      if (res.status === 401) return redirectToLogin();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoi(data.error || "Lưu thất bại.");
        return;
      }
      setThanhCong(`Đã gán ${data.soGan} mã, gỡ ${data.soGo} mã.`);
      await tai();
    } catch {
      // Giữ nguyên dữ liệu đang gõ để người dùng bấm lưu lại, không xoá công sức nhập.
      setLoi("Lỗi mạng — chưa lưu được, dữ liệu vừa nhập vẫn còn trên màn hình.");
    } finally {
      setDangLuu(false);
    }
  }

  const soChuaKhop =
    duLieu?.items.filter((i) => (nhap[i.takeoffItemId] ?? "").trim() !== "" && i.tenBoq === null)
      .length ?? 0;

  return (
    <section className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="space-y-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100 flex items-center gap-2">
            <Hash className="w-4 h-4 text-sky-400" strokeWidth={1.75} />
            Mã BOQ Theo Dự Án (Bóc Tách XBOSS_BOCKL)
          </h2>
          <p className="text-xs text-zinc-400">
            Gán mã BOQ của dự án cho từng hạng mục bóc tách. Plugin tải rule pack kèm mã này nên QS
            không phải gõ cột A của Excel; sheet <span className="font-mono">Doi-chieu</span> lấy KL
            hợp đồng theo đúng mã đã gán.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {duLieu && (
            // Đường đưa map tới plugin: tải rule pack ĐÃ GÁN MÃ của dự án này rồi nạp bằng
            // XBOSS_RULEPACK — cột A của Excel bóc tách tự điền. Bản toàn cục (nút ở mục trên)
            // vẫn để trống mã như trước.
            <ButtonLink
              size="sm"
              variant="primary"
              icon={Download}
              href={`/api/engineering/cad/rule-pack?project=${duLieu.projectId}`}
              download={`xboss-rule-pack-${duLieu.rulePackVersion}-duan-${duLieu.projectId}.json`}
            >
              Tải Rule Pack Của Dự Án
            </ButtonLink>
          )}
          <Button
            size="sm"
            icon={Sparkles}
            onClick={() => void xinGoiY()}
            disabled={dangGoiY || !duLieu?.choSua}
            aria-label="Gợi ý mã BOQ từ danh mục BOQ của dự án"
          >
            {dangGoiY ? "Đang gợi ý…" : "Gợi Ý Từ Danh Mục BOQ"}
          </Button>
          <Button
            size="sm"
            icon={RefreshCw}
            onClick={() => void tai()}
            aria-label="Tải lại map mã BOQ"
          >
            Tải Lại
          </Button>
        </div>
      </div>

      {loi && (
        <p className="flex items-center gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {loi}
        </p>
      )}

      {lyDoGoiY && (
        <p className="flex items-start gap-1.5 text-xs text-sky-300">
          <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          {lyDoGoiY} Mã do máy đề xuất chỉ được điền sẵn, chưa lưu — bạn vẫn phải bấm Lưu.
        </p>
      )}

      {duLieu === null ? (
        !loi && <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="text-zinc-400">
                <tr className="border-b border-zinc-800">
                  <th className="text-left font-semibold py-2 pr-3">Hạng mục bóc tách</th>
                  <th className="text-left font-semibold py-2 pr-3">Hệ</th>
                  <th className="text-left font-semibold py-2 pr-3">ĐV</th>
                  <th className="text-left font-semibold py-2 pr-3">Mã BOQ</th>
                  <th className="text-left font-semibold py-2">Dòng BOQ khớp trên hệ thống</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {duLieu.items.map((i) => {
                  const ma = (nhap[i.takeoffItemId] ?? "").trim();
                  return (
                    <tr key={i.takeoffItemId} className="border-b border-zinc-900">
                      <td className="py-2 pr-3">
                        <div className="text-zinc-100">{i.ten}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">{i.takeoffItemId}</div>
                      </td>
                      <td className="py-2 pr-3 text-zinc-400">{i.nhom}</td>
                      <td className="py-2 pr-3 text-zinc-400">{i.donVi}</td>
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          value={nhap[i.takeoffItemId] ?? ""}
                          onChange={(e) =>
                            setNhap((t) => ({ ...t, [i.takeoffItemId]: e.target.value }))
                          }
                          disabled={!duLieu.choSua}
                          maxLength={64}
                          placeholder="—"
                          aria-label={`Mã BOQ cho hạng mục ${i.ten}`}
                          className="w-40 min-h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono text-xs disabled:opacity-60"
                        />
                        {/* Đánh dấu rõ mã nào do máy đề xuất — kèm icon + chữ, không chỉ bằng màu. */}
                        {maDoGoiY[i.takeoffItemId] && ma === "" ? null : maDoGoiY[
                            i.takeoffItemId
                          ] ? (
                          <p className="mt-1 flex items-start gap-1 text-[11px] text-sky-300">
                            <Sparkles className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
                            <span>
                              Máy đề xuất · {Math.round(maDoGoiY[i.takeoffItemId].doTinCay * 100)}%
                              — {maDoGoiY[i.takeoffItemId].lyDo}
                            </span>
                          </p>
                        ) : null}
                      </td>
                      <td className="py-2">
                        {ma === "" ? (
                          <span className="text-zinc-500">Chưa gán</span>
                        ) : i.tenBoq === null ? (
                          <span className="flex items-center gap-1.5 text-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            Chưa có dòng BOQ nào mang mã này trong dự án
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            {i.tenBoq} — KL hợp đồng {i.klBoq ?? 0} {i.donVi}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {duLieu.choSua ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="primary"
                icon={Save}
                onClick={() => void luu()}
                disabled={dangLuu}
                aria-label="Lưu map mã BOQ theo dự án"
              >
                {dangLuu ? "Đang lưu…" : "Lưu Map Mã BOQ"}
              </Button>
              {soChuaKhop > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {soChuaKhop} mã chưa khớp dòng BOQ nào — vẫn lưu được, nhưng sheet Đối chiếu sẽ bỏ
                  trống KL hợp đồng.
                </span>
              )}
              {thanhCong && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {thanhCong}
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500">
              Chỉ Admin/PM sửa được map này (rule pack {duLieu.rulePackVersion}).
            </p>
          )}
        </>
      )}
    </section>
  );
}
