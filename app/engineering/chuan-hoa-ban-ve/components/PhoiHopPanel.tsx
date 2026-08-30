"use client";

import { useCallback, useEffect, useState } from "react";
import { Compass, RefreshCw, AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import { Button, Card, Chip, Section, StatCard } from "@/app/components/ui";
import { redirectToLogin } from "@/app/lib/me";

// M116 PR3 §6 bước 5 — panel "Phối hợp liên hệ": đọc mục phoiHop (PhoiHopTomTat) đính kèm khi
// XBOSS_UPLOAD gửi kèm sidecar XBOSS_PHOIHOP_BAOCAO xuất ra. Cùng nguồn dữ liệu với
// PluginControlPanel (/api/engineering/cad/dashboard) nhưng tách panel riêng theo đúng brief M116
// PR3 (không nhét thêm cột vào bảng lịch sử upload vốn đã dày).

type TomTatPhoiHopLop = {
  lop: string;
  nhan: string;
  tongSo: number;
  soCung: number;
  soMem: number;
  soCanhBao: number;
  soChuaXuLy: number;
  soChapNhan: number;
  soBoQua: number;
};

type TomTatPhoiHop = {
  tongSo: number;
  soCung: number;
  soMem: number;
  soCanhBao: number;
  soChuaXuLy: number;
  soChapNhan: number;
  soBoQua: number;
  theoLop: TomTatPhoiHopLop[];
};

type DongLichSu = {
  revisionId: number;
  drawingCode: string;
  drawingName: string;
  rev: string;
  submittedAt: string | null;
  phoiHop: TomTatPhoiHop | null;
};

function ngay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN");
}

/** Một bản vẽ có dữ liệu phối hợp — thẻ nhỏ tổng cộng + chi tiết theo lớp kiểm. */
function TheBanVe({ dong }: { dong: DongLichSu }) {
  const ph = dong.phoiHop;
  if (!ph) return null;
  return (
    <Card tone="sunken" pad="md" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono font-bold text-zinc-100">{dong.drawingCode}</span>
          <span className="text-zinc-500 text-xs"> — {dong.drawingName}</span>
        </div>
        <span className="text-[11px] text-zinc-500 shrink-0">
          Rev {dong.rev} · {ngay(dong.submittedAt)}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Tổng xung đột" value={ph.tongSo} icon={Compass} tone="neutral" />
        <StatCard label="Cứng" value={ph.soCung} tone="danger" icon={AlertTriangle} />
        <StatCard label="Mềm" value={ph.soMem} tone="warning" icon={AlertTriangle} />
        <StatCard label="Cảnh báo" value={ph.soCanhBao} tone="info" icon={AlertTriangle} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="success" icon={CheckCircle2}>
          {ph.soChapNhan} chấp nhận
        </Chip>
        <Chip tone="neutral" icon={CircleDashed}>
          {ph.soBoQua} bỏ qua có lý do
        </Chip>
        <Chip tone={ph.soChuaXuLy > 0 ? "warning" : "success"} icon={AlertTriangle}>
          {ph.soChuaXuLy} chưa xử lý
        </Chip>
      </div>

      {ph.theoLop.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-zinc-800">
          <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">
            Theo lớp kiểm
          </div>
          <ul className="space-y-1">
            {ph.theoLop.map((l) => (
              <li
                key={l.lop}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-300"
              >
                <span className="font-medium text-zinc-200">{l.nhan}</span>
                <span className="text-zinc-500">
                  {l.tongSo} xung đột ({l.soCung} cứng, {l.soMem} mềm, {l.soCanhBao} cảnh báo) ·{" "}
                  {l.soChuaXuLy} chưa xử lý
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default function PhoiHopPanel() {
  const [dsLichSu, setDsLichSu] = useState<DongLichSu[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  const tai = useCallback(async () => {
    try {
      const res = await fetch("/api/engineering/cad/dashboard");
      if (res.status === 401) return redirectToLogin();
      const data = await res.json();
      if (!res.ok) {
        setLoi(data.error || "Không tải được dữ liệu phối hợp.");
        setDsLichSu([]);
        return;
      }
      setLoi(null);
      setDsLichSu(Array.isArray(data.lichSu) ? data.lichSu : []);
    } catch {
      setLoi("Lỗi mạng — không tải được dữ liệu phối hợp.");
      setDsLichSu([]);
    }
  }, []);

  useEffect(() => {
    void tai();
  }, [tai]);

  const coDuLieu = (dsLichSu ?? []).filter((d) => d.phoiHop !== null);

  return (
    <Section
      title="Phối Hợp Liên Hệ"
      icon={Compass}
      description="Xung đột giữa các hệ MEPF phát hiện bằng XBOSS_PHOIHOP, gộp theo bản vẽ đã gửi từ plugin (M116)."
      actions={
        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          onClick={() => void tai()}
          aria-label="Tải lại dữ liệu phối hợp"
        >
          Tải Lại
        </Button>
      }
    >
      {loi && (
        <p className="flex items-center gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {loi}
        </p>
      )}

      {dsLichSu === null ? (
        <Skeleton className="h-24 w-full" />
      ) : coDuLieu.length === 0 ? (
        <p className="text-xs text-zinc-400">
          Chưa có dữ liệu phối hợp — bản vẽ đã gửi chưa chạy <code>XBOSS_PHOIHOP_BAOCAO</code> trước
          khi <code>XBOSS_UPLOAD</code>, hoặc rule pack chưa bật{" "}
          <code>drawTools.coordinationPolicy</code>. Chạy <code>XBOSS_PHOIHOP</code> để kiểm rồi{" "}
          <code>XBOSS_PHOIHOP_BAOCAO</code> để xuất báo cáo kèm số liệu ở đây.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {coDuLieu.map((d) => (
            <TheBanVe key={d.revisionId} dong={d} />
          ))}
        </div>
      )}
    </Section>
  );
}
