"use client";
import {
  useEffect,
  useId,
  useState,
  useCallback,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const khongDangKy = () => () => {};
const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]";

// Modal có thể nằm ở các nhánh React khác nhau: host confirm ở layout được mount trước form,
// còn portal confirm được thêm sau và có z-index cao hơn. Thứ tự effect không phải thứ tự nổi.
const cacModalDangMo = new Set<HTMLDivElement>();
let overflowTruocModal: string | undefined;
let nutMoDauTien: HTMLElement | null = null;

function modalTrenCung(): HTMLDivElement | undefined {
  let trenCung: HTMLDivElement | undefined;
  let zTrenCung = -Infinity;
  for (const panel of cacModalDangMo) {
    if (!panel.isConnected) continue;
    const overlay = panel.parentElement;
    const z = Number(overlay ? getComputedStyle(overlay).zIndex : 0) || 0;
    if (
      !trenCung ||
      z > zTrenCung ||
      (z === zTrenCung &&
        !!(trenCung.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING))
    ) {
      trenCung = panel;
      zTrenCung = z;
    }
  }
  return trenCung;
}

function coTheNhanFocus(control: HTMLElement): boolean {
  if (
    !control.isConnected ||
    control.matches(":disabled") ||
    control.closest('[hidden], [inert], [aria-hidden="true"]')
  )
    return false;
  const style = getComputedStyle(control);
  return (
    style.visibility === "visible" &&
    Array.from(control.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0)
  );
}

function cacControlNhanTab(panel: HTMLDivElement): HTMLElement[] {
  // :disabled tính cả disabled kế thừa từ fieldset; client rect/visibility loại cả control
  // bị ẩn bởi tổ tiên. Không chỉ kiểm thuộc tính disabled trực tiếp hoặc selector cuối cùng.
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (control) => control.tabIndex >= 0 && coTheNhanFocus(control),
  );
}

function focusTrongModal(panel: HTMLDivElement) {
  (cacControlNhanTab(panel)[0] ?? panel).focus({ preventScroll: true });
}

