import type { Table } from "../model";
import type { CsvDelimiter } from "../parsers/delimited";
import { flattenNewlines } from "./layout";

/** TSV を出力する。セル内のタブ・改行は半角スペースに置き換え、引用符は使わない（Q34 司令塔判断） */
export function toTsv(table: Table): string {
  return table.rows.map((row) => row.map((cell) => flattenNewlines(cell).replace(/\t/g, " ")).join("\t")).join("\n");
}

/** CSV のセルを、区切り文字・引用符を含む場合だけ引用符で囲む（内部の " は "" に二重化。RFC 4180 風） */
export function quoteCsvCell(cell: string, delimiter: CsvDelimiter): string {
  const flat = flattenNewlines(cell);
  if (!flat.includes(delimiter) && !flat.includes('"')) return flat;
  return `"${flat.replace(/"/g, '""')}"`;
}

/** CSV を出力する（区切り文字は Q35 の設定値。セル内改行は Q30 により半角スペース） */
export function toCsv(table: Table, delimiter: CsvDelimiter): string {
  return table.rows.map((row) => row.map((cell) => quoteCsvCell(cell, delimiter)).join(delimiter)).join("\n");
}
