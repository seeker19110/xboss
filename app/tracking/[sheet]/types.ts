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

export type Cell = { id: number; installed: boolean };
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
  custom: Record<string, unknown>;
  cells: Record<string, Cell>;
};
export type Grid = { columns: string[]; tasks: GridTask[] };
