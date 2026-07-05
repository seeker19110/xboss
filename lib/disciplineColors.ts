// Lookup màu tĩnh cho disciplines.color (giá trị lưu trong DB: 'zinc'|'amber'|'sky'|'violet'|
// 'emerald'|'rose' — xem migrations/0005_boq.sql). Viết literal class Tailwind ở đây (không
// interpolate chuỗi động `bg-${color}-400`) để JIT purge nhận diện được — theo đúng nguyên tắc
// CLAUDE.md: không hardcode hex, không tự phát minh phong cách mới ngoài thang màu sẵn có.
export type DisciplineColorClasses = { dot: string; border: string; text: string };

const MAP: Record<string, DisciplineColorClasses> = {
  zinc: { dot: "bg-zinc-400", border: "border-zinc-400", text: "text-zinc-300" },
  amber: { dot: "bg-amber-400", border: "border-amber-400", text: "text-amber-300" },
  sky: { dot: "bg-sky-400", border: "border-sky-400", text: "text-sky-300" },
  violet: { dot: "bg-violet-400", border: "border-violet-400", text: "text-violet-300" },
  emerald: { dot: "bg-emerald-400", border: "border-emerald-400", text: "text-emerald-300" },
  rose: { dot: "bg-rose-400", border: "border-rose-400", text: "text-rose-300" },
};

export function disciplineColorClasses(color?: string | null): DisciplineColorClasses {
  return MAP[color ?? ""] ?? MAP.zinc;
}
