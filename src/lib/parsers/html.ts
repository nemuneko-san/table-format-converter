import type { Align, RawTable } from "../model";

const BLOCK_TAGS = new Set(["P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "BLOCKQUOTE"]);

/** セルのテキスト。<br> とブロック要素の区切りをセル内改行にし、それ以外の空白は 1 個に詰める */
export function cellText(node: Node): string {
  return collect(node).replace(/[ \t\r\n\f]+/g, " ").replace(/ ?\0 ?/g, "\n").replace(/\n+/g, "\n").replace(/^[ \n]+|[ \n]+$/g, "");
}

/** 表示されない要素。中のテキストをセルに入れない */
const HIDDEN_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

/** セル内に入れ子になった table。セルのテキストを半角スペースでつなぐ */
function nestedTableText(table: Element): string {
  const cells = tableRows(table).flatMap((tr) => directCells(tr));
  return ` ${cells.map((cell) => collect(cell).replaceAll("\u0000", " ")).join(" ")} `;
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

/** style 属性の退避先。拡張ページの CSP（style-src 'self'）は style 属性を持つ要素を作るたびに違反を報告するため、パース前に名前を変える */
export const STYLE_ATTR = "data-tfc-style";

/** 中身をタグとして読まない要素（HTML の raw text / escapable raw text 要素） */
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"]);

const SPACE = /[\t\n\f\r ]/;

/** 位置 i から属性名・値を読み飛ばし、タグ末尾の `>` の次の位置を返す。style 属性の名前は STYLE_ATTR に置き換えて out に書く */
function scanTag(text: string, start: number, out: string[]): number {
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ">") {
      out.push(">");
      return i + 1;
    }
    if (SPACE.test(ch) || ch === "/") {
      out.push(ch);
      i++;
      continue;
    }
    // 属性名（先頭の `=` も名前の一部。HTML の仕様どおり）
    let end = i + 1;
    while (end < text.length && !SPACE.test(text[end]) && !"/>=".includes(text[end])) end++;
    const name = text.slice(i, end);
    out.push(name.toLowerCase() === "style" ? STYLE_ATTR : name);
    i = scanAttrValue(text, end, out);
  }
  return i;
}

/** 属性名の直後から `= 値` を読み飛ばして out に書き、次の位置を返す */
function scanAttrValue(text: string, start: number, out: string[]): number {
  let i = start;
  while (i < text.length && SPACE.test(text[i])) i++;
  if (text[i] !== "=") {
    out.push(text.slice(start, i));
    return i;
  }
  i++;
  while (i < text.length && SPACE.test(text[i])) i++;
  const quote = text[i];
  let end: number;
  if (quote === '"' || quote === "'") {
    const close = text.indexOf(quote, i + 1);
    end = close === -1 ? text.length : close + 1;
  } else {
    end = i;
    while (end < text.length && !SPACE.test(text[end]) && text[end] !== ">") end++;
  }
  out.push(text.slice(start, end));
  return end;
}

/** タグ名の終わりの位置 */
function tagNameEnd(text: string, start: number): number {
  let i = start;
  while (i < text.length && !SPACE.test(text[i]) && text[i] !== "/" && text[i] !== ">") i++;
  return i;
}

/** raw text 要素の中身を飛ばし、閉じタグ `</name` の位置を返す（無ければ末尾） */
function rawTextEnd(text: string, start: number, name: string): number {
  const close = text.toLowerCase().indexOf(`</${name}`, start);
  return close === -1 ? text.length : close;
}

/**
 * タグの style 属性の名前を STYLE_ATTR に変える。値・それ以外の文字はそのまま残す。
 * 引用符の中の `>`、コメント、script / textarea などの中身にある「style=」は書き換えない
 */
export function renameStyleAttributes(text: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) {
      out.push(text.slice(i));
      break;
    }
    out.push(text.slice(i, lt));
    if (text.startsWith("<!--", lt)) {
      const close = text.indexOf("-->", lt + 4);
      const end = close === -1 ? text.length : close + 3;
      out.push(text.slice(lt, end));
      i = end;
      continue;
    }
    const isEnd = text[lt + 1] === "/";
    const nameStart = isEnd ? lt + 2 : lt + 1;
    if (!/[A-Za-z]/.test(text[nameStart] ?? "")) {
      out.push("<");
      i = lt + 1;
      continue;
    }
    const nameEnd = tagNameEnd(text, nameStart);
    out.push(text.slice(lt, nameEnd));
    i = scanTag(text, nameEnd, out);
    const name = text.slice(nameStart, nameEnd).toLowerCase();
    if (isEnd || !RAW_TEXT_TAGS.has(name)) continue;
    const end = rawTextEnd(text, i, name);
    out.push(text.slice(i, end));
    i = end;
  }
  return out.join("");
}

function readAlign(cell: Element): Align {
  const style = (cell.getAttribute(STYLE_ATTR) ?? "").match(/text-align\s*:\s*(left|center|right)/i);
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
  const doc = new DOMParser().parseFromString(renameStyleAttributes(text), "text/html");
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
