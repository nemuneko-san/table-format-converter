import type { Align } from "../model";
import { stringWidth, type WidthOptions } from "../width";

/** セルごとの表示幅と、列ごとの最大幅。幅は 1 回だけ計算して使い回す */
export type Measured = {
  cellWidths: number[][];
  columnWidths: number[];
};

export function measure(rows: readonly (readonly string[])[], options: WidthOptions): Measured {
  const cols = rows[0]?.length ?? 0;
  const columnWidths = Array.from({ length: cols }, () => 0);
  const cellWidths = rows.map((row) =>
    row.map((cell, c) => {
      const w = stringWidth(cell, options);
      if (w > columnWidths[c]) columnWidths[c] = w;
      return w;
    }),
  );
  return { cellWidths, columnWidths };
}

/** 表示幅 textWidth の文字列を width になるよう空白で埋める。right は右寄せ、center は中央、それ以外は左寄せ */
export function padCell(text: string, textWidth: number, width: number, align: Align): string {
  const gap = Math.max(0, width - textWidth);
  if (gap === 0) return text;
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
