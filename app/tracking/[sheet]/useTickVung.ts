"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { showToast } from "@/app/components/Toast";
import { useVungChon } from "@/app/components/grid/useVungChon";
import {
  LICH_SU_RONG,
  ghiThaoTac,
  loDeHoanTac,
  loDeLamLai,
  mucDeHoanTac,
  mucDeLamLai,
  xacNhanHoanTac,
  xacNhanLamLai,
  type LichSuTick,
  type LoDao,
} from "@/app/components/grid/lichSuTick";
import { dungLoTick, oTrongVung } from "./tick";
import { guiLoTick } from "./tickApi";
import type { Grid } from "./types";

// Nối vùng chọn + lịch sử hoàn tác + gửi lô cho lưới tracking (M121 PR3+PR4).
// Đặt riêng khỏi `TrackingGrid.tsx` để file lưới chỉ còn dựng giao diện — và để mọi quyết
// định "gửi gì / hoàn tác thế nào" nằm cạnh nhau, không rải trong 1700 dòng JSX.
export function useTickVung(opts: {
  grid: Grid | null;
  load: () => void;
  onChanged: () => void;
  onOfflineTickBatch: (dimIds: number[], installed: boolean) => void;
}) {
  const { grid, load, onChanged, onOfflineTickBatch } = opts;
  const chon = useVungChon();
  const [lichSu, setLichSu] = useState<LichSuTick>(LICH_SU_RONG);
  const [dangGui, setDangGui] = useState(false);
  // Khoá bằng ref, KHÔNG dựa vào `dangGui`: state React cập nhật bất đồng bộ nên hai lần bấm
  // Ctrl+Z liên tiếp (hoặc double-click nút) vẫn lọt qua cửa `dangGui` — cả hai cùng đọc một
  // `lichSu` cũ, gửi trùng lô rồi pop HAI mục khỏi ngăn xếp trong khi chỉ hoàn tác một, làm
  // mất một bước lịch sử. Ref đổi ngay trong cùng vòng lặp sự kiện nên chặn được.
  // Đặt ở hook (không ở nút bấm) để phủ mọi lối vào: nút, phím tắt, và cả lối thêm sau này.
  const dangChay = useRef(false);

  // useMemo: `oDaChon` là dependency của các useCallback bên dưới — tính lại mỗi lần render sẽ
  // làm mọi callback đổi tham chiếu, kéo theo re-render thừa cả lưới.
  const oDaChon = useMemo(
    () => (grid && chon.vung ? oTrongVung(grid.tasks, grid.columns, chon.vung) : []),
    [grid, chon.vung],
  );

  // Gửi nhiều lô tuần tự. Dừng ngay khi server từ chối: các lô sau thường cùng vùng, gửi tiếp
  // chỉ nhân bản đúng một thông báo lỗi. Trả `false` nếu có lô không vào được.
  const guiCacLo = useCallback(
    async (loList: LoDao[]): Promise<boolean> => {
      for (const lo of loList) {
        const kq = await guiLoTick(lo.dimIds, lo.installed);
        if (kq.trangThai === "mangLoi") {
          onOfflineTickBatch(lo.dimIds, lo.installed);
          continue; // mất mạng không phải từ chối — đã xếp hàng đợi, coi như xong
        }
        if (kq.trangThai === "tuChoi") {
          showToast(kq.loi, "error");
          return false;
        }
      }
      return true;
    },
    [onOfflineTickBatch],
  );

  // Tick/bỏ tick toàn bộ vùng đang chọn bằng MỘT request.
  const tickVung = useCallback(
    async (value: boolean) => {
      const lo = dungLoTick(oDaChon);
      if (!lo.ok) {
        showToast(lo.loi, "error");
        return;
      }
      if (!lo.ids.length) return;
      if (dangChay.current) return;
      dangChay.current = true;
      // Giá trị TRƯỚC của từng ô — ghi lại ngay, vì sau khi `load()` dữ liệu đã là giá trị mới.
      const truoc = oDaChon.map((o) => o.installed);
      setDangGui(true);
      try {
        const ok = await guiCacLo([{ dimIds: lo.ids, installed: value }]);
        if (ok) setLichSu((ls) => ghiThaoTac(ls, { dimIds: lo.ids, truoc, sau: value }));
      } finally {
        dangChay.current = false;
        setDangGui(false);
      }
      load();
      onChanged();
    },
    [oDaChon, guiCacLo, load, onChanged],
  );

  const hoanTac = useCallback(async () => {
    const muc = mucDeHoanTac(lichSu);
    if (!muc || dangChay.current) return;
    dangChay.current = true;
    setDangGui(true);
    try {
      const ok = await guiCacLo(loDeHoanTac(muc));
      // Server từ chối → GIỮ mục trong ngăn hoàn tác để thử lại sau khi mở gate (FR5).
      if (ok) setLichSu(xacNhanHoanTac);
    } finally {
      dangChay.current = false;
      setDangGui(false);
    }
    load();
    onChanged();
  }, [lichSu, guiCacLo, load, onChanged]);

  const lamLai = useCallback(async () => {
    const muc = mucDeLamLai(lichSu);
    if (!muc || dangChay.current) return;
    dangChay.current = true;
    setDangGui(true);
    try {
      const ok = await guiCacLo(loDeLamLai(muc));
      if (ok) setLichSu(xacNhanLamLai);
    } finally {
      dangChay.current = false;
      setDangGui(false);
    }
    load();
    onChanged();
  }, [lichSu, guiCacLo, load, onChanged]);

  // Ghi lại một lần tick lẻ (từ `toggle`) để nó cũng hoàn tác được như tick vùng.
  const ghiTickLe = useCallback((dimId: number, truoc: boolean, sau: boolean) => {
    setLichSu((ls) => ghiThaoTac(ls, { dimIds: [dimId], truoc: [truoc], sau }));
  }, []);

  // Ghi một lô đã gửi thành công ngoài hook này (vd "tick cả hàng") vào cùng ngăn lịch sử —
  // để Ctrl+Z hoàn tác được mọi thao tác tick, không phân biệt nó bắt nguồn từ nút nào.
  const ghiThaoTacLo = useCallback((dimIds: number[], truoc: boolean[], sau: boolean) => {
    setLichSu((ls) => ghiThaoTac(ls, { dimIds, truoc, sau }));
  }, []);

  return {
    ...chon,
    soODaChon: oDaChon.length,
    dangGui,
    tickVung,
    hoanTac,
    lamLai,
    ghiTickLe,
    ghiThaoTacLo,
    coTheHoanTac: lichSu.hoanTac.length > 0,
    coTheLamLai: lichSu.lamLai.length > 0,
  };
}
