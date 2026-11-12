import type { RawTable } from "../model";
import { graphemeWidth } from "../width";

/** 罫線表（罫線文字 / ASCII）の形式差分 */
type RuledSpec = {
  /** 横罫線の行か */
  isBorder: (line: string) => boolean;
  /** 縦罫線として扱う文字 */
  verticals: RegExp;
  /** 横罫線の行のうち、交点（列境界）ではない線の文字 */
  horizontals: RegExp;
};

const BOX_VERTICALS = /[│┃║╎╏┆┇┊┋]/;

/** 罫線文字だけから成り、縦線で始まらない行（│───│ のような内容がダッシュだけのデータ行は除く） */
export function isBoxBorderLine(line: string): boolean {
  const t = line.trim();
  return /^[─-╿]+$/.test(t) && !BOX_VERTICALS.test(t[0]) && /[^│┃║╎╏┆┇┊┋]/.test(t);
}

export function isAsciiBorderLine(line: string): boolean {
  return /^\+[-=+:]*[-=][-=+:]*\+$/.test(line.trim());
}

const BOX_SPEC: RuledSpec = {
  isBorder: isBoxBorderLine,
  verticals: BOX_VERTICALS,
  horizontals: /[─━═┄┅┈┉╌╍╴╵╶╷╸╹╺╻╼╽╾╿]/,
};
const ASCII_SPEC: RuledSpec = { isBorder: isAsciiBorderLine, verticals: /\|/, horizontals: /[-=:]/ };

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

type Glyph = { col: number; text: string };

/** 行を書記素ごとに、表示桁位置つきで並べる（曖昧幅 1 として数える） */
function glyphs(line: string): Glyph[] {
  const out: Glyph[] = [];
  let col = 0;
  for (const { segment } of segmenter.segment(line)) {
    out.push({ col, text: segment });
    col += graphemeWidth(segment, { ambiguousWide: false });
  }
  return out;
}

/** 横罫線の行から列境界（交点）の表示桁位置を求める */
function boundaryColumns(border: string, spec: RuledSpec): number[] {
  return glyphs(border.trimEnd())
    .filter((g) => !spec.horizontals.test(g.text) && g.text.trim() !== "")
    .map((g) => g.col);
}

/** 列境界の桁位置で内容行を切る。境界位置に縦線が無ければ null（全角のずれ等） */
function splitByColumns(line: string, columns: readonly number[], spec: RuledSpec): string[] | null {
  const all = glyphs(line.trimEnd());
  const byCol = new Map(all.map((g, i) => [g.col, i] as const));
  const cuts: number[] = [];
  for (const col of columns) {
    const index = byCol.get(col);
    if (index === undefined || !spec.verticals.test(all[index].text)) return null;
    cuts.push(index);
  }
  return cuts.slice(1).map((end, i) =>
    all
      .slice(cuts[i] + 1, end)
      .map((g) => g.text)
      .join(""),
  );
}

/** 縦線の文字で内容行を分割する（列境界で切れないときの代替） */
function splitByVerticals(line: string, verticals: RegExp): string[] {
  const t = line.trim();
  const cells = t.split(new RegExp(verticals.source, "g"));
  if (verticals.test(t[0] ?? "")) cells.shift();
  if (t.length > 1 && verticals.test(t[t.length - 1])) cells.pop();
  return cells;
}

type Section = { lines: string[]; borderBefore: string | null };

/** 横罫線で区切られた内容行のグループ。連続する罫線は 1 本とみなす */
function sections(lines: readonly string[], spec: RuledSpec): Section[] {
  const out: Section[] = [{ lines: [], borderBefore: null }];
  for (const line of lines) {
    if (!spec.isBorder(line)) {
      out[out.length - 1].lines.push(line);
      continue;
    }
    const border = line.trim();
    if (out[out.length - 1].lines.length > 0) out.push({ lines: [], borderBefore: border });
    else out[out.length - 1].borderBefore = border;
  }
  return out.filter((s) => s.lines.length > 0);
}

/** 複数の物理行を 1 行に結合する（列ごとに空でない断片を改行でつなぐ） */
function mergeLines(cellLines: readonly string[][]): string[] {
  const cols = cellLines.reduce((max, cells) => Math.max(max, cells.length), 0);
  return Array.from({ length: cols }, (_, c) =>
    cellLines
      .map((cells) => (cells[c] ?? "").trim())
      .filter((piece) => piece !== "")
      .join("\n"),
  );
}

/**
 * 罫線から決まるヘッダー有無。
 * - 内側の横罫線がヘッダー下の 1 本だけ: ヘッダーあり
 * - 行間罫線がある表: ヘッダー下の罫線だけ線種が違うときだけヘッダーあり。全て同じなら内容から推定（null）
 */
function headerFromBorders(groups: readonly Section[]): boolean | null {
  if (groups.length === 2) return true;
  const inner = groups.slice(1).map((s) => s.borderBefore);
  return inner[0] !== inner[1] ? true : null;
}

/**
 * 罫線表を解析する。折り返しセルの扱いは Q19（自動切り替え）に従う。
 * - 行間罫線がある表（内側の横罫線が 2 本以上）: 罫線で区切られた範囲を 1 行とみなし、折り返しを改行で結合する
 * - ヘッダー下にだけ罫線がある表: ヘッダーは罫線までを 1 行に結合し、データは 1 物理行 = 1 行
 * - 内側の横罫線が無い表: 1 物理行 = 1 行（ヘッダー有無は内容から推定）
 * 内容行は罫線の交点の桁位置で列に切る（セル内の │ や | を区切りと誤認しない）。切れない行は縦線の文字で分割する。
 */
function parseRuled(text: string, spec: RuledSpec): RawTable {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const firstBorder = lines.find(spec.isBorder);
  const columns = firstBorder ? boundaryColumns(firstBorder, spec) : [];
  const split = (line: string): string[] =>
    (columns.length >= 2 ? splitByColumns(line, columns, spec) : null) ?? splitByVerticals(line, spec.verticals);
  const groups = sections(lines, spec);
  const rows = groups.map((group) => group.lines.map(split));
  if (groups.length >= 3) return { rows: rows.map(mergeLines), header: headerFromBorders(groups), inputAligns: null };
  if (groups.length === 2) return { rows: [mergeLines(rows[0]), ...rows[1]], header: true, inputAligns: null };
  return { rows: rows[0] ?? [], header: null, inputAligns: null };
}

export function parseBox(text: string): RawTable {
  return parseRuled(text, BOX_SPEC);
}

export function parseAscii(text: string): RawTable {
  return parseRuled(text, ASCII_SPEC);
}
