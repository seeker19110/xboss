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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
};

export type GridEdit = { rowId: number | string; patch: Record<string, unknown> };

type Props<Row> = {
  rows: Row[];
  columns: GridColumn<Row>[];
  rowKey: (r: Row) => number | string;
  onCommit: (edits: GridEdit[]) => Promise<void> | void;
  readOnly?: boolean;
  stickyCols?: number;            // số cột trái dính (mã/tên)
  maxBodyHeight?: number;         // px; cuộn dọc bên trong, header dính
};

type Pos = { r: number; c: number };
const keyOf = (r: number, c: number) => `${r}:${c}`;

export default function SpreadsheetGrid<Row>({
  rows, columns, rowKey, onCommit, readOnly = false, stickyCols = 1, maxBodyHeight,
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
  const gridRef = useRef<HTMLDivElement>(null);
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

  const inRect = (r: number, c: number) =>
    r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;

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
    setActive(a => {
      const r = Math.max(0, Math.min(nRows - 1, a.r + dr));
      const c = Math.max(0, Math.min(nCols - 1, a.c + dc));
      if (!extend) setAnchor({ r, c });
      return { r, c };
    });
  }, [nRows, nCols]);

  // Gom các ô (r,c,raw) → edit theo rowId rồi gọi onCommit 1 lần.
  const commitCells = useCallback(async (cells: { r: number; c: number; raw: string }[]) => {
    const byRow = new Map<string, Record<string, unknown>>();
    const rowIdMap = new Map<string, number | string>(); // key → original id
    const touched: string[] = [];
    for (const { r, c, raw } of cells) {
      const col = columns[c];
      const row = rows[r];
      if (!col || !row || !isEditable(c, row) || !col.toPatch) continue;
      const patch = col.toPatch(raw, row);
      if (!patch) continue;
      const id = rowKey(row);
      const k = String(id);
      byRow.set(k, { ...(byRow.get(k) ?? {}), ...patch });
      rowIdMap.set(k, id);
      touched.push(keyOf(r, c));
    }
    if (byRow.size === 0) return;
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
  }, [columns, rows, isEditable, rowKey, onCommit]);

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
    const cells = spreadPaste(matrix, active.r, active.c)
      .filter(({ r, c }) => r < nRows && c < nCols);
    await commitCells(cells);
  }, [active, nRows, nCols, commitCells]);

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
    const cells: { r: number; c: number; raw: string }[] = [];
    for (let r = rect.r0; r <= rect.r1; r++)
      for (let c = rect.c0; c <= rect.c1; c++) cells.push({ r, c, raw: '' });
    commitCells(cells);
  }, [rect, commitCells]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return; // input tự xử lý
    const mod = e.ctrlKey || e.metaKey;
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
      const newW = Math.max(60, (e as any).clientX - (gridRef.current?.getBoundingClientRect().left ?? 0));
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
    return result;
  }, [rows, columns, sortBy, search]);

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
    for (let c = 0; c < columns.length; c++) { out.push(acc); if (c < stickyCols) acc += (columns[c]?.width ?? 120); }
    return out;
  }, [columns, stickyCols]);

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
            <button onClick={() => setShowShortcuts(!showShortcuts)} className="hover:text-zinc-300">⌨️ Ctrl/?</button>
            <button onClick={() => setShowSearch(!showSearch)} className="hover:text-zinc-300">🔍 Ctrl/F</button>
            <button onClick={exportCSV} className="hover:text-zinc-300">💾 Ctrl/S</button>
          </div>
        </div>

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
              {columns.map((col, c) => (
                <th
                  key={col.key}
                  className={`bg-zinc-900 text-zinc-300 font-medium border-b border-r border-zinc-800 px-2 py-1.5 text-left relative group ${c < stickyCols ? 'sticky z-30' : ''}`}
                  style={{ width: colWidth(c), minWidth: colWidth(c), left: c < stickyCols ? leftOffsets[c] : undefined }}
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
                    <div
                      onMouseDown={() => setResizingCol(c)}
                      onDoubleClick={() => autoFitColumn(c)}
                      className="w-1 h-5 bg-zinc-600 hover:bg-sky-500 cursor-col-resize group-hover:opacity-100 opacity-0 transition"
                      title="Kéo để thay đổi kích thước, double-click để auto-fit"
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedAndFiltered.map((row, displayR) => {
              const r = rows.indexOf(row);
              return (
                <tr key={rowKey(row)}>
                  {columns.map((col, c) => {
                    const k = keyOf(r, c);
                    const isActive = active.r === r && active.c === c;
                    const selected = inRect(r, c);
                    const isSaving = saving.has(k);
                    const err = errors.get(k);
                    const editableHere = isEditable(c, row);
                    const align = col.align ?? (col.type === 'number' ? 'right' : col.type === 'checkbox' ? 'center' : 'left');
                    return (
                      <td
                        key={col.key}
                        role="gridcell"
                        aria-selected={selected}
                        onMouseDown={(e) => {
                          if (e.shiftKey) { setActive({ r, c }); }
                          else { setActive({ r, c }); setAnchor({ r, c }); setDragging(true); }
                          gridRef.current?.focus();
                        }}
                        onMouseEnter={() => { if (dragging) setActive({ r, c }); }}
                        onDoubleClick={() => startEdit()}
                        className={[
                          'border-b border-r border-zinc-800 px-2 py-1 whitespace-nowrap relative',
                          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
                          c < stickyCols ? 'sticky z-10 bg-zinc-950' : 'bg-zinc-950',
                          selected ? 'bg-sky-950/40' : '',
                          isActive ? 'ring-1 ring-inset ring-sky-400' : '',
                          err ? 'ring-1 ring-inset ring-rose-400' : '',
                          editableHere ? 'cursor-cell' : 'text-zinc-400',
                        ].join(' ')}
                        style={{ width: colWidth(c), minWidth: colWidth(c), left: c < stickyCols ? leftOffsets[c] : undefined }}
                        title={err ?? undefined}
                      >
                        {editing && isActive ? (
                          <CellEditor col={col} value={draft} setValue={setDraft} editRef={editRef}
                            onDone={finishEdit} />
                        ) : (
                          <span className="block overflow-hidden text-ellipsis">
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
