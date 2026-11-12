import { isNumericLike } from "./align";
import { columnCount, type RawTable, type Table } from "./model";

/** セル前後の半角・全角空白を除去する（内部の連続空白は保持。Q32） */
export function trimCell(cell: string): string {
  return cell.replace(/^[ \t　]+|[ \t　]+$/g, "");
}

/** 内容から 1 行目がヘッダーらしいかを推定する */
export function guessHeader(rows: readonly (readonly string[])[]): boolean {
  if (rows.length < 2) return false;
  const first = rows[0];
  return first.every((cell) => cell !== "" && !isNumericLike(cell));
}

export type Normalized = {
  table: Table;
  /** 形式・内容から自動判定したヘッダー有無 */
  detectedHeader: boolean;
  warnings: string[];
};

/**
 * パーサ出力を表モデルに正規化する。
 * セルの前後空白除去、列数不揃いの空セル補完（警告つき。Q10）、ヘッダー自動判定（Q28）を行う。
 */
export function normalize(raw: RawTable, inlineMarkdown: boolean): Normalized {
  const trimmed = raw.rows.map((row) => row.map(trimCell));
  const cols = columnCount(trimmed);
  const shortRows: number[] = [];
  const rows = trimmed.map((row, index) => {
    if (row.length >= cols) return row;
    shortRows.push(index + 1);
    return [...row, ...Array.from({ length: cols - row.length }, () => "")];
  });
  const warnings =
    shortRows.length === 0
      ? []
      : [`列数が揃っていない行を空セルで補いました（${cols} 列に揃えた行: ${formatRowList(shortRows)}）`];
  const detectedHeader = raw.header ?? guessHeader(rows);
  const inputAligns = raw.inputAligns
    ? Array.from({ length: cols }, (_, i) => raw.inputAligns?.[i] ?? "none")
    : null;
  return {
    table: { rows, header: detectedHeader, inputAligns, inlineMarkdown },
    detectedHeader,
    warnings,
  };
}

function formatRowList(rows: readonly number[]): string {
  const head = rows.slice(0, 10).map((n) => `${n} 行目`).join("、");
  return rows.length > 10 ? `${head} ほか ${rows.length - 10} 行` : head;
}
