export type Task = {
  id: number;
  code: string;
  name: string;
  status: string;
  endDate: string | null;
  progressPercent: number;
};
export type Pkg = {
  id: number;
  code: string;
  floorLabel: string | null;
  name: string;
  status: string;
  progress: number;
  tasks: Task[];
  boqCode: string | null;
  drawingUrl: string | null;
  bbntUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  custom: Record<string, unknown>;
};
export type Data = {
  sheet: {
    id?: number;
    code: string;
    name: string;
    responsible?: string;
    managerId?: number | null;
    slug?: string;
  };
  packages: Pkg[];
  version?: string;
};
export type UserItem = { id: number; name: string; role: string };

// Ô lưới + dữ liệu sự kiện tick (M120). 3 trường sau NULL với ô chưa tick và với ô đã tick
// TRƯỚC khi M120 triển khai — UI phải chịu được NULL, không giả định luôn có người/ngày.
export type Cell = {
  id: number;
  installed: boolean;
  installedAt?: string | null;
  installedByName?: string | null;
  note?: string | null;
};
export type GridTask = {
  id: number;
  code: string;
  name: string;
  status: string;
  progressPercent: number;
  boqCode: string | null;
  drawingUrl: string | null;
  photoCount: number;
  commentCount: number;
  delayReason: string | null;
  startDate: string | null;
  endDate: string | null;
  // Ngày thực tế suy từ chuỗi tick (M120) — chỉ đọc, không sửa được từ UI.
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  custom: Record<string, unknown>;
  cells: Record<string, Cell>;
};
export type Grid = { columns: string[]; tasks: GridTask[] };
