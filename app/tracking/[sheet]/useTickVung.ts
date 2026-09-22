"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showToast } from "@/app/components/Toast";
import { useVungChon } from "@/app/components/grid/useVungChon";
import { parseTSV, serializeTSV } from "@/lib/tien-do/grid";
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
import { dungLoTuDan } from "./dan";
import { dungLoTick, oTrongVung } from "./tick";
import { guiLoTick } from "./tickApi";
import type { Grid } from "./types";

// Phần tử đang được gõ liệu — bỏ qua dán/copy vùng ở đây để không cướp thao tác của ô đó.
function dangGoLieu(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  return !!node && (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName) || node.isContentEditable);
}

// Nối vùng chọn + lịch sử hoàn tác + gửi lô cho lưới tracking (M121 PR3+PR4, dán/copy M124 V5).
// Đặt riêng khỏi `TrackingGrid.tsx` để file lưới chỉ còn dựng giao diện — và để mọi quyết
// định "gửi gì / hoàn tác thế nào" nằm cạnh nhau, không rải trong gần 1800 dòng JSX.
export function useTickVung(opts: {
  grid: Grid | null;
  load: () => void;
  onChanged: () => void;
  onOfflineTickBatch: (dimIds: number[], installed: boolean) => void;
  editMode: boolean;
}) {
  const { grid, load, onChanged, onOfflineTickBatch, editMode } = opts;
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

  // Dán ma trận TSV (từ Excel) vào vùng đang chọn — M124 việc 5. `dungLoTuDan` đã lát ma trận
  // theo góc trên-trái của vùng nên có thể dán vùng lớn hơn ô đang chọn, giống Excel thật.
  const dan = useCallback(
    async (text: string) => {
      if (!grid || !chon.vung || dangChay.current) return;
      const matrix = parseTSV(text);
      const kq = dungLoTuDan(matrix, chon.vung, grid);
      if ("loi" in kq) {
        showToast(kq.loi, "error");
        return;
      }
      const { tick, boTick, boQua } = kq;
      if (!tick.length && !boTick.length) {
        if (boQua) showToast(`Không dán được ô nào (${boQua} ô bỏ qua)`, "error");
        return;
      }
      // Giá trị TRƯỚC của từng ô — tra theo id từ lưới hiện tại trước khi gửi.
      const truocById = new Map<number, boolean>();
      for (const t of grid.tasks)
        for (const col of grid.columns) {
          const c = t.cells[col];
          if (c) truocById.set(c.id, c.installed);
        }
      // Gom tối đa 2 lô (tick / bỏ tick) — mỗi lô một giá trị `installed` chung nên không gộp
      // được thành MỘT mục lịch sử (`MucTick.sau` chỉ giữ một giá trị); ghi 2 mục liên tiếp vẫn
      // hoàn tác được đầy đủ bằng Ctrl+Z, chỉ tốn 2 lần bấm khi lần dán trộn cả tick lẫn bỏ tick.
      const loList: LoDao[] = [];
      if (tick.length) loList.push({ dimIds: tick, installed: true });
      if (boTick.length) loList.push({ dimIds: boTick, installed: false });
      dangChay.current = true;
      setDangGui(true);
      try {
        const ok = await guiCacLo(loList);
        if (ok) {
          for (const lo of loList) {
            const truoc = lo.dimIds.map((id) => truocById.get(id) ?? !lo.installed);
            setLichSu((ls) => ghiThaoTac(ls, { dimIds: lo.dimIds, truoc, sau: lo.installed }));
          }
          const tong = tick.length + boTick.length;
          showToast(`Đã dán ${tong} ô${boQua ? ` (${boQua} bỏ qua)` : ""}`, "success");
        }
      } finally {
        dangChay.current = false;
        setDangGui(false);
      }
      load();
      onChanged();
    },
    [grid, chon.vung, guiCacLo, load, onChanged],
  );

  // Sao chép vùng đang chọn ra clipboard dạng TSV "x"/"" — dán được thẳng vào Excel.
  const saoChep = useCallback(() => {
    if (!grid || !chon.vung) return;
    const { r0, r1, c0, c1 } = chon.vung;
    const matrix: string[][] = [];
    for (let r = r0; r <= r1; r++) {
      const task = grid.tasks[r];
      const row: string[] = [];
      for (let c = c0; c <= c1; c++) {
        const col = grid.columns[c];
        const cell = col !== undefined ? task?.cells[col] : undefined;
        row.push(cell?.installed ? "x" : "");
      }
      matrix.push(row);
    }
    navigator.clipboard?.writeText(serializeTSV(matrix)).catch(() => {
      /* trình duyệt từ chối quyền clipboard — bỏ qua, không có gì để báo thêm người dùng */
    });
  }, [grid, chon.vung]);

  // Ctrl+V dán ma trận vào vùng đang chọn — chỉ khi đang sửa và có vùng chọn.
  useEffect(() => {
    if (!editMode) return;
    const onPaste = (e: ClipboardEvent) => {
      if (dangGoLieu(e.target) || !chon.vung) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      e.preventDefault();
      void dan(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [editMode, chon.vung, dan]);

  // Ctrl+C sao chép vùng đang chọn — chỉ khi đang sửa và có vùng chọn.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "c") return;
      if (dangGoLieu(e.target) || !chon.vung) return;
      saoChep();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, chon.vung, saoChep]);

  return {
    ...chon,
    soODaChon: oDaChon.length,
    dangGui,
    tickVung,
    hoanTac,
    lamLai,
    ghiTickLe,
    ghiThaoTacLo,
    dan,
    saoChep,
    coTheHoanTac: lichSu.hoanTac.length > 0,
    coTheLamLai: lichSu.lamLai.length > 0,
  };
}