// ── Modal nền tảng: overlay + Escape để đóng + khoá scroll nền ──────────────
// Dùng chung cho mọi modal trong app thay vì tự dựng overlay từng nơi.
// Render qua portal vào <body>: overlay `fixed inset-0` đặt trong phần tử có `backdrop-filter`/
// `transform`/`filter` (vd header sticky `backdrop-blur-md` của AppHeader) sẽ lấy phần tử đó làm
// containing block → modal bị kẹt/cắt trong header. Portal chỉ bật sau hydrate (lượt render server
// và lượt hydrate đầu vẫn render tại chỗ để không lệch HTML); modal mở sau đó portal ngay lần đầu.
export function Modal({
  onClose,
  children,
  className = "max-w-md",
  zIndex = "z-50",
  drawer = false,
  id,
  ariaLabel,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  zIndex?: string;
  /** true = dạng drawer bám mép trái, cao toàn màn hình (vd sidebar mobile) thay vì hộp thoại giữa màn hình (mặc định). */
  drawer?: boolean;
  /** id gắn vào panel — dùng khi cần locator/CSS trỏ thẳng tới nội dung modal (vd drawer sidebar mobile). */
  id?: string;
  /** Tên truy cập tường minh của hộp thoại. Không truyền → lấy theo tiêu đề h1/h2/h3 (hoặc [data-modal-title]) đầu tiên trong panel. */
  ariaLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const autoTitleId = useId();
  const [labelledBy, setLabelledBy] = useState<string | undefined>(undefined);
  const laClient = useSyncExternalStore(
    khongDangKy,
    () => true,
    () => false,
  );

  // Không có ariaLabel → tìm tiêu đề đầu tiên trong panel làm tên truy cập (aria-labelledby).
  // Theo dõi panel bằng MutationObserver: modal có tiêu đề chỉ hiện sau khi tải dữ liệu vẫn
  // được gắn tên. Chỉ setState khi id đổi nên không tạo vòng render.
  useEffect(() => {
    const panel = panelRef.current;
    if (ariaLabel || !panel) return;
    const capNhat = () => {
      const heading = panel.querySelector<HTMLElement>("h1, h2, h3, [data-modal-title]");
      if (heading && !heading.id) heading.id = autoTitleId;
      const next = heading?.id || undefined;
      setLabelledBy((cur) => (cur === next ? cur : next));
    };
    capNhat();
    const observer = new MutationObserver(capNhat);
    observer.observe(panel, { childList: true, subtree: true });
    return () => observer.disconnect();
    // laClient: panel được dựng lại trong portal sau hydrate → theo dõi panel mới.
  }, [ariaLabel, autoTitleId, laClient]);

  // onClose thường là hàm inline (tham chiếu đổi mỗi lần parent render).
  // Giữ trong ref để listener keydown luôn gọi bản mới mà KHÔNG phải đăng ký lại
  // effect — nếu effect chạy lại mỗi render thì setTimeout sẽ focus lại nút đầu
  // tiên và cướp focus khỏi ô input đang gõ ("chữ nhảy ra ngoài, phải click lại").
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Phần tử đang giữ focus lúc modal MỞ (thường là nút bấm mở nó) — chụp ngay ở lần render
  // đầu, trước khi ô `autoFocus` trong modal kịp cướp focus ở bước commit.
  const [opener] = useState(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  // Khoá scroll theo toàn bộ stack, không khôi phục overflow của từng modal riêng lẻ:
  // cha có thể unmount trước con, trong khi confirm của layout vẫn còn mở.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!cacModalDangMo.size) {
      overflowTruocModal = document.body.style.overflow;
      nutMoDauTien = opener;
    }
    cacModalDangMo.add(panel);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      // Không cướp focus khỏi input đang gõ hoặc modal con vừa mở.
      if (modalTrenCung() !== panel || panel.contains(document.activeElement)) return;
      focusTrongModal(panel);
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      // defaultPrevented cũng chặn listener khác xử lý lại cùng phím nếu onClose vừa
      // unmount modal trên cùng đồng bộ. onClose inline vẫn được đọc qua ref ổn định.
      if (e.defaultPrevented || modalTrenCung() !== panel) return;
      if (e.key === "Escape") {
        // Đánh dấu "đã xử lý": listener Esc ở window của trang phía sau (vd CertDocument) kiểm
        // e.defaultPrevented thay vì dò [role=dialog] — Modal đóng đồng bộ nên DOM đã mất dialog.
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") {
        const focusable = cacControlNhanTab(panel);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!focusable.length) {
          e.preventDefault();
          panel.focus({ preventScroll: true });
          return;
        }
        // Khi pending làm mất focus ở control disabled, đưa focus trở lại stack thay vì
        // để Tab đi vào header hoặc form phía sau. Panel dự phòng cũng theo quy tắc này.
        if (!focusable.includes(document.activeElement as HTMLElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus({ preventScroll: true });
          return;
        }
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus({ preventScroll: true });
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus({ preventScroll: true });
          }
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      cacModalDangMo.delete(panel);
      const modalConLai = modalTrenCung();
      let traFocus = modalConLai?.contains(opener) ? opener : null;
      if (!cacModalDangMo.size) {
        document.body.style.overflow = overflowTruocModal ?? "";
        overflowTruocModal = undefined;
        traFocus = nutMoDauTien?.isConnected ? nutMoDauTien : opener;
        nutMoDauTien = null;
      }
      // Đợi các cleanup/setup cùng commit (kể cả StrictMode) xong. Modal mới hoặc con còn
      // mở phải giữ focus; chỉ trả về trigger khi stack thực sự đã đóng hết.
      queueMicrotask(() => {
        if (modalTrenCung() !== modalConLai) return;
        if (modalConLai) {
          if (modalConLai.contains(document.activeElement)) return;
          if (traFocus && coTheNhanFocus(traFocus)) traFocus.focus({ preventScroll: true });
          else focusTrongModal(modalConLai);
        } else if (!cacModalDangMo.size && traFocus && coTheNhanFocus(traFocus)) {
          traFocus.focus({ preventScroll: true });
        }
      });
    };
  }, [opener, laClient]);

  const lop = (
    <div
      className={`fixed inset-0 ${zIndex} backdrop-blur-xs flex transition-opacity ${
        drawer ? "items-stretch justify-start" : "items-center justify-center p-4"
      }`}
      style={{ background: "var(--overlay-scrim)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : labelledBy}
        className={
          drawer
            ? `bg-zinc-950 border-r border-zinc-800 h-full overflow-y-auto safe-top shadow-2xl ${className}`
            : `bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto ${className}`
        }
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
  return laClient ? createPortal(lop, document.body) : lop;
}

// ── Dialog kiểu prompt/confirm/alert trả Promise — thay window.* ────────────
// window.prompt bị chặn trong PWA standalone trên một số WebView/iOS,
// và không style được theo dark theme. Gọi: await appPrompt('...', 'giá trị').

type DialogRequest =
  | { kind: "alert"; message: string; resolve: (v: void) => void }
  | {
      kind: "confirm";
      message: string;
      danger?: boolean;
      confirmLabel?: string;
      resolve: (v: boolean) => void;
    }
  | {
      kind: "prompt";
      message: string;
      defaultValue: string;
      placeholder?: string;
      mono?: boolean;
      resolve: (v: string | null) => void;
    };

let pushRequest: ((r: DialogRequest) => void) | null = null;
const queue: DialogRequest[] = [];

function dispatch(r: DialogRequest) {
  if (pushRequest) pushRequest(r);
  else queue.push(r); // AppDialogs chưa mount — giữ lại, mount xong xử lý
}

export function appAlert(message: string): Promise<void> {
  return new Promise((resolve) => dispatch({ kind: "alert", message, resolve }));
}
export function appConfirm(
  message: string,
  opts?: { danger?: boolean; confirmLabel?: string },
): Promise<boolean> {
  return new Promise((resolve) => dispatch({ kind: "confirm", message, ...opts, resolve }));
}
export function appPrompt(
  message: string,
  defaultValue = "",
  opts?: { placeholder?: string; mono?: boolean },
): Promise<string | null> {
  return new Promise((resolve) =>
    dispatch({ kind: "prompt", message, defaultValue, ...opts, resolve }),
  );
}

// Host hiển thị dialog — mount 1 lần trong layout gốc.
export default function AppDialogs() {
  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const pending = useRef<DialogRequest[]>([]);
  const [value, setValue] = useState("");

  const showNext = useCallback(() => {
    const next = pending.current.shift() ?? null;
    setCurrent(next);
    setValue(next?.kind === "prompt" ? next.defaultValue : "");
  }, []);

  useEffect(() => {
    pushRequest = (r: DialogRequest) => {
      pending.current.push(r);
      setCurrent((c) => {
        if (c) return c; // đang mở dialog khác — xếp hàng
        const next = pending.current.shift();
        if (!next) return c;
        setValue(next.kind === "prompt" ? next.defaultValue : "");
        return next;
      });
    };
    queue.splice(0).forEach((r) => pushRequest!(r));
    return () => {
      pushRequest = null;
    };
  }, []);

  if (!current) return null;

  const close = (fn: () => void) => {
    fn();
    showNext();
  };
  const cancel = () =>
    close(() => {
      if (current.kind === "confirm") current.resolve(false);
      else if (current.kind === "prompt") current.resolve(null);
      else current.resolve();
    });
  const ok = () =>
    close(() => {
      if (current.kind === "confirm") current.resolve(true);
      else if (current.kind === "prompt") current.resolve(value);
      else current.resolve();
    });

  return (
    <Modal onClose={cancel} className="max-w-sm" zIndex="z-[70]">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <h3 className="font-semibold text-sm flex-1 whitespace-pre-wrap">{current.message}</h3>
        <button
          onClick={cancel}
          aria-label="Đóng"
          className="text-zinc-400 hover:text-white shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        {current.kind === "prompt" && (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={current.placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter") ok();
            }}
            className={`w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 ${current.mono ? "font-mono" : ""}`}
          />
        )}
        <div className="flex justify-end gap-2.5 pt-1">
          {current.kind !== "alert" && (
            <button
              onClick={cancel}
              className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-xl transition font-medium min-h-[40px]"
            >
              Huỷ
            </button>
          )}
          <button
            onClick={ok}
            autoFocus={current.kind !== "prompt"}
            className={`px-5 py-2 text-sm rounded-xl font-medium text-white transition active:scale-[0.98] min-h-[40px] shadow-sm ${
              current.kind === "confirm" && current.danger
                ? "bg-red-700 hover:bg-red-800"
                : "bg-emerald-700 hover:bg-emerald-800"
            }`}
          >
            {current.kind === "confirm" ? (current.confirmLabel ?? "Đồng ý") : "OK"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
