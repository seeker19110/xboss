"use client";
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

// Kéo thả sắp xếp nhóm (trong sheet) và task (trong nhóm) trên lưới tracking — M135.
// `DanhSachKeo` bọc danh sách; mỗi phần tử bọc `MucKeo` (div) hoặc `HangKeo` (tr); `TayNamKeo`
// đặt ở đâu bên trong phần tử cũng được — nó lấy listeners của phần tử gần nhất qua context,
// và tự ẩn khi không nằm trong phần tử kéo được (vd đang lọc → page không bọc).

/** Thứ tự mới sau khi thả `activeId` lên vị trí `overId`; null nếu không đổi gì. */
export function thuTuSauKhiTha(ids: number[], activeId: number, overId: number): number[] | null {
  if (activeId === overId) return null;
  const tu = ids.indexOf(activeId);
  const toi = ids.indexOf(overId);
  if (tu < 0 || toi < 0) return null;
  return arrayMove(ids, tu, toi);
}

/** PUT thứ tự lên API; trả thông báo lỗi tiếng Việt hoặc null khi thành công. */
export async function luuThuTu(url: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const j = await res.json().catch(() => ({}));
    return j.error ?? "Không lưu được thứ tự mới";
  } catch {
    return "Mất kết nối — chưa lưu được thứ tự mới, thử lại khi có mạng";
  }
}

// Chỉ kéo theo trục dọc (lưới rất rộng, cuộn ngang) — tự viết thay vì thêm gói @dnd-kit/modifiers.
const chiTrucDoc: Modifier = ({ transform }) => ({ ...transform, x: 0 });

type TayNam = ReturnType<typeof useSortable>["listeners"] & object;
const TayNamCtx = createContext<{
  listeners?: TayNam;
  attributes: ReturnType<typeof useSortable>["attributes"];
  setActivatorNodeRef: (el: HTMLElement | null) => void;
} | null>(null);

const TatCtx = createContext(true);

export function DanhSachKeo({
  ids,
  tat = false,
  onSapXep,
  children,
}: {
  ids: number[];
  /** Tắt kéo (không quyền/đang lọc) nhưng vẫn giữ cây DOM — tránh remount lưới khi bật/tắt. */
  tat?: boolean;
  onSapXep: (idsMoi: number[]) => void;
  children: ReactNode;
}) {
  // Cảm ứng: nhấn giữ 200 ms mới bắt đầu kéo — vuốt ngay là cuộn trang như thường (FR5).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const moi = thuTuSauKhiTha(ids, Number(active.id), Number(over.id));
    if (moi) onSapXep(moi);
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[chiTrucDoc]}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Nhấn Space để nhấc, mũi tên lên/xuống để di chuyển, Space để thả, Esc để huỷ.",
        },
        announcements: {
          onDragStart: () => "Đã nhấc mục lên.",
          onDragOver: ({ over }) => (over ? "Đang ở vị trí mới." : "Ra ngoài danh sách."),
          onDragEnd: ({ over }) => (over ? "Đã thả vào vị trí mới." : "Đã thả, không đổi."),
          onDragCancel: () => "Đã huỷ kéo, giữ thứ tự cũ.",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={tat}>
        <TatCtx.Provider value={tat}>{children}</TatCtx.Provider>
      </SortableContext>
    </DndContext>
  );
}

function useMucKeo(id: number) {
  const tat = useContext(TatCtx);
  const s = useSortable({ id, disabled: tat });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(s.transform),
    transition: s.transition,
    position: "relative",
    zIndex: s.isDragging ? 30 : undefined,
    opacity: s.isDragging ? 0.85 : undefined,
  };
  const ctx = tat
    ? null
    : {
        listeners: s.listeners,
        attributes: s.attributes,
        setActivatorNodeRef: s.setActivatorNodeRef,
      };
  return { setNodeRef: s.setNodeRef, style, ctx };
}

/** Phần tử kéo được dạng khối (vd Card nhóm). */
export function MucKeo({ id, children }: { id: number; children: ReactNode }) {
  const { setNodeRef, style, ctx } = useMucKeo(id);
  return (
    <div ref={setNodeRef} style={style}>
      <TayNamCtx.Provider value={ctx}>{children}</TayNamCtx.Provider>
    </div>
  );
}

/** Phần tử kéo được dạng hàng bảng (task). */
export function HangKeo({
  id,
  className,
  hidden,
  children,
}: {
  id: number;
  className?: string;
  hidden?: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, style, ctx } = useMucKeo(id);
  return (
    <tr ref={setNodeRef} style={style} className={className} hidden={hidden}>
      <TayNamCtx.Provider value={ctx}>{children}</TayNamCtx.Provider>
    </tr>
  );
}

/** Tay nắm kéo. Hiển thị 28px nhưng vùng chạm mở rộng ra 40px bằng `before:` (NFR). */
export function TayNamKeo({ nhan }: { nhan: string }) {
  const ctx = useContext(TayNamCtx);
  if (!ctx) return null;
  return (
    <button
      type="button"
      ref={ctx.setActivatorNodeRef}
      {...ctx.attributes}
      {...ctx.listeners}
      aria-label={nhan}
      title={nhan}
      onClick={(e) => e.stopPropagation()}
      className="relative shrink-0 p-1 rounded text-zinc-500 hover:text-zinc-200 cursor-grab active:cursor-grabbing touch-none focus-visible:outline-2 focus-visible:outline-emerald-400 before:absolute before:-inset-1.5 before:content-['']"
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );
}
