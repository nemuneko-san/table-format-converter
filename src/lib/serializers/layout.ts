import type { Align } from "../model";
import { stringWidth, type WidthOptions } from "../width";

/** 列ごとの最大表示幅 */
export function columnWidths(rows: readonly (readonly string[])[], options: WidthOptions): number[] {
  const cols = rows[0]?.length ?? 0;
  return Array.from({ length: cols }, (_, c) =>
    rows.reduce((max, row) => Math.max(max, stringWidth(row[c] ?? "", options)), 0),
  );
}

/** 表示幅 width になるよう空白で埋める。right は右寄せ、center は中央、それ以外は左寄せ */
export function padCell(text: string, width: number, align: Align, options: WidthOptions): string {
  const gap = Math.max(0, width - stringWidth(text, options));
  if (align === "right") return " ".repeat(gap) + text;
  if (align === "center") {
    const left = Math.floor(gap / 2);
    return " ".repeat(left) + text + " ".repeat(gap - left);
  }
  return text + " ".repeat(gap);
}

/** セル内改行を半角スペースにする（Q30: Markdown / HTML 以外の形式） */
export function flattenNewlines(cell: string): string {
  return cell.replace(/\n/g, " ");
}
