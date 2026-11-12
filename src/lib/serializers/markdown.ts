import { effectiveAligns } from "../align";
import type { Align, Table } from "../model";
import type { WidthOptions } from "../width";
import { columnWidths, padCell } from "./layout";

export type MarkdownOptions = WidthOptions & {
  /** 桁を揃えて整形する（Q25。既定は整形なし） */
  pad: boolean;
};

/** セルを Markdown 用にエスケープする（| → \|、改行 → <br>。Q30・Q31） */
export function escapeMarkdownCell(cell: string): string {
  return cell.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

/** 区切りセル。width はコロンを含めた全体の幅（最小 3 本の - は常に確保する） */
function separatorCell(align: Align, width: number): string {
  const colons = align === "center" ? 2 : align === "none" ? 0 : 1;
  const dashes = "-".repeat(Math.max(3, width - colons));
  if (align === "center") return `:${dashes}:`;
  if (align === "right") return `${dashes}:`;
  if (align === "left") return `:${dashes}`;
  return dashes;
}

function plainLine(cells: readonly string[]): string {
  return `|${cells.map((cell) => (cell === "" ? " " : ` ${cell} `)).join("|")}|`;
}

function paddedLine(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

/**
 * GFM のパイプ表を出力する。ヘッダーなしの表には空のヘッダー行を補う（Q29）。
 */
export function toMarkdown(table: Table, options: MarkdownOptions): string {
  const cols = table.rows[0]?.length ?? 0;
  if (cols === 0) return "";
  const aligns = effectiveAligns(table);
  const escaped = table.rows.map((row) => row.map(escapeMarkdownCell));
  const header = table.header ? escaped[0] : Array.from({ length: cols }, () => "");
  const body = table.header ? escaped.slice(1) : escaped;
  if (!options.pad) {
    const sep = `| ${aligns.map((a) => separatorCell(a, 0)).join(" | ")} |`;
    return [plainLine(header), sep, ...body.map(plainLine)].join("\n");
  }
  const minWidths = aligns.map((a) => (a === "center" ? 5 : a === "none" ? 3 : 4));
  const widths = columnWidths([header, ...body], options).map((w, c) => Math.max(minWidths[c], w));
  // ヘッダー行は左詰め、データ行は列の揃えに従って詰める（Q25 の例と同じ）
  const line = (row: readonly string[], isHeader = false): string =>
    paddedLine(row.map((cell, c) => padCell(cell, widths[c], isHeader ? "none" : aligns[c], options)));
  const sep = paddedLine(aligns.map((a, c) => separatorCell(a, widths[c])));
  return [line(header, true), sep, ...body.map((row) => line(row))].join("\n");
}
