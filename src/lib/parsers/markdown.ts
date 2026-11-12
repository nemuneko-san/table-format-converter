import type { Align, RawTable } from "../model";

const SEPARATOR_CELL = /^\s*:?-+:?\s*$/;

/** 行をエスケープされていない | で分割する（先頭・末尾の | は除く）。\| は | に戻す */
export function splitPipeRow(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  if (trimmed.startsWith("|")) cells.shift();
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) cells.pop();
  return cells;
}

/** 区切り行（| --- | :-: | ---: |）か */
export function isSeparatorLine(line: string): boolean {
  if (!line.includes("-")) return false;
  if (!line.includes("|") && !/^\s*:?-+:?\s*$/.test(line)) return false;
  const cells = splitPipeRow(line);
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell));
}

function toAlign(cell: string): Align {
  const c = cell.trim();
  const left = c.startsWith(":");
  const right = c.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "none";
}

function brToNewline(cell: string): string {
  return cell.replace(/<br\s*\/?>/gi, "\n");
}

/**
 * GFM のパイプ表を解析する。2 行目が区切り行ならヘッダーあり、無ければヘッダーなしとみなす。
 * セル内のインライン記法はそのまま保持する（Q18）。<br> はセル内改行に戻す。
 */
export function parseMarkdown(text: string): RawTable {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const sepIndex = lines.findIndex(isSeparatorLine);
  const hasHeader = sepIndex === 1;
  const sepCells = hasHeader ? splitPipeRow(lines[1]) : [];
  const explicit = sepCells.some((cell) => cell.includes(":"));
  // 先頭 2 行以内の区切り行だけを構造として除く（以降の行はセル値が - だけのデータ行でありうる）
  const dropIndex = sepIndex >= 0 && sepIndex <= 1 ? sepIndex : -1;
  const dataLines = lines.filter((_, index) => index !== dropIndex);
  return {
    rows: dataLines.map((line) => splitPipeRow(line).map(brToNewline)),
    header: hasHeader,
    inputAligns: explicit ? sepCells.map(toAlign) : null,
  };
}

