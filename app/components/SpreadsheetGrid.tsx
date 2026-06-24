'use client';
// Lưới chỉnh sửa kiểu bảng tính (Excel/Google Sheet) dùng chung cho nhiều bảng
// (vật tư, tracking...). Dữ liệu vẫn ở Postgres: mọi thay đổi ô gom thành danh
// sách edit và đẩy lên qua callback `onCommit` (gọi endpoint batch của trang).
//
// Tính năng: điều hướng bàn phím, chọn vùng (shift+click / shift+mũi tên),
// copy/paste TSV (tương thích Excel), fill-down (Ctrl+D), xoá vùng (Delete).
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

export type GridEdit = { rowId: number; patch: Record<string, unknown> };

type Props<Row> = {
  rows: Row[];
  columns: GridColumn<Row>[];
  rowKey: (r: Row) => number;
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
  const gridRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

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
    const byRow = new Map<number, Record<string, unknown>>();
    const touched: string[] = [];
    for (const { r, c, raw } of cells) {
      const col = columns[c];
      const row = rows[r];
      if (!col || !row || !isEditable(c, row) || !col.toPatch) continue;
      const patch = col.toPatch(raw, row);
      if (!patch) continue;
      const id = rowKey(row);
      byRow.set(id, { ...(byRow.get(id) ?? {}), ...patch });
      touched.push(keyOf(r, c));
    }
    if (byRow.size === 0) return;
    const edits: GridEdit[] = [...byRow.entries()].map(([rowId, patch]) => ({ rowId, patch }));

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
    navigator.clipboard?.writeText(serializeTSV(matrix)).catch(() => { /* clipboard bị chặn */ });
  }, [rect, columns, rows]);

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
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
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

  const colWidth = useCallback((c: number) => columns[c]?.width ?? 120, [columns]);
  // Vị trí trái (px) cho các cột dính — cộng dồn bề rộng các cột dính trước nó.
  const leftOffsets = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (let c = 0; c < columns.length; c++) { out.push(acc); if (c < stickyCols) acc += (columns[c]?.width ?? 120); }
    return out;
  }, [columns, stickyCols]);

  return (
    <div
      ref={gridRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPaste={readOnly ? undefined : (e) => { e.preventDefault(); pasteAt(e.clipboardData.getData('text/plain')); }}
      onMouseUp={() => setDragging(false)}
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
                className={`bg-zinc-900 text-zinc-300 font-medium border-b border-r border-zinc-800 px-2 py-1.5 text-left ${c < stickyCols ? 'sticky z-30' : ''}`}
                style={{ width: colWidth(c), minWidth: colWidth(c), left: c < stickyCols ? leftOffsets[c] : undefined }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
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
          ))}
        </tbody>
      </table>
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
