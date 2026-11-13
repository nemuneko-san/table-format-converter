import type { Table } from "../lib/model";

/** これを超えるセル数の表はプレビューを省略する（Q50 司令塔判断） */
export const PREVIEW_CELL_LIMIT = 5000;

export type PreviewHandlers = {
  onCellInput: (row: number, col: number, value: string) => void;
  /** セルの編集を終えた（フォーカスが外れた）。次の入力を別の 1 手として扱うために使う */
  onCellBlur: () => void;
  onMoveColumn: (col: number, delta: -1 | 1) => void;
  onDeleteColumn: (col: number) => void;
};

/** SVG 要素を作るための名前空間の識別子（接続先ではない） */
const SVG_NS = "http://www.w3.org/2000/svg";
/** 列メニューとボタンの間の隙間と、画面の端から離す幅（px） */
const MENU_OFFSET = 4;
const MENU_EDGE = 8;

/** 列操作のアイコン（16px、線のみ）。外部リソースを使わないようにパスを直接持つ */
const ICON_PATHS = {
  menu: "M3 8h.01M8 8h.01M13 8h.01",
  left: "M13 8H3.5M7 4.5 3.5 8 7 11.5",
  right: "M3 8h9.5M9 4.5l3.5 3.5L9 11.5",
  delete: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4",
} as const;

type IconKind = keyof typeof ICON_PATHS;

function icon(kind: IconKind): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("button-icon", `icon-${kind}`);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATHS[kind]);
  svg.append(path);
  return svg;
}

type PopoverElement = HTMLElement & { hidePopover?: () => void };

/** popover として開いているか（:popover-open を解釈できない環境では false） */
function isOpen(menu: Element): boolean {
  try {
    return menu.matches(":popover-open");
  } catch {
    return false;
  }
}

/** 開いていれば閉じる（popover 非対応の環境では何もしない） */
function closeMenu(menu: PopoverElement): void {
  if (isOpen(menu)) menu.hidePopover?.();
}

/** メニューの項目: 記号に頼らず文字で意味を示す */
function menuItem(kind: IconKind, text: string, label: string, onClick: () => void, disabled: boolean): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = kind === "delete" ? "menu-item danger" : "menu-item";
  el.setAttribute("role", "menuitem");
  el.title = label;
  el.setAttribute("aria-label", label);
  el.disabled = disabled;
  const span = document.createElement("span");
  span.textContent = text;
  el.append(icon(kind), span);
  el.addEventListener("click", onClick);
  return el;
}

/**
 * 列見出しの「列の操作」ボタンと、その下に開くメニュー。
 * 開閉は Web 標準の popover（Chrome 114〜）に任せ、Esc と外側のクリックで閉じる。フォーカスがメニューの外へ出ても閉じる
 */
