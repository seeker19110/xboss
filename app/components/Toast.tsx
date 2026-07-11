"use client";
// Toast — thông báo ngắn tự ẩn (thành công/lỗi/cảnh báo), thay `alert()` cho các
// thông điệp không cần chặn thao tác (khác với appAlert/appConfirm trong dialogs.tsx,
// vốn là modal CHẶN cần người dùng bấm OK — dùng khi thật sự cần xác nhận đã đọc).
// Cùng cơ chế pub-sub với AppDialogs: gọi showToast() ở bất kỳ đâu, host mount 1 lần
// trong layout gốc. Vị trí căn giữa đáy màn hình tự bù lề sidebar qua .app-toast-center
// (xem globals.css, cùng cơ chế với toast SSE có sẵn ở trang tracking).
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";

type ToastKind = "success" | "error" | "warning";
type ToastItem = { id: number; kind: ToastKind; message: string };

let push: ((item: ToastItem) => void) | null = null;
let idSeq = 0;
const queue: ToastItem[] = [];

export function showToast(message: string, kind: ToastKind = "success") {
  const item: ToastItem = { id: ++idSeq, kind, message };
  if (push) push(item);
  else queue.push(item); // ToastHost chưa mount — giữ lại, mount xong hiện tiếp
}

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
};
const STYLES: Record<ToastKind, string> = {
  success: "bg-emerald-900 border-emerald-700 text-emerald-200",
  error: "bg-red-900 border-red-700 text-red-200",
  warning: "bg-amber-900 border-amber-700 text-amber-200",
};

const DURATION_MS = 4000;

// Host hiển thị toast — mount 1 lần trong layout gốc (giống AppDialogs).
export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    setItems((cur) => cur.filter((i) => i.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  useEffect(() => {
    push = (item) => {
      setItems((cur) => [...cur, item]);
      timers.current.set(
        item.id,
        setTimeout(() => remove(item.id), DURATION_MS),
      );
    };
    queue.splice(0).forEach((item) => push!(item));
    const timersAtMount = timers.current;
    return () => {
      push = null;
      timersAtMount.forEach(clearTimeout);
      timersAtMount.clear();
    };
  }, [remove]);

  if (items.length === 0) return null;

  return (
    <div
      className="app-toast-center safe-bottom fixed left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 print:hidden"
      style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
      role="status"
      aria-live="polite"
    >
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <div
            key={item.id}
            className={`flex items-center gap-2 rounded-full border py-2 pl-3 pr-2 text-sm shadow-xl ${STYLES[item.kind]}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.message}</span>
            <button
              onClick={() => remove(item.id)}
              aria-label="Đóng thông báo"
              className="shrink-0 rounded-full p-0.5 hover:bg-black/20"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
