import type { Align, RawTable } from "../model";

const BLOCK_TAGS = new Set(["P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "BLOCKQUOTE"]);

/** セルのテキスト。<br> とブロック要素の区切りをセル内改行にし、それ以外の空白は 1 個に詰める */
export function cellText(node: Node): string {
  return collect(node).replace(/[ \t\r\n\f]+/g, " ").replace(/ ?\u0000 ?/g, "\n").replace(/\n+/g, "\n").replace(/^[ \n]+|[ \n]+$/g, "");
}

/** 表示されない要素。中のテキストをセルに入れない */
const HIDDEN_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

/** セル内に入れ子になった table。セルのテキストを半角スペースでつなぐ */
function nestedTableText(table: Element): string {
  const cells = tableRows(table).flatMap((tr) => directCells(tr));
  return ` ${cells.map((cell) => collect(cell).replace(/\u0000/g, " ")).join(" ")} `;
}

function collect(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  if (HIDDEN_TAGS.has(el.tagName)) return "";
  if (el.tagName === "BR") return "\u0000";
  if (el.tagName === "TABLE") return nestedTableText(el);
  const inner = Array.from(el.childNodes).map(collect).join("");
  return BLOCK_TAGS.has(el.tagName) ? `\u0000${inner}\u0000` : inner;
}

function readAlign(cell: Element): Align {
  const style = (cell.getAttribute("style") ?? "").match(/text-align\s*:\s*(left|center|right)/i);
  const value = (style?.[1] ?? cell.getAttribute("align") ?? "").toLowerCase();
  if (value === "left" || value === "center" || value === "right") return value;
  return "none";
}

function spanOf(cell: Element, name: "colspan" | "rowspan"): number {
  const n = Number.parseInt(cell.getAttribute(name) ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 1000) : 1;
}

type Grid = { cells: string[][]; aligns: Align[] };

/** colspan / rowspan を展開した格子を作る。結合範囲は先頭（最上段・左端）にだけ値を入れる（Q20） */
function buildGrid(rows: readonly Element[]): Grid {
  const cells: string[][] = rows.map(() => []);
  const occupied: boolean[][] = rows.map(() => []);
  const aligns: Align[] = [];
  rows.forEach((tr, r) => {
    let c = 0;
    for (const cell of directCells(tr)) {
      while (occupied[r][c]) c++;
      const colspan = spanOf(cell, "colspan");
      const rowspan = Math.min(spanOf(cell, "rowspan"), rows.length - r);
      fillSpan(cells, occupied, { r, c, rowspan, colspan }, cellText(cell));
      if (aligns[c] === undefined || aligns[c] === "none") aligns[c] = readAlign(cell);
      c += colspan;
    }
  });
  return { cells: cells.map((row) => Array.from(row, (v) => v ?? "")), aligns };
}

type Span = { r: number; c: number; rowspan: number; colspan: number };

function fillSpan(cells: string[][], occupied: boolean[][], span: Span, value: string): void {
  for (let dr = 0; dr < span.rowspan; dr++) {
    for (let dc = 0; dc < span.colspan; dc++) {
      cells[span.r + dr][span.c + dc] = dr === 0 && dc === 0 ? value : "";
      occupied[span.r + dr][span.c + dc] = true;
    }
  }
}

function directCells(tr: Element): Element[] {
  return Array.from(tr.children).filter((el) => el.tagName === "TD" || el.tagName === "TH");
}

function tableRows(table: Element): Element[] {
  return Array.from(table.querySelectorAll("tr")).filter((tr) => tr.closest("table") === table);
}

function hasHeaderRow(table: Element, first: Element | undefined): boolean | null {
  if (Array.from(table.children).some((el) => el.tagName === "THEAD")) return true;
  if (!first) return null;
  const cells = directCells(first);
  if (cells.length > 0 && cells.every((el) => el.tagName === "TH")) return true;
  return null;
}

/** HTML の最初の table を解析する */
export function parseHtml(text: string): RawTable {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const table = doc.querySelector("table");
  if (!table) throw new Error("table 要素が見つかりません");
  const rows = tableRows(table);
  const grid = buildGrid(rows);
  const explicit = grid.aligns.some((a) => a !== "none");
  return {
    rows: grid.cells,
    header: hasHeaderRow(table, rows[0]),
    inputAligns: explicit ? grid.aligns.map((a) => a ?? "none") : null,
  };
}