function columnMenu(
  c: number,
  cols: number,
  handlers: PreviewHandlers,
  run: (action: () => void, focusCol: number) => void,
): HTMLDivElement {
  const id = `col-menu-${c}`;
  const wrap = document.createElement("div");
  wrap.className = "col-menu";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "col-menu-button";
  trigger.dataset.colMenu = String(c);
  trigger.setAttribute("popovertarget", id);
  trigger.setAttribute("aria-haspopup", "menu");
  const label = `列の操作（${c + 1} 列目）`;
  trigger.title = label;
  trigger.setAttribute("aria-label", label);
  trigger.append(icon("menu"));

  const menu: PopoverElement = document.createElement("div");
  menu.id = id;
  menu.className = "col-menu-list";
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", label);
  menu.append(
    menuItem("left", "左へ移動", `左へ移動（${c + 1} 列目）`, () => run(() => handlers.onMoveColumn(c, -1), c - 1), c === 0),
    menuItem("right", "右へ移動", `右へ移動（${c + 1} 列目）`, () => run(() => handlers.onMoveColumn(c, 1), c + 1), c === cols - 1),
    menuItem("delete", "列を削除", `列を削除（${c + 1} 列目）`, () => run(() => handlers.onDeleteColumn(c), Math.min(c, cols - 2)), cols <= 1),
  );
  // 開いたらボタンの真下に置き（画面の外へはみ出さないよう寄せる）、最初の押せる項目にフォーカスを移す
  menu.addEventListener("toggle", () => {
    if (!isOpen(menu)) return;
    const view = menu.ownerDocument.defaultView;
    const rect = trigger.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const maxLeft = (view?.innerWidth ?? width) - width - MENU_EDGE;
    const below = rect.bottom + MENU_OFFSET;
    const fitsBelow = below + height <= (view?.innerHeight ?? below + height);
    menu.style.left = `${Math.max(MENU_EDGE, Math.min(rect.right - width, maxLeft))}px`;
    menu.style.top = `${fitsBelow ? below : Math.max(MENU_EDGE, rect.top - MENU_OFFSET - height)}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  });
  menu.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && (menu.contains(next) || next === trigger)) return;
    closeMenu(menu);
  });
  // 上下の矢印キーで項目を移る
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const index = items.indexOf(menu.ownerDocument.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
    event.preventDefault();
  });
  wrap.append(trigger, menu);
  return wrap;
}

/** 編集できる要素にする。data-row / data-col は編集対象のセル位置 */
function makeEditable(el: HTMLElement, value: string, r: number, c: number, handlers: PreviewHandlers): void {
  el.textContent = value;
  // 貼り付けた書式・画像などを持ち込まないよう、プレーンテキストだけを編集できるようにする
  el.setAttribute("contenteditable", "plaintext-only");
  el.spellcheck = false;
  el.dataset.row = String(r);
  el.dataset.col = String(c);
  el.addEventListener("input", () => handlers.onCellInput(r, c, el.innerText));
  el.addEventListener("blur", () => handlers.onCellBlur());
}

function editableCell(tag: "th" | "td", value: string, r: number, c: number, handlers: PreviewHandlers): HTMLElement {
  const cell = document.createElement(tag);
  makeEditable(cell, value, r, c, handlers);
  return cell;
}

/** 1 行目のセル: 編集できる文字の欄と、列の操作ボタン（列見出しの中に置く）を並べる */
function firstRowCell(
  tag: "th" | "td",
  value: string,
  c: number,
  cols: number,
  handlers: PreviewHandlers,
  run: (action: () => void, focusCol: number) => void,
): HTMLElement {
  const cell = document.createElement(tag);
  cell.className = "col-head";
  const text = document.createElement("div");
  text.className = "cell-text";
  makeEditable(text, value, 0, c, handlers);
  const wrap = document.createElement("div");
  wrap.className = "col-head-inner";
  wrap.append(text, columnMenu(c, cols, handlers, run));
  cell.append(wrap);
  return cell;
}

/** 表モデルを HTML の表として描画する（Q41: 入力・出力欄の下に常時表示）。セルは直接編集できる（Q40） */
export function renderPreview(container: HTMLElement, table: Table | null, handlers: PreviewHandlers): void {
  if (!table || table.rows.length === 0) {
    container.replaceChildren();
    return;
  }
  const cols = table.rows[0].length;
  const cells = table.rows.length * cols;
  if (cells > PREVIEW_CELL_LIMIT) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = `表が大きいため（${cells.toLocaleString()} セル）プレビューを省略しました。変換とコピーは行えます。`;
    container.replaceChildren(note);
    return;
  }
  // メニューは画面に固定して開くので、ページや表がスクロールしたら閉じる（ボタンから離れて見えないように）
  if (!container.dataset.menuScrollBound) {
    container.dataset.menuScrollBound = "true";
    container.ownerDocument.addEventListener(
      "scroll",
      () => container.querySelectorAll<PopoverElement>(".col-menu-list").forEach(closeMenu),
      { capture: true, passive: true },
    );
  }
  // 列の操作で表が描き直されたあと、操作した列（移動先・削除後の隣）の「列の操作」ボタンにフォーカスを戻す
  const run = (action: () => void, focusCol: number): void => {
    action();
    container.querySelector<HTMLButtonElement>(`[data-col-menu="${Math.max(0, focusCol)}"]`)?.focus();
  };
  const el = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  table.rows.forEach((row, r) => {
    const tr = document.createElement("tr");
    const isHeader = table.header && r === 0;
    const tag = isHeader ? "th" : "td";
    if (isHeader) tr.className = "header-row";
    tr.append(
      ...row.map((value, c) =>
        r === 0 ? firstRowCell(tag, value, c, cols, handlers, run) : editableCell(tag, value, r, c, handlers),
      ),
    );
    (isHeader ? thead : tbody).append(tr);
  });
  el.append(thead, tbody);
  container.replaceChildren(el);
}
