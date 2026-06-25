'use client';
// Lưới chỉnh sửa kiểu bảng tính (Excel/Google Sheet) dùng chung cho nhiều bảng
// (vật tư, tracking...). Dữ liệu vẫn ở Postgres: mọi thay đổi ô gom thành danh
// sách edit và đẩy lên qua callback `onCommit` (gọi endpoint batch của trang).
//
// Tính năng: điều hướng bàn phím, chọn vùng (shift+click/drag/mũi tên),
// copy/paste/cut TSV, fill-down (Ctrl+D), xoá, select all (Ctrl+A),
// context menu (right-click), sort by column, search/replace (Ctrl+F/H),
// resize columns (drag header), auto-fit (double-click header),
// export CSV (Ctrl+S), keyboard shortcuts guide (Ctrl+?).
// Theme: chỉ dùng token Tailwind (zinc + nhấn -400), không hex, không `dark:`
// để giữ cơ chế đảo màu sáng/tối trong globals.css.
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { serializeTSV, parseTSV, normalizeRect, spreadPaste, type Rect } from '@/lib/grid';

export type GridColumn<Row> = {
  key: string;
  label: string;
  width?: number;                 // px; mặc định 120
  type?: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'readonly';
  options?: { value: string; label: string }[];
  editable?: boolean | ((row: Row) => boolean);
  align?: 'left' | 'right' | 'center';
  // Giá trị hiển thị/copy của ô.
  get: (row: Row) => string | number | boolean | null;
  // Chuỗi thô (gõ tay hoặc dán) → mảnh patch gửi API; trả null = bỏ qua ô này.
  toPatch?: (raw: string, row: Row) => Record<string, unknown> | null;
  // Nhãn hiển thị tuỳ biến (vd map id người → tên) — mặc định dùng get().
  render?: (row: Row) => React.ReactNode;
  // Conditional formatting: trả class Tailwind (token zinc + nhấn) tô màu ô theo
  // điều kiện (vd vượt định mức = nền đỏ). Chỉ dùng token, không hex/`dark:`.
  cellClass?: (row: Row) => string | undefined;
};

export type GridEdit = { rowId: number | string; patch: Record<string, unknown> };

type Props<Row> = {
  rows: Row[];
  columns: GridColumn<Row>[];
  rowKey: (r: Row) => number | string;
  onCommit: (edits: GridEdit[]) => Promise<void> | void;
  readOnly?: boolean;
  stickyCols?: number;            // số cột trái dính (mã/tên) — mặc định ban đầu
  maxBodyHeight?: number;         // px; cuộn dọc bên trong, header dính
  // Tuỳ chọn thêm/xoá dòng: chỉ hiện nút khi trang cha cấp callback (model có hỗ trợ).
  onAddRow?: () => Promise<void> | void;
  onDeleteRows?: (rowIds: (number | string)[]) => Promise<void> | void;
  // Khi dán vượt số dòng hiện có: tự thêm dòng mới (qua onAddRow) rồi điền tiếp.
  // Chỉ bật cho lưới state-local (Đơn hàng/PO) — không dùng cho lưới ghi DB.
  growRowsOnPaste?: boolean;
};

type Pos = { r: number; c: number };
const keyOf = (r: number, c: number) => `${r}:${c}`;

