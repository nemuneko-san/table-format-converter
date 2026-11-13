/**
 * 操作の結果を画面の右下に少しの間だけ出すトースト通知。
 * table-to-markdown-copier の src/content/toast.ts に合わせる（右下 16px・3 秒・1 つずつ・成功は緑と ✓、失敗は赤と !、
 * 成功は role="status"、失敗は role="alert"）。こちらは自前の拡張ページで CSP が style-src 'self' のため、
 * Shadow DOM とインラインの <style> は使わず、見た目は styles.css の .toast に書く
 */

export type ToastKind = "success" | "error";

/** トーストを出しておく時間（元の実装と同じ） */
export const TOAST_DURATION_MS = 3000;

let current: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** トーストを出す。前のトーストが残っていれば消して入れ替える（重ねない） */
export function showToast(kind: ToastKind, message: string, doc: Document = document): void {
  current?.remove();
  clearTimeout(timer);
  const toast = doc.createElement("div");
  toast.className = `toast ${kind}`;
  toast.setAttribute("role", kind === "error" ? "alert" : "status");
  const icon = doc.createElement("span");
  icon.className = "toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = kind === "success" ? "✓" : "!";
  const text = doc.createElement("span");
  text.textContent = message;
  toast.append(icon, text);
  doc.body.append(toast);
  current = toast;
  timer = setTimeout(() => {
    toast.remove();
    if (current === toast) current = null;
  }, TOAST_DURATION_MS);
}
