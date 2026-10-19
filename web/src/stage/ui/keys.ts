// Phím tắt dạng hàm thuần: phân loại phần tử đang giữ tiêu điểm và đổi phím
// thành hành động. Không đụng DOM nên kiểm thử được bằng node.

export type TargetKind = "text" | "button" | "toggle" | "radio" | "range" | "select" | "link" | "other";

interface ElLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}

const INPUT_KIND: Record<string, TargetKind> = {
  checkbox: "toggle", radio: "radio", range: "range",
  button: "button", submit: "button", reset: "button", color: "button", file: "button", image: "button",
  hidden: "other",
};

/** Ô gõ chữ là "text" (phím tắt nhường hẳn); các loại còn lại chỉ giữ vài phím riêng. */
export function targetKind(el: unknown): TargetKind {
  const e = el as ElLike | null;
  if (!e || typeof e.tagName !== "string") return "other";
  if (e.isContentEditable) return "text";
  const tag = e.tagName.toUpperCase();
  if (tag === "TEXTAREA") return "text";
  if (tag === "INPUT") return INPUT_KIND[(e.type || "text").toLowerCase()] ?? "text";
  if (tag === "SELECT") return "select";
  if (tag === "BUTTON") return "button";
  if (tag === "A") return "link";
  return "other";
}

const ARROW = (k: string) => k.startsWith("Arrow");
const PAGE = (k: string) => k === "Home" || k === "End" || k === "PageUp" || k === "PageDown";

/** Phím mà phần tử loại này tự xử lý khi đứng yên (Space bấm nút, mũi tên kéo thanh trượt...). */
export function nativeKey(kind: TargetKind, key: string): boolean {
  switch (kind) {
    case "text": return true;
    case "button": return key === " " || key === "Enter";
    case "toggle": return key === " ";
    case "radio": return key === " " || ARROW(key);
    case "range": return ARROW(key) || PAGE(key);
    case "select": return key === " " || key === "Enter" || ARROW(key) || PAGE(key);
    case "link": return key === "Enter";
    default: return false;
  }
}

export type Route = "skip" | "run" | "steal";

/**
 * skip: để trình duyệt xử lý; run: chạy phím tắt; steal: chạy phím tắt và bỏ
 * tiêu điểm khỏi phần tử. Vừa bấm chuột vào ô (hoặc đang trình chiếu) thì phím
 * tắt thắng; đi tới bằng Tab thì phần tử giữ phím của nó.
 */
export function routeKey(kind: TargetKind, key: string, o: { pointerFocus: boolean; presenting: boolean }): Route {
  if (kind === "text") return "skip";
  if (!nativeKey(kind, key)) return "run";
  return o.pointerFocus || o.presenting ? "steal" : "skip";
}

export type Action =
  | { type: "save" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "selectAll" }
  | { type: "copy" }
  | { type: "paste" }
  | { type: "toggle" }
  | { type: "seek"; to: "start" | "end" }
  | { type: "jump"; dir: -1 | 1 }
  | { type: "markJump"; dir: -1 | 1 }
  | { type: "mark" }
  | { type: "step"; beats: number }
  | { type: "nudge"; dx: number; dz: number }
  | { type: "clear" }
  | { type: "add" }
  | { type: "delete" }
  | { type: "deleteHint" }
  | { type: "help"; open: boolean }
  | { type: "snap" }
  | { type: "view" }
  | { type: "present" }
  | { type: "exit" }
  | { type: "mirror" }
  | { type: "swap" }
  | { type: "rotate"; dir: 1 | -1 }
  | { type: "turn"; dir: 1 | -1 }
  | { type: "loop" }
  | { type: "fit" }
  | { type: "planFrom" }
  | { type: "group"; n: number };

export interface KeyIn {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  repeat?: boolean;
  /** KeyboardEvent.code ("Digit1"): Option 1 trên máy Mac ra chữ khác nên Alt 1..9 xét theo phím vật lý. */
  code?: string;
}

export interface KeyCtx {
  presenting: boolean;
  help: boolean;
  hasSelection: boolean;
  hasDancers: boolean;
  hasBlock: boolean;
  /** Tiêu điểm đang ở một khối đội hình (dòng thời gian hoặc danh sách). */
  formationFocused: boolean;
  /** Trên trang đang có chữ được bôi đen. */
  textSelected?: boolean;
  /** Đang mở hộp thoại che bài (Xuất video, Đang xử lý...): chỉ còn Ctrl S, hộp tự lo Esc. */
  modal?: boolean;
  /** Đang mở menu hay khung bật ra (Lưu bài, Tệp, công cụ sơ đồ): Esc để menu tự đóng. */
  popup?: boolean;
}

/** Các menu bật ra trong trang; menu tự đóng bằng Esc nên phím tắt chung không được bỏ chọn theo. */
export const POPUP_SELECTOR = ".menu .pop, .rh-pop";

/** Có menu bật ra nào đang hiện không (root là document, để rời ra cho dễ kiểm thử). */
export function popupOpen(root: { querySelector(s: string): unknown } | null | undefined): boolean {
  return !!root?.querySelector(POPUP_SELECTOR);
}

/** Có hộp thoại che bài đang mở không. Hướng dẫn và Học động tác có xử lý phím riêng nên không tính ở đây. */
export function modalOpen(ui: { exportOpen: boolean; variantsOpen?: boolean; busy: unknown }): boolean {
  return ui.exportOpen || !!ui.variantsOpen || !!ui.busy;
}

