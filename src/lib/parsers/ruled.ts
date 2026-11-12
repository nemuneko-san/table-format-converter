import type { RawTable } from "../model";

/** 罫線表（罫線文字 / ASCII）の形式差分 */
type RuledSpec = {
  /** 横罫線の行か */
  isBorder: (line: string) => boolean;
  /** 縦罫線として扱う文字 */
  verticals: RegExp;
};

const BOX_VERTICALS = /[│┃║╎╏┆┇┊┋]/;

export function isBoxBorderLine(line: string): boolean {
  const t = line.trim();
  return /^[─-╿]+$/.test(t) && /[^│┃║╎╏┆┇┊┋]/.test(t);
}

export function isAsciiBorderLine(line: string): boolean {
  return /^\+[-=+:]*[-=][-=+:]*\+$/.test(line.trim());
}

const BOX_SPEC: RuledSpec = { isBorder: isBoxBorderLine, verticals: BOX_VERTICALS };
const ASCII_SPEC: RuledSpec = { isBorder: isAsciiBorderLine, verticals: /\|/ };

function splitContentLine(line: string, verticals: RegExp): string[] {
  const t = line.trim();
  const cells = t.split(new RegExp(verticals.source, "g"));
  if (verticals.test(t[0] ?? "")) cells.shift();
  if (t.length > 1 && verticals.test(t[t.length - 1])) cells.pop();
  return cells;
}

/** 横罫線で区切られた内容行のグループ。連続する罫線は 1 本とみなす */
function groupLines(lines: readonly string[], spec: RuledSpec): string[][] {
  const groups: string[][] = [[]];
  for (const line of lines) {
    if (!spec.isBorder(line)) {
      groups[groups.length - 1].push(line);
      continue;
    }
    if (groups[groups.length - 1].length > 0) groups.push([]);
  }
  return groups.filter((group) => group.length > 0);
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
 * 罫線表を解析する。折り返しセルの扱いは Q19（自動切り替え）に従う。
 * - 行間罫線がある表（内側の横罫線が 2 本以上）: 罫線で区切られた範囲を 1 行とみなし、折り返しを改行で結合する
 * - ヘッダー下にだけ罫線がある表: ヘッダーは罫線までを 1 行に結合し、データは 1 物理行 = 1 行
 * - 内側の横罫線が無い表: 1 物理行 = 1 行（ヘッダー有無は内容から推定）
 */
function parseRuled(text: string, spec: RuledSpec): RawTable {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const groups = groupLines(lines, spec).map((group) =>
    group.map((line) => splitContentLine(line, spec.verticals)),
  );
  if (groups.length >= 3) {
    return { rows: groups.map(mergeLines), header: true, inputAligns: null };
  }
  if (groups.length === 2) {
    return { rows: [mergeLines(groups[0]), ...groups[1]], header: true, inputAligns: null };
  }
  return { rows: groups[0] ?? [], header: null, inputAligns: null };
}

export function parseBox(text: string): RawTable {
  return parseRuled(text, BOX_SPEC);
}

export function parseAscii(text: string): RawTable {
  return parseRuled(text, ASCII_SPEC);
}