export default function SpreadsheetGrid<Row>({
  rows, columns, rowKey, onCommit, readOnly = false, stickyCols = 1, maxBodyHeight,
  onAddRow, onDeleteRows, growRowsOnPaste = false,
}: Props<Row>) {
  const [active, setActive] = useState<Pos>({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 0 }); // đầu vùng chọn
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [clipboard, setClipboard] = useState<{ matrix: (string | number | boolean | null)[][]; cut: boolean } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [sortBy, setSortBy] = useState<{ col: number; asc: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [replace, setReplace] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [freezeCols, setFreezeCols] = useState(stickyCols);          // số cột đóng băng (chỉnh được)
  const [colFilters, setColFilters] = useState<Record<number, Set<string>>>({}); // filter per-cột (AutoFilter)
  const [filterMenu, setFilterMenu] = useState<number | null>(null); // cột đang mở dropdown filter
  const [alignOverride, setAlignOverride] = useState<Record<number, 'left' | 'center' | 'right'>>({});
  // Ngăn xếp Undo/Redo: mỗi mục là lô ô đã đổi kèm giá trị cũ + mới (theo rowKey).
  const [undoStack, setUndoStack] = useState<{ rowKey: number | string; c: number; oldRaw: string; newRaw: string }[][]>([]);
  const [redoStack, setRedoStack] = useState<{ rowKey: number | string; c: number; oldRaw: string; newRaw: string }[][]>([]);
  const [pinned, setPinned] = useState<Set<string>>(new Set());      // rowKey các dòng được ghim
  const [hiddenCols, setHiddenCols] = useState<Set<number>>(new Set()); // chỉ số cột bị ẩn nhanh
  const [wrap, setWrap] = useState(false);                            // xuống dòng (wrap text) trong ô
  const [extraRects, setExtraRects] = useState<Rect[]>([]);          // các vùng chọn rời (Ctrl/Cmd+click)
  const gridRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  // Dán còn dở: chờ parent thêm đủ dòng (qua onAddRow) rồi mới điền nốt.
  const pendingPaste = useRef<{ matrix: string[][]; r: number; c: number } | null>(null);
  const editRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const nCols = columns.length;
  const nRows = rows.length;
  const rect: Rect = useMemo(() => normalizeRect(anchor, active), [anchor, active]);

  const isEditable = useCallback((c: number, row: Row) => {
    if (readOnly) return false;
    const col = columns[c];
    if (!col || col.type === 'readonly') return false;
    return typeof col.editable === 'function' ? col.editable(row) : col.editable !== false;
  }, [columns, readOnly]);

  const inOneRect = (rc: Rect, r: number, c: number) =>
    r >= rc.r0 && r <= rc.r1 && c >= rc.c0 && c <= rc.c1;
  // Ô thuộc vùng chọn = vùng hiện tại HOẶC một trong các vùng rời (Ctrl/Cmd+click).
  const inRect = (r: number, c: number) =>
    inOneRect(rect, r, c) || extraRects.some(rc => inOneRect(rc, r, c));

  // Tập ô (đã loại trùng) của toàn bộ vùng chọn — dùng cho xoá/định dạng/thống kê.
  const selectedCells = useCallback((): { r: number; c: number }[] => {
    const seen = new Set<string>();
    const out: { r: number; c: number }[] = [];
    for (const rc of [rect, ...extraRects]) {
      for (let r = rc.r0; r <= rc.r1; r++)
        for (let c = rc.c0; c <= rc.c1; c++) {
          const k = keyOf(r, c);
          if (!seen.has(k)) { seen.add(k); out.push({ r, c }); }
        }
    }
    return out;
  }, [rect, extraRects]);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      if (editRef.current instanceof HTMLInputElement) editRef.current.select();
    }
  }, [editing]);

  // Đóng context menu khi click ngoài
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Giữ ô active trong phạm vi khi rows/cols đổi (lọc, xoá hàng...).
  useEffect(() => {
    setActive(a => ({ r: Math.min(a.r, Math.max(0, nRows - 1)), c: Math.min(a.c, Math.max(0, nCols - 1)) }));
  }, [nRows, nCols]);

  const move = useCallback((dr: number, dc: number, extend: boolean) => {
    setExtraRects([]); // điều hướng bàn phím → bỏ các vùng chọn rời
    setActive(a => {
      const r = Math.max(0, Math.min(nRows - 1, a.r + dr));
      const c = Math.max(0, Math.min(nCols - 1, a.c + dc));
      if (!extend) setAnchor({ r, c });
      return { r, c };
    });
  }, [nRows, nCols]);

  // Chuỗi thô để khôi phục (Undo) giá trị hiện tại của 1 ô.
  const rawOf = useCallback((c: number, row: Row): string => {
    const v = columns[c]?.get(row);
    return v === null || v === undefined || v === false ? '' : v === true ? '1' : String(v);
  }, [columns]);

  // Gom các ô (r,c,raw) → edit theo rowId rồi gọi onCommit 1 lần.
  // track=true: lưu lô thay đổi vào ngăn xếp Undo (false khi chính undo/redo gọi).
  const commitCells = useCallback(async (cells: { r: number; c: number; raw: string }[], track = true) => {
    const byRow = new Map<string, Record<string, unknown>>();
    const rowIdMap = new Map<string, number | string>(); // key → original id
    const touched: string[] = [];
    const undoCells: { rowKey: number | string; c: number; oldRaw: string; newRaw: string }[] = [];
    for (const { r, c, raw } of cells) {
      const col = columns[c];
      const row = rows[r];
      if (!col || !row || !isEditable(c, row) || !col.toPatch) continue;
      const patch = col.toPatch(raw, row);
      if (!patch) continue;
      const id = rowKey(row);
      const k = String(id);
      undoCells.push({ rowKey: id, c, oldRaw: rawOf(c, row), newRaw: raw });
      byRow.set(k, { ...(byRow.get(k) ?? {}), ...patch });
      rowIdMap.set(k, id);
      touched.push(keyOf(r, c));
    }
    if (byRow.size === 0) return;
    if (track && undoCells.length) {
      setUndoStack(s => [...s.slice(-49), undoCells]); // giữ tối đa 50 bước
      setRedoStack([]);
    }
    const edits: GridEdit[] = [...byRow.entries()].map(([k, patch]) => ({ rowId: rowIdMap.get(k)!, patch }));

    setSaving(prev => { const n = new Set(prev); touched.forEach(k => n.add(k)); return n; });
    setErrors(prev => { const n = new Map(prev); touched.forEach(k => n.delete(k)); return n; });
    try {
      await onCommit(edits);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi lưu';
      setErrors(prev => { const n = new Map(prev); touched.forEach(k => n.set(k, msg)); return n; });
    } finally {
      setSaving(prev => { const n = new Set(prev); touched.forEach(k => n.delete(k)); return n; });
    }
  }, [columns, rows, isEditable, rowKey, onCommit, rawOf]);

  const startEdit = useCallback((preset?: string) => {
    const col = columns[active.c];
    const row = rows[active.r];
    if (!col || !row || !isEditable(active.c, row)) return;
    if (col.type === 'checkbox') { // checkbox: toggle ngay, không vào edit
      commitCells([{ r: active.r, c: active.c, raw: col.get(row) ? '' : '1' }]);
      return;
    }
    const cur = col.get(row);
    setDraft(preset !== undefined ? preset : (cur === null || cur === false ? '' : String(cur)));
    setEditing(true);
  }, [active, columns, rows, isEditable, commitCells]);

  const finishEdit = useCallback((commit: boolean, advance: 0 | 1 = 1) => {
    if (commit) {
      const col = columns[active.c];
      const row = rows[active.r];
      if (col && row && String(col.get(row) ?? '') !== draft) {
        commitCells([{ r: active.r, c: active.c, raw: draft }]);
      }
    }
    setEditing(false);
    if (advance) move(1, 0, false);
    gridRef.current?.focus();
  }, [active, columns, rows, draft, commitCells, move]);

  const copySelection = useCallback(() => {
    const matrix: (string | number | boolean | null)[][] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const line: (string | number | boolean | null)[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) line.push(columns[c]?.get(rows[r]) ?? '');
      matrix.push(line);
    }
    setClipboard({ matrix, cut: false });
    navigator.clipboard?.writeText(serializeTSV(matrix)).catch(() => { /* clipboard bị chặn */ });
  }, [rect, columns, rows]);

  const cutSelection = useCallback(() => {
    const matrix: (string | number | boolean | null)[][] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const line: (string | number | boolean | null)[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) line.push(columns[c]?.get(rows[r]) ?? '');
      matrix.push(line);
    }
    setClipboard({ matrix, cut: true });
    navigator.clipboard?.writeText(serializeTSV(matrix)).catch(() => { /* clipboard bị chặn */ });
  }, [rect, columns, rows]);

  const selectAll = useCallback(() => {
    setAnchor({ r: 0, c: 0 });
    setActive({ r: Math.max(0, nRows - 1), c: Math.max(0, nCols - 1) });
  }, [nRows, nCols]);

  const pasteAt = useCallback(async (text: string) => {
    const matrix = parseTSV(text);
    if (!matrix.length) return;
    // Dán vượt số dòng hiện có → thêm dòng mới rồi điền nốt (chỉ lưới state-local).
    const needed = active.r + matrix.length - nRows;
    if (growRowsOnPaste && onAddRow && needed > 0) {
      pendingPaste.current = { matrix, r: active.r, c: active.c };
      for (let i = 0; i < needed; i++) await onAddRow();
      return;
    }
    const cells = spreadPaste(matrix, active.r, active.c)
      .filter(({ r, c }) => r < nRows && c < nCols);
    await commitCells(cells);
  }, [active, nRows, nCols, commitCells, growRowsOnPaste, onAddRow]);

  // Khi parent đã thêm đủ dòng cho lần dán còn dở → điền dữ liệu vào.
  useEffect(() => {
    const p = pendingPaste.current;
    if (!p || nRows < p.r + p.matrix.length) return;
    pendingPaste.current = null;
    commitCells(spreadPaste(p.matrix, p.r, p.c).filter(({ c }) => c < nCols));
  }, [nRows, nCols, commitCells]);

  const fillDown = useCallback(() => {
    if (rect.r0 === rect.r1) return;
    const cells: { r: number; c: number; raw: string }[] = [];
    for (let c = rect.c0; c <= rect.c1; c++) {
      const src = columns[c]?.get(rows[rect.r0]);
      const raw = src === null || src === false ? '' : src === true ? '1' : String(src);
      for (let r = rect.r0 + 1; r <= rect.r1; r++) cells.push({ r, c, raw });
    }
    commitCells(cells);
  }, [rect, columns, rows, commitCells]);

  const clearSelection = useCallback(() => {
    commitCells(selectedCells().map(({ r, c }) => ({ r, c, raw: '' })));
  }, [selectedCells, commitCells]);

  // Re-commit 1 lô ô theo rowKey (dùng cho undo/redo); không ghi lại lịch sử.
  const recommit = useCallback((batch: { rowKey: number | string; c: number; raw: string }[]) => {
    const cells = batch
      .map(({ rowKey: id, c, raw }) => ({ r: rows.findIndex(row => rowKey(row) === id), c, raw }))
      .filter(({ r }) => r >= 0);
    if (cells.length) commitCells(cells, false);
  }, [rows, rowKey, commitCells]);

  const undo = useCallback(() => {
    setUndoStack(stack => {
      if (!stack.length) return stack;
      const batch = stack[stack.length - 1];
      recommit(batch.map(b => ({ rowKey: b.rowKey, c: b.c, raw: b.oldRaw })));
      setRedoStack(r => [...r, batch]);
      return stack.slice(0, -1);
    });
  }, [recommit]);

  const redo = useCallback(() => {
    setRedoStack(stack => {
      if (!stack.length) return stack;
      const batch = stack[stack.length - 1];
      recommit(batch.map(b => ({ rowKey: b.rowKey, c: b.c, raw: b.newRaw })));
      setUndoStack(u => [...u.slice(-49), batch]);
      return stack.slice(0, -1);
    });
  }, [recommit]);

  // Đặt căn lề cho cột đang chọn (ghi đè align mặc định của cột).
  const setColAlign = useCallback((a: 'left' | 'center' | 'right') => {
    setAlignOverride(prev => ({ ...prev, [active.c]: a }));
  }, [active.c]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return; // input tự xử lý
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === '?') { e.preventDefault(); setShowShortcuts(!showShortcuts); return; }
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); setShowSearch(!showSearch); return; }
    if (mod && e.key.toLowerCase() === 'h') { e.preventDefault(); setShowSearch(true); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportCSV(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
    if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); cutSelection(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); fillDown(); return; }
    if (mod) return; // để paste (onPaste) và phím hệ thống khác chạy
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); move(-1, 0, e.shiftKey); break;
      case 'ArrowDown': e.preventDefault(); move(1, 0, e.shiftKey); break;
      case 'ArrowLeft': e.preventDefault(); move(0, -1, e.shiftKey); break;
      case 'ArrowRight': case 'Tab': e.preventDefault(); move(0, e.key === 'Tab' && e.shiftKey ? -1 : 1, false); break;
      case 'Enter': case 'F2': e.preventDefault(); startEdit(); break;
      case 'Delete': case 'Backspace': e.preventDefault(); clearSelection(); break;
      case ' ': e.preventDefault(); startEdit(); break;
      default:
        // Gõ ký tự in được → vào edit với ký tự đó (như Excel)
        if (e.key.length === 1 && !e.altKey) { e.preventDefault(); startEdit(e.key); }
    }
  };

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (resizingCol === null) return;
      const newW = Math.max(60, e.clientX - (gridRef.current?.getBoundingClientRect().left ?? 0));
      setColWidths(prev => ({ ...prev, [resizingCol]: newW }));
    }
    function handleMouseUp() {
      setResizingCol(null);
    }
    if (resizingCol !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [resizingCol]);

  const colWidth = useCallback((c: number) => colWidths[c] ?? columns[c]?.width ?? 120, [colWidths, columns]);

  const sortedAndFiltered = useMemo(() => {
    let result = rows;
    if (sortBy !== null) {
      const col = columns[sortBy.col];
      if (col) {
        result = [...result].sort((a, b) => {
          const av = col.get(a);
          const bv = col.get(b);
          const aStr = av === null ? '' : String(av);
          const bStr = bv === null ? '' : String(bv);
          const cmp = aStr.localeCompare(bStr, 'vi', { numeric: true });
          return sortBy.asc ? cmp : -cmp;
        });
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        columns.some(col => String(col.get(r) ?? '').toLowerCase().includes(q))
      );
    }
    // Filter per-cột (AutoFilter): mỗi cột có tập giá trị được chọn → giữ hàng khớp.
    const activeFilters = Object.entries(colFilters).filter(([, set]) => set.size > 0);
    if (activeFilters.length) {
      result = result.filter(r =>
        activeFilters.every(([c, set]) => set.has(String(columns[Number(c)]?.get(r) ?? '')))
      );
    }
    // Đưa các dòng được ghim lên đầu (giữ thứ tự tương đối — stable partition).
    if (pinned.size) {
      const pin: Row[] = [], rest: Row[] = [];
      for (const r of result) (pinned.has(String(rowKey(r))) ? pin : rest).push(r);
      result = [...pin, ...rest];
    }
    return result;
  }, [rows, columns, sortBy, search, colFilters, pinned, rowKey]);

  // Tập giá trị phân biệt của 1 cột (cho dropdown filter).
  const distinctValues = useCallback((c: number) => {
    const set = new Set<string>();
    for (const row of rows) set.add(String(columns[c]?.get(row) ?? ''));
    return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [rows, columns]);

  // Thống kê vùng chọn (đếm / tổng / trung bình các ô số) — thanh trạng thái kiểu GSheet.
  const selectionStats = useMemo(() => {
    let count = 0, numCount = 0, sum = 0;
    for (const { r, c } of selectedCells()) {
      const row = rows[r];
      if (!row) continue;
      count++;
      const v = columns[c]?.get(row);
      const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
      if (!isNaN(n) && String(v ?? '').trim() !== '') { numCount++; sum += n; }
    }
    return { count, numCount, sum, avg: numCount ? sum / numCount : 0 };
  }, [selectedCells, rows, columns]);

  const doReplace = useCallback(() => {
    if (!search.trim()) return;
    const q = search.toLowerCase();
    const cells: { r: number; c: number; raw: string }[] = [];
    for (let r = 0; r < sortedAndFiltered.length; r++) {
      const row = sortedAndFiltered[r];
      const origR = rows.indexOf(row);
      for (let c = 0; c < columns.length; c++) {
        const val = String(columns[c]?.get(row) ?? '').toLowerCase();
        if (val.includes(q)) {
          const newVal = String(columns[c]?.get(row) ?? '').replace(new RegExp(search, 'gi'), replace);
          cells.push({ r: origR, c, raw: newVal });
        }
      }
    }
    if (cells.length > 0) commitCells(cells);
  }, [search, replace, sortedAndFiltered, rows, columns, commitCells]);

  const exportCSV = useCallback(() => {
    const lines: string[] = [];
    lines.push(columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(','));
    for (const row of sortedAndFiltered) {
      const line = columns.map(c => {
        const v = c.get(row) ?? '';
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(',');
      lines.push(line);
    }
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [columns, sortedAndFiltered]);

  // Xuất Excel đúng những gì đang thấy: cột hiển thị (bỏ cột ẩn), thứ tự sau
  // sort/filter, freeze + AutoFilter. Màu: dò token Tailwind trong cellClass
  // (rose/red→đỏ, emerald/green→xanh, amber→vàng, sky/blue→xanh dương) — best-effort.
  const exportXLSX = useCallback(async () => {
    const ExcelJS = (await import('exceljs')).default;
    const cols = columns.filter((_, c) => !hiddenCols.has(c));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bảng tính');
    ws.columns = cols.map(c => ({ width: Math.min(Math.max((c.width ?? 120) / 7, 8), 50) }));
    const header = ws.addRow(cols.map(c => c.label));
    header.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF27272A' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });
    const FILL: { test: RegExp; argb: string; fg: string }[] = [
      { test: /rose|red/, argb: 'FFFEE2E2', fg: 'FF991B1B' },
      { test: /emerald|green/, argb: 'FFD1FAE5', fg: 'FF065F46' },
      { test: /amber|yellow/, argb: 'FFFEF3C7', fg: 'FF92400E' },
      { test: /sky|blue/, argb: 'FFE0F2FE', fg: 'FF075985' },
    ];
    for (const row of sortedAndFiltered) {
      const xr = ws.addRow(cols.map(c => {
        const v = c.get(row);
        return typeof v === 'boolean' ? (v ? '✓' : '') : v ?? '';
      }));
      cols.forEach((c, i) => {
        const cls = c.cellClass?.(row);
        if (!cls) return;
        const m = FILL.find(f => f.test.test(cls));
        if (m) {
          const cell = xr.getCell(i + 1);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: m.argb } };
          cell.font = { color: { argb: m.fg } };
        }
      });
    }
    ws.views = [{ state: 'frozen', xSplit: freezeCols, ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bang-tinh-${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [columns, hiddenCols, sortedAndFiltered, freezeCols]);

  const autoFitColumn = useCallback((c: number) => {
    let maxLen = columns[c]?.label.length ?? 0;
    for (const row of rows) {
      const len = String(columns[c]?.get(row) ?? '').length;
      if (len > maxLen) maxLen = len;
    }
    setColWidths(prev => ({ ...prev, [c]: Math.min(maxLen * 8 + 16, 400) }));
  }, [columns, rows]);
  // Vị trí trái (px) cho các cột dính — cộng dồn bề rộng các cột dính trước nó.
  const leftOffsets = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (let c = 0; c < columns.length; c++) { out.push(acc); if (c < freezeCols) acc += (colWidths[c] ?? columns[c]?.width ?? 120); }
    return out;
  }, [columns, freezeCols, colWidths]);

  // Đóng dropdown filter khi click ra ngoài.
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) setFilterMenu(null);
    }
    if (filterMenu !== null) {
      document.addEventListener('mousedown', handle);
      return () => document.removeEventListener('mousedown', handle);
    }
  }, [filterMenu]);

  const selectionCount = useMemo(() => {
    let count = 0;
    for (let r = rect.r0; r <= rect.r1; r++) {
      for (let c = rect.c0; c <= rect.c1; c++) count++;
    }
    return count;
  }, [rect]);

  return (
    <div className="relative">
      <div className="bg-zinc-900/50 border-b border-zinc-800 space-y-2 px-3 py-2">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <div>
            {selectionCount > 1 && <span>{selectionCount} ô được chọn</span>}
            {clipboard && <span className="ml-3 text-zinc-500">{clipboard.cut ? '✂️ Cắt' : '📋 Sao chép'}</span>}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            <button onClick={() => setWrap(w => !w)} className={wrap ? 'text-sky-400' : 'hover:text-zinc-300'} title="Xuống dòng trong ô (wrap text)">↕️ Wrap</button>
            {hiddenCols.size > 0 && (
              <button onClick={() => setHiddenCols(new Set())} className="text-amber-400 hover:text-amber-300" title="Hiện lại các cột đã ẩn">👁 {hiddenCols.size} cột ẩn</button>
            )}
            <button onClick={() => setShowShortcuts(!showShortcuts)} className="hover:text-zinc-300">⌨️ Ctrl/?</button>
            <button onClick={() => setShowSearch(!showSearch)} className="hover:text-zinc-300">🔍 Ctrl/F</button>
            <button onClick={exportCSV} className="hover:text-zinc-300">💾 CSV</button>
            <button onClick={exportXLSX} className="hover:text-zinc-300" title="Xuất Excel đúng filter/sort + màu">📤 Excel</button>
          </div>
        </div>

        {/* Thanh công cụ: undo/redo, căn lề, đóng băng cột, thêm/xoá dòng */}
        {!readOnly && (
          <div className="flex items-center gap-1 flex-wrap text-zinc-300">
            <ToolBtn onClick={undo} disabled={!undoStack.length} title="Hoàn tác (Ctrl+Z)">↶</ToolBtn>
            <ToolBtn onClick={redo} disabled={!redoStack.length} title="Làm lại (Ctrl+Y)">↷</ToolBtn>
            <span className="w-px h-4 bg-zinc-700 mx-1" />
            <ToolBtn onClick={() => setColAlign('left')} title="Căn trái cột">⇤</ToolBtn>
            <ToolBtn onClick={() => setColAlign('center')} title="Căn giữa cột">↔</ToolBtn>
            <ToolBtn onClick={() => setColAlign('right')} title="Căn phải cột">⇥</ToolBtn>
            <span className="w-px h-4 bg-zinc-700 mx-1" />
            <ToolBtn onClick={() => setFreezeCols(n => Math.max(0, n - 1))} disabled={freezeCols <= 0} title="Bớt cột đóng băng">❄−</ToolBtn>
            <span className="text-[10px] text-zinc-500 px-1">đóng băng {freezeCols} cột</span>
            <ToolBtn onClick={() => setFreezeCols(n => Math.min(nCols, n + 1))} disabled={freezeCols >= nCols} title="Thêm cột đóng băng">❄+</ToolBtn>
            {(onAddRow || onDeleteRows) && <span className="w-px h-4 bg-zinc-700 mx-1" />}
            {onAddRow && <ToolBtn onClick={() => onAddRow()} title="Thêm dòng mới">＋ dòng</ToolBtn>}
            {onDeleteRows && (
              <ToolBtn
                onClick={() => {
                  const ids = [...new Set(
                    Array.from({ length: rect.r1 - rect.r0 + 1 }, (_, i) => rows[rect.r0 + i])
                      .filter(Boolean).map(row => rowKey(row))
                  )];
                  if (ids.length) onDeleteRows(ids);
                }}
                title="Xoá dòng đang chọn"
              >🗑 dòng</ToolBtn>
            )}
            {Object.keys(colFilters).some(c => colFilters[Number(c)]?.size) && (
              <button onClick={() => setColFilters({})} className="ml-1 text-[10px] text-sky-400 hover:text-sky-300">Xoá lọc</button>
            )}
          </div>
        )}

        {showSearch && (
          <div className="flex items-center gap-2 bg-zinc-800 rounded p-2">
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-sky-500"
            />
            <input
              type="text"
              placeholder="Thay thế bằng..."
              value={replace}
              onChange={e => setReplace(e.target.value)}
              className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white outline-none focus:border-sky-500"
            />
            <button
              onClick={doReplace}
              disabled={!search.trim()}
              className="bg-amber-700 hover:bg-amber-600 disabled:opacity-40 rounded px-3 py-1 text-sm font-medium"
            >
              Thay thế
            </button>
            <button
              onClick={() => setShowSearch(false)}
              className="text-zinc-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
      </div>
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={readOnly ? undefined : (e) => { e.preventDefault(); pasteAt(e.clipboardData.getData('text/plain')); }}
        onMouseUp={() => setDragging(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!readOnly) setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        className="overflow-auto outline-none rounded-lg border border-zinc-800 focus-visible:ring-1 focus-visible:ring-sky-400"
        style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
        role="grid"
        aria-rowcount={nRows + 1}
      >
        <table className="border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
          <thead className="sticky top-0 z-20">
            <tr>
              {columns.map((col, c) => hiddenCols.has(c) ? null : (
                <th
                  key={col.key}
                  className={`bg-zinc-900 text-zinc-300 font-medium border-b border-r border-zinc-800 px-2 py-1.5 text-left relative group ${c < freezeCols ? 'sticky z-30' : ''}`}
                  style={{ width: colWidth(c), minWidth: colWidth(c), left: c < freezeCols ? leftOffsets[c] : undefined }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <button
                      onClick={() => setSortBy(
                        sortBy?.col === c && sortBy.asc
                          ? { col: c, asc: false }
                          : { col: c, asc: true }
                      )}
                      className="hover:text-sky-400 flex-1 text-left"
                    >
                      {col.label}
                      {sortBy?.col === c && (sortBy.asc ? ' ▲' : ' ▼')}
                    </button>
                    {/* Nút filter per-cột (AutoFilter) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setFilterMenu(filterMenu === c ? null : c); }}
                      className={`shrink-0 px-0.5 ${colFilters[c]?.size ? 'text-sky-400' : 'text-zinc-600 hover:text-zinc-300'}`}
                      title="Lọc theo cột"
                      aria-label={`Lọc cột ${col.label}`}
                    >
                      ▾
                    </button>
                    {/* Ẩn nhanh cột này */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setHiddenCols(prev => new Set(prev).add(c)); }}
                      className="shrink-0 px-0.5 text-zinc-600 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition"
                      title="Ẩn cột này" aria-label={`Ẩn cột ${col.label}`}
                    >
                      ⊘
                    </button>
                    <div
                      onMouseDown={() => setResizingCol(c)}
                      onDoubleClick={() => autoFitColumn(c)}
                      className="w-1 h-5 bg-zinc-600 hover:bg-sky-500 cursor-col-resize group-hover:opacity-100 opacity-0 transition"
                      title="Kéo để thay đổi kích thước, double-click để auto-fit"
                    />
                  </div>
                  {filterMenu === c && (
                    <ColumnFilter
                      ref={filterMenuRef}
                      values={distinctValues(c)}
                      selected={colFilters[c] ?? new Set()}
                      onApply={(set) => { setColFilters(prev => ({ ...prev, [c]: set })); setFilterMenu(null); }}
                      onClose={() => setFilterMenu(null)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedAndFiltered.map((row, displayR) => {
              const r = rows.indexOf(row);
              const isPinned = pinned.has(String(rowKey(row)));
              return (
                <tr key={rowKey(row)}>
                  {columns.map((col, c) => {
                    if (hiddenCols.has(c)) return null;
                    const k = keyOf(r, c);
                    const isActive = active.r === r && active.c === c;
                    const selected = inRect(r, c);
                    const isSaving = saving.has(k);
                    const err = errors.get(k);
                    const editableHere = isEditable(c, row);
                    const align = alignOverride[c] ?? col.align ?? (col.type === 'number' ? 'right' : col.type === 'checkbox' ? 'center' : 'left');
                    const condClass = col.cellClass?.(row) ?? '';
                    // Kẻ hàng xen kẽ 2 màu (zebra): dùng token zinc để light mode ra
                    // dải xám sáng (~#EEEEEE/#CCCCCC), dark mode tự đảo — không hardcode hex.
                    const rowBg = isPinned ? 'bg-amber-950/30' : displayR % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-800';
                    return (
                      <td
                        key={col.key}
                        role="gridcell"
                        aria-selected={selected}
                        onMouseDown={(e) => {
                          gridRef.current?.focus();
                          if (e.ctrlKey || e.metaKey) {
                            // Ctrl/Cmd+click: thêm 1 vùng chọn rời, giữ các vùng trước.
                            setExtraRects(prev => [...prev, rect]);
                            setActive({ r, c }); setAnchor({ r, c }); setDragging(true);
                            return;
                          }
                          setExtraRects([]); // click thường → bỏ các vùng rời
                          if (e.shiftKey) { setActive({ r, c }); }
                          else { setActive({ r, c }); setAnchor({ r, c }); setDragging(true); }
                        }}
                        onMouseEnter={() => { if (dragging) setActive({ r, c }); }}
                        onDoubleClick={() => startEdit()}
                        className={[
                          'border-b border-r border-zinc-800 px-2 py-1 relative',
                          wrap ? 'whitespace-normal break-words align-top' : 'whitespace-nowrap',
                          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
                          c < freezeCols ? `sticky z-10 ${rowBg}` : rowBg,
                          condClass,
                          selected ? 'bg-sky-950/40' : '',
                          isActive ? 'ring-1 ring-inset ring-sky-400' : '',
                          err ? 'ring-1 ring-inset ring-rose-400' : '',
                          editableHere ? 'cursor-cell' : 'text-zinc-400',
                        ].join(' ')}
                        style={{ width: colWidth(c), minWidth: colWidth(c), left: c < freezeCols ? leftOffsets[c] : undefined }}
                        title={err ?? undefined}
                      >
                        {/* Đánh dấu dòng ghim ở ô đầu tiên hiển thị */}
                        {isPinned && c === [...Array(nCols).keys()].find(i => !hiddenCols.has(i)) && (
                          <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-amber-400 text-[10px]" aria-label="Dòng ghim">📌</span>
                        )}
                        {editing && isActive ? (
                          <CellEditor col={col} value={draft} setValue={setDraft} editRef={editRef}
                            onDone={finishEdit} />
                        ) : (
                          <span className={wrap ? 'block' : 'block overflow-hidden text-ellipsis'}>
                            {col.type === 'checkbox'
                              ? (col.get(row) ? '✓' : '')
                              : col.render ? col.render(row) : displayValue(col.get(row))}
                          </span>
                        )}
                        {isSaving && (
                          <Loader2 className="w-3 h-3 animate-spin text-sky-400 absolute right-1 top-1/2 -translate-y-1/2" aria-label="Đang lưu" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Thanh trạng thái: thống kê vùng chọn (kiểu Google Sheet) */}
      {selectionStats.count > 1 && (
        <div className="flex items-center gap-4 justify-end bg-zinc-900/50 border-t border-zinc-800 px-3 py-1 text-[11px] text-zinc-400">
          <span>Đếm: <b className="text-zinc-200">{selectionStats.count}</b></span>
          {selectionStats.numCount > 0 && (
            <>
              <span>Tổng: <b className="text-zinc-200">{selectionStats.sum.toLocaleString('vi')}</b></span>
              <span>TB: <b className="text-zinc-200">{selectionStats.avg.toLocaleString('vi', { maximumFractionDigits: 2 })}</b></span>
              <span>Số ô số: <b className="text-zinc-200">{selectionStats.numCount}</b></span>
            </>
          )}
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold text-lg">⌨️ Phím tắt</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div>
                <div className="font-semibold text-sky-300 mb-2">Điều hướng</div>
                <div className="space-y-1 text-zinc-300">
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">↑↓←→</kbd> Mũi tên | <kbd className="bg-zinc-700 px-2 py-1 rounded">Tab</kbd> Tab</div>
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Enter</kbd> / <kbd className="bg-zinc-700 px-2 py-1 rounded">F2</kbd> Sửa ô</div>
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Shift</kbd> + Mũi tên Chọn vùng</div>
                </div>
              </div>
              <div>
                <div className="font-semibold text-sky-300 mb-2">Clipboard</div>
                <div className="space-y-1 text-zinc-300">
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Ctrl/⌘</kbd> + <kbd className="bg-zinc-700 px-2 py-1 rounded">C</kbd> Sao chép</div>
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Ctrl/⌘</kbd> + <kbd className="bg-zinc-700 px-2 py-1 rounded">X</kbd> Cắt</div>
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Ctrl/⌘</kbd> + <kbd className="bg-zinc-700 px-2 py-1 rounded">V</kbd> Dán</div>
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Ctrl/⌘</kbd> + <kbd className="bg-zinc-700 px-2 py-1 rounded">D</kbd> Điền xuống</div>
                </div>
              </div>
              <div>
                <div className="font-semibold text-sky-300 mb-2">Chỉnh sửa</div>
                <div className="space-y-1 text-zinc-300">
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Delete</kbd> / <kbd className="bg-zinc-700 px-2 py-1 rounded">Backspace</kbd> Xoá</div>
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Ctrl/⌘</kbd> + <kbd className="bg-zinc-700 px-2 py-1 rounded">A</kbd> Chọn tất cả</div>
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Ctrl/⌘</kbd> + <kbd className="bg-zinc-700 px-2 py-1 rounded">F</kbd> Tìm kiếm</div>
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Ctrl/⌘</kbd> + <kbd className="bg-zinc-700 px-2 py-1 rounded">H</kbd> Thay thế</div>
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Ctrl/⌘</kbd> + <kbd className="bg-zinc-700 px-2 py-1 rounded">Z</kbd> Hoàn tác · <kbd className="bg-zinc-700 px-2 py-1 rounded">Ctrl/⌘</kbd> + <kbd className="bg-zinc-700 px-2 py-1 rounded">Y</kbd> Làm lại</div>
                </div>
              </div>
              <div>
                <div className="font-semibold text-sky-300 mb-2">Cột</div>
                <div className="space-y-1 text-zinc-300">
                  <div>Click header để sắp xếp (A→Z hoặc Z→A)</div>
                  <div>Kéo phần right của header để thay đổi kích thước</div>
                  <div>Double-click resize handle để auto-fit</div>
                </div>
              </div>
              <div>
                <div className="font-semibold text-sky-300 mb-2">Xuất</div>
                <div className="space-y-1 text-zinc-300">
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Ctrl/⌘</kbd> + <kbd className="bg-zinc-700 px-2 py-1 rounded">S</kbd> Xuất CSV</div>
                  <div><kbd className="bg-zinc-700 px-2 py-1 rounded">Ctrl/⌘</kbd> + <kbd className="bg-zinc-700 px-2 py-1 rounded">?</kbd> Hướng dẫn</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
        >
          <button
            onClick={() => { copySelection(); setContextMenu(null); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 text-left"
          >
            📋 Sao chép
          </button>
          {/* Ghim / bỏ ghim các dòng trong vùng chọn (ô đầu vùng quyết định trạng thái) */}
          <button
            onClick={() => {
              const ids = Array.from({ length: rect.r1 - rect.r0 + 1 }, (_, i) => rows[rect.r0 + i])
                .filter(Boolean).map(row => String(rowKey(row)));
              const allPinned = ids.every(id => pinned.has(id));
              setPinned(prev => {
                const n = new Set(prev);
                ids.forEach(id => allPinned ? n.delete(id) : n.add(id));
                return n;
              });
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 text-left"
          >
            📌 Ghim / bỏ ghim dòng
          </button>
          {!readOnly && (
            <>
              <button
                onClick={() => { cutSelection(); setContextMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 text-left"
              >
                ✂️ Cắt
              </button>
              {clipboard && (
                <button
                  onClick={() => { pasteAt(serializeTSV(clipboard.matrix)); setContextMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 text-left"
                >
                  📌 Dán
                </button>
              )}
              <div className="border-t border-zinc-700 my-1" />
              <button
                onClick={() => { clearSelection(); setContextMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 text-left"
              >
                🗑️ Xoá
              </button>
              {rect.r0 !== rect.r1 && (
                <button
                  onClick={() => { fillDown(); setContextMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 text-left"
                >
                  ⬇️ Điền xuống
                </button>
              )}
              <div className="border-t border-zinc-700 my-1" />
              <button
                onClick={() => { selectAll(); setContextMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 text-left"
              >
                ⬚ Chọn tất cả
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Nút nhỏ trên thanh công cụ (đồng bộ style, có trạng thái disabled).
function ToolBtn({ onClick, disabled, title, children }: {
  onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="px-1.5 py-0.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 border border-zinc-700">
      {children}
    </button>
  );
}

// Dropdown lọc theo cột (AutoFilter kiểu Excel): checklist giá trị phân biệt.
const ColumnFilter = forwardRef<HTMLDivElement, {
  values: string[];
  selected: Set<string>;
  onApply: (set: Set<string>) => void;
  onClose: () => void;
}>(function ColumnFilter({ values, selected, onApply, onClose }, ref) {
  // Khởi tạo: chưa lọc (selected rỗng) = chọn tất cả.
  const [picked, setPicked] = useState<Set<string>>(() =>
    selected.size ? new Set(selected) : new Set(values));
  const [q, setQ] = useState('');
  const shown = q.trim() ? values.filter(v => v.toLowerCase().includes(q.toLowerCase())) : values;
  const allShownPicked = shown.length > 0 && shown.every(v => picked.has(v));

  return (
    <div ref={ref} onMouseDown={e => e.stopPropagation()}
      className="absolute z-40 top-full right-0 mt-1 w-52 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-2 font-normal text-zinc-200">
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm giá trị..."
        className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs outline-none focus:border-sky-500 mb-2" />
      <label className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer hover:bg-zinc-700 rounded">
        <input type="checkbox" checked={allShownPicked}
          onChange={() => setPicked(prev => {
            const n = new Set(prev);
            if (allShownPicked) shown.forEach(v => n.delete(v));
            else shown.forEach(v => n.add(v));
            return n;
          })} />
        <span className="font-medium">(Chọn tất cả)</span>
      </label>
      <div className="max-h-48 overflow-y-auto">
        {shown.map(v => (
          <label key={v} className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer hover:bg-zinc-700 rounded">
            <input type="checkbox" checked={picked.has(v)}
              onChange={() => setPicked(prev => {
                const n = new Set(prev);
                n.has(v) ? n.delete(v) : n.add(v);
                return n;
              })} />
            <span className="truncate">{v === '' ? '(trống)' : v}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-zinc-700">
        <button onClick={onClose} className="text-xs text-zinc-400 hover:text-white px-2 py-1">Huỷ</button>
        <button
          onClick={() => onApply(picked.size === values.length ? new Set() : new Set(picked))}
          className="text-xs bg-sky-700 hover:bg-sky-600 rounded px-2 py-1 font-medium">Áp dụng</button>
      </div>
    </div>
  );
});

function displayValue(v: string | number | boolean | null): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? '✓' : '';
  return String(v);
}

function CellEditor<Row>({ col, value, setValue, editRef, onDone }: {
  col: GridColumn<Row>;
  value: string;
  setValue: (v: string) => void;
  editRef: React.RefObject<HTMLInputElement | HTMLSelectElement | null>;
  onDone: (commit: boolean, advance?: 0 | 1) => void;
}) {
  const base = 'absolute inset-0 w-full h-full px-2 bg-zinc-900 text-white outline-none ring-1 ring-inset ring-sky-400';
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); onDone(true, 1); }
    else if (e.key === 'Escape') { e.preventDefault(); onDone(false, 0); }
    else if (e.key === 'Tab') { e.preventDefault(); onDone(true, 0); }
    e.stopPropagation();
  };
  if (col.type === 'select') {
    return (
      <select ref={editRef as React.RefObject<HTMLSelectElement>} className={base} value={value}
        onChange={e => setValue(e.target.value)} onKeyDown={onKey} onBlur={() => onDone(true, 0)}>
        {col.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input ref={editRef as React.RefObject<HTMLInputElement>} className={base}
      type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
      value={value} onChange={e => setValue(e.target.value)} onKeyDown={onKey} onBlur={() => onDone(true, 0)} />
  );
}
