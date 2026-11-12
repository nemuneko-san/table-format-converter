import { effectiveAligns } from "../align";
import type { Table } from "../model";
import { stringWidth, type WidthOptions } from "../width";
import { flattenNewlines, measure, padCell } from "./layout";

/** 罫線の文字セット。[左, 中, 右] × [上, 中, 下] と横線・縦線 */
type Charset = {
  h: string;
  v: string;
  top: readonly [string, string, string];
  mid: readonly [string, string, string];
  bottom: readonly [string, string, string];
};

export type BoxStyle = "single" | "heavy" | "double" | "rounded";

export const BOX_STYLES: readonly BoxStyle[] = ["single", "heavy", "double", "rounded"];

export const BOX_STYLE_LABELS: Record<BoxStyle, string> = {
  single: "単線 ┌─┐",
  heavy: "太線 ┏━┓",
  double: "二重線 ╔═╗",
  rounded: "角丸 ╭─╮",
};

const BOX_CHARSETS: Record<BoxStyle, Charset> = {
  single: { h: "─", v: "│", top: ["┌", "┬", "┐"], mid: ["├", "┼", "┤"], bottom: ["└", "┴", "┘"] },
  heavy: { h: "━", v: "┃", top: ["┏", "┳", "┓"], mid: ["┣", "╋", "┫"], bottom: ["┗", "┻", "┛"] },
  double: { h: "═", v: "║", top: ["╔", "╦", "╗"], mid: ["╠", "╬", "╣"], bottom: ["╚", "╩", "╝"] },
  rounded: { h: "─", v: "│", top: ["╭", "┬", "╮"], mid: ["├", "┼", "┤"], bottom: ["╰", "┴", "╯"] },
};

const ASCII_CHARSET: Charset = { h: "-", v: "|", top: ["+", "+", "+"], mid: ["+", "+", "+"], bottom: ["+", "+", "+"] };

export type RuledOptions = WidthOptions & {
  /** 全ての行の間に罫線を入れる（Q21。false ならヘッダー下のみ） */
  rowSeparators: boolean;
};

function renderRuled(table: Table, charset: Charset, options: RuledOptions): string {
  const rows = table.rows.map((row) => row.map(flattenNewlines));
  if ((rows[0]?.length ?? 0) === 0) return "";
  const aligns = effectiveAligns(table);
  // 罫線文字の幅（曖昧幅 2 のとき 2）。列の内幅をその倍数に切り上げて縦線の位置を揃える
  const unit = Math.max(1, stringWidth(charset.h, options));
  const measured = measure(rows, options);
  const inner = measured.columnWidths.map((w) => Math.ceil((w + 2) / unit) * unit);
  const border = ([left, middle, right]: readonly [string, string, string]): string =>
    left + inner.map((w) => charset.h.repeat(w / unit)).join(middle) + right;
  // ヘッダー行は左詰め、データ行は列の揃えに従って詰める
  const content = (row: readonly string[], r: number): string => {
    const isHeader = table.header && r === 0;
    const cells = row.map(
      (cell, c) => ` ${padCell(cell, measured.cellWidths[r][c], inner[c] - 2, isHeader ? "none" : aligns[c])} `,
    );
    return charset.v + cells.join(charset.v) + charset.v;
  };
  const lines = [border(charset.top)];
  rows.forEach((row, index) => {
    if (index > 0 && (options.rowSeparators || (table.header && index === 1))) lines.push(border(charset.mid));
    lines.push(content(row, index));
  });
  lines.push(border(charset.bottom));
  return lines.join("\n");
}

export function toBox(table: Table, options: RuledOptions & { style: BoxStyle }): string {
  return renderRuled(table, BOX_CHARSETS[options.style], options);
}

export function toAscii(table: Table, options: RuledOptions): string {
  // ASCII の罫線文字は常に幅 1
  return renderRuled(table, ASCII_CHARSET, options);
}
