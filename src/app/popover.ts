/**
 * ボタンの下に開く面（列の操作メニュー・詳細設定）の共通処理。開閉は Web 標準の popover（Chrome 114〜）に任せ、
 * Esc と外側のクリックでの開閉はブラウザが行う。ここではボタンの真下への配置と、フォーカスが外へ出たとき・
 * ページや表のスクロール・ウィンドウの幅の変更で閉じる処理を足す（固定位置の面がボタンから離れて置き去りにならないように）
 */

/** 面とボタンの間の隙間と、画面の端から離す幅（px） */
const GAP = 4;
const EDGE = 8;

type PopoverElement = HTMLElement & { hidePopover?: () => void };

/** popover として開いているか（:popover-open を解釈できない環境では false） */
export function isOpen(panel: Element): boolean {
  try {
    return panel.matches(":popover-open");
  } catch {
    return false;
  }
}

/** 開いていれば閉じる（popover 非対応の環境では何もしない） */
export function closePopover(panel: PopoverElement): void {
  if (isOpen(panel)) panel.hidePopover?.();
}

/** 文書内の開いている面をすべて閉じる */
export function closeAllPopovers(doc: Document): void {
  doc.querySelectorAll<PopoverElement>("[popover]").forEach(closePopover);
}

/** スクロールとウィンドウの幅の変更で開いている面を閉じる。文書ごとに 1 回だけ登録する */
function installAutoClose(doc: Document): void {
  const root = doc.documentElement;
  if (root.dataset.popoverAutoClose) return;
  root.dataset.popoverAutoClose = "true";
  doc.addEventListener("scroll", () => closeAllPopovers(doc), { capture: true, passive: true });
  doc.defaultView?.addEventListener("resize", () => closeAllPopovers(doc));
}

/**
 * panel を trigger の真下（入らなければ真上）に、画面の外へはみ出さないよう寄せて開くようにする。
 * align が "end" ならボタンの右端に、"start" なら左端に揃える。開いたら最初の操作できる要素へフォーカスを移す
 */
export function anchorPopover(panel: PopoverElement, trigger: HTMLElement, align: "start" | "end"): void {
  installAutoClose(panel.ownerDocument);
  panel.addEventListener("toggle", () => {
    if (!isOpen(panel)) return;
    const view = panel.ownerDocument.defaultView;
    const rect = trigger.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const viewWidth = view?.innerWidth ?? width;
    const viewHeight = view?.innerHeight ?? rect.bottom + height;
    const wanted = align === "end" ? rect.right - width : rect.left;
    const below = rect.bottom + GAP;
    const fitsBelow = below + height <= viewHeight;
    panel.style.left = `${Math.max(EDGE, Math.min(wanted, viewWidth - width - EDGE))}px`;
    panel.style.top = `${fitsBelow ? below : Math.max(EDGE, rect.top - GAP - height)}px`;
    panel
      .querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled)")
      ?.focus({ preventScroll: true });
  });
  panel.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && (panel.contains(next) || next === trigger)) return;
    closePopover(panel);
  });
}
