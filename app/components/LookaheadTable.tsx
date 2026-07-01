'use client';

import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { DELAY_REASON_LABEL } from '@/lib/delay';

const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị',
  dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành',
  nghiem_thu: 'Đã nghiệm thu',
  tre: 'Đang trễ',
};

type LTask = {
  id: number;
  code: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  progressPercent: number;
  floorLabel: string | null;
  packageCode: string;
  sheetType: string;
  delayReason: string | null;
};

type TableProps = {
  tasks: LTask[];
  dateCol: 'startDate' | 'endDate';
};

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('vi-VN');
};

const columnHelper = createColumnHelper<LTask>();

export function LookaheadTable({ tasks, dateCol }: TableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('code', {
        header: 'Mã',
        cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
        size: 100,
      }),
      columnHelper.accessor('name', {
        header: 'Công việc',
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor('floorLabel', {
        header: 'Tầng',
        cell: (info) => info.getValue() ?? '—',
        size: 80,
      }),
      columnHelper.accessor(dateCol, {
        header: dateCol === 'startDate' ? 'Bắt đầu' : 'Đến hạn',
        cell: (info) => {
          const dateVal = info.getValue();
          const status = info.row.original.status;
          const isOverdue = dateCol === 'endDate' && status === 'tre';
          return (
            <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
              {fmtDate(dateVal)}
            </span>
          );
        },
        size: 100,
      }),
      columnHelper.accessor('progressPercent', {
        header: '%',
        cell: (info) => `${Math.round((info.getValue() ?? 0) * 100)}%`,
        size: 60,
      }),
      columnHelper.accessor('status', {
        header: 'Ghi chú',
        cell: (info) => {
          const status = info.getValue();
          const delayReason = info.row.original.delayReason;
          return (
            <span className="text-xs text-zinc-600">
              {status === 'tre'
                ? `Đang trễ${delayReason ? ` · ${DELAY_REASON_LABEL[delayReason as keyof typeof DELAY_REASON_LABEL] ?? delayReason}` : ''}`
                : STATUS_LABEL[status] ?? ''}
            </span>
          );
        },
      }),
    ],
    [dateCol]
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto mb-4" tabIndex={0} role="region" aria-label="Bảng công việc (cuộn ngang)">
      <table className="w-full text-sm border-collapse">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-zinc-100 border-y border-zinc-300 text-left">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={`p-2 font-semibold cursor-pointer select-none hover:bg-zinc-200 transition-colors ${
                    header.column.getCanSort() ? 'user-select-none' : ''
                  }`}
                  style={{ width: header.getSize() }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      <span className="inline-flex">
                        {header.column.getIsSorted() === 'asc' && (
                          <ChevronUp className="w-4 h-4 text-zinc-600" />
                        )}
                        {header.column.getIsSorted() === 'desc' && (
                          <ChevronDown className="w-4 h-4 text-zinc-600" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, idx) => (
            <tr
              key={row.id}
              className={`border-b border-zinc-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50'}`}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="p-2" style={{ width: cell.column.getSize() }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