// giữ phím thì chỉ lặp các phím di chuyển; còn lại một lần bấm một lần chạy
const ONCE = new Set<Action["type"]>([
  "save", "selectAll", "copy", "paste", "toggle", "clear", "add", "delete", "deleteHint", "help",
  "snap", "view", "present", "exit", "mirror", "swap", "rotate", "turn", "loop", "fit", "planFrom", "mark", "group",
]);

export function resolveShortcut(k: KeyIn, c: KeyCtx): Action | null {
  const a = resolve(k, c);
  if (a && k.repeat && ONCE.has(a.type)) return null;
  return a;
}

/** Số 1..9 của phím (hàng số hoặc bàn phím số), không phải số thì 0. */
function groupDigit(k: KeyIn): number {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(k.code ?? "") ?? /^([1-9])$/.exec(k.key);
  return m ? Number(m[1]) : 0;
}

function resolve(k: KeyIn, c: KeyCtx): Action | null {
  const key = k.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  if (k.ctrl && lower === "s") return { type: "save" };
  if (c.help) return key === "Escape" || key === "?" ? { type: "help", open: false } : null;
  // hộp thoại đang mở: không sửa bài, không dời vạch phát phía sau hộp (Esc do hộp tự đóng)
  if (c.modal) return null;
  // menu bật ra tự đóng bằng Esc; Esc không được bỏ chọn người múa phía sau nữa
  if (c.popup && key === "Escape") return null;
  // "?" cần Shift (hoặc AltGr ở vài bàn phím) nên không xét phím bổ trợ
  if (key === "?") return c.presenting ? null : { type: "help", open: true };
  if (k.ctrl) {
    // đang chiếu thì Ctrl Z, Ctrl A... không làm gì để khỏi sửa mà không thấy
    if (c.presenting || k.alt) return null;
    if (lower === "z") return { type: k.shift ? "redo" : "undo" };
    if (lower === "y") return { type: "redo" };
    if (lower === "a") return { type: "selectAll" };
    // đang bôi đen chữ trên trang thì để Ctrl C chép chữ như thường
    if (lower === "c" && !k.shift && !c.textSelected && c.hasDancers) return { type: "copy" };
    if (lower === "v" && !k.shift && c.hasDancers) return { type: "paste" };
    return null;
  }
  if (k.alt) {
    // Alt 1..9: chọn nhóm lưu sẵn thứ n (Ctrl Alt đã loại ở trên vì AltGr cũng ra Ctrl Alt)
    const n = groupDigit(k);
    return n && !k.shift && !c.presenting && c.hasDancers ? { type: "group", n } : null;
  }
  // Shift [ / Shift ]: nhảy theo mốc đoạn nhạc; bàn phím Mỹ ra "{" "}", vài bàn phím vẫn ra "[" "]" kèm Shift
  if (key === "{" || (k.shift && key === "[")) return { type: "markJump", dir: -1 };
  if (key === "}" || (k.shift && key === "]")) return { type: "markJump", dir: 1 };
  if (c.presenting) {
    switch (key) {
      case " ": return { type: "toggle" };
      case "ArrowRight": case "PageDown": case "]": return { type: "jump", dir: 1 };
      case "ArrowLeft": case "PageUp": case "[": return { type: "jump", dir: -1 };
      case "Home": return { type: "seek", to: "start" };
      case "End": return { type: "seek", to: "end" };
      case "Escape": return { type: "exit" };
    }
    if (lower === "f") return { type: "exit" };
    return null;
  }
  const sel = c.hasSelection;
  switch (key) {
    case " ": return { type: "toggle" };
    case "Home": return { type: "seek", to: "start" };
    case "End": return { type: "seek", to: "end" };
    case "ArrowLeft": case "ArrowRight": {
      const s = key === "ArrowLeft" ? -1 : 1;
      if (sel) return { type: "nudge", dx: s * (k.shift ? 1 : 0.25), dz: 0 };
      return { type: "step", beats: s * (k.shift ? 8 : 1) };
    }
    case "ArrowUp": case "ArrowDown": {
      if (!sel) return null;
      const s = key === "ArrowUp" ? -1 : 1;
      return { type: "nudge", dx: 0, dz: s * (k.shift ? 1 : 0.25) };
    }
    case "Escape": return { type: "clear" };
    case "Enter": case "+": return c.hasDancers ? { type: "add" } : null;
    case "Delete":
      if (c.formationFocused) return { type: "delete" };
      if (sel) return { type: "deleteHint" };
      return c.hasBlock ? { type: "delete" } : null;
    case "[": return { type: "jump", dir: -1 };
    case "]": return { type: "jump", dir: 1 };
  }
  switch (lower) {
    case "n": return { type: "snap" };
    case "v": return { type: "view" };
    case "f": return c.hasDancers ? { type: "present" } : null;
    case "m": return { type: "mirror" };
    case "x": return sel ? { type: "swap" } : null;
    case "r": return c.hasDancers ? { type: "rotate", dir: k.shift ? -1 : 1 } : null;
    case "q": return c.hasDancers ? { type: "turn", dir: k.shift ? -1 : 1 } : null;

    case "l": return { type: "loop" };
    case "o": return { type: "planFrom" };
    case "z": return k.shift ? { type: "fit" } : null;
    case "b": return k.shift ? null : { type: "mark" };
  }
  return null;
}
