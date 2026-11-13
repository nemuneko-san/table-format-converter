import type { Table } from "../lib/model";

/** これを超えるセル数の表はプレビューを省略する（Q50 司令塔判断） */
export const PREVIEW_CELL_LIMIT = 5000;

export type PreviewHandlers = {
  onCellInput: (row: number, col: number, value: string) => void;
  onMoveColumn: (col: number, delta: -1 | 1) => void;
  onDeleteColumn: (col: number) => void;
};

function button(label: string, title: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.title = title;
  el.setAttribute("aria-label", title);
  el.disabled = disabled;
  el.addEventListener("click", onClick);
  return el;
}

function columnControls(cols: number, handlers: PreviewHandlers): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.className = "col-controls";
  for (let c = 0; c < cols; c++) {
    const th = document.createElement("th");
    th.append(
      button("←", `${c + 1} 列目を左へ移動`, () => handlers.onMoveColumn(c, -1), c === 0),
      button("→", `${c + 1} 列目を右へ移動`, () => handlers.onMoveColumn(c, 1), c === cols - 1),
      button("×", `${c + 1} 列目を削除`, () => handlers.onDeleteColumn(c), cols <= 1),
    );
    tr.append(th);
  }
  return tr;
}

function editableCell(tag: "th" | "td", value: string, r: number, c: number, handlers: PreviewHandlers): HTMLElement {
  const cell = document.createElement(tag);
  cell.textContent = value;
  // 貼り付けた書式・画像などを持ち込まないよう、プレーンテキストだけを編集できるようにする
  cell.setAttribute("contenteditable", "plaintext-only");
  cell.spellcheck = false;
  cell.dataset.row = String(r);
  cell.dataset.col = String(c);
  cell.addEventListener("input", () => handlers.onCellInput(r, c, cell.innerText));
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
  thead.append(columnControls(cols, handlers));
  const tbody = document.createElement("tbody");
  table.rows.forEach((row, r) => {
    const tr = document.createElement("tr");
    const isHeader = table.header && r === 0;
    if (isHeader) tr.className = "header-row";
    tr.append(...row.map((value, c) => editableCell(isHeader ? "th" : "td", value, r, c, handlers)));
    (isHeader ? thead : tbody).append(tr);
  });
  el.append(thead, tbody);
  container.replaceChildren(el);
}
