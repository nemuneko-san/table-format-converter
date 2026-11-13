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

const SVG_NS = "http://www.w3.org/2000/svg";

/** 列操作のアイコン（16px、線のみ）。外部リソースを使わないようにパスを直接持つ */
const ICON_PATHS = {
  left: "M13 8H3.5M7 4.5 3.5 8 7 11.5",
  right: "M3 8h9.5M9 4.5l3.5 3.5L9 11.5",
  delete: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4",
} as const;

function icon(kind: keyof typeof ICON_PATHS): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATHS[kind]);
  svg.append(path);
  return svg;
}

function toolButton(
  kind: keyof typeof ICON_PATHS,
  label: string,
  onClick: () => void,
  disabled: boolean,
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = kind === "delete" ? "icon-button danger" : "icon-button";
  el.title = label;
  el.setAttribute("aria-label", label);
  el.disabled = disabled;
  el.append(icon(kind));
  el.addEventListener("click", onClick);
  return el;
}

function columnTools(c: number, cols: number, handlers: PreviewHandlers): HTMLDivElement {
  const tools = document.createElement("div");
  tools.className = "col-tools";
  tools.append(
    toolButton("left", `左へ移動（${c + 1} 列目）`, () => handlers.onMoveColumn(c, -1), c === 0),
    toolButton("right", `右へ移動（${c + 1} 列目）`, () => handlers.onMoveColumn(c, 1), c === cols - 1),
    toolButton("delete", `列を削除（${c + 1} 列目）`, () => handlers.onDeleteColumn(c), cols <= 1),
  );
  return tools;
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

/** 1 行目のセル: 編集できる文字の欄と、列操作のボタン（列見出しの中に置く）を並べる */
function firstRowCell(
  tag: "th" | "td",
  value: string,
  c: number,
  cols: number,
  handlers: PreviewHandlers,
): HTMLElement {
  const cell = document.createElement(tag);
  cell.className = "col-head";
  const text = document.createElement("div");
  text.className = "cell-text";
  makeEditable(text, value, 0, c, handlers);
  const wrap = document.createElement("div");
  wrap.className = "col-head-inner";
  wrap.append(text, columnTools(c, cols, handlers));
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
        r === 0 ? firstRowCell(tag, value, c, cols, handlers) : editableCell(tag, value, r, c, handlers),
      ),
    );
    (isHeader ? thead : tbody).append(tr);
  });
  el.append(thead, tbody);
  container.replaceChildren(el);
}
